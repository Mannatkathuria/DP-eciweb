import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { addDeployment, addSitrep, assessStation, securityOverview, updateDeployment } from "../controllers/security.controller.js";

// Police and security arrangements. Internal: never shown to candidates, agents or the public.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

const READ = ["security:plan", "security:coordinate", "control:view", "district:manage", "state:manage", "record:read", "logistics:track"];
router.get("/", authorize(...READ), securityOverview);
router.post("/stations/:stationId/assessment", authorize("security:plan"), assessStation);
router.post("/deployments", authorize("security:plan"), addDeployment);
router.post("/deployments/:id", authorize("security:plan", "security:coordinate"), updateDeployment);
router.post("/sitreps", authorize("security:coordinate"), addSitrep);

export default router;
