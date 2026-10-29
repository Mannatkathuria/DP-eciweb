import express from "express";
import { verifyJWT, requireRole } from "../middlewares/verifyJWT.middleware.js";
import {
    listBloOfficers,
    assignBloRole,
    removeBloRole,
    searchEciVoters
} from "../controllers/eci.controller.js";

const router = express.Router();

router.use(verifyJWT, requireRole("eci", "admin"));

router.get("/blo-list", listBloOfficers);
router.post("/blo/assign", assignBloRole);
router.post("/blo/remove", removeBloRole);
router.get("/voters", searchEciVoters);

export default router;
