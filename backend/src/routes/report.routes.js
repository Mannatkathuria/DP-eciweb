import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { rollForPart, summary } from "../controllers/report.controller.js";

// Consolidated counts for the caller's jurisdiction (district, State or national).
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/summary", authorize("district:manage", "state:manage", "report:state", "report:national", "national:view", "national:manage",
    "record:read", "application:decide", "nomination:scrutinise", "control:view", "blo:supervise", "observer:view"), summary);

router.get("/roll-part", authorize("roll:view-part"), rollForPart);

export default router;
