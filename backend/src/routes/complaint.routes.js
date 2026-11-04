import express from "express";
import { optionalJWT, requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { limiter } from "../middlewares/rateLimit.middleware.js";
import { complaintPhoto, dispatchComplaint, disposeComplaint, fieldReportComplaint, fileComplaint, listComplaints, trackComplaint } from "../controllers/complaint.controller.js";

// Model Code of Conduct complaints (cVIGIL): anyone reports; the control room dispatches a flying
// squad; the squad reports; the RO/ARO disposes.
const router = express.Router();
const intake = limiter("mcc-intake", { windowMs: 10 * 60 * 1000, limit: 15, message: "Too many reports from this connection. Try again later." });
const STAFF = ["complaint:dispatch", "complaint:investigate", "complaint:dispose", "record:read", "expenditure:read", "national:view", "national:manage", "state:manage"];

router.post("/", intake, optionalJWT, fileComplaint);
router.get("/track/:ref", intake, trackComplaint);
router.get("/", verifyJWT, requirePasswordChanged, authorize(...STAFF), listComplaints);
router.get("/:id/photo", verifyJWT, requirePasswordChanged, authorize(...STAFF), complaintPhoto);
router.post("/:id/dispatch", verifyJWT, requirePasswordChanged, authorize("complaint:dispatch"), dispatchComplaint);
router.post("/:id/field-report", verifyJWT, requirePasswordChanged, authorize("complaint:investigate"), fieldReportComplaint);
router.post("/:id/dispose", verifyJWT, requirePasswordChanged, authorize("complaint:dispose"), disposeComplaint);

export default router;
