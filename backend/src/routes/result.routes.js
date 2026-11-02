import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { generateMock, listSources, receiveEntry, receivePublication, registerResultSource } from "../controllers/result.controller.js";

// Result sources and what they send. Only the ECI administrator (integration:manage) registers a
// source or relays its entries in this prototype; a real feed would authenticate server-to-server.
// Nothing here lets anyone edit or declare a result. Public reads are in public.routes.js.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged, authorize("integration:manage"));

router.get("/sources", listSources);
router.post("/sources", registerResultSource);
router.post("/sources/:sourceId/entries", receiveEntry);
router.post("/sources/:sourceId/publication", receivePublication);
router.post("/sources/:sourceId/mock", generateMock);

export default router;
