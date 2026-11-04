import crypto from "crypto";
import { transaction } from "../config/redis.js";
import { NODAL_FUNCTIONS, NODAL_ROLES, ROLE_BY_ID } from "../config/roles.js";
import { getUserByEpic } from "../repositories/user.repository.js";
import { getAssignment, listAllAssignments, saveAssignment } from "../repositories/assignment.repository.js";
import { assignmentInEffect, containsJurisdiction, effectiveAssignments, hasPermission, validateJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { constituencyHasStations, findActiveStation } from "./pollingStation.controller.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const ELECTION_MAX = 120;

/**
 * Optional validity window. A date (YYYY-MM-DD) or a full ISO time; validFrom defaults to now and
 * validUntil to open-ended. A date-only validUntil lasts to the end of that day (IST).
 */
const parseWindow = (body) => {
    const parse = (v, field, endOfDay) => {
        if (v === undefined || v === null || v === "") return null;
        const str = String(v).trim();
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30` : str;
        const t = new Date(iso);
        if (Number.isNaN(t.getTime())) throw new ApiError(400, `${field} must be a date (YYYY-MM-DD) or an ISO time.`);
        return t.toISOString();
    };
    const validFrom = parse(body.validFrom, "validFrom", false);
    const validUntil = parse(body.validUntil, "validUntil", true);
    if (validUntil && new Date(validUntil) <= new Date(validFrom ?? Date.now())) throw new ApiError(400, "validUntil must be after validFrom (and in the future).");
    return { validFrom, validUntil };
};
const sameRole = (accountRole, role) => accountRole === role || (accountRole === "admin" && role === "blo");

// Election staff the District Election Officer (or CEO) appoints, and the polling parties the
// Returning Officer arranges for each station.
export const STAFF_ROLES = ["presiding_officer", "polling_officer", "counting_supervisor", "counting_assistant", "sector_officer", "sector_police_officer", "flying_squad"];
export const POLLING_PARTY_ROLES = ["presiding_officer", "polling_officer"];

/**
 * Who may grant or revoke an assignment:
 *   role:assign     (ECI administrator)  any role, anywhere
 *   blo:assign      (ERO)                BLOs inside the ERO's own jurisdiction
 *   staff:assign    (DEO, CEO)           polling, counting and sector staff inside their jurisdiction
 *   polling:arrange (RO, ARO)            presiding and polling officers inside their constituency
 */
const assertMayManage = (req, role, jurisdiction) => {
    if (hasPermission(req.user, "role:assign")) return;
    const inside = containsJurisdiction(req.authority.assignments, jurisdiction);
    if (hasPermission(req.user, "blo:assign") && role === "blo" && inside) return;
    if (hasPermission(req.user, "staff:assign") && STAFF_ROLES.includes(role) && inside) return;
    if (hasPermission(req.user, "polling:arrange") && POLLING_PARTY_ROLES.includes(role) && inside) return;
    // Nodal officers are designated by the DEO (district) or the CEO (state) for one subject.
    if (hasPermission(req.user, "nodal:coordinate") && hasPermission(req.user, "staff:assign") && NODAL_ROLES.includes(role) && inside) return;
    const mine = (hasPermission(req.user, "blo:assign") && role === "blo")
        || (hasPermission(req.user, "staff:assign") && STAFF_ROLES.includes(role))
        || (hasPermission(req.user, "polling:arrange") && POLLING_PARTY_ROLES.includes(role))
        || (hasPermission(req.user, "nodal:coordinate") && hasPermission(req.user, "staff:assign") && NODAL_ROLES.includes(role));
    throw new ApiError(403, mine
        ? "You can only make this assignment inside your own jurisdiction."
        : "Your role is not authorised to make this assignment.");
};

/** Once a constituency has approved polling stations, a station-level assignment must name one of them. */
const assertKnownStation = async (role, jurisdiction) => {
    if (!ROLE_BY_ID[role].scope.includes("pollingStation") || !jurisdiction.pollingStation) return;
    if (!jurisdiction.constituency || !(await constituencyHasStations(jurisdiction))) return;
    if (!(await findActiveStation(jurisdiction))) {
        throw new ApiError(400, `"${jurisdiction.pollingStation}" is not an approved polling station in ${jurisdiction.constituency}${jurisdiction.partNumber ? `, part ${jurisdiction.partNumber}` : ""}.`);
    }
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
        .sort((a, b) => new Date(b.grantedAt) - new Date(a.grantedAt))
        .map((a) => ({ ...a, inEffect: assignmentInEffect(a) }));
    res.json({ success: true, data: { items, total: items.length } });
});

export const grantAssignment = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const role = String(body.role ?? "").trim();
    if (!ROLE_BY_ID[role]) throw new ApiError(400, "Unknown role.");
    const jurisdiction = validateJurisdiction(role, body.jurisdiction ?? {});
    const election = String(body.election ?? "").trim().slice(0, ELECTION_MAX) || null;
    const window = parseWindow(body);
    // A nodal officer's assignment names the one subject they coordinate.
    const nodalFunction = NODAL_ROLES.includes(role) ? String(body.function ?? "").trim() : null;
    if (NODAL_ROLES.includes(role) && !NODAL_FUNCTIONS[nodalFunction]) {
        throw new ApiError(400, `A nodal officer's assignment must name its subject (function): ${Object.keys(NODAL_FUNCTIONS).join(", ")}.`);
    }
    assertMayManage(req, role, jurisdiction);
    await assertKnownStation(role, jurisdiction);

    const target = await getUserByEpic(body.epic);
    if (!target) throw new ApiError(404, "No account found for that identifier.");
    if (!sameRole(target.role, role)) {
        throw new ApiError(409, `This account holds the role "${target.role}". An assignment must match the account's role.`);
    }

    const same = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
    if ((await listAllAssignments()).some((a) => a.status === "active" && a.userId === target._id && a.role === role
        && (a.election ?? null) === election && same(a.jurisdiction, jurisdiction) && (a.function ?? null) === nodalFunction)) {
        throw new ApiError(409, "This person already holds this assignment.");
    }

    const assignment = {
        _id: crypto.randomUUID(), userId: target._id, epic: target.epic, role, election, jurisdiction,
        ...(nodalFunction ? { function: nodalFunction } : {}),
        validFrom: window.validFrom, validUntil: window.validUntil,
        status: "active", grantedBy: req.user.epic, grantedAt: new Date().toISOString(),
        revokedBy: null, revokedAt: null, revokeReason: null
    };
    const tx = transaction();
    saveAssignment(assignment, tx);
    await recordAudit(auditEvent({
        actor: req.user, action: "assignment.granted",
        resource: { type: "assignment", id: assignment._id }, jurisdiction,
        after: { epic: target.epic, role, election, jurisdiction, ...(nodalFunction ? { function: nodalFunction } : {}), ...window }
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
