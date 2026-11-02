import { transaction } from "../config/redis.js";
import { getRegistration, lockRegistration, saveRegistration } from "../repositories/registration.repository.js";
import { getChangeRequest, lockChangeRequest, saveChangeRequest } from "../repositories/changeRequest.repository.js";
import { assertCovers, recordJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { changeTarget } from "./changeRequest.controller.js";
import { requireReason, REASON_MAX_LENGTH } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Follow-up states for Form 6 (registration) and Form 8 (change request), between submission and
// the ERO/AERO's decision:
//
//   information_required   the ERO/AERO asked the applicant for more information. The applicant
//                          answers, and the application returns to the stage it was at.
//   re-verification        the ERO/AERO sent a field-verified application back to the BLO. The
//                          earlier verification is kept in `previousVerifications`; the status
//                          returns to "pending" with a `reverification` note for the BLO.
//
// Neither step decides the application: only approve/reject do, and only the ERO/AERO.

const KINDS = {
    registration: {
        label: "application", resource: "registration", lock: lockRegistration, get: getRegistration, save: saveRegistration,
        target: (r) => r
    },
    change_request: {
        label: "change request", resource: "change_request", lock: lockChangeRequest, get: getChangeRequest, save: saveChangeRequest,
        target: changeTarget
    }
};

const RESPONSE_MAX = 1000;
const cleanText = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

const withLock = async (kind, id, fn) => {
    const cfg = KINDS[kind];
    const release = await cfg.lock(id);
    if (!release) throw new ApiError(409, `This ${cfg.label} is being processed. Refresh in a moment.`);
    try {
        const record = await cfg.get(id);
        if (!record) throw new ApiError(404, `${cfg.label[0].toUpperCase()}${cfg.label.slice(1)} not found.`);
        return await fn(record, cfg);
    } finally { await release(); }
};

const save = async (cfg, updated, event) => {
    const tx = transaction();
    cfg.save(updated, tx);
    await recordAudit(auditEvent(event), tx);
    await tx.exec();
};

/** ERO/AERO: ask the applicant for more information (from pending or field_verified). */
export const requestInformation = (kind) => asyncHandler(async (req, res) => {
    const note = requireReason(req.body?.note, "information request");
    const updated = await withLock(kind, req.params.id, async (record, cfg) => {
        assertCovers(req.authority.assignments, cfg.target(record), `This ${cfg.label}`);
        if (!["pending", "field_verified"].includes(record.status)) throw new ApiError(409, `This ${cfg.label} is ${record.status.replace("_", " ")}; information can only be requested while it is open.`);
        const at = new Date().toISOString();
        const next = { ...record, status: "information_required", updatedAt: at,
            informationRequest: { note, by: req.user.epic, role: req.user.role, at, returnTo: record.status, response: null, respondedAt: null } };
        await save(cfg, next, { actor: req.user, action: `${cfg.resource}.information_requested`, resource: { type: cfg.resource, id: record._id },
            jurisdiction: recordJurisdiction(cfg.target(record)), before: { status: record.status }, after: { status: next.status }, note });
        return next;
    });
    res.json({ success: true, message: "Information requested. The applicant sees your note on their status page.", data: updated });
});

/** ERO/AERO: send a field-verified application back to the BLO for verification again. */
export const requestReverification = (kind) => asyncHandler(async (req, res) => {
    const note = requireReason(req.body?.note, "re-verification request");
    const updated = await withLock(kind, req.params.id, async (record, cfg) => {
        assertCovers(req.authority.assignments, cfg.target(record), `This ${cfg.label}`);
        if (record.status !== "field_verified") throw new ApiError(409, "Only a field-verified application can be sent back for re-verification.");
        const at = new Date().toISOString();
        const next = { ...record, status: "pending", updatedAt: at, fieldVerification: null,
            previousVerifications: [...(record.previousVerifications ?? []), record.fieldVerification],
            reverification: { note, by: req.user.epic, role: req.user.role, at } };
        await save(cfg, next, { actor: req.user, action: `${cfg.resource}.reverification_requested`, resource: { type: cfg.resource, id: record._id },
            jurisdiction: recordJurisdiction(cfg.target(record)), before: { status: record.status }, after: { status: "pending" }, note });
        return next;
    });
    res.json({ success: true, message: "Sent back to the BLO for verification again.", data: updated });
});

/**
 * The applicant answers an information request; the application returns to where it was.
 * `check(record)` proves the caller is the applicant (reference ID + date of birth for Form 6,
 * the signed-in voter for Form 8).
 */
export const respondToInformationRequest = (kind, check) => asyncHandler(async (req, res) => {
    const response = cleanText(req.body?.response, RESPONSE_MAX);
    if (response.length < 5) throw new ApiError(400, "Write your answer (at least 5 characters).");
    await withLock(kind, req.params.id, async (record, cfg) => {
        check(req, record);
        if (record.status !== "information_required") throw new ApiError(409, "No information has been requested for this application.");
        const at = new Date().toISOString();
        const next = { ...record, status: record.informationRequest.returnTo, updatedAt: at,
            informationRequest: { ...record.informationRequest, response, respondedAt: at } };
        await save(cfg, next, { actor: req.user ?? null, action: `${cfg.resource}.information_provided`, resource: { type: cfg.resource, id: record._id },
            jurisdiction: recordJurisdiction(cfg.target(record)), before: { status: record.status }, after: { status: next.status } });
    });
    res.json({ success: true, message: "Thank you. Your answer has been sent to the electoral registration office." });
});

export const NOTE_MAX = REASON_MAX_LENGTH;
