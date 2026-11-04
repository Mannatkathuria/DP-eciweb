import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { createNodalTask, fileNodalReport, nodalOverview, updateNodalTask } from "../controllers/nodal.controller.js";

// Nodal officers report on their one subject; the DEO, Deputy DEO and CEO coordinate them.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/", authorize("nodal:function-manage", "nodal:coordinate"), nodalOverview);
router.post("/reports", authorize("nodal:function-manage"), fileNodalReport);
router.post("/tasks", authorize("nodal:coordinate"), createNodalTask);
router.post("/tasks/:id", authorize("nodal:function-manage", "nodal:coordinate"), updateNodalTask);

export default router;
