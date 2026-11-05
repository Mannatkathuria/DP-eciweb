// Model Code of Conduct complaints (the cVIGIL flow) and seizures.
//
//   1. INTAKE      Anyone reports what they saw, with the place, the constituency and an optional
//                  photo. A reference and a 100-minute response clock start. Anonymous reports
//                  carry no contact details and cannot be followed up by phone.
//   2. DISPATCH    The district control room (DEO, Deputy DEO) or the RO/ARO assigns a flying
//                  squad of that constituency, or drops a report that is plainly not a violation.
//   3. FIELD       The flying squad reaches the spot and reports what it found and did, including
//                  any seizure (cash, liquor, drugs, freebies, other) with its value.
//   4. DISPOSAL    The RO/ARO disposes of the complaint with a reason (action taken, notice to a
//                  candidate, referred to police or another authority, or not substantiated).
//
// A flag or a seizure is not a finding that a candidate broke the law. Every step is audited and
// the complainant sees the status and the disposal, never the officers' identities.
import crypto from "crypto";
import { redis, transaction } from "../config/redis.js";
import { hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { actorOf, amountOf, areaOf, asRecord, assertScope, clean, inScope, newId, nowIso, oneOf, page, requireText, store } from "../services/workflow.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const CATEGORIES = {
    cash: { label: "Distribution of cash or bribery", severity: "high" },
    liquor: { label: "Distribution of liquor, drugs or freebies", severity: "high" },
    loudspeaker: { label: "Loudspeakers beyond permitted hours", severity: "medium" },
    hate_speech: { label: "Hate speech or communal appeals", severity: "critical" },
    defacement: { label: "Unauthorised banners or defacement of property", severity: "medium" },
    intimidation: { label: "Firearms or voter intimidation", severity: "critical" },
    paid_news: { label: "Paid news or uncertified advertisements", severity: "medium" },
    government_misuse: { label: "Misuse of government vehicles or premises", severity: "high" },
    other: { label: "Other Model Code of Conduct violation", severity: "medium" }
};
export const STATUS = {
    received: "Received, awaiting dispatch", assigned: "Flying squad on the way", field_reported: "Field report received, awaiting disposal",
    disposed: "Disposed by the Returning Officer", dropped: "Dropped (not a violation or duplicate)"
};
export const DISPOSALS = { action_taken: "Action taken on the spot", notice_issued: "Notice issued to the candidate or party", referred_police: "Referred to the police (FIR or inquiry)", referred_other: "Referred to another authority", not_substantiated: "Not substantiated" };
export const SEIZURE_KINDS = { cash: "Cash", liquor: "Liquor", drugs: "Drugs", freebies: "Freebies and gifts", precious_metals: "Precious metals", other: "Other" };
const SLA_MINUTES = 100;
const complaints = store("mcc-complaint");
const photoKey = (id) => `mcc-complaint:photo:${id}`;
const refKey = (ref) => `mcc-complaint:ref:${ref}`;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

const withClock = (c) => {
    const due = Date.parse(c.receivedAt) + SLA_MINUTES * 60000;
    const end = c.disposal?.at ?? c.droppedAt ?? null;
    return { ...c, statusText: STATUS[c.status], categoryLabel: CATEGORIES[c.category]?.label, severity: CATEGORIES[c.category]?.severity,
        clock: { dueAt: new Date(due).toISOString(), minutesLeft: end ? null : Math.round((due - Date.now()) / 60000), closedWithinSla: end ? Date.parse(end) <= due : null } };
};
const publicView = (c) => {
    const v = withClock(c);
    return { referenceId: v.referenceId, category: v.category, categoryLabel: v.categoryLabel, status: v.status, statusText: v.statusText, constituency: v.jurisdiction.constituency,
        receivedAt: v.receivedAt, clock: v.clock, disposal: v.disposal ? { outcome: v.disposal.outcome, outcomeText: DISPOSALS[v.disposal.outcome], note: v.disposal.note, at: v.disposal.at } : null,
        timeline: v.timeline.map((t) => ({ step: t.step, at: t.at })) };
};

/** Anyone: report a violation. */
export const fileComplaint = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const area = areaOf(b, "constituency");
    const category = oneOf(b.category, CATEGORIES, "category");
    const description = requireText(b.description, "Description", { min: 10, max: 2000 });
    const location = (() => {
        const lat = Number(b.lat), lng = Number(b.lng);
        return Number.isFinite(lat) && Number.isFinite(lng) && lat > 6 && lat < 38 && lng > 68 && lng < 98 ? { lat, lng } : null;
    })();
    let photo = null;
    if (b.photo) {
        const m = String(b.photo).match(DATA_URL);
        if (!m || m[2].length > 5_600_000) throw new ApiError(400, "Attach a JPEG, PNG or WebP photo of up to 4 MB.");
        photo = `data:image/${m[1]};base64,${m[2]}`;
    }
    const anonymous = b.anonymous === true;
    const mobile = anonymous ? null : (/^[6-9]\d{9}$/.test(clean(b.mobile)) ? clean(b.mobile) : null);
    const at = nowIso();
    const c = {
        _id: newId(), referenceId: `CV${new Date().getUTCFullYear()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`, jurisdiction: area, category, description,
        place: clean(b.place, 200) || null, location, hasPhoto: Boolean(photo), anonymous, complainant: anonymous ? null : { mobile, epic: req.user?.epic ?? null, name: req.user?.name ?? null },
        status: "received", receivedAt: at, assignedTo: null, fieldReport: null, seizures: [], disposal: null, droppedAt: null, timeline: [{ step: "received", at }]
    };
    const tx = transaction();
    complaints.save(c, tx);
    tx.set(refKey(c.referenceId), c._id);
    if (photo) tx.set(photoKey(c._id), photo);
    await recordAudit(auditEvent({ actor: req.user ?? null, action: "complaint.received", resource: { type: "mcc_complaint", id: c._id }, jurisdiction: asRecord(area), after: { category, anonymous } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: `Received. A flying squad is expected to act within ${SLA_MINUTES} minutes.`, data: publicView(c) });
});

export const trackComplaint = asyncHandler(async (req, res) => {
    const id = await redis().get(refKey(clean(req.params.ref).toUpperCase()));
    const c = id ? await complaints.get(id) : null;
    if (!c) throw new ApiError(404, "No report was found with that reference.");
    res.json({ success: true, data: publicView(c) });
});

/** Officials in the constituency or district: the queue. Flying squads see what is assigned to them. */
export const listComplaints = asyncHandler(async (req, res) => {
    const q = req.query;
    const squad = hasPermission(req.user, "complaint:investigate") && !hasPermission(req.user, "complaint:dispatch");
    const items = (await complaints.list()).filter((c) => inScope(req, c.jurisdiction))
        .filter((c) => !squad || c.assignedTo?.epic === req.user.epic)
        .filter((c) => !q.status || c.status === q.status)
        .map(withClock);
    const counts = Object.fromEntries(Object.keys(STATUS).map((s) => [s, items.filter((c) => c.status === s).length]));
    const open = items.filter((c) => ["received", "assigned", "field_reported"].includes(c.status));
    const closed = items.filter((c) => c.clock.closedWithinSla !== null);
    const seized = items.flatMap((c) => c.seizures).reduce((acc, s) => ({ ...acc, [s.kind]: (acc[s.kind] ?? 0) + s.value }), {});
    // Flying squads of the area, for dispatch.
    let squads = [];
    if (hasPermission(req.user, "complaint:dispatch")) {
        const { listAllAssignments } = await import("../repositories/assignment.repository.js");
        squads = (await listAllAssignments()).filter((a) => a.role === "flying_squad" && a.status === "active" && inScope(req, a.jurisdiction ?? {})).map((a) => ({ epic: a.epic, jurisdiction: a.jurisdiction }));
    }
    res.json({ success: true, data: { items: page(items, q, "receivedAt"), counts, overdue: open.filter((c) => c.clock.minutesLeft < 0).length,
        withinSla: closed.length ? Math.round((closed.filter((c) => c.clock.closedWithinSla).length / closed.length) * 100) : null, seized,
        squads, categories: CATEGORIES, disposals: DISPOSALS, seizureKinds: SEIZURE_KINDS,
        can: { dispatch: hasPermission(req.user, "complaint:dispatch"), investigate: hasPermission(req.user, "complaint:investigate"), dispose: hasPermission(req.user, "complaint:dispose") } } });
});

export const complaintPhoto = asyncHandler(async (req, res) => {
    const c = await complaints.get(req.params.id);
    if (!c) throw new ApiError(404, "Report not found.");
    assertScope(req, c.jurisdiction, "This report");
    res.json({ success: true, data: { dataUrl: await redis().get(photoKey(c._id)) } });
});

const step = async (req, mutate, action) => complaints.withLock(req.params.id, async () => {
    const c = await complaints.get(req.params.id);
    if (!c) throw new ApiError(404, "Report not found.");
    assertScope(req, c.jurisdiction, "This report");
    const { next, note } = await mutate(c);
    const tx = transaction();
    complaints.save(next, tx);
    await recordAudit(auditEvent({ actor: req.user, action, resource: { type: "mcc_complaint", id: c._id }, jurisdiction: asRecord(c.jurisdiction), before: { status: c.status }, after: { status: next.status }, note }), tx);
    await tx.exec();
    return withClock(next);
});

/** Control room / RO: assign a flying squad, or drop the report. */
export const dispatchComplaint = asyncHandler(async (req, res) => {
    const out = await step(req, async (c) => {
        if (c.status !== "received") throw new ApiError(409, "Only a new report is dispatched.");
        const at = nowIso();
        if (req.body?.drop === true) {
            const note = requireReason(req.body?.note, "dropping the report");
            return { next: { ...c, status: "dropped", droppedAt: at, dropReason: note, timeline: [...c.timeline, { step: "dropped", at, by: req.user.epic }] }, note };
        }
        const epic = clean(req.body?.squadEpic).toUpperCase();
        const { listAllAssignments } = await import("../repositories/assignment.repository.js");
        const squad = (await listAllAssignments()).find((a) => a.role === "flying_squad" && a.status === "active" && a.epic === epic);
        if (!squad) throw new ApiError(400, "Choose an active flying squad.");
        if (!inScope({ authority: { assignments: [squad] } }, c.jurisdiction)) throw new ApiError(400, "That flying squad does not cover this constituency.");
        return { next: { ...c, status: "assigned", assignedTo: { epic, at, by: req.user.epic }, timeline: [...c.timeline, { step: "assigned", at, by: req.user.epic }] }, note: epic };
    }, "complaint.dispatched");
    res.json({ success: true, data: out });
});

/** Flying squad: what was found and done, with any seizure. */
export const fieldReportComplaint = asyncHandler(async (req, res) => {
    const out = await step(req, async (c) => {
        if (c.status !== "assigned" || c.assignedTo?.epic !== req.user.epic) throw new ApiError(409, "This report is not assigned to you.");
        const at = nowIso();
        const seizures = (Array.isArray(req.body?.seizures) ? req.body.seizures : []).slice(0, 10).map((s) => ({
            kind: oneOf(s.kind, SEIZURE_KINDS, "seizure kind"), value: amountOf(s.value, "Seizure value"), description: clean(s.description, 200) || null, at
        }));
        const report = { found: req.body?.found === true, actions: requireText(req.body?.actions, "What you found and did", { min: 10, max: 2000 }), reachedAt: clean(req.body?.reachedAt, 5) || null, by: actorOf(req.user), at };
        return { next: { ...c, status: "field_reported", fieldReport: report, seizures, timeline: [...c.timeline, { step: "field_reported", at, by: req.user.epic }] }, note: report.actions };
    }, "complaint.field_reported");
    // Seizures in the field report go straight into the Election Seizure Management System.
    const { recordComplaintSeizures } = await import("./seizure.controller.js");
    await recordComplaintSeizures(req, out);
    res.json({ success: true, data: out });
});

/** RO / ARO: dispose of the complaint with a reason. */
export const disposeComplaint = asyncHandler(async (req, res) => {
    const out = await step(req, async (c) => {
        if (!["field_reported", "assigned"].includes(c.status)) throw new ApiError(409, "A report is disposed of after the flying squad has acted.");
        const outcome = oneOf(req.body?.outcome, DISPOSALS, "outcome");
        const note = requireReason(req.body?.note, "disposal");
        const at = nowIso();
        return { next: { ...c, status: "disposed", disposal: { outcome, note, by: actorOf(req.user), at }, timeline: [...c.timeline, { step: "disposed", at, by: req.user.epic }] }, note };
    }, "complaint.disposed");
    res.json({ success: true, data: out });
});

export const listAllComplaints = () => complaints.list();
