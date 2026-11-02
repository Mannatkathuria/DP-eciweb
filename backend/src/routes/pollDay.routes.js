import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import {
    getRegister, getStation, listCases, markVoter, raiseCase, reportQueue, resolveCase, searchElectors, setPollStatus
} from "../controllers/pollDay.controller.js";

// Poll day at the caller's own polling station. Each controller resolves the station from the
// caller's assignment, so nobody can act on another station by changing an id.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

const STATION_TEAM = ["polling:conduct", "polling:identify-voter", "polling:mark-register", "polling:observe", "observer:report"];

router.get("/station", authorize(...STATION_TEAM, "roll:view-part"), getStation);
router.get("/electors", authorize("polling:conduct", "polling:identify-voter", "polling:mark-register", "roll:view-part"), searchElectors);
router.post("/electors/:epic/mark", authorize("polling:mark-register", "polling:conduct"), markVoter);
router.post("/poll/status", authorize("polling:conduct"), setPollStatus);
router.post("/queue", authorize("polling:conduct", "polling:identify-voter"), reportQueue);
router.get("/cases", authorize(...STATION_TEAM), listCases);
router.post("/cases", authorize("polling:conduct", "polling:identify-voter", "polling:mark-register", "polling:object"), raiseCase);
router.post("/cases/:id/resolve", authorize("polling:conduct"), resolveCase);
router.get("/register", authorize("polling:conduct"), getRegister);

export default router;
