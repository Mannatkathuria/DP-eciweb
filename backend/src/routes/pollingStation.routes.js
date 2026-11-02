import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { requireStepUp } from "../middlewares/stepUp.middleware.js";
import {
    approveStationChange, importStations, listStationsForStaff, proposeRelocation, proposeStation, rejectStationChange
} from "../controllers/pollingStation.controller.js";

// Officials' view of polling stations. The DEO proposes; the ECI approves. Public reads are in public.routes.js.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/", authorize("station:view", "station:propose", "station:approve"), listStationsForStaff);
router.post("/", authorize("station:propose"), proposeStation);
router.post("/import", authorize("station:propose"), importStations);
router.post("/:id/relocation", authorize("station:propose"), proposeRelocation);
router.post("/:id/approve", authorize("station:approve"), requireStepUp, approveStationChange);
router.post("/:id/reject", authorize("station:approve"), requireStepUp, rejectStationChange);

export default router;
