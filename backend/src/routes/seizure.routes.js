import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { listSeizures, recordSeizure, releaseSeizure } from "../controllers/seizure.controller.js";

// Election Seizure Management System.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
router.get("/", authorize("seizure:record", "seizure:read", "expenditure:read", "complaint:dispatch", "state:manage", "national:view", "national:manage"), listSeizures);
router.post("/", authorize("seizure:record"), recordSeizure);
router.post("/:id/release", authorize("seizure:release"), releaseSeizure);
export default router;
