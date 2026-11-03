import { coversAny } from "../services/authority.service.js";
import { hashEvent, historyFor, recentEvents, verifyAudit } from "../services/audit.service.js";
import { verifyAuditChain } from "../services/projector.service.js";
import { auditSearch } from "../services/readModel.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Audit events carry the jurisdiction of the record acted on; a supervisory user only sees
// events from inside their own assignment. National roles see everything.
const visible = (req, events) =>
    events.filter((e) => coversAny(req.authority.assignments, { ...e.jurisdiction, assemblyConstituency: e.jurisdiction?.constituency }));

export const listRecentAudit = asyncHandler(async (req, res) => {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const items = visible(req, await recentEvents(limit));
    res.json({ success: true, data: { items, total: items.length } });
});

export const getResourceHistory = asyncHandler(async (req, res) => {
    const items = visible(req, await historyFor(req.params.type, req.params.id));
    res.json({ success: true, data: { items, total: items.length } });
});

/** ECI administrator: recompute every event hash and compare the counter with the trail. */
export const checkAuditIntegrity = asyncHandler(async (req, res) => {
    const local = await verifyAudit();
    // The hash chain anchored in MongoDB (a second database) catches a rewrite that kept each event's own hash consistent.
    const chain = await verifyAuditChain(hashEvent);
    res.json({ success: true, data: { ...local, chain, ok: local.ok && (chain.checked ? chain.ok : true) } });
});

const when = (v, label) => {
    if (v === undefined || v === "") return null;
    if (!Number.isFinite(Date.parse(v))) throw new ApiError(400, `${label} must be a date and time.`);
    return new Date(v).toISOString();
};

/** Search the audit trail by action, actor, record and time (MongoDB archive, or the latest Redis entries). */
export const searchAudit = asyncHandler(async (req, res) => {
    const q = req.query;
    if (q.actor && !/^[A-Z]{3}\d{7}$/.test(String(q.actor).toUpperCase())) throw new ApiError(400, "Actor must be an EPIC number.");
    const limit = Math.min(200, Math.max(1, parseInt(q.limit) || 50));
    const result = await auditSearch(req.authority.assignments, {
        action: q.action ? String(q.action).trim().slice(0, 60) : null, actor: q.actor ? String(q.actor).toUpperCase() : null,
        resourceType: q.resourceType || null, resourceId: q.resourceId || null,
        from: when(q.from, "From"), to: when(q.to, "To"), before: when(q.before, "Before"), limit
    });
    res.json({ success: true, data: result });
});
