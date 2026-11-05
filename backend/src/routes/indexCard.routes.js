import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { editCard, examineCard, finaliseCard, listCards, prepareCard, publicCards, submitCard } from "../controllers/indexCard.controller.js";

// Online Index Card: RO prepares and submits, CEO examines, the Commission finalises.
const router = express.Router();
const auth = [verifyJWT, requirePasswordChanged];
router.get("/public", publicCards);
router.get("/", ...auth, authorize("index:prepare", "index:examine", "index:finalise", "record:read", "national:view"), listCards);
router.post("/", ...auth, authorize("index:prepare"), prepareCard);
router.post("/:id", ...auth, authorize("index:prepare"), editCard);
router.post("/:id/submit", ...auth, authorize("index:prepare"), submitCard);
router.post("/:id/examine", ...auth, authorize("index:examine"), examineCard);
router.post("/:id/finalise", ...auth, authorize("index:finalise"), finaliseCard);
export default router;
