import express from "express";
import { verifyJWT, requireRole, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import {
    listVerifications,
    resolveVerification,
    getStats,
    listRegistrationRequests,
    submitFieldVerification,
    approveRegistration,
    rejectRegistration,
    getRegistrationDocumentFile
} from "../controllers/admin.controllers.js";
import {
    listAllChangeRequests,
    approveChangeRequest,
    rejectChangeRequest
} from "../controllers/changeRequest.controller.js";

const router = express.Router();
const bloOnly = requireRole("admin", "blo");

router.use(verifyJWT, requirePasswordChanged);

// Identity-verification cases (Persona review queue): BLO / admin.
router.get("/verifications", bloOnly, listVerifications);
router.patch("/verifications/:id/resolve", bloOnly, resolveVerification);
router.get("/stats", bloOnly, getStats);

// Form 6 registration: permission + jurisdiction, checked on the server for every request.
//   BLO        lists applications in their area and submits field verification
//   ERO/AERO   lists applications in their constituency and approves or rejects them
const CAN_SEE_APPLICATIONS = ["application:review", "verification:field-report", "application:decide"];
router.get("/registrations", authorize(...CAN_SEE_APPLICATIONS), listRegistrationRequests);
router.get("/registrations/:id/documents/:category", authorize(...CAN_SEE_APPLICATIONS), getRegistrationDocumentFile);
router.post("/registrations/:id/field-verification", authorize("verification:field-report"), submitFieldVerification);
router.post("/registrations/:id/approve", authorize("application:decide"), approveRegistration);
router.post("/registrations/:id/reject", authorize("application:decide"), rejectRegistration);

// Voter change/correction requests (Form 8): still decided by the BLO in this prototype.
// TODO(phase 1): move the decision to the ERO/AERO, like Form 6.
router.get("/changes", bloOnly, listAllChangeRequests);
router.post("/changes/:id/approve", bloOnly, approveChangeRequest);
router.post("/changes/:id/reject", bloOnly, rejectChangeRequest);

export default router;
