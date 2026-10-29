import express from "express";
import { verifyJWT, requireRole, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import {
    submitChangeRequest,
    getMyChangeRequests,
    listAllChangeRequests,
    approveChangeRequest,
    rejectChangeRequest
} from "../controllers/changeRequest.controller.js";

const router = express.Router();

// Voter routes (requires logged in voter)
router.post("/", verifyJWT, requireRole("voter"), submitChangeRequest);
router.get("/my", verifyJWT, requireRole("voter"), getMyChangeRequests);

// BLO / Admin review routes
router.get("/list", verifyJWT, requireRole("admin", "blo"), requirePasswordChanged, listAllChangeRequests);
router.post("/:id/approve", verifyJWT, requireRole("admin", "blo"), requirePasswordChanged, approveChangeRequest);
router.post("/:id/reject", verifyJWT, requireRole("admin", "blo"), requirePasswordChanged, rejectChangeRequest);

export default router;
