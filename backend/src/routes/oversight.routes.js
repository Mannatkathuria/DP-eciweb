import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { requireStepUp } from "../middlewares/stepUp.middleware.js";
import {
    closeDirection, complyDirection, fileReport, issueDirection, listDirections, listReports, reviewReport, supplementReport
} from "../controllers/oversight.controller.js";

// Observer reports to the Commission, and the Commission's directions to field officers.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

const READ_REPORTS = ["observer:report", "observer:view", "national:view", "national:manage", "direction:issue"];
router.get("/observer-reports", authorize(...READ_REPORTS), listReports);
router.post("/observer-reports", authorize("observer:report"), fileReport);
router.post("/observer-reports/:id/review", authorize("national:manage", "direction:issue"), reviewReport);
router.post("/observer-reports/:id/supplement", authorize("observer:report"), supplementReport);

// Any official can be the addressee of a direction; who sees what is decided per direction.
const OFFICIALS = ["direction:issue", "national:view", "national:manage", "state:manage", "district:manage", "nomination:scrutinise", "application:decide", "polling:inspect", "polling:conduct", "security:plan", "observer:report"];
router.get("/directions", authorize(...OFFICIALS), listDirections);
router.post("/directions", authorize("direction:issue"), requireStepUp, issueDirection);
router.post("/directions/:id/comply", authorize(...OFFICIALS), complyDirection);
router.post("/directions/:id/close", authorize("direction:issue"), closeDirection);

export default router;
