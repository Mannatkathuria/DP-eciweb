import express from "express";
import {
    startVotingVerification,
    startVotingPersona,
    syncVotingPersona,
    submitVotingDocument,
    issueVotingChallenge,
    submitVotingFace,
    verifyFingerprint,
    getVotingReferencePhoto
} from "../controllers/votingVerification.controller.js";
import { verifyJWT, requireRole } from "../middlewares/verifyJWT.middleware.js";

const router = express.Router();
// Legacy national demo of the polling-day identity steps (works only in demo mode). ECI
// administrator only; the station-scoped poll-day module (/poll-day) is the real workflow.
router.use(verifyJWT, requireRole("eci"));

router.post("/start", startVotingVerification);
router.post("/:id/persona/start", startVotingPersona);
router.post("/:id/persona/sync", syncVotingPersona);
router.get("/:id/reference-photo", getVotingReferencePhoto);
router.post("/:id/document", submitVotingDocument);
router.post("/:id/face/challenge", issueVotingChallenge);
router.post("/:id/face", submitVotingFace);
router.post("/:id/fingerprint", verifyFingerprint);

export default router;
