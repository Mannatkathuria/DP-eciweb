import crypto from "crypto";
import { transaction } from "../config/redis.js";
import { ROLE_BY_ID } from "../config/roles.js";
import { getUserByEpic } from "../repositories/user.repository.js";
import { getAssignment, listAllAssignments, saveAssignment } from "../repositories/assignment.repository.js";
import { containsJurisdiction, effectiveAssignments, hasPermission, validateJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const ELECTION_MAX = 120;
const sameRole = (accountRole, role) => accountRole === role || (accountRole === "admin" && role === "blo");

/**
 * Who may grant or revoke an assignment:
 *   role:assign (ECI administrator)  any role, anywhere
 *   blo:assign  (ERO)                BLO assignments inside the ERO's own jurisdiction only
 */
const assertMayManage = (req, role, jurisdiction) => {
    if (hasPermission(req.user, "role:assign")) return;
    if (hasPermission(req.user, "blo:assign") && role === "blo" && containsJurisdiction(req.authority.assignments, jurisdiction)) return;
    throw new ApiError(403, role === "blo"
        ? "You can only assign BLOs inside your own jurisdiction."
        : "Your role is not authorised to make this assignment.");
};

export const listMyAssignments = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { role: req.user.role, assignments: await effectiveAssignments(req.user) } });
});

/** Assignments the caller can see: national roles see all; others only those inside their own jurisdiction. */
export const listAssignments = asyncHandler(async (req, res) => {
    const epic = String(req.query.epic ?? "").trim().toUpperCase();
    const status = String(req.query.status ?? "active");
    const items = (await listAllAssignments())
        .filter((a) => !epic || a.epic === epic)
        .filter((a) => status === "all" || a.status === status)
        .filter((a) => containsJurisdiction(req.authority.assignments, a.jurisdiction))
        .sort((a, b) => new Date(b.grantedAt) - new Date(a.grantedAt));
    res.json({ success: true, data: { items, total: items.length } });
});

export const grantAssignment = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const role = String(body.role ?? "").trim();
    if (!ROLE_BY_ID[role]) throw new ApiError(400, "Unknown role.");
    const jurisdiction = validateJurisdiction(role, body.jurisdiction ?? {});
    const election = String(body.election ?? "").trim().slice(0, ELECTION_MAX) || null;
    assertMayManage(req, role, jurisdiction);

    const target = await getUserByEpic(body.epic);
    if (!target) throw new ApiError(404, "No account found for that identifier.");
    if (!sameRole(target.role, role)) {
        throw new ApiError(409, `This account holds the role "${target.role}". An assignment must match the account's role.`);
    }

    const assignment = {
        _id: crypto.randomUUID(), userId: target._id, epic: target.epic, role, election, jurisdiction,
        status: "active", grantedBy: req.user.epic, grantedAt: new Date().toISOString(),
        revokedBy: null, revokedAt: null, revokeReason: null
    };
    const tx = transaction();
    saveAssignment(assignment, tx);
    await recordAudit(auditEvent({
        actor: req.user, action: "assignment.granted",
        resource: { type: "assignment", id: assignment._id }, jurisdiction,
        after: { epic: target.epic, role, election, jurisdiction }
    }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: "Assignment granted.", data: assignment });
});

export const revokeAssignment = asyncHandler(async (req, res) => {
    const reason = requireReason(req.body?.reason, "revocation");
    const assignment = await getAssignment(req.params.id);
    if (!assignment) throw new ApiError(404, "Assignment not found.");
    assertMayManage(req, assignment.role, assignment.jurisdiction);
    if (assignment.status !== "active") throw new ApiError(409, "This assignment has already been revoked.");

    const revoked = { ...assignment, status: "revoked", revokedBy: req.user.epic, revokedAt: new Date().toISOString(), revokeReason: reason };
    const tx = transaction();
    saveAssignment(revoked, tx);
    await recordAudit(auditEvent({
        actor: req.user, action: "assignment.revoked",
        resource: { type: "assignment", id: assignment._id }, jurisdiction: assignment.jurisdiction,
        before: { status: "active" }, after: { status: "revoked" }, note: reason
    }), tx);
    await tx.exec();
    res.json({ success: true, message: "Assignment revoked.", data: revoked });
});
