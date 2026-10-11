import express from "express";
import { searchElector } from "../controllers/elector.controller.js";

const router = express.Router();

router.post("/search", searchElector);

export default router;