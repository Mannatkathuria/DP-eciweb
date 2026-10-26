import express from "express";
import { verifyJWT, requireRole, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import {
    listVerifications,
    resolveVerification,
    getStats,
    listRegistrationRequests,
    approveRegistration,
    rejectRegistration
} from "../controllers/admin.controllers.js";
import {
    listAllChangeRequests,
    approveChangeRequest,
    rejectChangeRequest
} from "../controllers/changeRequest.controller.js";

const router = express.Router();

router.use(verifyJWT, requireRole("admin", "blo"), requirePasswordChanged);

router.get("/verifications", listVerifications);
router.patch("/verifications/:id/resolve", resolveVerification);
router.get("/stats", getStats);

// Voter registration requests: only a BLO/admin can review and approve.
router.get("/registrations", listRegistrationRequests);
router.post("/registrations/:id/approve", approveRegistration);
router.post("/registrations/:id/reject", rejectRegistration);

// Voter change/correction requests: BLO reviews and updates electoral roll.
router.get("/changes", listAllChangeRequests);
router.post("/changes/:id/approve", approveChangeRequest);
router.post("/changes/:id/reject", rejectChangeRequest);

export default router;
