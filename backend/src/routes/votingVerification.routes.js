import express from "express";
import { authorize } from "../middlewares/authorize.middleware.js";
import {
    startVotingVerification,
    startVotingPersona,
    syncVotingPersona,
    submitVotingDocument,
    submitVotingFace,
    verifyFingerprint
} from "../controllers/votingVerification.controller.js";
import { verifyJWT, requireRole } from "../middlewares/verifyJWT.middleware.js";

const router = express.Router();
// Legacy national demo of the polling-day identity steps (works only in demo mode). ECI
// administrator only; the station-scoped poll-day module (/poll-day) is the real workflow.
router.use(verifyJWT, requireRole("eci"), authorize("verification:review"));

router.post("/start", startVotingVerification);
router.post("/:id/persona/start", startVotingPersona);
router.post("/:id/persona/sync", syncVotingPersona);
// Retired steps of the old in-app camera flow: they answer 410 Gone, so an old client fails clearly.
router.get("/:id/reference-photo", submitVotingDocument);
router.post("/:id/document", submitVotingDocument);
router.post("/:id/face/challenge", submitVotingFace);
router.post("/:id/face", submitVotingFace);
router.post("/:id/fingerprint", verifyFingerprint);

export default router;
