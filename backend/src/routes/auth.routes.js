import { idempotent } from "../middlewares/idempotency.middleware.js";
import express from "express";
import { limiter } from "../middlewares/rateLimit.middleware.js";
import { login, me, logout, logoutEverywhere, submitRegistration, getRegistrationStatus, getGeography, getRoles } from "../controllers/auth.controller.js";
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
router.post("/register", registerLimiter, idempotent("form6"), submitRegistration);
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
// BLOs sign in here too: their BLO ID (BLO1000001) is shaped like an EPIC; there is no password.
export default router;
