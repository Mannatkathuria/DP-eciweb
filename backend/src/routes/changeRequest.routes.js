import express from "express";
import { verifyJWT, requireRole } from "../middlewares/verifyJWT.middleware.js";
import { submitChangeRequest, getMyChangeRequests } from "../controllers/changeRequest.controller.js";

const router = express.Router();

// Voter routes (requires logged in voter). Officials review requests under /api/v1/admin/changes,
// where permission and jurisdiction are checked.
router.post("/", verifyJWT, requireRole("voter"), submitChangeRequest);
router.get("/my", verifyJWT, requireRole("voter"), getMyChangeRequests);

export default router;
