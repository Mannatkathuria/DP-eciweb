import express from "express";
import { verifyJWT, requirePasswordChanged, requireRole } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { requireStepUp } from "../middlewares/stepUp.middleware.js";
import {
    decideObjection, fieldReportObjection, fileObjection, listObjectionsForStaff, myObjections, replyToObjection, withdrawObjection
} from "../controllers/objection.controller.js";

// Form 7: objections to inclusion and requests for deletion. Electors and booth level agents file;
// the elector objected to may reply; the BLO verifies; the ERO/AERO decides.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

const canFile = authorize("application:submit", "roll:claims-objections");
router.post("/", canFile, fileObjection);
router.get("/my", canFile, myObjections);
router.post("/:id/withdraw", canFile, withdrawObjection);
router.post("/:id/reply", requireRole("voter"), authorize("roll:view-own"), replyToObjection);

router.get("/staff", authorize("application:decide", "verification:field-report"), listObjectionsForStaff);
router.post("/staff/:id/field-report", authorize("verification:field-report"), fieldReportObjection);
router.post("/staff/:id/decide", authorize("application:decide"), requireStepUp, decideObjection);

export default router;
