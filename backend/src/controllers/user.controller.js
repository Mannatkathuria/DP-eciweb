import { transaction } from "../config/redis.js";
import { getUserByEpic, saveUser } from "../repositories/user.repository.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Account suspension by the ECI administrator: a suspended account cannot sign in or use an
// existing session, and none of its assignments apply, until it is reinstated. Assignments are
// kept, so reinstating restores exactly what the person held. Both steps need a reason and are
// audited. An administrator cannot suspend their own account.

const findTarget = async (req) => {
    const target = await getUserByEpic(String(req.params.epic ?? "").trim().toUpperCase());
    if (!target) throw new ApiError(404, "No account found for that identifier.");
    if (target._id === req.user._id) throw new ApiError(409, "You cannot suspend or reinstate your own account.");
    return target;
};

const change = (suspend) => asyncHandler(async (req, res) => {
    const reason = requireReason(req.body?.reason, suspend ? "suspension" : "reinstatement");
    const target = await findTarget(req);
    if (Boolean(target.suspended) === suspend) throw new ApiError(409, suspend ? "This account is already suspended." : "This account is not suspended.");
    const at = new Date().toISOString();
    const updated = suspend
        ? { ...target, suspended: true, suspendedAt: at, suspendedBy: req.user.epic, suspensionReason: reason }
        : { ...target, suspended: false, reinstatedAt: at, reinstatedBy: req.user.epic };
    const tx = transaction();
    await saveUser(updated, tx);
    await recordAudit(auditEvent({ actor: req.user, action: suspend ? "user.suspended" : "user.reinstated", resource: { type: "user", id: target._id },
        before: { suspended: Boolean(target.suspended) }, after: { suspended: suspend, epic: target.epic, role: target.role }, note: reason }), tx);
    await tx.exec();
    res.json({ success: true, message: suspend ? "Account suspended. Its sessions stop working at once." : "Account reinstated.",
        data: { epic: target.epic, role: target.role, suspended: suspend } });
});

export const suspendUser = change(true);
export const reinstateUser = change(false);

/** ECI administrator: look up an account's status (no personal record). */
export const getUserStatus = asyncHandler(async (req, res) => {
    const target = await getUserByEpic(String(req.params.epic ?? "").trim().toUpperCase());
    if (!target) throw new ApiError(404, "No account found for that identifier.");
    res.json({ success: true, data: { epic: target.epic, role: target.role, name: target.name ?? null, suspended: Boolean(target.suspended),
        suspendedAt: target.suspendedAt ?? null, suspensionReason: target.suspensionReason ?? null } });
});
