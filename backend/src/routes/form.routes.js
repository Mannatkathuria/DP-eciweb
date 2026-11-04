import express from "express";
import { optionalJWT, requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { requireStepUp } from "../middlewares/stepUp.middleware.js";
import { limiter } from "../middlewares/rateLimit.middleware.js";
import {
    decideForm, fieldReport, formCatalogue, getDocument, getForStaff, listForStaff, myForms, submitForm, trackForm, withdrawForm
} from "../controllers/formcontroller.js";

// Electoral forms 2, 2A, 3, 6A, 6B, 7 and 8. Anyone submits and tracks by reference number; the
// BLO verifies in the field; only the ERO/AERO of the constituency decides.
const router = express.Router();
const intakeLimiter = limiter("eform-intake", { windowMs: 10 * 60 * 1000, limit: 20, message: "Too many applications from this connection. Try again later." });
const STAFF = ["application:decide", "verification:field-report", "application:review", "record:read", "roll:manage"];

router.get("/", formCatalogue);
router.get("/status/:ref", intakeLimiter, trackForm);
router.get("/mine", verifyJWT, myForms);
router.post("/mine/:id/withdraw", verifyJWT, withdrawForm);

router.get("/staff", verifyJWT, requirePasswordChanged, authorize(...STAFF), listForStaff);
router.get("/staff/:id", verifyJWT, requirePasswordChanged, authorize(...STAFF), getForStaff);
router.get("/staff/:id/documents/:name", verifyJWT, requirePasswordChanged, authorize("application:decide", "verification:field-report"), getDocument);
router.post("/staff/:id/field-report", verifyJWT, requirePasswordChanged, authorize("verification:field-report"), fieldReport);
router.post("/staff/:id/decide", verifyJWT, requirePasswordChanged, authorize("application:decide"), requireStepUp, decideForm);

// Submission last, so "staff", "status" and "mine" are never taken for a form name.
router.post("/:form", intakeLimiter, optionalJWT, submitForm);

export default router;
