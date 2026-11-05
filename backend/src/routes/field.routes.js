import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { addRegisterEntry, listDeliveries, listRegister, listSurveys, recordEpicDelivery, surveyLists, surveyPhoto, surveyStation } from "../controllers/field.controller.js";

// BLO App field work: facility surveys (AMF/EMF, GPS, photo, distances), the BLO register and EPIC delivery.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
const READ = ["station:survey", "station:propose", "station:view", "district:manage", "state:manage", "application:decide", "blo:supervise", "accessibility:review"];
router.get("/lists", surveyLists);
router.get("/surveys", authorize(...READ), listSurveys);
router.get("/surveys/:id/photo", authorize(...READ), surveyPhoto);
router.post("/stations/:stationId/survey", authorize("station:survey"), surveyStation);
router.get("/register", authorize("verification:field-report", "application:decide", "blo:supervise"), listRegister);
router.post("/register", authorize("verification:field-report"), addRegisterEntry);
router.get("/epic-deliveries", authorize("verification:field-report", "application:decide", "blo:supervise"), listDeliveries);
router.post("/epic-deliveries", authorize("verification:field-report"), recordEpicDelivery);
export default router;
