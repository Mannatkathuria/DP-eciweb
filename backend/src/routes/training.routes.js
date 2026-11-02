import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { attempt, myModules, teamProgress } from "../controllers/training.controller.js";

const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/modules", myModules);
router.post("/modules/:id/attempts", attempt);
router.get("/team", authorize("blo:assign", "blo:supervise", "staff:assign", "polling:arrange"), teamProgress);

export default router;
