import express from "express";
import {
    startVotingVerification, submitVotingDocument,
    issueVotingChallenge, submitVotingFace, verifyFingerprint, getVotingReferencePhoto
} from "../controllers/votingVerification.controller.js";
import { verifyJWT, requireRole } from "../middlewares/verifyJWT.middleware.js";

const router = express.Router();
router.use(verifyJWT, requireRole("eci"));
router.post("/start", startVotingVerification);
router.get("/:id/reference-photo", getVotingReferencePhoto);
router.post("/:id/document", submitVotingDocument);
router.post("/:id/face/challenge", issueVotingChallenge);
router.post("/:id/face", submitVotingFace);
router.post("/:id/fingerprint", verifyFingerprint);
export default router;
