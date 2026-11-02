import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { createElection, listAllElections, reviseSchedule } from "../controllers/election.controller.js";

// Elections and their schedule. Reading is public (mounted behind the public rate limiter);
// announcing an election or revising its schedule is for the ECI administrator.
const router = express.Router();
const staff = [verifyJWT, requirePasswordChanged, authorize("election:manage")];

router.get("/", listAllElections);
router.post("/", ...staff, createElection);
router.post("/:id/schedule", ...staff, reviseSchedule);

export default router;
