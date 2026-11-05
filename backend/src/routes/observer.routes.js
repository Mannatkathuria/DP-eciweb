import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { myObserverPortal, publicObservers, reportSquadLocation, squadLocations, updateMyProfile } from "../controllers/observer.controller.js";

// Observer portal and app, the public observers list, and flying-squad positions.
const router = express.Router();
const auth = [verifyJWT, requirePasswordChanged];
router.get("/public", publicObservers);
router.get("/me", ...auth, authorize("observer:report"), myObserverPortal);
router.post("/me/profile", ...auth, authorize("observer:report"), updateMyProfile);
router.get("/squads", ...auth, authorize("observer:report", "complaint:dispatch", "complaint:dispose", "complaint:investigate", "control:view", "expenditure:read"), squadLocations);
router.post("/squads/location", ...auth, authorize("complaint:investigate"), reportSquadLocation);
export default router;
