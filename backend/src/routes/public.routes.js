import express from "express";
import { listAllElections } from "../controllers/election.controller.js";
import { lookupStationByEpic, nearbyPublicStations, searchPublicStations } from "../controllers/pollingStation.controller.js";
import { publicCandidates } from "../controllers/nomination.controller.js";
import { publicResults, publicTurnout } from "../controllers/result.controller.js";
import { publicQueue } from "../controllers/pollDay.controller.js";

// Public information: elections, approved polling stations and published lists of contesting
// candidates. Mounted behind the public rate limiter. Nothing here returns personal details.
const router = express.Router();

router.get("/elections", listAllElections);
router.get("/stations", searchPublicStations);
router.get("/stations/near", nearbyPublicStations);
router.get("/stations/epic/:epic", lookupStationByEpic);
router.get("/stations/:id/queue", publicQueue);
router.get("/candidates", publicCandidates);
router.get("/results", publicResults);
router.get("/turnout", publicTurnout);

export default router;
