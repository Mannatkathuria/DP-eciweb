import express from "express";
import { verifyJWT, requireRole, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { requireStepUp } from "../middlewares/stepUp.middleware.js";
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
    submitChangeFieldVerification,
    approveChangeRequest,
    rejectChangeRequest
} from "../controllers/changeRequest.controller.js";
import { requestInformation, requestReverification } from "../controllers/followUp.controller.js";

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
router.post("/registrations/:id/approve", authorize("application:decide"), requireStepUp, approveRegistration);
router.post("/registrations/:id/reject", authorize("application:decide"), requireStepUp, rejectRegistration);
router.post("/registrations/:id/request-information", authorize("application:decide"), requestInformation("registration"));
router.post("/registrations/:id/request-reverification", authorize("application:decide"), requestReverification("registration"));

// Form 8 corrections and shifts: the same split. The BLO verifies; the ERO/AERO decides.
router.get("/changes", authorize(...CAN_SEE_APPLICATIONS), listAllChangeRequests);
router.post("/changes/:id/field-verification", authorize("verification:field-report"), submitChangeFieldVerification);
router.post("/changes/:id/approve", authorize("application:decide"), requireStepUp, approveChangeRequest);
router.post("/changes/:id/reject", authorize("application:decide"), requireStepUp, rejectChangeRequest);
router.post("/changes/:id/request-information", authorize("application:decide"), requestInformation("change_request"));
router.post("/changes/:id/request-reverification", authorize("application:decide"), requestReverification("change_request"));

export default router;
