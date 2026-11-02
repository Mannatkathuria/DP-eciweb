import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { requireStepUp } from "../middlewares/stepUp.middleware.js";
import { getUserStatus, reinstateUser, suspendUser } from "../controllers/user.controller.js";

const router = express.Router();
router.use(verifyJWT, requirePasswordChanged, authorize("role:assign"));
router.get("/:epic", getUserStatus);
router.post("/:epic/suspend", requireStepUp, suspendUser);
router.post("/:epic/reinstate", requireStepUp, reinstateUser);
export default router;
