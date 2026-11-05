import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { requireStepUp } from "../middlewares/stepUp.middleware.js";
import {
    approveStationChange, ceoForward, closeStationIssue, forwardToCeo, importStations, listStationIssues, listStationsForStaff, proposeRelocation, proposeStation,
    publishStationChange, recordConsultation, rejectStationChange, reportStationIssue, seekClarification
} from "../controllers/pollingStation.controller.js";

// Officials' view of polling stations (RP Act 1951, s. 25): the DEO drafts and consults, the CEO
// forwards, the Commission gives prior approval, the DEO publishes. Public reads are in public.routes.js.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/", authorize("station:view", "station:propose", "station:approve", "state:manage", "station:survey"), listStationsForStaff);

// Problems with a station, reported by anyone working in the area; the DEO closes them.
const CAN_REPORT_ISSUE = ["station:view", "station:propose", "polling:inspect", "roll:view-part", "application:decide", "roll:claims-objections", "nomination:submit"];
router.get("/issues", authorize(...CAN_REPORT_ISSUE, "state:manage", "station:approve"), listStationIssues);
router.post("/issues", authorize(...CAN_REPORT_ISSUE), reportStationIssue);
router.post("/issues/:issueId/close", authorize("station:propose"), closeStationIssue);
router.post("/", authorize("station:propose"), proposeStation);
router.post("/import", authorize("station:propose"), importStations);
router.post("/:id/relocation", authorize("station:propose"), proposeRelocation);
router.post("/:id/consultation", authorize("station:propose"), recordConsultation);
router.post("/:id/forward", authorize("station:propose"), forwardToCeo);
router.post("/:id/ceo-forward", authorize("state:manage"), ceoForward);
router.post("/:id/clarification", authorize("station:approve"), seekClarification);
router.post("/:id/approve", authorize("station:approve"), requireStepUp, approveStationChange);
router.post("/:id/publish", authorize("station:propose"), requireStepUp, publishStationChange);
router.post("/:id/reject", authorize("station:approve"), requireStepUp, rejectStationChange);

export default router;
