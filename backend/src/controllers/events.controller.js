import { eventsSince, EVENT_TYPES } from "../services/events.service.js";
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
