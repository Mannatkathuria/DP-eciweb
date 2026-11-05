import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { addHoliday, addVacancy, announcePlan, createPlan, eplanOverview, sendMessage, updateActivity } from "../controllers/eplan.controller.js";

// Election planning: the Commission's planning division (plan:manage) and CEOs (plan:state).
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
const PLANNERS = ["plan:manage", "plan:state"];
router.get("/", authorize(...PLANNERS, "national:view"), eplanOverview);
router.post("/vacancies", authorize("plan:manage"), addVacancy);
router.post("/holidays", authorize(...PLANNERS), addHoliday);
router.post("/plans", authorize("plan:manage"), createPlan);
router.post("/plans/:id/announce", authorize("plan:manage"), announcePlan);
router.post("/activities/:id", authorize(...PLANNERS), updateActivity);
router.post("/messages", authorize(...PLANNERS), sendMessage);
export default router;
