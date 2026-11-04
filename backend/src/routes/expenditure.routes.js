import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { addEntry, addShadowEntry, correctEntry, listRegisters, myRegister, noteEntry } from "../controllers/expenditure.controller.js";

// Candidates' expenditure registers; expenditure observers read them and keep a shadow register.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.get("/mine", authorize("expenditure:report"), myRegister);
router.post("/", authorize("expenditure:report"), addEntry);
router.post("/:id/correct", authorize("expenditure:report"), correctEntry);
router.get("/", authorize("expenditure:read", "record:read", "permission:decide", "district:manage", "state:manage", "national:view", "national:manage"), listRegisters);
router.post("/:id/notes", authorize("expenditure:read"), noteEntry);
router.post("/shadow", authorize("expenditure:read"), addShadowEntry);

export default router;
