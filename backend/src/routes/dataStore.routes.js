import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { dataStoreStatus, syncNow } from "../controllers/dataStore.controller.js";

const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
router.get("/", authorize("national:manage", "integration:manage"), dataStoreStatus);
router.post("/sync", authorize("national:manage"), syncNow);
export default router;
