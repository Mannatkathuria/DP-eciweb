import crypto from "crypto";
import { acquireLock, jsonGet, redis, transaction } from "../config/redis.js";
import { getElectorByEpic, saveElector } from "../repositories/elector.repository.js";
import { assertCovers, coversAny, recordJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { opsEvent, publishEvents, recordEvent } from "../services/events.service.js";
import { requireReason, validateDocumentProof } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Form 7: objection to the inclusion of a name in the roll, or a request to delete one's own name
// (Registration of Electors Rules 1960, rules 13(2), 17-20). The sequence follows the Rules:
//   1. Filed by an elector of the same constituency (or by the elector about their own entry), or
//      by a booth level agent of a party for their own part, at most 10 a day, with a declaration.
//   2. NOTICE: when the objection is about someone else, they are notified and may reply. The ERO
//      cannot decide before the notice period ends (FORM7_NOTICE_DAYS, default 7).
//   3. The BLO of the part reports what they found in the field.
//   4. The ERO/AERO decides with a recorded reason (step-up required). Accepting it marks the entry
//      deleted; nothing is erased: the record keeps the entry, the grounds and the order.
//
// Storage (Redis): objection:<id>, objections:all (set), objections:by:<epic> (filed by),
// objections:against:<epic> (about), objections:open:<epic> (the one open objection per entry),
// objections:bla:<epic>:<date> (daily count for a booth level agent).

export const GROUNDS = {
    deceased: "The person has died",
    shifted: "Ordinarily resident elsewhere (shifted)",
    duplicate: "Enrolled more than once",
    not_citizen: "Not a citizen of India",
    underage: "Under 18 on the qualifying date",
    absent: "Not found at the address (absent)"
};
const SELF_GROUNDS = ["shifted", "duplicate"];
const BLA_DAILY_LIMIT = 10;
const OPEN = ["notice", "pending_verification", "field_verified"];
const noticeDays = () => { const n = Number(process.env.FORM7_NOTICE_DAYS ?? 7); return Number.isFinite(n) && n >= 0 ? n : 7; };

const key = (id) => `objection:${id}`;
const getObjection = (id) => jsonGet(key(id));
const saveObjection = (o, tx) => {
    tx.set(key(o._id), JSON.stringify(o));
    tx.sAdd("objections:all", o._id);
    tx.sAdd(`objections:by:${o.objector.epic}`, o._id);
    tx.sAdd(`objections:against:${o.target.epic}`, o._id);
    if (OPEN.includes(o.status)) tx.set(`objections:open:${o.target.epic}`, o._id);
    else tx.del(`objections:open:${o.target.epic}`);
};
const listIds = async (set) => (await Promise.all((await redis().sMembers(set)).map(getObjection))).filter(Boolean);
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const sameAc = (a, b) => clean(a.state).toLowerCase() === clean(b.state).toLowerCase()
    && clean(a.assemblyConstituency).toLowerCase() === clean(b.assemblyConstituency).toLowerCase();
const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

/** What the person objected to may see: no documents, nothing about the objector beyond name and role. */
const targetView = (o) => ({
    _id: o._id, ground: o.ground, groundLabel: GROUNDS[o.ground], details: o.details, status: o.status,
    objector: { name: o.objector.name, role: o.objector.role, self: o.self }, noticeUntil: o.noticeUntil,
    reply: o.reply, decision: o.decision, filedAt: o.filedAt
});
const objectorView = (o) => ({
    _id: o._id, ground: o.ground, groundLabel: GROUNDS[o.ground], details: o.details, status: o.status, self: o.self,
    target: { epic: o.target.epic, name: o.target.name, assemblyConstituency: o.target.assemblyConstituency, partNumber: o.target.partNumber },
    noticeUntil: o.noticeUntil, reply: o.reply ? { at: o.reply.at } : null, decision: o.decision, filedAt: o.filedAt
});

const lockFor = (id) => acquireLock(`objection:lock:${id}`);
const withLock = async (id, fn) => {
    const release = await lockFor(id);
    if (!release) throw new ApiError(409, "This objection is being processed. Try again in a moment.");
    try { return await fn(); } finally { await release(); }
};

/** Files a Form 7 objection (a voter, or a booth level agent for their part). */
export const fileObjection = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const targetEpic = clean(body.targetEpic).toUpperCase();
    if (!/^[A-Z]{3}\d{7}$/.test(targetEpic)) throw new ApiError(400, "Enter the EPIC number of the entry you object to.");
    const ground = clean(body.ground);
    if (!GROUNDS[ground]) throw new ApiError(400, `Choose a ground: ${Object.keys(GROUNDS).join(", ")}.`);
    const details = clean(body.details);
    if (details.length < 20 || details.length > 1000) throw new ApiError(400, "Explain the objection in 20 to 1000 characters.");
    if (body.declaration !== true) throw new ApiError(400, "Confirm the declaration: a false statement is an offence under section 31 of the RP Act 1950.");
    const proof = body.documentProof ? validateDocumentProof(body.documentProof, "Supporting document") : null;

    const target = await getElectorByEpic(targetEpic);
    if (!target || target.isActive === false) throw new ApiError(404, "No current roll entry has that EPIC number.");

    const isBla = req.user.role === "bla";
    const self = !isBla && targetEpic === req.user.epic;
    let objector;
    if (isBla) {
        // A booth level agent files only for the part they are appointed to, within a daily limit.
        if (!req.authority?.assignments) throw new ApiError(403, "Your role is not authorised for this action.");
        assertCovers(req.authority.assignments, target, "This roll entry");
        objector = { epic: req.user.epic, name: req.user.name ?? null, role: "bla" };
    } else {
        if (self && !SELF_GROUNDS.includes(ground)) throw new ApiError(400, "You can ask to delete your own entry only because you have shifted or are enrolled twice.");
        const own = await getElectorByEpic(req.user.epic);
        if (!own || own.isActive === false) throw new ApiError(403, "Only an elector on the roll can file an objection.");
        if (!self && !sameAc(own, target)) throw new ApiError(403, "You can object only to entries in the roll of your own assembly constituency.");
        objector = { epic: req.user.epic, name: own.name, role: "voter" };
    }

    const release = await acquireLock(`objection:target:${targetEpic}`, 15);
    if (!release) throw new ApiError(409, "Another objection to this entry is being filed. Try again in a moment.");
    try {
        if (await redis().get(`objections:open:${targetEpic}`)) throw new ApiError(409, "An objection to this entry is already being processed.");
        const dayKey = `objections:bla:${req.user.epic}:${todayIST()}`;
        if (isBla && Number(await redis().get(dayKey) ?? 0) >= BLA_DAILY_LIMIT) {
            throw new ApiError(429, `A booth level agent may file at most ${BLA_DAILY_LIMIT} objections a day.`);
        }
        const now = new Date();
        const objection = {
            _id: crypto.randomUUID(), form: "Form 7", ground, details, self,
            objector, declaration: { accepted: true, at: now.toISOString() },
            target: { epic: target.epic, name: target.name, state: target.state, district: target.district, assemblyConstituency: target.assemblyConstituency,
                partNumber: target.partNumber ?? null, serialNumber: target.serialNumber ?? null, pollingStation: target.pollingStation ?? null },
            documentProof: proof,
            status: self ? "pending_verification" : "notice",
            noticeUntil: self ? null : new Date(now.getTime() + noticeDays() * 86400000).toISOString(),
            reply: null, fieldReport: null, decision: null, filedAt: now.toISOString(), updatedAt: now.toISOString()
        };
        const tx = transaction();
        saveObjection(objection, tx);
        if (isBla) tx.incr(dayKey).expire(dayKey, 2 * 86400);
        await recordAudit(auditEvent({ actor: req.user, action: "objection.filed", resource: { type: "objection", id: objection._id },
            jurisdiction: recordJurisdiction(target), after: { ground, target: target.epic, status: objection.status, self } }), tx);
        const event = recordEvent(opsEvent({ type: "APPLICATION_SUBMITTED", jurisdiction: recordJurisdiction(target), payload: { form: "Form 7", ground }, actor: req.user }), tx);
        await tx.exec();
        await publishEvents(event);
        res.status(201).json({ success: true,
            message: self ? "Your request to delete your entry has been filed. The BLO will verify it." : `Objection filed. The elector is given ${noticeDays()} days' notice to reply before the ERO decides.`,
            data: objectorView(objection) });
    } finally { await release(); }
});

/** The caller's own objections, and objections filed against their entry (with the right to reply). */
export const myObjections = asyncHandler(async (req, res) => {
    const filed = (await listIds(`objections:by:${req.user.epic}`)).sort((a, b) => b.filedAt.localeCompare(a.filedAt)).map(objectorView);
    const against = (await listIds(`objections:against:${req.user.epic}`)).filter((o) => !o.self)
        .sort((a, b) => b.filedAt.localeCompare(a.filedAt)).map(targetView);
    res.json({ success: true, data: { filed, against, grounds: GROUNDS, noticeDays: noticeDays() } });
});

/** The elector objected to replies during the notice period. */
export const replyToObjection = asyncHandler(async (req, res) => {
    const text = clean(req.body?.reply);
    if (text.length < 10 || text.length > 1000) throw new ApiError(400, "Write your reply in 10 to 1000 characters.");
    const updated = await withLock(req.params.id, async () => {
        const o = await getObjection(req.params.id);
        if (!o || o.target.epic !== req.user.epic || o.self) throw new ApiError(404, "Objection not found.");
        if (!OPEN.includes(o.status)) throw new ApiError(409, "This objection has already been decided.");
        if (o.reply) throw new ApiError(409, "You have already replied to this objection.");
        const now = new Date().toISOString();
        const next = { ...o, reply: { text, at: now }, updatedAt: now };
        const tx = transaction();
        saveObjection(next, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "objection.replied", resource: { type: "objection", id: o._id }, jurisdiction: recordJurisdiction(o.target) }), tx);
        await tx.exec();
        return next;
    });
    res.json({ success: true, message: "Your reply has been recorded for the ERO.", data: targetView(updated) });
});

/** The person who filed withdraws it before a decision. */
export const withdrawObjection = asyncHandler(async (req, res) => {
    const updated = await withLock(req.params.id, async () => {
        const o = await getObjection(req.params.id);
        if (!o || o.objector.epic !== req.user.epic) throw new ApiError(404, "Objection not found.");
        if (!OPEN.includes(o.status)) throw new ApiError(409, "This objection has already been decided.");
        const now = new Date().toISOString();
        const next = { ...o, status: "withdrawn", decision: { outcome: "withdrawn", by: req.user.epic, at: now }, updatedAt: now };
        const tx = transaction();
        saveObjection(next, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "objection.withdrawn", resource: { type: "objection", id: o._id }, jurisdiction: recordJurisdiction(o.target) }), tx);
        await tx.exec();
        return next;
    });
    res.json({ success: true, message: "Objection withdrawn.", data: objectorView(updated) });
});

/** Officials: objections in their jurisdiction. */
export const listObjectionsForStaff = asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const now = Date.now();
    const items = (await listIds("objections:all"))
        .filter((o) => coversAny(req.authority.assignments, o.target))
        .filter((o) => !status || o.status === status)
        .sort((a, b) => b.filedAt.localeCompare(a.filedAt))
        .map((o) => ({ ...o, documentProof: o.documentProof ? { attached: true } : null, groundLabel: GROUNDS[o.ground],
            decidableFrom: o.noticeUntil, noticeOpen: Boolean(o.noticeUntil && Date.parse(o.noticeUntil) > now) }));
    res.json({ success: true, data: { items, grounds: GROUNDS } });
});

/** BLO (or BLO supervisor) records the field finding. */
export const fieldReportObjection = asyncHandler(async (req, res) => {
    const finding = clean(req.body?.finding);
    if (!["confirmed", "not_confirmed"].includes(finding)) throw new ApiError(400, "finding must be 'confirmed' or 'not_confirmed'.");
    const notes = clean(req.body?.notes);
    if (notes.length < 10 || notes.length > 1000) throw new ApiError(400, "Describe what you found in 10 to 1000 characters.");
    const updated = await withLock(req.params.id, async () => {
        const o = await getObjection(req.params.id);
        if (!o) throw new ApiError(404, "Objection not found.");
        assertCovers(req.authority.assignments, o.target, "This objection");
        if (!OPEN.includes(o.status)) throw new ApiError(409, "This objection has already been decided.");
        if (o.objector.epic === req.user.epic) throw new ApiError(403, "You cannot verify an objection you filed.");
        const now = new Date().toISOString();
        const next = { ...o, status: "field_verified", fieldReport: { finding, notes, by: req.user.epic, role: req.user.role, at: now }, updatedAt: now };
        const tx = transaction();
        saveObjection(next, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "objection.field_verified", resource: { type: "objection", id: o._id },
            jurisdiction: recordJurisdiction(o.target), before: { status: o.status }, after: { status: next.status, finding }, note: notes }), tx);
        await tx.exec();
        return next;
    });
    res.json({ success: true, data: updated });
});

/**
 * ERO/AERO decision, with a reason. Accepting needs the field report and, for an objection about
 * someone else, the end of the notice period. An accepted objection marks the entry deleted; the
 * entry itself is kept with the grounds and the order.
 */
export const decideObjection = asyncHandler(async (req, res) => {
    const outcome = clean(req.body?.outcome);
    if (!["accepted", "rejected"].includes(outcome)) throw new ApiError(400, "outcome must be 'accepted' or 'rejected'.");
    const reason = requireReason(req.body?.reason, "decision");
    let liveEvent = null;
    const updated = await withLock(req.params.id, async () => {
        const o = await getObjection(req.params.id);
        if (!o) throw new ApiError(404, "Objection not found.");
        assertCovers(req.authority.assignments, o.target, "This objection");
        if (!OPEN.includes(o.status)) throw new ApiError(409, "This objection has already been decided.");
        if (o.objector.epic === req.user.epic) throw new ApiError(403, "You cannot decide an objection you filed.");
        if (outcome === "accepted" && !o.fieldReport) throw new ApiError(409, "The BLO's field report is needed before the objection can be accepted.");
        if (outcome === "accepted" && o.noticeUntil && Date.parse(o.noticeUntil) > Date.now()) {
            throw new ApiError(409, `The elector's notice period runs until ${o.noticeUntil}; decide after it ends.`);
        }
        const now = new Date().toISOString();
        const tx = transaction();
        if (outcome === "accepted") {
            const elector = await getElectorByEpic(o.target.epic);
            if (!elector) throw new ApiError(404, "The roll entry no longer exists.");
            if (elector.isActive === false) throw new ApiError(409, "This entry is already deleted.");
            saveElector({ ...elector, isActive: false, updatedAt: now,
                deletion: { form: "Form 7", objectionId: o._id, ground: o.ground, reason, orderedBy: req.user.epic, at: now } }, tx);
            liveEvent = recordEvent(opsEvent({ type: "ELECTORAL_ROLL_UPDATED", jurisdiction: recordJurisdiction(elector), payload: { change: "deletion", form: "Form 7", ground: o.ground }, actor: req.user }), tx);
        }
        const next = { ...o, status: outcome, decision: { outcome, reason, by: req.user.epic, role: req.user.role, at: now }, updatedAt: now };
        saveObjection(next, tx);
        await recordAudit(auditEvent({ actor: req.user, action: `objection.${outcome}`, resource: { type: "objection", id: o._id },
            jurisdiction: recordJurisdiction(o.target), before: { status: o.status, isActive: true },
            after: { status: outcome, ...(outcome === "accepted" ? { isActive: false, elector: o.target.epic } : {}) }, note: reason }), tx);
        if (outcome === "accepted") {
            await recordAudit(auditEvent({ actor: req.user, action: "elector.deleted", resource: { type: "elector", id: o.target.epic },
                jurisdiction: recordJurisdiction(o.target), before: { isActive: true }, after: { isActive: false, ground: o.ground, objectionId: o._id }, note: reason }), tx);
        }
        await tx.exec();
        return next;
    });
    if (liveEvent) await publishEvents(liveEvent);
    res.json({ success: true, message: outcome === "accepted" ? "Objection accepted. The entry is marked deleted from the roll." : "Objection rejected. The entry stays on the roll.", data: updated });
});
