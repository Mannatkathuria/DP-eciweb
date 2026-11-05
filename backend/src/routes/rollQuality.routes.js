import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { decideFlag, flagCertificate, issueNotice, listFlags, recordFieldFinding, recordNoticeDelivery, reportDeath, scanRoll, sendForFieldCheck } from "../controllers/rollQuality.controller.js";

// ERONET roll quality: PSE/DSE flags, deaths reported by BLOs, notices, hearings and orders.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
const READ = ["roll:manage", "application:decide", "verification:field-report", "blo:supervise", "record:read"];
router.get("/", authorize(...READ), listFlags);
router.post("/scan", authorize("roll:manage"), scanRoll);
router.post("/death-report", authorize("verification:field-report"), reportDeath);
router.get("/:id/certificate", authorize("application:decide", "verification:field-report"), flagCertificate);
router.post("/:id/field-check", authorize("application:decide"), sendForFieldCheck);
router.post("/:id/field-finding", authorize("verification:field-report"), recordFieldFinding);
router.post("/:id/notice", authorize("application:decide"), issueNotice);
router.post("/:id/notice-delivered", authorize("verification:field-report"), recordNoticeDelivery);
router.post("/:id/decide", authorize("application:decide"), decideFlag);
export default router;
