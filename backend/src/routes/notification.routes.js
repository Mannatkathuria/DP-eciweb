
import { Router } from "express";
import { getUserNotifications } from "../controllers/notification.controller.js";

const router = Router();

router.get("/", getUserNotifications);

export default router;
