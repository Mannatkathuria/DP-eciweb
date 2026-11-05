import express from "express";
import { searchElector } from "../controllers/elector.controller.js";
import { optionalJWT } from "../middlewares/verifyJWT.middleware.js";

const router = express.Router();

router.post("/search", optionalJWT, searchElector);

export default router;