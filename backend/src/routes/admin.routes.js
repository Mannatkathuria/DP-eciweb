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

const router = express.Router();

router.use(verifyJWT, requireRole("admin", "blo"), requirePasswordChanged);

router.get("/verifications", listVerifications);
router.patch("/verifications/:id/resolve", resolveVerification);
router.get("/stats", getStats);

// Voter registration requests: only a BLO/admin can review and approve.
router.get("/registrations", listRegistrationRequests);
router.post("/registrations/:id/approve", approveRegistration);
router.post("/registrations/:id/reject", rejectRegistration);

export default router;
