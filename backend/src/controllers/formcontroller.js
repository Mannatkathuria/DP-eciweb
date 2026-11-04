// Electoral forms other than Form 6: service voters (Forms 2, 2A, 3), overseas electors (Form 6A),
// Aadhaar / alternative-document information (Form 6B), objections and deletions (Form 7) and
// shifting, correction, replacement EPIC and PwD marking (Form 8).
//
// The flow follows the Registration of Electors Rules, 1960 and the RP Act, 1950:
//   1. INTAKE. Anyone may submit; the form is addressed to the ERO of one assembly constituency
//      (chosen from the ECI list). The applicant gets a reference number. Intake is not approval.
//   2. FIELD VERIFICATION. The BLO of that constituency records what they found and recommends;
//      for inclusion and shifting they also fix the part number and polling station.
//   3. DECISION. Only the ERO/AERO of that constituency decides, with step-up re-authentication
//      and a recorded reason. Only an approval changes the roll, and the change is the one the
//      form asks for (new entry, deletion, correction, shift, PwD marking, authentication record).
//   4. TRACKING. The applicant follows the status by reference number; officers' identities and
//      documents are never shown publicly.
//
// Aadhaar numbers are never stored: only the last four digits and a salted hash, so a duplicate
// can be noticed. Uploaded documents are checked by their bytes and kept apart from the form;
// they are deleted once the application is decided (their metadata is kept).
//
// Storage (Redis): eform:<id>, eform:all, eform:ref:<reference> -> id, eform:doc:<id>:<name>.
import crypto from "crypto";
import { redis, transaction } from "../config/redis.js";
import { getElectorByEpic, nextSerialNumber, saveElector } from "../repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "../repositories/user.repository.js";
import { boothFromAssignments, hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { opsEvent, publishEvents, recordEvent } from "../services/events.service.js";
import { reserveUniqueEpic } from "../services/registration.service.js";
import { actorOf, areaOf, asRecord, assertScope, clean, inScope, newId, nowIso, page, store } from "../services/workflow.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const FORMS = {
    "form-2": { code: "FORM_2", title: "Form 2: service voter (Armed Forces)", kind: "inclusion", category: "service_voter" },
    "form-2a": { code: "FORM_2A", title: "Form 2A: service voter (State Armed Police outside the State)", kind: "inclusion", category: "service_voter" },
    "form-3": { code: "FORM_3", title: "Form 3: service voter (Government of India post outside India)", kind: "inclusion", category: "service_voter" },
    "form-6a": { code: "FORM_6A", title: "Form 6A: overseas elector", kind: "inclusion", category: "overseas_elector" },
    "form-6b": { code: "FORM_6B", title: "Form 6B: Aadhaar or alternative document for authentication", kind: "authentication" },
    "form-7": { code: "FORM_7", title: "Form 7: objection or deletion", kind: "deletion" },
    "form-8": { code: "FORM_8", title: "Form 8: shifting, correction, replacement EPIC or PwD marking", kind: "change" }
};
const CODE_TO_ROUTE = Object.fromEntries(Object.entries(FORMS).map(([route, f]) => [f.code, route]));

export const STATUS = {
    submitted: "Received, awaiting field verification",
    field_verified: "Field verified, awaiting the ERO's decision",
    approved: "Approved by the Electoral Registration Officer",
    rejected: "Rejected by the Electoral Registration Officer",
    withdrawn: "Withdrawn"
};
const OPEN = ["submitted", "field_verified"];

const forms = store("eform");
const docKey = (id, name) => `eform:doc:${id}:${name}`;
const refKey = (ref) => `eform:ref:${ref}`;

const norm = (v) => clean(v).toLowerCase();
const EPIC = /^[A-Z]{3}\d{7}$/;
const epicOf = (v) => { const e = clean(v).toUpperCase(); return EPIC.test(e) ? e : null; };

// ---- Sanitising what the applicant sent ----

const SENSITIVE = ["aadhaarNumber"];
const MAX_FIELDS = 120;
const MAX_DOCS = 8;
const DOC_MAX_BYTES = 6 * 1024 * 1024;
const DOC_TYPES = {
    "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    "application/pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-"
};
const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i;

const aadhaarSalt = () => process.env.ACCESS_TOKEN_SECRET || "eciweb";
const hashAadhaar = (n) => crypto.createHmac("sha256", aadhaarSalt()).update(n).digest("hex");

/** Only plain values: strings (trimmed, capped), booleans, numbers and short arrays of strings. */
const sanitiseFields = (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "application must be an object of form fields.");
    const entries = Object.entries(input);
    if (entries.length > MAX_FIELDS) throw new ApiError(400, "Too many fields in this application.");
    const out = {};
    let aadhaar = null;
    for (const [k, v] of entries) {
        if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)) continue;
        if (SENSITIVE.includes(k)) {
            const digits = String(v ?? "").replace(/\D/g, "");
            if (digits) {
                if (digits.length !== 12) throw new ApiError(400, "An Aadhaar number has 12 digits.");
                aadhaar = { last4: digits.slice(-4), hash: hashAadhaar(digits) };
            }
            continue;
        }
        if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
        else if (typeof v === "string") { const s = v.trim().slice(0, 600); if (s) out[k] = s; }
        else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").slice(0, 20).map((x) => x.trim().slice(0, 100));
    }
    return { fields: out, aadhaar };
};

/** Each document checked by its first bytes, not by the type the browser claims. */
const sanitiseDocuments = (input = {}) => {
    if (!input || typeof input !== "object") return {};
    const entries = Object.entries(input).filter(([, d]) => d && typeof d === "object");
    if (entries.length > MAX_DOCS) throw new ApiError(400, `Attach at most ${MAX_DOCS} documents.`);
    const out = {};
    for (const [name, d] of entries) {
        if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(name)) continue;
        const m = typeof d.dataUrl === "string" ? d.dataUrl.match(DATA_URL) : null;
        if (!m) throw new ApiError(400, `${name}: upload a JPEG, PNG or PDF file.`);
        const mime = m[1].toLowerCase();
        if (!DOC_TYPES[mime]) throw new ApiError(400, `${name}: only JPEG, PNG and PDF files are accepted.`);
        if (m[2].length > Math.ceil(DOC_MAX_BYTES / 3) * 4) throw new ApiError(400, `${name}: the file must be 6 MB or smaller.`);
        const bytes = Buffer.from(m[2], "base64");
        if (!bytes.length || bytes.length > DOC_MAX_BYTES || !DOC_TYPES[mime](bytes)) throw new ApiError(400, `${name}: the file is not a valid ${mime}.`);
        out[name] = { dataUrl: `data:${mime};base64,${m[2]}`, meta: { name, fileName: clean(d.fileName, 120) || name, mimeType: mime, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") } };
    }
    return out;
};

/** Who the form is about, read from the fields each form uses. */
const subjectOf = (form, f) => {
    const name = clean([f.firstName, f.lastName].filter(Boolean).join(" ")) || clean(f.fullName) || clean(f.applicantName) || clean(f.electorName) || null;
    const subject = { name, epic: null, targetEpic: null, targetName: null };
    if (form.code === "FORM_6B") subject.epic = epicOf(f.epicNumber);
    if (form.code === "FORM_8") subject.epic = epicOf(f.epicNumber);
    if (form.code === "FORM_7") {
        subject.epic = epicOf(f.applicantEpic);
        if (f.applicationType === "self-deletion") { subject.targetEpic = subject.epic; subject.targetName = name; }
        else { subject.targetEpic = epicOf(f.personEpic); subject.targetName = clean([f.personName, f.personSurname].filter(Boolean).join(" ")) || null; }
    }
    if (form.kind === "inclusion") subject.epic = epicOf(f.previousEpic) || epicOf(f.epicNumber);
    return subject;
};

const requiredByForm = (form, f) => {
    const need = (cond, msg) => { if (!cond) throw new ApiError(400, msg); };
    need(subjectOf(form, f).name || form.code === "FORM_7", "Give the applicant's name.");
    if (form.kind === "inclusion") need(f.dateOfBirth || f.ageYears, "Give the date of birth or age.");
    if (form.code === "FORM_6B") need(subjectOf(form, f).epic, "Give the EPIC number of the entry this Form 6B is for.");
    if (form.code === "FORM_7") {
        need(["delete-existing", "object-proposed", "self-deletion"].includes(f.applicationType), "Choose what this Form 7 is for.");
        need(clean(f.reason), "Give the reason for the objection or deletion.");
        if (f.applicationType !== "object-proposed") need(subjectOf(form, f).targetEpic, "Give the EPIC number of the entry to be deleted.");
    }
    if (form.code === "FORM_8") {
        need(["shift", "correction", "replacement", "pwd"].includes(f.applicationType), "Choose what this Form 8 is for.");
        need(subjectOf(form, f).epic, "Give your EPIC number.");
        if (f.applicationType === "correction") need(Array.isArray(f.correctionFields) && f.correctionFields.length >= 1 && f.correctionFields.length <= 4, "Choose between one and four entries to correct.");
    }
    const declared = ["truthConfirmed", "declarationConfirmed", "informationConfirmed", "citizenDeclaration"].some((k) => f[k] === true);
    need(declared, "Confirm the declaration at the end of the form.");
};

// ---- Views ----

/** What anyone with the reference number may see: the steps, never officers' identities. */
const publicView = (a) => ({
    referenceId: a.referenceId, formCode: a.formCode, title: a.title, status: a.status, statusText: STATUS[a.status],
    constituency: a.jurisdiction.constituency, state: a.jurisdiction.state, submittedAt: a.submittedAt,
    timeline: a.timeline.map((t) => ({ step: t.step, at: t.at })),
    decision: a.decision ? { outcome: a.decision.outcome, reason: a.decision.reason, at: a.decision.at, epic: a.decision.epic ?? null } : null
});

const sanitiseForList = (a) => ({
    _id: a._id, referenceId: a.referenceId, formCode: a.formCode, title: a.title, kind: a.kind, status: a.status, statusText: STATUS[a.status],
    jurisdiction: a.jurisdiction, subject: a.subject, requestType: a.fields.applicationType ?? null, submittedAt: a.submittedAt,
    fieldReport: a.fieldReport ? { recommendation: a.fieldReport.recommendation, by: a.fieldReport.by, at: a.fieldReport.at } : null,
    decision: a.decision ?? null
});

const newReference = () => `EF${new Date().getUTCFullYear()}${crypto.randomBytes(5).toString("hex").toUpperCase()}`;

// ---- Intake ----

/** Anyone: submit a form addressed to the ERO of one constituency. */
export const submitForm = asyncHandler(async (req, res) => {
    const form = FORMS[req.params.form];
    if (!form) throw new ApiError(404, "Unknown form.");
    const body = req.body ?? {};
    if (body.formCode && body.formCode !== form.code) throw new ApiError(400, "formCode does not match the form address.");
    const jurisdiction = areaOf(body.jurisdiction ?? {}, "constituency");
    const { fields, aadhaar } = sanitiseFields(body.application);
    requiredByForm(form, fields);
    const docs = sanitiseDocuments(body.documents);
    const subject = subjectOf(form, fields);

    // The entry the form is about must be in the roll of the constituency it is addressed to,
    // except a shift (addressed to the new constituency) and inclusion forms.
    if (["FORM_6B", "FORM_8"].includes(form.code)) {
        const elector = await getElectorByEpic(subject.epic);
        if (!elector || elector.isActive === false) throw new ApiError(404, "No active roll entry was found for that EPIC number.");
        subject.name = subject.name || elector.name;
        subject.currentArea = { state: elector.state, district: elector.district, constituency: elector.assemblyConstituency, partNumber: elector.partNumber ?? null };
        const shift = form.code === "FORM_8" && fields.applicationType === "shift";
        if (!shift && (elector.state !== jurisdiction.state || elector.assemblyConstituency !== jurisdiction.constituency)) {
            throw new ApiError(400, `This entry is in ${elector.assemblyConstituency}, ${elector.state}. Address the form to that constituency's ERO.`);
        }
    }
    if (form.code === "FORM_7" && subject.targetEpic) {
        const target = await getElectorByEpic(subject.targetEpic);
        if (!target || target.isActive === false) throw new ApiError(404, "The entry to be deleted was not found in the roll.");
        if (target.state !== jurisdiction.state || target.assemblyConstituency !== jurisdiction.constituency) {
            throw new ApiError(400, `That entry is in ${target.assemblyConstituency}, ${target.state}. Address the form to that constituency's ERO.`);
        }
        subject.targetName = subject.targetName || target.name;
    }
    // One open application per form, entry and request type.
    const fingerprint = crypto.createHash("sha256").update([form.code, fields.applicationType ?? "", subject.epic ?? "", subject.targetEpic ?? "", aadhaar?.hash ?? "", norm(subject.name), fields.dateOfBirth ?? "", jurisdiction.constituency].join("|")).digest("hex");
    const duplicate = (await forms.list()).find((a) => a.fingerprint === fingerprint && OPEN.includes(a.status));
    if (duplicate) throw new ApiError(409, `An identical application is already open (reference ${duplicate.referenceId}).`);

    const at = nowIso();
    const app = {
        _id: newId(), referenceId: newReference(), formCode: form.code, route: req.params.form, title: form.title, kind: form.kind,
        category: form.category ?? null, jurisdiction, subject, fields, aadhaar: aadhaar ? { last4: aadhaar.last4, hash: aadhaar.hash } : null,
        documents: Object.values(docs).map((d) => d.meta), fingerprint, status: "submitted",
        submittedBy: req.user ? actorOf(req.user) : null, channel: req.user ? "signed-in" : "online",
        submittedAt: at, timeline: [{ step: "submitted", at }], fieldReport: null, decision: null
    };
    const tx = transaction();
    forms.save(app, tx);
    tx.set(refKey(app.referenceId), app._id);
    for (const [name, d] of Object.entries(docs)) tx.set(docKey(app._id, name), d.dataUrl);
    await recordAudit(auditEvent({ actor: req.user ?? null, action: "eform.submitted", resource: { type: "eform", id: app._id }, jurisdiction: asRecord(jurisdiction), after: { formCode: form.code, referenceId: app.referenceId, requestType: fields.applicationType ?? null } }), tx);
    const ev = recordEvent(opsEvent({ type: "APPLICATION_SUBMITTED", jurisdiction, payload: { kind: form.code } }), tx);
    await tx.exec();
    await publishEvents(ev);
    res.status(201).json({ success: true, message: `Your application has been received and sent to the ERO of ${jurisdiction.constituency}. Keep the reference number to track it.`,
        data: { referenceId: app.referenceId, status: app.status, message: `Sent to the Electoral Registration Officer of ${jurisdiction.constituency}.` } });
});
/** Anyone with the reference number: the status and steps. */
export const trackForm = asyncHandler(async (req, res) => {
    const ref = clean(req.params.ref).toUpperCase();
    const id = await redis().get(refKey(ref));
    const app = id ? await forms.get(id) : null;
    if (!app) throw new ApiError(404, "No application was found with that reference number.");
    res.json({ success: true, data: publicView(app) });
});

/** Signed-in applicant: their own forms. */
export const myForms = asyncHandler(async (req, res) => {
    const mine = (await forms.list()).filter((a) => a.submittedBy?.epic === req.user.epic || a.subject?.epic === req.user.epic);
    res.json({ success: true, data: { items: page(mine, req.query, "submittedAt").map(publicView) } });
});

// ---- Officials ----

const canSee = (req) => ["application:decide", "verification:field-report", "application:review", "record:read", "roll:manage"].some((p) => hasPermission(req.user, p));

/** BLO, ERO/AERO, BLO supervisor and observers (read only): forms in their jurisdiction. */
export const listForStaff = asyncHandler(async (req, res) => {
    if (!canSee(req)) throw new ApiError(403, "Your role cannot see electoral applications.");
    const q = req.query;
    const items = (await forms.list())
        .filter((a) => inScope(req, a.jurisdiction))
        .filter((a) => (!q.status || a.status === q.status) && (!q.form || a.formCode === q.form))
        .filter((a) => !q.open || OPEN.includes(a.status));
    const counts = Object.fromEntries(Object.keys(STATUS).map((s) => [s, items.filter((a) => a.status === s).length]));
    res.json({ success: true, data: { items: page(items, q, "submittedAt").map(sanitiseForList), counts, statusText: STATUS, forms: Object.fromEntries(Object.values(FORMS).map((f) => [f.code, f.title])) } });
});

const loadInScope = async (req) => {
    const app = await forms.get(req.params.id);
    if (!app) throw new ApiError(404, "Application not found.");
    assertScope(req, app.jurisdiction, "This application");
    return app;
};

export const getForStaff = asyncHandler(async (req, res) => {
    if (!canSee(req)) throw new ApiError(403, "Your role cannot see electoral applications.");
    const app = await loadInScope(req);
    let current = null;
    for (const epic of [app.subject?.epic, app.subject?.targetEpic].filter(Boolean)) {
        const e = await getElectorByEpic(epic);
        if (e) current = { ...(current ?? {}), [epic]: { epic: e.epic, name: e.name, gender: e.gender, dateOfBirth: e.dateOfBirth, state: e.state, assemblyConstituency: e.assemblyConstituency, partNumber: e.partNumber, pollingStation: e.pollingStation, isActive: e.isActive !== false } };
    }
    const { aadhaar, fingerprint, ...rest } = app; // eslint-disable-line no-unused-vars
    res.json({ success: true, data: { ...rest, aadhaar: aadhaar ? { last4: aadhaar.last4 } : null, rollEntries: current } });
});

/** One uploaded document, for an official working on the application. */
export const getDocument = asyncHandler(async (req, res) => {
    if (!hasPermission(req.user, "application:decide") && !hasPermission(req.user, "verification:field-report")) throw new ApiError(403, "Only the BLO and the ERO/AERO open applicants' documents.");
    const app = await loadInScope(req);
    const meta = app.documents.find((d) => d.name === req.params.name);
    if (!meta) throw new ApiError(404, "Document not found.");
    const dataUrl = await redis().get(docKey(app._id, meta.name));
    if (!dataUrl) throw new ApiError(410, "This document was deleted after the application was decided.");
    await recordAudit(auditEvent({ actor: req.user, action: "eform.document_viewed", resource: { type: "eform", id: app._id }, jurisdiction: asRecord(app.jurisdiction), note: meta.name }));
    res.json({ success: true, data: { ...meta, dataUrl } });
});

const needsBooth = (app) => app.kind === "inclusion" || (app.formCode === "FORM_8" && app.fields.applicationType === "shift");

/** BLO: field verification and recommendation. Nothing changes in the roll. */
export const fieldReport = asyncHandler(async (req, res) => {
    if (!hasPermission(req.user, "verification:field-report")) throw new ApiError(403, "Only field staff record verification.");
    const result = await forms.withLock(req.params.id, async () => {
        const app = await loadInScope(req);
        if (app.status !== "submitted") throw new ApiError(409, `This application is ${STATUS[app.status].toLowerCase()}.`);
        const body = req.body ?? {};
        const recommendation = body.recommendation === "reject" ? "reject" : body.recommendation === "approve" ? "approve" : null;
        if (!recommendation) throw new ApiError(400, "recommendation must be approve or reject.");
        const note = recommendation === "reject" ? requireReason(body.note, "recommendation") : clean(body.note, 500) || null;
        const method = ["home_visit", "phone", "documents", "office"].includes(body.method) ? body.method : "home_visit";
        let booth = null;
        if (recommendation === "approve" && needsBooth(app)) {
            const fromAssignment = boothFromAssignments(req.authority.assignments, asRecord(app.jurisdiction));
            const partNumber = clean(body.partNumber) || fromAssignment?.partNumber || "";
            const pollingStation = clean(body.pollingStation, 200) || fromAssignment?.pollingStation || "";
            if (!/^[1-9]\d{0,3}$/.test(partNumber)) throw new ApiError(400, "Record the part number (1-9999) for the new entry.");
            if (pollingStation.length < 3) throw new ApiError(400, "Record the polling station for the new entry.");
            booth = { partNumber, pollingStation };
        }
        const at = nowIso();
        const updated = {
            ...app, status: "field_verified",
            fieldReport: { recommendation, note, method, booth, contacted: body.contacted !== false, by: actorOf(req.user), at },
            timeline: [...app.timeline, { step: "field_verified", at }]
        };
        const tx = transaction();
        forms.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "eform.field_verified", resource: { type: "eform", id: app._id }, jurisdiction: asRecord(app.jurisdiction), after: { recommendation, booth, method }, note }), tx);
        const ev = recordEvent(opsEvent({ type: "VERIFICATION_COMPLETED", jurisdiction: app.jurisdiction, payload: { kind: app.formCode, recommendation }, actor: req.user }), tx);
        await tx.exec();
        await publishEvents(ev);
        return updated;
    });
    res.json({ success: true, message: "Field report recorded. The ERO/AERO decides the application.", data: sanitiseForList(result) });
});

// ---- What an approval does to the roll ----

const dobFrom = (f) => {
    if (f.dateOfBirth && !Number.isNaN(Date.parse(f.dateOfBirth))) return new Date(f.dateOfBirth).toISOString();
    const years = Number(f.ageYears);
    if (Number.isFinite(years) && years > 0) { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - years); return d.toISOString(); }
    return null;
};
const ageFrom = (iso) => (iso ? Math.max(0, new Date().getFullYear() - new Date(iso).getFullYear()) : null);
const genderOf = (g) => { const v = norm(g); return v.startsWith("f") ? "Female" : v.startsWith("m") ? "Male" : v ? "Other" : "Other"; };

/** Adds the writes for an approval to `tx`. Returns a summary for the audit trail and the applicant. */
const applyApproval = async (app, booth, officer, tx) => {
    const f = app.fields;
    const at = nowIso();
    const order = { referenceId: app.referenceId, formCode: app.formCode, by: officer.epic, at };

    if (app.kind === "inclusion") {
        if (!booth) throw new ApiError(400, "Record the part number and polling station for the new entry.");
        if (app.subject.epic) {
            const existing = await getElectorByEpic(app.subject.epic);
            if (existing && existing.isActive !== false) throw new ApiError(409, `This person already has an active entry (${existing.epic}). Ask for Form 8 (shifting) instead.`);
        }
        const epic = await reserveUniqueEpic(app._id);
        const dob = dobFrom(f);
        const elector = {
            _id: newId(), epic, name: app.subject.name, dateOfBirth: dob, age: ageFrom(dob), gender: genderOf(f.gender),
            state: app.jurisdiction.state, district: app.jurisdiction.district, assemblyConstituency: app.jurisdiction.constituency,
            address: [f.house || f.indiaHouse, f.street || f.indiaStreet, f.townVillage || f.indiaTownVillage || f.locality].filter(Boolean).join(", ") || null,
            pinCode: f.pinCode || f.indiaPinCode || null, partNumber: booth.partNumber, pollingStation: booth.pollingStation,
            serialNumber: await nextSerialNumber({ state: app.jurisdiction.state, assemblyConstituency: app.jurisdiction.constituency, partNumber: booth.partNumber }),
            relativeName: f.relativeName || [f.relativeFirstName, f.relativeLastName].filter(Boolean).join(" ") || null, relationType: f.relationType || null,
            electorCategory: app.category, photoUrl: null, isActive: true, registeredAt: at, registrationId: app._id, approvedBy: officer.epic, order
        };
        saveElector(elector, tx);
        if (!(await getUserByEpic(epic))) saveUser({ _id: newId(), epic, name: elector.name, role: "voter", registrationId: app._id, approvedBy: officer.epic, createdAt: at }, tx);
        return { epic, effect: `New ${app.category === "overseas_elector" ? "overseas elector" : "service voter"} entry ${epic} in part ${booth.partNumber}.` };
    }

    if (app.formCode === "FORM_6B") {
        const e = await getElectorByEpic(app.subject.epic);
        if (!e) throw new ApiError(404, "The roll entry no longer exists.");
        saveElector({ ...e, authentication: { method: app.aadhaar ? "aadhaar" : "alternative_document", aadhaarLast4: app.aadhaar?.last4 ?? null, documentType: f.alternativeDocumentType ?? null, order }, updatedAt: at }, tx);
        return { epic: e.epic, effect: "Authentication information recorded against the entry." };
    }

    if (app.formCode === "FORM_7") {
        if (f.applicationType === "object-proposed") return { epic: null, effect: "Objection upheld: the proposed inclusion is not to be made." };
        const e = await getElectorByEpic(app.subject.targetEpic);
        if (!e || e.isActive === false) throw new ApiError(409, "The entry is not in the roll any more.");
        // Nothing is erased: the entry is marked deleted and keeps the order that deleted it.
        saveElector({ ...e, isActive: false, deletion: { ground: f.reason, order }, updatedAt: at }, tx);
        return { epic: e.epic, effect: `Entry ${e.epic} marked deleted from the roll.` };
    }

    if (app.formCode === "FORM_8") {
        const e = await getElectorByEpic(app.subject.epic);
        if (!e || e.isActive === false) throw new ApiError(409, "The entry is not in the roll any more.");
        const before = { name: e.name, gender: e.gender, dateOfBirth: e.dateOfBirth, assemblyConstituency: e.assemblyConstituency, partNumber: e.partNumber, address: e.address ?? null };
        let next = { ...e, updatedAt: at, lastOrder: order };
        const type = f.applicationType;
        if (type === "shift") {
            if (!booth) throw new ApiError(400, "Record the new part number and polling station.");
            next = { ...next, state: app.jurisdiction.state, district: app.jurisdiction.district, assemblyConstituency: app.jurisdiction.constituency,
                address: [f.house, f.street, f.townVillage].filter(Boolean).join(", ") || e.address, pinCode: f.pinCode || e.pinCode,
                partNumber: booth.partNumber, pollingStation: booth.pollingStation,
                serialNumber: await nextSerialNumber({ state: app.jurisdiction.state, assemblyConstituency: app.jurisdiction.constituency, partNumber: booth.partNumber }) };
        } else if (type === "correction") {
            const c = f.correctionFields ?? [];
            if (c.includes("name") && f.correctedName) next.name = f.correctedName;
            if (c.includes("gender") && f.correctedGender) next.gender = genderOf(f.correctedGender);
            if (c.includes("dob") && f.correctedDob && !Number.isNaN(Date.parse(f.correctedDob))) { next.dateOfBirth = new Date(f.correctedDob).toISOString(); next.age = ageFrom(next.dateOfBirth); }
            if (c.includes("relationType") && f.correctedRelationType) next.relationType = f.correctedRelationType;
            if (c.includes("relationName") && f.correctedRelationName) next.relativeName = f.correctedRelationName;
            if (c.includes("address") && f.correctedAddress) next.address = f.correctedAddress;
        } else if (type === "replacement") {
            next.replacementEpic = { reason: f.replacementReason ?? null, issuedAt: at, order };
        } else if (type === "pwd") {
            next.pwd = { categories: f.disabilityCategories ?? [], percent: f.disabilityPercent ?? null, order };
        }
        saveElector(next, tx);
        const after = { name: next.name, gender: next.gender, dateOfBirth: next.dateOfBirth, assemblyConstituency: next.assemblyConstituency, partNumber: next.partNumber, address: next.address ?? null };
        const changed = Object.keys(after).filter((k) => String(after[k] ?? "") !== String(before[k] ?? ""));
        return { epic: e.epic, effect: type === "shift" ? `Entry shifted to part ${booth.partNumber}, ${app.jurisdiction.constituency}.` : type === "correction" ? `Corrected: ${changed.join(", ") || "no visible change"}.` : type === "replacement" ? "Replacement EPIC to be issued." : "Marked as a person with disability.", before, after };
    }
    return { epic: null, effect: "Order recorded." };
};

/** ERO/AERO: approve or reject, with a reason. Step-up is enforced on the route. */
export const decideForm = asyncHandler(async (req, res) => {
    if (!hasPermission(req.user, "application:decide")) throw new ApiError(403, "Only the ERO or AERO decides applications.");
    const result = await forms.withLock(req.params.id, async () => {
        const app = await loadInScope(req);
        if (!OPEN.includes(app.status)) throw new ApiError(409, `This application is already ${STATUS[app.status].toLowerCase()}.`);
        const outcome = req.body?.decision === "approve" ? "approved" : req.body?.decision === "reject" ? "rejected" : null;
        if (!outcome) throw new ApiError(400, "decision must be approve or reject.");
        const reason = outcome === "rejected" ? requireReason(req.body?.reason) : clean(req.body?.reason, 500) || "Approved on the material on record.";
        if (outcome === "approved" && app.status !== "field_verified" && app.kind !== "authentication") {
            throw new ApiError(409, "Wait for the BLO's field verification before approving this application.");
        }
        if (outcome === "approved" && app.formCode === "FORM_7" && app.submittedAt) {
            // The person objected to is given notice; the ERO cannot decide within the notice period.
            const days = Number(process.env.FORM7_NOTICE_DAYS ?? 7);
            const until = Date.parse(app.submittedAt) + (Number.isFinite(days) ? days : 7) * 86400000;
            if (app.fields.applicationType !== "self-deletion" && Date.now() < until) throw new ApiError(409, `The notice period runs until ${new Date(until).toISOString().slice(0, 10)}. Decide after it ends.`);
        }
        const booth = (() => {
            const b = { partNumber: clean(req.body?.partNumber), pollingStation: clean(req.body?.pollingStation, 200) };
            if (b.partNumber || b.pollingStation) {
                if (!/^[1-9]\d{0,3}$/.test(b.partNumber) || b.pollingStation.length < 3) throw new ApiError(400, "A corrected booth needs a part number (1-9999) and a polling station.");
                return b;
            }
            return app.fieldReport?.booth ?? null;
        })();
        const at = nowIso();
        const tx = transaction();
        let effect = null;
        if (outcome === "approved") effect = await applyApproval(app, booth, req.user, tx);
        const decided = {
            ...app, status: outcome,
            decision: { outcome, reason, by: actorOf(req.user), at, booth: outcome === "approved" ? booth : null, epic: effect?.epic ?? null, effect: effect?.effect ?? null,
                legalBasis: "Representation of the People Act, 1950 and Registration of Electors Rules, 1960" },
            documents: app.documents.map((d) => ({ ...d, deletedAt: at })),
            timeline: [...app.timeline, { step: outcome, at }]
        };
        forms.save(decided, tx);
        for (const d of app.documents) tx.del(docKey(app._id, d.name));
        await recordAudit(auditEvent({ actor: req.user, action: `eform.${outcome}`, resource: { type: "eform", id: app._id }, jurisdiction: asRecord(app.jurisdiction),
            before: effect?.before ?? { status: app.status }, after: effect?.after ?? { status: outcome, epic: effect?.epic ?? null }, note: reason }), tx);
        const evs = [recordEvent(opsEvent({ type: "REGISTRATION_DECIDED", jurisdiction: app.jurisdiction, payload: { kind: app.formCode, decision: outcome }, actor: req.user }), tx)];
        if (outcome === "approved") evs.push(recordEvent(opsEvent({ type: "ELECTORAL_ROLL_UPDATED", jurisdiction: app.jurisdiction, payload: { kind: app.formCode } , actor: req.user }), tx));
        try { await tx.exec(); }
        catch (error) { if (effect?.epic && app.kind === "inclusion") await redis().del(`epic:allocated:${effect.epic}`).catch(() => {}); throw error; }
        await publishEvents(evs);
        return decided;
    });
    res.json({ success: true, message: result.status === "approved" ? `Approved. ${result.decision.effect}` : "Rejected. The applicant sees the reason.", data: sanitiseForList(result) });
});

/** Applicant: withdraw while it is still open. */
export const withdrawForm = asyncHandler(async (req, res) => {
    const result = await forms.withLock(req.params.id, async () => {
        const app = await forms.get(req.params.id);
        if (!app || (app.submittedBy?.epic !== req.user.epic)) throw new ApiError(404, "Application not found.");
        if (!OPEN.includes(app.status)) throw new ApiError(409, "Only an open application can be withdrawn.");
        const at = nowIso();
        const updated = { ...app, status: "withdrawn", timeline: [...app.timeline, { step: "withdrawn", at }] };
        const tx = transaction();
        forms.save(updated, tx);
        for (const d of app.documents) tx.del(docKey(app._id, d.name));
        await recordAudit(auditEvent({ actor: req.user, action: "eform.withdrawn", resource: { type: "eform", id: app._id }, jurisdiction: asRecord(app.jurisdiction) }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: publicView(result) });
});

export const formCatalogue = (req, res) => res.json({ success: true, data: { forms: Object.entries(FORMS).map(([route, f]) => ({ route, ...f })), status: STATUS } });
export const routeForCode = (code) => CODE_TO_ROUTE[code] ?? null;
