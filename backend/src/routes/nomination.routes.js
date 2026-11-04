import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { requireStepUp } from "../middlewares/stepUp.middleware.js";
import {
    delegateScrutiny, fileNomination, getDelegation, listNominationsForRo, revokeScrutinyDelegation, myNominations, publishContesting, scrutinise, withdraw, assistedNomination } from "../controllers/nomination.controller.js";

const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

// Candidate
router.post("/", authorize("nomination:submit"), fileNomination);
router.get("/mine", authorize("nomination:submit"), myNominations);
// The election agent follows the nomination of the candidate they act for (read only).
router.get("/assisted", authorize("nomination:assist"), assistedNomination);
router.post("/:id/withdraw", authorize("nomination:submit"), withdraw);
// Returning Officer / Assistant Returning Officer
router.get("/", authorize("nomination:scrutinise"), listNominationsForRo);
router.post("/:id/scrutiny", authorize("nomination:scrutinise"), scrutinise);
router.get("/scrutiny-delegation", authorize("nomination:scrutinise"), getDelegation);
router.post("/scrutiny-delegation", authorize("scrutiny:delegate"), requireStepUp, delegateScrutiny);
router.post("/scrutiny-delegation/revoke", authorize("scrutiny:delegate"), requireStepUp, revokeScrutinyDelegation);
router.post("/contesting", authorize("candidates:publish"), requireStepUp, publishContesting);

export default router;
