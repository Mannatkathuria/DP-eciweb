import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { getResourceHistory, listRecentAudit } from "../controllers/audit.controller.js";

// Read-only. The audit trail has no write, update or delete endpoint.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged, authorize("audit:read"));

router.get("/", listRecentAudit);
router.get("/:type/:id", getResourceHistory);

export default router;
