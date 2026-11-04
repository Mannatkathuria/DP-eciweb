import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { logisticsOverview, recordStep } from "../controllers/logistics.controller.js";

// Movement of polling parties and custody of election material, station by station.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/", authorize("logistics:track", "control:view", "district:manage", "state:manage", "record:read", "nodal:function-manage"), logisticsOverview);
router.post("/stations/:stationId", authorize("logistics:track"), recordStep);

export default router;
