import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize, loadAuthority } from "../middlewares/authorize.middleware.js";
import { myInbox, workload } from "../controllers/inbox.controller.js";

// Every officer's work across the platform, and workload statistics for supervisors.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
router.get("/", loadAuthority, myInbox);
router.get("/workload", authorize("application:decide", "blo:supervise", "district:manage", "state:manage", "national:view", "national:manage"), workload);
export default router;
