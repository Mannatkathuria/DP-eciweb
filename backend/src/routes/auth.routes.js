import express from "express";
import rateLimit from "express-rate-limit";
import { login, me, logout, registerVoter } from "../controllers/auth.controller.js";
import { verifyJWT } from "../middlewares/verifyJWT.middleware.js";

const router = express.Router();
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: "Too many sign-in attempts. Try again later." }
});
router.post("/login", loginLimiter, login);
router.post("/register", registerVoter);
router.post("/logout", logout);
router.get("/me", verifyJWT, me);
export default router;
