import express from "express";
import { optionalJWT, requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { limiter } from "../middlewares/rateLimit.middleware.js";
import { fileGrievance, grievanceDocument, grievanceLists, listGrievances, reopenGrievance, respondGrievance, routeGrievance, trackGrievance } from "../controllers/grievance.controller.js";

// National Grievance Services Portal.
const router = express.Router();
const intake = limiter("ngsp-intake", { windowMs: 10 * 60 * 1000, limit: 15, message: "Too many grievances from this connection. Try again later." });
const auth = [verifyJWT, requirePasswordChanged];
router.get("/lists", grievanceLists);
router.post("/", intake, optionalJWT, fileGrievance);
router.get("/track/:ref", intake, trackGrievance);
router.post("/track/:ref/reopen", intake, reopenGrievance);
router.get("/", ...auth, authorize("grievance:handle", "national:view"), listGrievances);
router.get("/:id/documents/:n", ...auth, authorize("grievance:handle"), grievanceDocument);
router.post("/:id/route", ...auth, authorize("grievance:handle"), routeGrievance);
router.post("/:id/respond", ...auth, authorize("grievance:handle"), respondGrievance);
export default router;
