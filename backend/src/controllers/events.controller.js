import { eventsSince, EVENT_TYPES } from "../services/events.service.js";
import { eventHistory } from "../services/readModel.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** Catch-up feed: operational events after `since` (ISO time or ms), within the caller's jurisdiction. */
export const listEvents = asyncHandler(async (req, res) => {
    const types = req.query.types ? String(req.query.types).split(",").filter((t) => EVENT_TYPES.includes(t)) : null;
    if (req.query.types && !types.length) throw new ApiError(400, "Unknown event type.");
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const items = await eventsSince(req.authority.assignments, req.query.since, { limit, types });
    res.json({ success: true, data: { items, last: items.at(-1)?.at ?? req.query.since ?? null } });
});

const isoOrNull = (v, label) => {
    if (v === undefined || v === "") return null;
    if (!Number.isFinite(Date.parse(v))) throw new ApiError(400, `${label} must be a date and time.`);
    return new Date(v).toISOString();
};

/** Searchable event history (MongoDB archive, or the Redis log), newest first, within the caller's jurisdiction. */
export const listEventHistory = asyncHandler(async (req, res) => {
    const types = req.query.types ? String(req.query.types).split(",").filter((t) => EVENT_TYPES.includes(t)) : null;
    if (req.query.types && !types.length) throw new ApiError(400, "Unknown event type.");
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const result = await eventHistory(req.authority.assignments, {
        types, stationId: req.query.stationId || null, electionId: req.query.electionId || null,
        from: isoOrNull(req.query.from, "From"), to: isoOrNull(req.query.to, "To"), before: isoOrNull(req.query.before, "Before"), limit
    });
    res.json({ success: true, data: result });
});
