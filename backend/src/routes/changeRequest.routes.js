import express from "express";
import { authorize } from "../middlewares/authorize.middleware.js";
import { verifyJWT, requireRole } from "../middlewares/verifyJWT.middleware.js";
import { submitChangeRequest, getMyChangeRequests } from "../controllers/changeRequest.controller.js";
import { respondToInformationRequest } from "../controllers/followUp.controller.js";
import { ApiError } from "../utils/ApiErrors.js";

const ownRequest = (req, record) => { if (record.epic !== req.user.epic) throw new ApiError(404, "Change request not found."); };

const router = express.Router();

// Voter routes (requires logged in voter). Officials review requests under /api/v1/admin/changes,
// where permission and jurisdiction are checked.
router.post("/", verifyJWT, requireRole("voter"), authorize("application:submit"), submitChangeRequest);
router.get("/my", verifyJWT, requireRole("voter"), authorize("application:track"), getMyChangeRequests);
// The voter answers an information request from the ERO/AERO.
router.post("/:id/information", verifyJWT, requireRole("voter"), respondToInformationRequest("change_request", ownRequest));

export default router;
