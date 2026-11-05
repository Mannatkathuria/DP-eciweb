import express from "express";
import { limiter } from "../middlewares/rateLimit.middleware.js";
import { askAssistant, assistServices } from "../controllers/assist.controller.js";

// Voter Mitra: public.
const router = express.Router();
const ask = limiter("assist", { windowMs: 60 * 1000, limit: 30, message: "Too many questions in a minute. Try again shortly." });
router.get("/services", assistServices);
router.post("/ask", ask, askAssistant);
export default router;
