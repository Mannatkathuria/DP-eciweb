import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import {
    completeRound, decideDiscrepancy, getCounting, observerReport, randomise, recordTable, reportDiscrepancy, savePlan, staffPool, vvpatDraw
} from "../controllers/counting.controller.js";

// Counting operations (no vote figures; see counting.controller.js). Each handler also checks
// the caller's jurisdiction and, where it matters, their specific role.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
const COUNTING = ["counting:supervise", "result:declare", "counting:supervise-table", "counting:record", "counting:observe", "counting:object", "counting:read", "observer:report"];
router.get("/:electionId", authorize(...COUNTING), getCounting);
router.get("/:electionId/staff", authorize("counting:supervise", "result:declare"), staffPool);
router.post("/:electionId/plan", authorize("counting:supervise", "result:declare"), savePlan);
router.post("/:electionId/randomise", authorize("counting:supervise", "result:declare"), randomise);
router.post("/:electionId/vvpat-draw", authorize("counting:supervise", "result:declare"), vvpatDraw);
router.post("/:electionId/rounds/:round/tables/:table", authorize("counting:supervise", "result:declare", "counting:supervise-table"), recordTable);
router.post("/:electionId/rounds/:round/complete", authorize("counting:supervise", "result:declare"), completeRound);
router.post("/:electionId/discrepancies", authorize("counting:object", "counting:supervise-table", "observer:report"), reportDiscrepancy);
router.post("/:electionId/discrepancies/:id/decide", authorize("counting:supervise", "result:declare"), decideDiscrepancy);
router.post("/:electionId/observer-reports", authorize("observer:report"), observerReport);
export default router;
