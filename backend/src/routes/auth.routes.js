import express from "express";
import rateLimit from "express-rate-limit";
import { login, me, logout, submitRegistration, getRegistrationStatus } from "../controllers/auth.controller.js";
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
router.post("/logout", logout);
router.get("/me", verifyJWT, me);
export default router;
