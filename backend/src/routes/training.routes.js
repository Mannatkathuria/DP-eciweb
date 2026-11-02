import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { attempt, myModules, teamProgress, listScenarios, scenarioReport, startScenario, submitScenario } from "../controllers/training.controller.js";

const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/modules", myModules);
router.post("/modules/:id/attempts", attempt);
router.get("/scenarios", listScenarios);
router.post("/scenarios/:id/start", startScenario);
router.post("/runs/:runId/submit", submitScenario);
router.get("/report", scenarioReport);
router.get("/team", authorize("blo:assign", "blo:supervise", "staff:assign", "polling:arrange"), teamProgress);

export default router;
