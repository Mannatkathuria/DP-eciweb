// Campaign permissions (the "Suvidha" single window): meetings, rallies, processions, vehicles,
// loudspeakers, temporary party offices and helicopters/helipads.
//
//   1. A candidate or their election agent applies for a date and place in their constituency.
//   2. For events on public ground (meetings, rallies, processions, helipads) the police of that
//      area give their remarks first (no objection, or objection with reasons).
//   3. The Returning Officer or ARO grants (with conditions) or refuses, with a reason.
// No meeting or procession is allowed in the 48 hours ending with the close of poll
// (RP Act 1951, s. 126). Every step is audited; the applicant sees the outcome and the reasons.
import { transaction } from "../config/redis.js";
import { getElection } from "../repositories/election.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { campaignContext } from "../services/candidate.service.js";
import { todayIST } from "../services/election.service.js";
import { actorOf, asRecord, assertScope, clean, dateOf, inScope, newId, nowIso, oneOf, page, requireText, store } from "../services/workflow.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const PERMISSION_TYPES = {
    public_meeting: { label: "Public meeting", police: true },
    rally: { label: "Rally or road show", police: true },
    procession: { label: "Procession", police: true },
    vehicle: { label: "Campaign vehicle", police: false },
    loudspeaker: { label: "Loudspeaker", police: false },
    party_office: { label: "Temporary election office", police: false },
    helipad: { label: "Helicopter and helipad", police: true },
    door_to_door: { label: "Door-to-door campaign team", police: false }
};
export const STATUS = {
    applied: "Applied, awaiting police remarks",
    with_ro: "Awaiting the Returning Officer's decision",
    granted: "Granted",
    refused: "Refused",
    withdrawn: "Withdrawn"
};
const OPEN = ["applied", "with_ro"];
const permissions = store("campaign-permission");
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const view = (p) => ({ ...p, typeLabel: PERMISSION_TYPES[p.type]?.label ?? p.type, statusText: STATUS[p.status] });

/** Candidate or election agent: apply. */
export const applyPermission = asyncHandler(async (req, res) => {
    const ctx = await campaignContext(req);
    const election = await getElection(ctx.electionId);
    const body = req.body ?? {};
    const type = oneOf(body.type, PERMISSION_TYPES, "type");
    const date = dateOf(body.date, "Date");
    if (date < todayIST()) throw new ApiError(400, "The date must be today or later.");
    if (election?.schedule?.pollDate && date > election.schedule.pollDate) throw new ApiError(400, "Campaign permissions are for dates up to the poll.");
    const from = clean(body.from), to = clean(body.to);
    if (!TIME.test(from) || !TIME.test(to) || to <= from) throw new ApiError(400, "Give a start and end time (HH:MM), the end after the start.");
    // RP Act 1951, s. 126: no public meeting or procession in the 48 hours ending with the close of poll.
    if (election?.schedule?.pollDate && PERMISSION_TYPES[type].police) {
        const silenceFrom = new Date(`${election.schedule.pollDate}T18:00:00+05:30`).getTime() - 48 * 3600000;
        if (new Date(`${date}T${to}:00+05:30`).getTime() > silenceFrom) throw new ApiError(400, "No public meeting or procession is allowed in the 48 hours ending with the close of poll (RP Act 1951, s. 126).");
    }
    const at = nowIso();
    const item = {
        _id: newId(), electionId: ctx.electionId, electionName: election?.name ?? null, jurisdiction: ctx.area, candidate: ctx.candidate,
        type, date, from, to, venue: requireText(body.venue, "Venue", { min: 5, max: 300 }), purpose: requireText(body.purpose, "Purpose", { min: 5, max: 600 }),
        expectedCrowd: Number.isFinite(Number(body.expectedCrowd)) && Number(body.expectedCrowd) > 0 ? Math.round(Number(body.expectedCrowd)) : null,
        vehicleNumbers: clean(body.vehicleNumbers, 300) || null,
        status: PERMISSION_TYPES[type].police ? "applied" : "with_ro",
        appliedBy: actorOf(req.user), appliedAs: ctx.as, appliedAt: at, police: null, decision: null,
        history: [{ step: "applied", at, by: req.user.epic }]
    };
    const tx = transaction();
    permissions.save(item, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "permission.applied", resource: { type: "campaign_permission", id: item._id }, jurisdiction: asRecord(item.jurisdiction), after: { type, date, venue: item.venue } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: item.status === "applied" ? "Applied. The police give their remarks, then the Returning Officer decides." : "Applied. The Returning Officer decides.", data: view(item) });
});

/** Applicant: their applications (for the candidate they act for). */
export const myPermissions = asyncHandler(async (req, res) => {
    const ctx = await campaignContext(req);
    const items = (await permissions.list()).filter((p) => p.electionId === ctx.electionId && (p.appliedBy.epic === req.user.epic || (ctx.candidate.nominationId && p.candidate.nominationId === ctx.candidate.nominationId) || p.candidate.epic === req.user.epic));
    res.json({ success: true, data: { items: page(items, req.query, "appliedAt").map(view), types: PERMISSION_TYPES, context: ctx } });
});

/** RO/ARO, police and readers: applications in their jurisdiction. */
export const listPermissions = asyncHandler(async (req, res) => {
    const q = req.query;
    const items = (await permissions.list()).filter((p) => inScope(req, p.jurisdiction))
        .filter((p) => (!q.status || p.status === q.status) && (!q.electionId || p.electionId === q.electionId));
    const counts = Object.fromEntries(Object.keys(STATUS).map((s) => [s, items.filter((p) => p.status === s).length]));
    res.json({ success: true, data: { items: page(items, q, "appliedAt").map(view), counts, types: PERMISSION_TYPES,
        can: { police: hasPermission(req.user, "security:coordinate"), decide: hasPermission(req.user, "permission:decide") } } });
});

/** Police (sector or district police officer): remarks on an application. */
export const policeRemarks = asyncHandler(async (req, res) => {
    const item = await permissions.withLock(req.params.id, async () => {
        const p = await permissions.get(req.params.id);
        if (!p) throw new ApiError(404, "Application not found.");
        assertScope(req, p.jurisdiction, "This application");
        if (p.status !== "applied") throw new ApiError(409, "Police remarks are taken only while the application awaits them.");
        const remark = oneOf(req.body?.remark, ["no_objection", "objection"], "remark");
        const note = remark === "objection" ? requireReason(req.body?.note, "objection") : clean(req.body?.note, 500) || null;
        const at = nowIso();
        const updated = { ...p, status: "with_ro", police: { remark, note, by: actorOf(req.user), at }, history: [...p.history, { step: `police_${remark}`, at, by: req.user.epic }] };
        const tx = transaction();
        permissions.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "permission.police_remarks", resource: { type: "campaign_permission", id: p._id }, jurisdiction: asRecord(p.jurisdiction), after: { remark }, note }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: view(item) });
});

/** RO/ARO: grant with conditions, or refuse with a reason. */
export const decidePermission = asyncHandler(async (req, res) => {
    const item = await permissions.withLock(req.params.id, async () => {
        const p = await permissions.get(req.params.id);
        if (!p) throw new ApiError(404, "Application not found.");
        assertScope(req, p.jurisdiction, "This application");
        if (p.status !== "with_ro") throw new ApiError(409, p.status === "applied" ? "Wait for the police remarks first." : `This application is already ${STATUS[p.status].toLowerCase()}.`);
        const decision = oneOf(req.body?.decision, ["grant", "refuse"], "decision");
        const reason = decision === "refuse" ? requireReason(req.body?.reason, "refusal") : clean(req.body?.reason, 500) || null;
        const conditions = decision === "grant" ? clean(req.body?.conditions, 800) || "Subject to the Model Code of Conduct and the directions of the police on the day." : null;
        if (decision === "grant" && p.police?.remark === "objection" && !reason) throw new ApiError(400, "The police objected. Record why you grant the permission anyway.");
        const at = nowIso();
        const status = decision === "grant" ? "granted" : "refused";
        const updated = { ...p, status, decision: { decision, reason, conditions, by: actorOf(req.user), at, permitNumber: decision === "grant" ? `PRM-${p._id.slice(0, 8).toUpperCase()}` : null },
            history: [...p.history, { step: status, at, by: req.user.epic }] };
        const tx = transaction();
        permissions.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: `permission.${status}`, resource: { type: "campaign_permission", id: p._id }, jurisdiction: asRecord(p.jurisdiction), after: { status, conditions }, note: reason }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: view(item) });
});

/** Applicant: withdraw while it is open. */
export const withdrawPermission = asyncHandler(async (req, res) => {
    const item = await permissions.withLock(req.params.id, async () => {
        const p = await permissions.get(req.params.id);
        if (!p || p.appliedBy.epic !== req.user.epic) throw new ApiError(404, "Application not found.");
        if (!OPEN.includes(p.status)) throw new ApiError(409, "Only an open application can be withdrawn.");
        const at = nowIso();
        const updated = { ...p, status: "withdrawn", history: [...p.history, { step: "withdrawn", at, by: req.user.epic }] };
        const tx = transaction();
        permissions.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "permission.withdrawn", resource: { type: "campaign_permission", id: p._id }, jurisdiction: asRecord(p.jurisdiction) }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: view(item) });
});

export const listAllPermissions = () => permissions.list();
