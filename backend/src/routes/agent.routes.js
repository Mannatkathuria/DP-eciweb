import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { agentsInConstituency, appointAgent, myAgents, revokeAgent } from "../controllers/agent.controller.js";

const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

// Candidate (and, for polling and counting agents, their election agent)
router.get("/mine", authorize("agent:appoint"), myAgents);
router.post("/", authorize("agent:appoint"), appointAgent);
router.post("/:id/revoke", authorize("agent:appoint"), revokeAgent);
// Returning Officer / ARO: agents in the constituency
router.get("/", authorize("nomination:scrutinise"), agentsInConstituency);

export default router;
