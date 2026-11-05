import express from "express";
import { requirePasswordChanged, verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { commissionUnits, evmOverview, firstRandomisation, randomisationDetail, receiveUnits, recordFlc, secondRandomisation, stationMachines } from "../controllers/evm.controller.js";

// EMS 2.0: EVM inventory, FLC, the two randomisations and commissioning.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);
const READ = ["evm:manage", "evm:allocate", "evm:view", "observer:report", "state:manage", "national:view", "national:manage"];
router.get("/", authorize(...READ), evmOverview);
router.get("/randomisations/:id", authorize(...READ), randomisationDetail);
router.get("/stations/:stationId", authorize(...READ, "polling:conduct", "station:view"), stationMachines);
router.post("/units", authorize("evm:manage"), receiveUnits);
router.post("/flc", authorize("evm:manage"), recordFlc);
router.post("/randomise/first", authorize("evm:randomise-first"), firstRandomisation);
router.post("/randomise/second", authorize("evm:allocate"), secondRandomisation);
router.post("/commission", authorize("evm:allocate"), commissionUnits);
export default router;
