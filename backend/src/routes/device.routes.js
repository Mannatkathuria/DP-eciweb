import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { heartbeat, listMyStationDevices, registerDevice, revokeDevice } from "../controllers/device.controller.js";

// Polling-station devices. Registering and heartbeats are for members of the station's polling
// party; revoking is also open to officers whose jurisdiction covers the station.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
const party = authorize("polling:conduct", "polling:identify-voter", "polling:mark-register");
router.get("/mine", party, listMyStationDevices);
router.post("/register", party, registerDevice);
router.post("/heartbeat", party, heartbeat);
router.post("/:id/revoke", authorize("polling:conduct", "incident:manage"), revokeDevice);
export default router;
