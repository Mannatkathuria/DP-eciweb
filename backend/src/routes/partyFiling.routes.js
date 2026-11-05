import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { complianceDashboard, fileReturn, getFiling, myFilings, scrutiniseFiling } from "../controllers/partyFiling.controller.js";

// IEMS: political parties' contribution reports, audited accounts and election expenditure statements.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
router.get("/mine", authorize("party:file"), myFilings);
router.post("/", authorize("party:file"), fileReturn);
router.get("/compliance", authorize("party:review", "national:view"), complianceDashboard);
router.get("/:id", authorize("party:file", "party:review", "national:view"), getFiling);
router.post("/:id/scrutiny", authorize("party:review"), scrutiniseFiling);
export default router;
