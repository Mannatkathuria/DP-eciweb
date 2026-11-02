import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { overview, recordVisit, reportIncident, updateIncident } from "../controllers/controlRoom.controller.js";

// Control room and incidents. Every read and write is limited to the caller's jurisdiction.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/", authorize("control:view"), overview);
router.post("/incidents", authorize("incident:report"), reportIncident);
router.post("/incidents/:id", authorize("incident:manage"), updateIncident);
router.post("/stations/:stationId/visits", authorize("polling:inspect"), recordVisit);

export default router;
