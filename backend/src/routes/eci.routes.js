import express from "express";
import { verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import {
    listBloOfficers,
    assignBloRole,
    removeBloRole,
    searchEciVoters
} from "../controllers/eci.controller.js";

const router = express.Router();

// ECI administrator only. The legacy "admin" account has BLO permissions and must not create
// BLO accounts or list electors nationwide (it could before; see docs/PROJECT_AUDIT.md, S1).
router.use(verifyJWT, authorize("role:assign"));

router.get("/blo-list", listBloOfficers);
router.post("/blo/assign", assignBloRole);
router.post("/blo/remove", removeBloRole);
router.get("/voters", searchEciVoters);

export default router;
