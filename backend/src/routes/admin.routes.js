import express from "express";
import { verifyJWT, requireRole } from "../middlewares/verifyJWT.middleware.js";
import {
    listVerifications,
    resolveVerification,
    getStats
} from "../controllers/admin.controllers.js";

const router = express.Router();

router.use(verifyJWT, requireRole("admin", "blo"));

router.get("/verifications", listVerifications);
router.patch("/verifications/:id/resolve", resolveVerification);
router.get("/stats", getStats);

export default router;
