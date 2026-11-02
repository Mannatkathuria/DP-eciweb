import { coversAny } from "../services/authority.service.js";
import { historyFor, recentEvents, verifyAudit } from "../services/audit.service.js";
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
    res.json({ success: true, data: await verifyAudit() });
});
