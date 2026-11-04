import express from "express";
import { optionalJWT, requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { requireStepUp } from "../middlewares/stepUp.middleware.js";
import { limiter } from "../middlewares/rateLimit.middleware.js";
import { decideFirst, decideSecond, fileAppeal, implementAppeal, listAppeals, secondAppeal, trackAppeal } from "../controllers/appeal.controller.js";

// Roll appeals (RP Act 1950, s. 24): first appeal to the district appellate authority, second
// appeal to the CEO; an allowed appeal is implemented by the ERO.
const router = express.Router();
const intake = limiter("appeal-intake", { windowMs: 10 * 60 * 1000, limit: 20, message: "Too many requests. Try again later." });

router.post("/", intake, optionalJWT, fileAppeal);
router.get("/track/:ref", intake, trackAppeal);
router.post("/track/:ref/second", intake, optionalJWT, secondAppeal);
router.get("/", verifyJWT, requirePasswordChanged, authorize("appeal:decide-first", "appeal:decide-second", "application:decide", "record:read"), listAppeals);
router.post("/:id/first", verifyJWT, requirePasswordChanged, authorize("appeal:decide-first"), requireStepUp, decideFirst);
router.post("/:id/second", verifyJWT, requirePasswordChanged, authorize("appeal:decide-second"), requireStepUp, decideSecond);
router.post("/:id/implement", verifyJWT, requirePasswordChanged, authorize("application:decide"), implementAppeal);

export default router;
