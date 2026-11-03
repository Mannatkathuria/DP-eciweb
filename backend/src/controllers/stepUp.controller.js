import { checkOtp, issueOtp } from "../services/otp.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { signStepUp, stepUpMinutes } from "../middlewares/stepUp.middleware.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const key = (user) => `stepup:${user._id}`;

/** Sends a fresh one-time code to the signed-in official (demo: printed in the backend terminal). */
export const requestStepUp = asyncHandler(async (req, res) => {
    await issueOtp(key(req.user), { ttlMs: 3 * 60 * 1000, logLabel: `step-up ${req.user.epic}` });
    res.json({ success: true, message: "A one-time code has been sent. It expires in 3 minutes." });
});

/** Checks the code and returns a short-lived step-up token for sensitive actions. */
export const verifyStepUp = asyncHandler(async (req, res) => {
    const otp = String(req.body?.otp ?? "");
    if (!/^\d{6}$/.test(otp)) throw new ApiError(400, "Enter the six-digit code.");
    await checkOtp(key(req.user), otp);
    await recordAudit(auditEvent({ actor: req.user, action: "auth.step-up", resource: { type: "user", id: req.user._id } }));
    res.json({ success: true, data: { stepUpToken: signStepUp(req.user), expiresInMinutes: stepUpMinutes() } });
});
