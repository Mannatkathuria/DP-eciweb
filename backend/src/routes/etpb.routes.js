import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { limiter } from "../middlewares/rateLimit.middleware.js";
import {
    collectPin, downloadBallot, generateBallots, listBallots, postBallot, receiveBallot, recordOfficerEnrolments, recordOfficerPins, trackBallot,
    transmitBallots, validateBallot, verifyServiceParticulars
} from "../controllers/etpb.controller.js";

// Service voters and electronically transmitted postal ballots.
const router = express.Router();
const auth = [verifyJWT, requirePasswordChanged];
const voter = limiter("etpb-voter", { windowMs: 10 * 60 * 1000, limit: 20, message: "Too many attempts. Try again later." });
// Service voter (no account: ballot id + PIN)
router.post("/download", voter, downloadBallot);
router.post("/return", voter, postBallot);
router.get("/track/:ballotId", voter, trackBallot);
// Record Officer
router.get("/record-officer/enrolments", ...auth, authorize("service:record"), recordOfficerEnrolments);
router.post("/record-officer/verify/:formId", ...auth, authorize("service:record"), verifyServiceParticulars);
router.get("/record-officer/pins", ...auth, authorize("service:record"), recordOfficerPins);
router.post("/record-officer/pins/:ballotId/collected", ...auth, authorize("service:record"), collectPin);
// Returning Officer
router.get("/", ...auth, authorize("etpb:manage", "service:record", "record:read", "state:manage", "national:view"), listBallots);
router.post("/:electionId/generate", ...auth, authorize("etpb:manage"), generateBallots);
router.post("/:electionId/transmit", ...auth, authorize("etpb:manage"), transmitBallots);
router.post("/ballots/:ballotId/receive", ...auth, authorize("etpb:manage"), receiveBallot);
router.post("/ballots/:ballotId/validate", ...auth, authorize("etpb:manage"), validateBallot);
export default router;
