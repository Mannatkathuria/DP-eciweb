import express from "express";
import { verifyJWT, requirePasswordChanged, requireRole } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { assignTask, listRegistrationTasks, recordTaskOutcome } from "../controllers/registrationTask.controller.js";

// Registration assistance tasks (new-voter pipeline). Jurisdiction is checked per task.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/", authorize("verification:field-report", "application:decide", "blo:supervise", "blo:assign"), listRegistrationTasks);
router.post("/:id/outcome", requireRole("blo", "admin"), authorize("verification:field-report"), recordTaskOutcome);
router.post("/:id/assign", authorize("blo:assign", "blo:supervise"), assignTask);

export default router;
