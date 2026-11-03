import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { listEventHistory, listEvents } from "../controllers/events.controller.js";

const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
const canSeeEvents = authorize("control:view", "polling:conduct", "polling:identify-voter", "polling:mark-register", "incident:manage", "application:decide", "roll:view-part");
router.get("/", canSeeEvents, listEvents);
router.get("/history", canSeeEvents, listEventHistory);
export default router;
