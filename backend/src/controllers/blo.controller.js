import jwt from "jsonwebtoken";
import { redis } from "../config/redis.js";
import { getUserByEpic, saveUser } from "../repositories/user.repository.js";
import {
    BLO_ID_PATTERN, BLO_OTP_TTL_MS, LOCK_MS, MAX_FAILED_PASSWORDS,
    hashPassword, maskMobile, normaliseBloId, passwordProblem, verifyPassword
} from "../services/blo.service.js";
import { checkOtp, issueOtp } from "../services/otp.service.js";
import { issueSession, publicUser } from "../services/session.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// The password step returns a short-lived signed challenge; the OTP is only accepted with it,
// so an OTP alone can never sign a BLO in.
// Sign-in and password reset use separate challenges and separate OTPs, so neither can stand in
// for the other.
const SIGN_IN = { purpose: "blo-otp", otpPrefix: "blo", logPrefix: "BLO",
    expired: "Your sign-in session has expired. Enter your BLO ID and password again." };
const RESET = { purpose: "blo-reset", otpPrefix: "blo-reset", logPrefix: "BLO PASSWORD RESET",
    expired: "This password reset has expired. Start again." };
const CHALLENGE_TTL = "10m";
const RESEND_COOLDOWN_SECONDS = 30;
const otpKey = (flow, bloId) => `${flow.otpPrefix}:${bloId}`;
const cooldownKey = (flow, bloId) => `${flow.otpPrefix}:otp:cooldown:${bloId}`;
const INVALID_CREDENTIALS = "Incorrect BLO ID or password.";

const sendOtp = (user, flow = SIGN_IN) => issueOtp(otpKey(flow, user.bloId), {
    ttlMs: BLO_OTP_TTL_MS,
    logLabel: `${flow.logPrefix} ${user.bloId} (mobile ${maskMobile(user.mobile)})`
});

const readChallenge = async (challenge, flow = SIGN_IN) => {
    let payload;
    try { payload = jwt.verify(String(challenge ?? ""), process.env.ACCESS_TOKEN_SECRET); }
    catch { throw new ApiError(401, flow.expired); }
    if (payload?.purpose !== flow.purpose || !BLO_ID_PATTERN.test(payload.bloId ?? "")) {
        throw new ApiError(401, flow.expired);
    }
    const user = await getUserByEpic(payload.bloId);
    if (!user || user.role !== "blo" || user._id !== payload.uid) throw new ApiError(401, flow.expired);
    return user;
};

const otpResponse = (user, flow = SIGN_IN) => ({
    challenge: jwt.sign({ purpose: flow.purpose, bloId: user.bloId, uid: user._id },
        process.env.ACCESS_TOKEN_SECRET, { expiresIn: CHALLENGE_TTL }),
    maskedMobile: maskMobile(user.mobile),
    expiresInSeconds: BLO_OTP_TTL_MS / 1000,
    resendAfterSeconds: RESEND_COOLDOWN_SECONDS
});

/** Step 1: BLO ID + password. On success an OTP (valid 2 minutes) is sent to the BLO's mobile. */
export const bloLogin = asyncHandler(async (req, res) => {
    const bloId = normaliseBloId(req.body?.bloId);
    const password = String(req.body?.password ?? "");
    if (!bloId || !password) throw new ApiError(400, "Enter your BLO ID and password.");
    if (!BLO_ID_PATTERN.test(bloId)) throw new ApiError(401, INVALID_CREDENTIALS);

    const user = await getUserByEpic(bloId);
    if (!user || user.role !== "blo" || !user.passwordHash) throw new ApiError(401, INVALID_CREDENTIALS);

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const minutes = Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000);
        throw new ApiError(423, `Too many incorrect passwords. Try again in ${minutes} minute(s).`);
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
        const attempts = (user.failedPasswordAttempts || 0) + 1;
        const locked = attempts >= MAX_FAILED_PASSWORDS;
        await saveUser({
            ...user,
            failedPasswordAttempts: locked ? 0 : attempts,
            lockedUntil: locked ? new Date(Date.now() + LOCK_MS).toISOString() : null
        });
        if (locked) throw new ApiError(423, `Too many incorrect passwords. Try again in ${LOCK_MS / 60000} minute(s).`);
        throw new ApiError(401, INVALID_CREDENTIALS);
    }

    await saveUser({ ...user, failedPasswordAttempts: 0, lockedUntil: null });
    await redis().set(cooldownKey(SIGN_IN, bloId), "1", { EX: RESEND_COOLDOWN_SECONDS });
    sendOtp(user);
    res.json({ success: true, message: "OTP sent to your registered mobile number.", data: otpResponse(user) });
});

/** Sends a fresh OTP for an in-progress sign-in (after a short cooldown). */
export const bloResendOtp = asyncHandler(async (req, res) => {
    const user = await readChallenge(req.body?.challenge);
    const allowed = await redis().set(cooldownKey(SIGN_IN, user.bloId), "1", { NX: true, EX: RESEND_COOLDOWN_SECONDS });
    if (allowed !== "OK") throw new ApiError(429, `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another OTP.`);
    sendOtp(user);
    res.json({ success: true, message: "A new OTP was sent to your registered mobile number.", data: otpResponse(user) });
});

/** Step 2: the OTP from the BLO's mobile. Signs the BLO in. */
export const bloVerifyOtp = asyncHandler(async (req, res) => {
    const user = await readChallenge(req.body?.challenge);
    const otp = String(req.body?.otp ?? "");
    if (!/^\d{6}$/.test(otp)) throw new ApiError(400, "Enter the six-digit OTP.");
    checkOtp(otpKey(SIGN_IN, user.bloId), otp);

    const token = issueSession(res, user);
    res.json({ success: true, message: "Signed in.", token, user: publicUser(user) });
});

/** Signed-in BLO replaces their password (required after the first sign-in). */
export const changeBloPassword = asyncHandler(async (req, res) => {
    if (req.user?.role !== "blo") throw new ApiError(403, "Only BLO accounts can change their password here.");
    const { currentPassword, newPassword } = req.body ?? {};
    if (!(await verifyPassword(currentPassword, req.user.passwordHash))) {
        throw new ApiError(400, "Current password is incorrect.");
    }
    const problem = passwordProblem(newPassword);
    if (problem) throw new ApiError(400, problem);
    if (String(newPassword) === String(currentPassword)) {
        throw new ApiError(400, "Choose a password different from your current one.");
    }
    const updated = {
        ...req.user, passwordHash: await hashPassword(newPassword), mustChangePassword: false,
        passwordChangedAt: new Date().toISOString()
    };
    await saveUser(updated);
    // Sessions issued before a password change are rejected (see verifyJWT), so renew this one.
    issueSession(res, updated);
    res.json({ success: true, message: "Password updated.", data: publicUser(updated) });
});

/** Forgot password, step 1: BLO ID -> OTP (valid 2 minutes) to the mobile registered for it. */
export const bloForgotPassword = asyncHandler(async (req, res) => {
    const bloId = normaliseBloId(req.body?.bloId);
    if (!bloId) throw new ApiError(400, "Enter your BLO ID.");
    const user = BLO_ID_PATTERN.test(bloId) ? await getUserByEpic(bloId) : null;
    if (!user || user.role !== "blo" || !user.mobile) throw new ApiError(404, "No BLO account was found with that ID.");

    const allowed = await redis().set(cooldownKey(RESET, bloId), "1", { NX: true, EX: RESEND_COOLDOWN_SECONDS });
    if (allowed !== "OK") throw new ApiError(429, `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another OTP.`);
    sendOtp(user, RESET);
    res.json({ success: true, message: "OTP sent to the registered mobile number.", data: otpResponse(user, RESET) });
});

/** Sends a fresh reset OTP for an in-progress reset (after a short cooldown). */
export const bloResendResetOtp = asyncHandler(async (req, res) => {
    const user = await readChallenge(req.body?.challenge, RESET);
    const allowed = await redis().set(cooldownKey(RESET, user.bloId), "1", { NX: true, EX: RESEND_COOLDOWN_SECONDS });
    if (allowed !== "OK") throw new ApiError(429, `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another OTP.`);
    sendOtp(user, RESET);
    res.json({ success: true, message: "A new OTP was sent to the registered mobile number.", data: otpResponse(user, RESET) });
});

/**
 * Forgot password, step 2: OTP + new password. Replaces the stored password, clears any lockout,
 * and signs out existing sessions. The BLO then signs in normally with the new password.
 */
export const bloResetPassword = asyncHandler(async (req, res) => {
    const user = await readChallenge(req.body?.challenge, RESET);
    const otp = String(req.body?.otp ?? "");
    const newPassword = req.body?.newPassword;
    if (!/^\d{6}$/.test(otp)) throw new ApiError(400, "Enter the six-digit OTP.");
    // Check the new password first so a weak password does not use up the OTP.
    const problem = passwordProblem(newPassword);
    if (problem) throw new ApiError(400, problem);
    checkOtp(otpKey(RESET, user.bloId), otp);

    await saveUser({
        ...user, passwordHash: await hashPassword(newPassword), mustChangePassword: false,
        failedPasswordAttempts: 0, lockedUntil: null, passwordChangedAt: new Date().toISOString()
    });
    res.json({ success: true, message: "Password reset. Sign in with your new password." });
});
