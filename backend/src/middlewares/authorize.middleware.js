import { effectiveAssignments, hasPermission } from "../services/authority.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Permission check, run after verifyJWT. Passes when the caller's role carries at least one of
 * the listed permissions, and loads the caller's assignments into `req.authority` so that the
 * controller can check jurisdiction for the specific record it acts on.
 */
export const authorize = (...permissions) => asyncHandler(async (req, res, next) => {
    const granted = permissions.filter((p) => hasPermission(req.user, p));
    if (!granted.length) throw new ApiError(403, "Your role is not authorised for this action.");
    req.authority = { permissions: granted, assignments: await effectiveAssignments(req.user) };
    next();
});
