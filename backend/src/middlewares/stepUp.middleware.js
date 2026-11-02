import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiErrors.js";

// Re-authentication ("step-up") for sensitive approvals. A signed-in official confirms a fresh
// one-time code (POST /auth/step-up/request, then /auth/step-up/verify) and gets a step-up token
// valid for STEP_UP_MINUTES (default 10). Sensitive endpoints require it in the X-Step-Up header.
// The token is bound to the account and is useless on its own: the session is still required.

export const STEP_UP_PURPOSE = "step-up";
export const stepUpMinutes = () => Math.min(30, Math.max(1, Number(process.env.STEP_UP_MINUTES) || 10));
export const stepUpRequired = () => process.env.STEP_UP_REQUIRED !== "false";

export const signStepUp = (user) => jwt.sign(
    { _id: user._id, purpose: STEP_UP_PURPOSE }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: `${stepUpMinutes()}m` });

export const requireStepUp = (req, res, next) => {
    if (!stepUpRequired()) return next();
    const token = req.header("X-Step-Up");
    const fail = (message) => next(new ApiError(401, message, [{ code: "STEP_UP_REQUIRED" }]));
    if (!token) return fail("Confirm it's you with a fresh one-time code before this action.");
    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        if (decoded.purpose !== STEP_UP_PURPOSE || decoded._id !== req.user?._id) return fail("That confirmation belongs to another session. Confirm again.");
        req.stepUpAt = new Date(decoded.iat * 1000).toISOString();
        next();
    } catch { return fail("Your confirmation has expired. Confirm it's you again."); }
};
