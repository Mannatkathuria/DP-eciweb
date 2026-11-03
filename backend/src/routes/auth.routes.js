import express from "express";
import { limiter } from "../middlewares/rateLimit.middleware.js";
import { login, me, logout, logoutEverywhere, submitRegistration, getRegistrationStatus, getGeography, getRoles } from "../controllers/auth.controller.js";
import {
    bloLogin, bloResendOtp, bloVerifyOtp, changeBloPassword,
    bloForgotPassword, bloResendResetOtp, bloResetPassword
} from "../controllers/blo.controller.js";
import { verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { requestStepUp, verifyStepUp } from "../controllers/stepUp.controller.js";
import { respondToInformationRequest } from "../controllers/followUp.controller.js";
import { applicantCheck } from "../controllers/auth.controller.js";

const router = express.Router();
const loginLimiter = limiter("login", { windowMs: 15 * 60 * 1000, limit: 20, message: "Too many sign-in attempts. Try again later." });

// EPIC in -> OTP generated. The session itself is issued after OTP verification.
router.post("/login", loginLimiter, login);
// Public: submits a registration REQUEST (no account is created until a BLO approves it).
const registerLimiter = limiter("register", { windowMs: 60 * 60 * 1000, limit: 10, message: "Too many registration requests. Try again later." });
router.post("/register", registerLimiter, submitRegistration);
router.get("/register/:id", getRegistrationStatus);
// The applicant answers an information request, proving it is them with the reference ID and date of birth.
router.post("/register/:id/information", registerLimiter, respondToInformationRequest("registration", applicantCheck));
// Public: State/UT -> district -> assembly constituency options for the registration form.
router.get("/geography", getGeography);
// Public: every sign-in role with its group and permissions.
router.get("/roles", getRoles);
router.post("/logout", logout);
router.post("/logout-all", verifyJWT, logoutEverywhere);
router.get("/me", verifyJWT, me);
// Re-authentication before sensitive approvals: a fresh code, then a 10-minute step-up token.
router.post("/step-up/request", loginLimiter, verifyJWT, requestStepUp);
router.post("/step-up/verify", loginLimiter, verifyJWT, verifyStepUp);

// BLO sign-in: BLO ID + password, then an OTP sent to the BLO's mobile (valid 2 minutes).
const bloLimiter = limiter("blo", { windowMs: 15 * 60 * 1000, limit: 30, message: "Too many sign-in attempts. Try again later." });
router.post("/blo/login", bloLimiter, bloLogin);
router.post("/blo/verify", bloLimiter, bloVerifyOtp);
router.post("/blo/resend", bloLimiter, bloResendOtp);
router.post("/blo/password", verifyJWT, changeBloPassword);
// Forgot password: OTP to the registered mobile, then a new password. Limited separately from
// sign-in so failed sign-in attempts do not block a reset.
const bloResetLimiter = limiter("bloReset", { windowMs: 15 * 60 * 1000, limit: 20, message: "Too many password reset attempts. Try again later." });
router.post("/blo/forgot", bloResetLimiter, bloForgotPassword);
router.post("/blo/forgot/resend", bloResetLimiter, bloResendResetOtp);
router.post("/blo/reset", bloResetLimiter, bloResetPassword);
export default router;
