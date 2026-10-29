import express from "express";
import rateLimit from "express-rate-limit";
import { login, me, logout, submitRegistration, getRegistrationStatus, getGeography } from "../controllers/auth.controller.js";
import {
    bloLogin, bloResendOtp, bloVerifyOtp, changeBloPassword,
    bloForgotPassword, bloResendResetOtp, bloResetPassword
} from "../controllers/blo.controller.js";
import { verifyJWT } from "../middlewares/verifyJWT.middleware.js";

const router = express.Router();
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Too many sign-in attempts. Try again later." }
});

// EPIC in -> OTP generated. The session itself is issued after OTP verification.
router.post("/login", loginLimiter, login);
// Public: submits a registration REQUEST (no account is created until a BLO approves it).
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Too many registration requests. Try again later." }
});
router.post("/register", registerLimiter, submitRegistration);
router.get("/register/:id", getRegistrationStatus);
// Public: State/UT -> district -> assembly constituency options for the registration form.
router.get("/geography", getGeography);
router.post("/logout", logout);
router.get("/me", verifyJWT, me);

// BLO sign-in: BLO ID + password, then an OTP sent to the BLO's mobile (valid 2 minutes).
const bloLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Too many sign-in attempts. Try again later." }
});
router.post("/blo/login", bloLimiter, bloLogin);
router.post("/blo/verify", bloLimiter, bloVerifyOtp);
router.post("/blo/resend", bloLimiter, bloResendOtp);
router.post("/blo/password", verifyJWT, changeBloPassword);
// Forgot password: OTP to the registered mobile, then a new password. Limited separately from
// sign-in so failed sign-in attempts do not block a reset.
const bloResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Too many password reset attempts. Try again later." }
});
router.post("/blo/forgot", bloResetLimiter, bloForgotPassword);
router.post("/blo/forgot/resend", bloResetLimiter, bloResendResetOtp);
router.post("/blo/reset", bloResetLimiter, bloResetPassword);
export default router;
