import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import {
    fileNomination, listNominationsForRo, myNominations, publishContesting, scrutinise, withdraw
} from "../controllers/nomination.controller.js";

const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

// Candidate
router.post("/", authorize("nomination:submit"), fileNomination);
router.get("/mine", authorize("nomination:submit"), myNominations);
router.post("/:id/withdraw", authorize("nomination:submit"), withdraw);
// Returning Officer / Assistant Returning Officer
router.get("/", authorize("nomination:scrutinise"), listNominationsForRo);
router.post("/:id/scrutiny", authorize("nomination:scrutinise"), scrutinise);
router.post("/contesting", authorize("candidates:publish"), publishContesting);

export default router;
