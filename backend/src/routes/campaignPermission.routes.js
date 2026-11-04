import express from "express";
import { verifyJWT, requirePasswordChanged } from "../middlewares/verifyJWT.middleware.js";
import { authorize } from "../middlewares/authorize.middleware.js";
import { applyPermission, decidePermission, listPermissions, myPermissions, policeRemarks, withdrawPermission } from "../controllers/campaignPermission.controller.js";

// Campaign permissions: candidate or election agent applies, police remark, RO/ARO decides.
const router = express.Router();
router.use(verifyJWT, requirePasswordChanged);

router.post("/", authorize("permission:apply"), applyPermission);
router.get("/mine", authorize("permission:apply"), myPermissions);
router.post("/mine/:id/withdraw", authorize("permission:apply"), withdrawPermission);
router.get("/", authorize("permission:decide", "security:coordinate", "record:read", "district:manage", "state:manage", "national:view", "national:manage"), listPermissions);
router.post("/:id/police", authorize("security:coordinate"), policeRemarks);
router.post("/:id/decide", authorize("permission:decide"), decidePermission);

export default router;
