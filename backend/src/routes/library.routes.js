import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { archiveLibraryItem, getLibraryItem, libraryMeta, listLibrary, publishLibraryItem } from "../controllers/library.controller.js";

// Handbooks, compendium, eBooks, FAQ and training material: public to read.
const router = express.Router();
router.get("/", listLibrary);
router.get("/meta", libraryMeta);
router.get("/:slug", getLibraryItem);
router.post("/", verifyJWT, requirePasswordChanged, authorize("library:manage"), publishLibraryItem);
router.post("/:slug/archive", verifyJWT, requirePasswordChanged, authorize("library:manage"), archiveLibraryItem);
export default router;
