import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { getVersion, listVersions, publishRollVersion } from "../controllers/rollVersion.controller.js";

const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.post("/", authorize("roll:publish"), publishRollVersion);
router.get("/", authorize("roll:publish", "roll:manage", "audit:read"), listVersions);
router.get("/:id", authorize("roll:publish", "roll:manage", "audit:read"), getVersion);

export default router;
