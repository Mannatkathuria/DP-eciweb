import crypto from "crypto";
import { getElectorByEpic, saveElector } from "../repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "../repositories/user.repository.js";
import {
    saveChangeRequest, getChangeRequest, listChangeRequests,
    listChangeRequestsForEpic, lockChangeRequest
} from "../repositories/changeRequest.repository.js";
import { performDocumentSanityCheck } from "../services/gemini.service.js";
import { validateGeography } from "../data/geography.js";
import { transaction } from "../config/redis.js";
import { validateDocumentProof, requireReason, REASON_MAX_LENGTH } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { assertCovers, boothFromAssignments, coversAny, recordJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { parseBoothAssignment } from "./admin.controllers.js";

const clean = (val) => String(val ?? "").trim();
const PIN_CODE_PATTERN = /^[1-9]\d{5}$/;

/**
 * Voter submits a change / correction request (Form 8).
 * Runs an AI sanity check on the uploaded proof vs current record.
 */
export const submitChangeRequest = asyncHandler(async (req, res) => {
    const epic = req.user?.epic;
    if (!epic) throw new ApiError(401, "Sign in as a voter to request changes.");

    const elector = await getElectorByEpic(epic);
    if (!elector || !elector.isActive) {
        throw new ApiError(404, "Electoral record not found.");
    }

    const {
        name, dateOfBirth, gender, state, district,
        assemblyConstituency, address, pinCode, documentProof
    } = req.body ?? {};

    const requestedChanges = {};

    if (name && clean(name) !== clean(elector.name)) {
        if (clean(name).length < 2 || clean(name).length > 100) {
            throw new ApiError(400, "Name must be between 2 and 100 characters.");
        }
        requestedChanges.name = clean(name);
    }

    if (dateOfBirth) {
        const d = new Date(dateOfBirth);
        if (isNaN(d.getTime()) || d > new Date()) {
            throw new ApiError(400, "Invalid date of birth.");
        }
        const iso = d.toISOString();
        if (iso.slice(0, 10) !== (elector.dateOfBirth || "").slice(0, 10)) {
            requestedChanges.dateOfBirth = iso;
            requestedChanges.age = Math.max(0, new Date().getFullYear() - d.getFullYear());
        }
    }

    if (gender && ["Male", "Female", "Other"].includes(gender) && gender !== elector.gender) {
        requestedChanges.gender = gender;
    }

    if (address && clean(address) !== clean(elector.address)) {
        if (clean(address).length < 10 || clean(address).length > 300) {
            throw new ApiError(400, "Full address must be between 10 and 300 characters.");
        }
        requestedChanges.address = clean(address).replace(/\s+/g, " ");
    }

    if (pinCode && clean(pinCode) !== clean(elector.pinCode)) {
        if (!PIN_CODE_PATTERN.test(clean(pinCode))) {
            throw new ApiError(400, "Enter a valid six-digit PIN code.");
        }
        requestedChanges.pinCode = clean(pinCode);
    }

    if (state || district || assemblyConstituency) {
        const newState = clean(state || elector.state);
        const newDistrict = clean(district || elector.district);
        const newConstituency = clean(assemblyConstituency || elector.assemblyConstituency);

        const geoError = validateGeography({
            state: newState,
            district: newDistrict,
            assemblyConstituency: newConstituency
        });
        if (geoError) throw new ApiError(400, geoError);

        if (newState !== elector.state) requestedChanges.state = newState;
        if (newDistrict !== elector.district) requestedChanges.district = newDistrict;
        if (newConstituency !== elector.assemblyConstituency) requestedChanges.assemblyConstituency = newConstituency;
    }

    if (Object.keys(requestedChanges).length === 0) {
        throw new ApiError(400, "No changes detected. Update at least one field to submit a request.");
    }

    const proofDocument = validateDocumentProof(documentProof, "Supporting document proof (e.g. Aadhaar, Passport, Utility bill)");

    // Run Gemini AI sanity check
    const aiReview = await performDocumentSanityCheck({
        type: "change_request",
        currentRecord: elector,
        requestedData: { ...elector, ...requestedChanges },
        documentImage: proofDocument
    });

    const changeRequest = {
        _id: crypto.randomUUID(),
        epic: elector.epic,
        electorId: elector._id,
        currentRecord: {
            name: elector.name,
            dateOfBirth: elector.dateOfBirth,
            gender: elector.gender,
            state: elector.state,
            district: elector.district,
            assemblyConstituency: elector.assemblyConstituency,
            address: elector.address || "—",
            pinCode: elector.pinCode || "—",
            partNumber: elector.partNumber,
            pollingStation: elector.pollingStation
        },
        requestedChanges,
        documentProof: proofDocument,
        aiReview,
        status: "pending",
        submittedAt: new Date().toISOString()
    };

    await saveChangeRequest(changeRequest);

    res.status(201).json({
        success: true,
        message: "Change request submitted. Your Booth Level Officer will verify it and the Electoral Registration Officer will decide.",
        data: {
            requestId: changeRequest._id,
            status: changeRequest.status,
            aiReview
        }
    });
});

/**
 * Voter views their submitted change requests.
 */
export const getMyChangeRequests = asyncHandler(async (req, res) => {
    const epic = req.user?.epic;
    if (!epic) throw new ApiError(401, "Sign in as a voter to view requests.");
    const requests = await listChangeRequestsForEpic(epic);
    requests.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    res.json({ success: true, data: { items: requests, total: requests.length } });
});

// ---- Review workflow (Form 8) ----
//
// Same authority split as Form 6 (RP Act 1950, s. 22):
//   pending          submitted by the voter
//   field_verified   the assigned BLO verified the facts and recommended a decision
//   approved         the ERO/AERO approved it and the electoral roll was corrected
//   rejected         the ERO/AERO rejected it, with a reason shown to the voter
// A request belongs to the area the elector will be in AFTER the change: a shift of residence is
// verified by the BLO of the new area and decided by the ERO of the new constituency, and the
// new booth is fixed during field verification.

export const OPEN_CHANGE_STATUSES = ["pending", "field_verified", "information_required"];
const AREA_FIELDS = ["state", "district", "assemblyConstituency"];

export const isShift = (request) => AREA_FIELDS.some((f) => request.requestedChanges?.[f] !== undefined);

/** The record a change request is judged against: the elector as it will be after the change. */
export const changeTarget = (request) => {
    const target = { ...request.currentRecord, ...request.requestedChanges };
    if (isShift(request)) { delete target.pollingStation; delete target.partNumber; }
    return target;
};

export const listAllChangeRequests = asyncHandler(async (req, res) => {
    const status = req.query.status || "pending";
    const { assignments } = req.authority;
    const all = await listChangeRequests();
    const items = all
        .filter((r) => status === "all" || r.status === status || (status === "open" && OPEN_CHANGE_STATUSES.includes(r.status)))
        .filter((r) => coversAny(assignments, changeTarget(r)))
        .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))
        .map((r) => ({ ...r, shift: isShift(r) }));
    res.json({ success: true, data: { items, total: items.length, jurisdictionAssigned: assignments.length > 0 } });
});

// Loads a change request in one of the allowed states, or explains why it cannot be acted on.
const getChangeRequestIn = async (id, statuses) => {
    const request = await getChangeRequest(id);
    if (!request) throw new ApiError(404, "Change request not found.");
    if (!statuses.includes(request.status)) {
        if (request.status === "pending") {
            throw new ApiError(409, "The Booth Level Officer has not submitted field verification for this request yet.");
        }
        if (request.status === "field_verified") {
            throw new ApiError(409, "Field verification has already been submitted. The ERO/AERO now decides this request.");
        }
        throw new ApiError(409, `This change request has already been ${request.status}.`);
    }
    return request;
};

const alreadyProcessing = () =>
    new ApiError(409, "This change request is currently being processed. Refresh the list in a moment.");

const coveringAssignmentId = (assignments, record) => assignments.find((a) => coversAny([a], record))?._id ?? null;
const hasBooth = (body) => Boolean(String(body?.partNumber ?? "").trim() || String(body?.pollingStation ?? "").trim());
const cleanNote = (value) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, REASON_MAX_LENGTH);

/**
 * BLO: records field verification and recommends approval or rejection. For a shift of residence
 * the BLO also fixes the new part number and polling station. The roll is not changed here.
 */
export const submitChangeFieldVerification = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body ?? {};
    const recommendation = String(body.recommendation ?? "").trim();
    if (!["approve", "reject"].includes(recommendation)) {
        throw new ApiError(400, "recommendation must be 'approve' or 'reject'.");
    }
    const { assignments } = req.authority;
    let booth = recommendation === "approve" && hasBooth(body) ? parseBoothAssignment(body) : null;
    const note = recommendation === "reject" ? requireReason(body.note, "rejection recommendation") : cleanNote(body.note);

    const release = await lockChangeRequest(id);
    if (!release) throw alreadyProcessing();
    try {
        const request = await getChangeRequestIn(id, ["pending"]);
        const target = changeTarget(request);
        assertCovers(assignments, target, "This change request");
        if (recommendation === "approve" && isShift(request)) {
            booth ??= boothFromAssignments(assignments, target);
            parseBoothAssignment(booth ?? {}); // a shift needs the new booth; explains what is missing
        }

        const now = new Date().toISOString();
        const fieldVerification = {
            by: req.user.epic, byUserId: req.user._id, role: req.user.role,
            assignmentId: coveringAssignmentId(assignments, target),
            recommendation, note: note || null,
            partNumber: booth?.partNumber ?? null, pollingStation: booth?.pollingStation ?? null,
            at: now
        };
        const updated = { ...request, status: "field_verified", fieldVerification, updatedAt: now };
        const tx = transaction();
        saveChangeRequest(updated, tx);
        await recordAudit(auditEvent({
            actor: req.user, action: "change_request.field_verified",
            resource: { type: "change_request", id: request._id },
            jurisdiction: recordJurisdiction(target), assignmentId: fieldVerification.assignmentId,
            before: { status: request.status },
            after: { status: updated.status, recommendation, partNumber: fieldVerification.partNumber, pollingStation: fieldVerification.pollingStation },
            note: note || null
        }), tx);
        await tx.exec();
        res.json({ success: true, message: "Field verification submitted. The ERO/AERO will decide this request.", data: updated });
    } finally {
        await release();
    }
});

/**
 * ERO/AERO approves a field-verified request. Updates the electoral roll record, the voter
 * account (for a name change), the request and the audit trail in one transaction, so a failure
 * cannot leave the roll half-updated. The officer may correct the booth.
 */
export const approveChangeRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { assignments } = req.authority;
    const override = hasBooth(req.body) ? parseBoothAssignment(req.body) : null;
    const release = await lockChangeRequest(id);
    if (!release) throw alreadyProcessing();

    try {
        const request = await getChangeRequestIn(id, ["field_verified"]);
        const target = changeTarget(request);
        assertCovers(assignments, target, "This change request");
        const elector = await getElectorByEpic(request.epic);
        if (!elector) throw new ApiError(404, "Voter electoral record could not be updated.");

        const field = request.fieldVerification ?? {};
        const booth = override ?? (field.partNumber && field.pollingStation
            ? { partNumber: field.partNumber, pollingStation: field.pollingStation } : null);
        if (isShift(request) && !booth) parseBoothAssignment({}); // a shift cannot keep the old booth

        const now = new Date().toISOString();
        const changes = { ...request.requestedChanges, ...(booth ?? {}) };
        const updatedElector = { ...elector, ...changes, updatedAt: now };
        const decided = {
            ...request,
            status: "approved",
            appliedChanges: changes,
            decidedBy: req.user.epic,
            decidedByRole: req.user.role,
            decidedAt: now,
            decisionNote: cleanNote(req.body?.note)
        };

        const tx = transaction();
        saveElector(updatedElector, tx);
        if (request.requestedChanges.name) {
            const user = await getUserByEpic(request.epic);
            if (user) saveUser({ ...user, name: request.requestedChanges.name }, tx);
        }
        saveChangeRequest(decided, tx);
        await recordAudit(auditEvent({
            actor: req.user, action: "change_request.approved",
            resource: { type: "change_request", id: request._id },
            jurisdiction: recordJurisdiction(target), assignmentId: coveringAssignmentId(assignments, target),
            before: Object.fromEntries(Object.keys(changes).map((k) => [k, elector[k] ?? null])),
            after: changes,
            note: decided.decisionNote || null
        }), tx);
        await tx.exec();

        res.json({
            success: true,
            message: "Change request approved. Electoral roll updated successfully.",
            data: { requestId: decided._id, epic: decided.epic, updatedElector }
        });
    } finally {
        await release();
    }
});

/** ERO/AERO rejects an open request (before or after field verification), with a reason. */
export const rejectChangeRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { assignments } = req.authority;
    const reason = requireReason(req.body?.note);
    const release = await lockChangeRequest(id);
    if (!release) throw alreadyProcessing();

    try {
        const request = await getChangeRequestIn(id, OPEN_CHANGE_STATUSES);
        const target = changeTarget(request);
        assertCovers(assignments, target, "This change request");
        const decided = {
            ...request,
            status: "rejected",
            decidedBy: req.user.epic,
            decidedByRole: req.user.role,
            decidedAt: new Date().toISOString(),
            decisionNote: reason
        };
        const tx = transaction();
        saveChangeRequest(decided, tx);
        await recordAudit(auditEvent({
            actor: req.user, action: "change_request.rejected",
            resource: { type: "change_request", id: request._id },
            jurisdiction: recordJurisdiction(target), assignmentId: coveringAssignmentId(assignments, target),
            before: { status: request.status, recommendation: request.fieldVerification?.recommendation ?? null },
            after: { status: "rejected" },
            note: reason
        }), tx);
        await tx.exec();
        res.json({ success: true, message: "Change request rejected.", data: decided });
    } finally {
        await release();
    }
});
