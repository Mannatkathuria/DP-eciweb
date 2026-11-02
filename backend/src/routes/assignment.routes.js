import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { grantAssignment, listAssignments, listMyAssignments, revokeAssignment } from "../controllers/assignment.controller.js";

const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/me", listMyAssignments);
router.get("/", authorize("role:assign", "blo:assign", "audit:read"), listAssignments);
router.post("/", authorize("role:assign", "blo:assign"), grantAssignment);
router.post("/:id/revoke", authorize("role:assign", "blo:assign"), revokeAssignment);

export default router;
