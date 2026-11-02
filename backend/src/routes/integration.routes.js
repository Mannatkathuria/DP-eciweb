import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { createSource, listRuns, listSources, rescreen, runIngestion, suspendSource } from "../controllers/integration.controller.js";

// Approved data sources and imports: ECI administrator only (integration:manage).
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged, authorize("integration:manage"));

router.get("/sources", listSources);
router.post("/sources", createSource);
router.post("/sources/:id/suspend", suspendSource);
router.post("/sources/:id/runs", runIngestion);
router.get("/runs", listRuns);
router.post("/rescreen", rescreen);

export default router;
