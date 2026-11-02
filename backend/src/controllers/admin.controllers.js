import { listVerifications as getAllVerifications, saveVerification, getVerification, lockVerification } from "../repositories/verification.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
import { listRegistrations as getAllRegistrations, getRegistration, saveRegistration, lockRegistration, pendingDuplicateKey, registrationDocumentKey, getRegistrationDocument } from "../repositories/registration.repository.js";
import { DOCUMENT_CATEGORIES, SEPARATE_DOCUMENTS, purgedDocumentMeta, withoutSecrets } from "../utils/form6.js";
import { createVoterFromApplication, enrollReferenceFace } from "../services/registration.service.js";
import { transaction } from "../config/redis.js";
import { requireReason, REASON_MAX_LENGTH } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { assertCovers, boothFromAssignments, coversAny, recordJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";

const percentile = (sorted, p) => {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
};

import { getUserByEpic, saveUser } from "../repositories/user.repository.js";

export const listVerifications = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const all = await getAllVerifications();
    let items = all.filter((v) => !req.query.status || v.status === req.query.status);
    if (req.query.unresolved === "true") items = items.filter((v) => !v.resolution?.decision);
    items.sort((a, b) => new Date(b.createdAt || b.startedAt || 0) - new Date(a.createdAt || a.startedAt || 0));
    const total = items.length;
    items = items.slice((page - 1) * limit, page * limit);
    const electors = Object.fromEntries((await listElectors()).map(e => [e.epic, e]));
    items = items.map(v => ({
        ...v,
        createdAt: v.createdAt || v.startedAt || new Date().toISOString(),
        elector: electors[v.epic] || null,
        aiReview: v.aiReview || v.identity?.aiReview || null
    }));
    res.json({ success: true, data: { items, total, page, limit } });
});

export const resolveVerification = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { decision, note } = req.body ?? {};
    if (!["cleared", "escalated"].includes(decision)) throw new ApiError(400, "decision must be 'cleared' or 'escalated'.");
    const release = await lockVerification(id);
    if (!release) throw new ApiError(409, "This case is already being resolved. Refresh in a moment.");
    try {
        const verification = await getVerification(id);
        if (!verification) throw new ApiError(404, "Verification not found.");
        if (verification.status !== "review_required" || verification.resolution?.decision) {
            throw new ApiError(409, "Only cases awaiting manual review can be resolved.");
        }

        verification.resolution = {
            by: req.user._id, byEpic: req.user.epic, decision,
            note: String(note ?? "").trim().slice(0, REASON_MAX_LENGTH), at: new Date().toISOString()
        };
        // The case and the voter's verified flag are saved together.
        const tx = transaction();
        if (decision === "cleared") {
            verification.status = "verified";
            const user = verification.epic ? await getUserByEpic(verification.epic) : null;
            if (user) saveUser({ ...user, verified: true }, tx);
        }
        saveVerification(verification, tx);
        await tx.exec();
        res.json({ success: true, message: "Case updated.", data: verification });
    } finally {
        await release();
    }
});

export const getStats = asyncHandler(async (req, res) => {
    const items = await getAllVerifications();
    const counts = {};
    for (const v of items) counts[v.status] = (counts[v.status] || 0) + 1;
    const completed = (counts.verified || 0) + (counts.review_required || 0);
    const secs = items.filter(v => v.durationMs > 0).map(v => v.durationMs / 1000).sort((a,b)=>a-b);
    const mean = secs.length ? secs.reduce((a,b)=>a+b,0)/secs.length : null;
    const identityBreakdown = {};
    for (const v of items) {
        const s = v.identity?.status;
        if (s) identityBreakdown[s] = (identityBreakdown[s] || 0) + 1;
    }
    res.json({ success: true, data: {
        total: items.length, verified: counts.verified || 0,
        reviewRequired: counts.review_required || 0, inProgress: counts.in_progress || 0,
        manualInterventionsPer100: completed ? +(((counts.review_required || 0) / completed) * 100).toFixed(1) : null,
        verificationSuccessRate: completed ? +(((counts.verified || 0) / completed) * 100).toFixed(1) : null,
        processingSeconds: { mean: mean === null ? null : +mean.toFixed(1), median: percentile(secs, 50), p95: percentile(secs, 95) },
        identityBreakdown
    }});
});


// ---- Voter registration requests ----
//
// Form 6 workflow (Representation of the People Act 1950, ss. 13B, 13C, 23):
//   pending          submitted by the applicant
//   field_verified   the assigned BLO has verified in the field and recommended a decision
//   approved         the ERO/AERO approved it: an electoral-roll entry and voter account exist
//   rejected         the ERO/AERO rejected it, with a reason shown to the applicant
// A BLO verifies and recommends; only the ERO/AERO decides. Every step is checked against the
// caller's assignment for the application's constituency and recorded in the audit trail.

export const OPEN_REGISTRATION_STATUSES = ["pending", "field_verified", "information_required"];

const summarise = (r) => ({
    ...withoutSecrets(r), // never send the encrypted Aadhaar to a client
    hasReferenceImage: Boolean(r.referenceImage),
    referenceImage: r.referenceImage || null,
    aiReview: r.aiReview || null
});

export const listRegistrationRequests = asyncHandler(async (req, res) => {
    const status = req.query.status || "pending";
    const { assignments } = req.authority;
    const items = (await getAllRegistrations())
        .filter((r) => status === "all" || r.status === status || (status === "open" && OPEN_REGISTRATION_STATUSES.includes(r.status)))
        .filter((r) => coversAny(assignments, r))
        .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))
        .map(summarise);
    res.json({ success: true, data: { items, total: items.length, jurisdictionAssigned: assignments.length > 0 } });
});

// Part numbers are positive integers within an assembly constituency.
const PART_NUMBER_PATTERN = /^[1-9]\d{0,3}$/;
const POLLING_STATION_MIN = 3;
const POLLING_STATION_MAX = 200;

/** Validates the part number and polling station fixed during field verification or decision. */
export const parseBoothAssignment = (body) => {
    const partNumber = String(body?.partNumber ?? "").trim();
    const pollingStation = String(body?.pollingStation ?? "").trim().replace(/\s+/g, " ");
    if (!partNumber || !pollingStation) {
        throw new ApiError(400, "Assign both a part number and a polling station before approving.");
    }
    if (!PART_NUMBER_PATTERN.test(partNumber)) {
        throw new ApiError(400, "Part number must be a whole number between 1 and 9999.");
    }
    if (pollingStation.length < POLLING_STATION_MIN || pollingStation.length > POLLING_STATION_MAX) {
        throw new ApiError(400, `Polling station must be between ${POLLING_STATION_MIN} and ${POLLING_STATION_MAX} characters.`);
    }
    return { partNumber, pollingStation };
};

const hasBooth = (body) => Boolean(String(body?.partNumber ?? "").trim() || String(body?.pollingStation ?? "").trim());

// Loads an application in one of the allowed states, or explains why it cannot be acted on.
const getApplicationIn = async (id, statuses) => {
    const application = await getRegistration(id);
    if (!application) throw new ApiError(404, "Registration request not found.");
    if (!statuses.includes(application.status)) {
        if (application.status === "pending") {
            throw new ApiError(409, "The Booth Level Officer has not submitted field verification for this application yet.");
        }
        if (application.status === "field_verified") {
            throw new ApiError(409, "Field verification has already been submitted. The ERO/AERO now decides this application.");
        }
        throw new ApiError(409, `This application has already been ${application.status}.`);
    }
    return application;
};

const alreadyProcessing = () =>
    new ApiError(409, "This application is already being processed. Refresh the list in a moment.");

const coveringAssignmentId = (assignments, record) => assignments.find((a) => coversAny([a], record))?._id ?? null;

/**
 * BLO: records the field verification of a pending application and recommends approval (with
 * the booth the applicant belongs to) or rejection (with a reason). The application then waits
 * for the ERO/AERO. Nothing is added to the electoral roll here.
 */
export const submitFieldVerification = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body ?? {};
    const recommendation = String(body.recommendation ?? "").trim();
    if (!["approve", "reject"].includes(recommendation)) {
        throw new ApiError(400, "recommendation must be 'approve' or 'reject'.");
    }
    const { assignments } = req.authority;

    // Validate before taking the lock, so a correction can be resubmitted at once.
    let booth = null;
    let note = String(body.note ?? "").trim().replace(/\s+/g, " ").slice(0, REASON_MAX_LENGTH);
    if (recommendation === "approve") {
        booth = hasBooth(body) ? parseBoothAssignment(body) : null;
    } else {
        note = requireReason(body.note, "rejection recommendation");
    }

    const release = await lockRegistration(id);
    if (!release) throw alreadyProcessing();
    try {
        const application = await getApplicationIn(id, ["pending"]);
        assertCovers(assignments, application, "This application");
        if (recommendation === "approve") {
            booth ??= boothFromAssignments(assignments, application);
            if (!booth?.partNumber || !booth?.pollingStation) parseBoothAssignment(booth ?? {}); // explains what is missing
        }

        const now = new Date().toISOString();
        const fieldVerification = {
            by: req.user.epic, byUserId: req.user._id, role: req.user.role,
            assignmentId: coveringAssignmentId(assignments, application),
            recommendation, note: note || null,
            partNumber: booth?.partNumber ?? null, pollingStation: booth?.pollingStation ?? null,
            at: now
        };
        const updated = { ...application, status: "field_verified", fieldVerification, updatedAt: now };
        const tx = transaction();
        saveRegistration(updated, tx);
        await recordAudit(auditEvent({
            actor: req.user, action: "registration.field_verified",
            resource: { type: "registration", id: application._id },
            jurisdiction: recordJurisdiction(application), assignmentId: fieldVerification.assignmentId,
            before: { status: application.status },
            after: { status: updated.status, recommendation, partNumber: fieldVerification.partNumber, pollingStation: fieldVerification.pollingStation },
            note: note || null
        }), tx);
        await tx.exec();
        res.json({ success: true, message: "Field verification submitted. The ERO/AERO will decide this application.", data: summarise(updated) });
    } finally {
        await release();
    }
});

/**
 * ERO/AERO: approves a field-verified application. The booth comes from the BLO's verification
 * unless the officer corrects it. Creates the electoral-roll record and the voter account.
 */
export const approveRegistration = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { assignments } = req.authority;
    // Validate a corrected booth before taking the lock, so a correction can be resubmitted at once.
    const override = hasBooth(req.body) ? parseBoothAssignment(req.body) : null;
    const release = await lockRegistration(id);
    if (!release) throw alreadyProcessing();

    let result;
    try {
        const application = await getApplicationIn(id, ["field_verified"]);
        assertCovers(assignments, application, "This application");
        const field = application.fieldVerification ?? {};
        const booth = override ?? parseBoothAssignment({ partNumber: field.partNumber, pollingStation: field.pollingStation });
        const note = String(req.body?.note ?? "").trim().replace(/\s+/g, " ").slice(0, REASON_MAX_LENGTH) || null;
        result = await createVoterFromApplication(application, req.user, booth, (tx, decided) => recordAudit(auditEvent({
            actor: req.user, action: "registration.approved",
            resource: { type: "registration", id: application._id },
            jurisdiction: recordJurisdiction(application), assignmentId: coveringAssignmentId(assignments, application),
            before: { status: application.status, recommendation: field.recommendation ?? null },
            after: { status: decided.status, epic: decided.epic, partNumber: booth.partNumber, pollingStation: booth.pollingStation, rollEntry: "created" },
            note
        }), tx));
    } finally {
        await release();
    }

    // The approval is saved; enrolling the reference photo is optional and cannot undo it.
    const biometricEnrolled = await enrollReferenceFace(result.epic, result.referenceImage);
    res.json({
        success: true,
        message: "Application approved and added to the electoral roll. The voter can now sign in.",
        data: { epic: result.epic, biometricEnrolled, application: summarise(result.application) }
    });
});

/** ERO/AERO: rejects an open application (before or after field verification), with a reason. */
export const rejectRegistration = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { assignments } = req.authority;
    // A rejection without a reason is refused before anything is locked or changed.
    const reason = requireReason(req.body?.note);
    const release = await lockRegistration(id);
    if (!release) throw alreadyProcessing();

    try {
        const application = await getApplicationIn(id, OPEN_REGISTRATION_STATUSES);
        assertCovers(assignments, application, "This application");
        const rejected = {
            ...application,
            status: "rejected",
            decisionNote: reason,
            decidedBy: req.user.epic,
            decidedByRole: req.user.role,
            decidedAt: new Date().toISOString(),
            referenceImage: null
        };
        // Like referenceImage, the other Form 6 documents are deleted once the officer has decided.
        if (application.documents) rejected.documents = purgedDocumentMeta(application.documents, rejected.decidedAt);
        const tx = transaction();
        for (const category of SEPARATE_DOCUMENTS) tx.del(registrationDocumentKey(application._id, category));
        saveRegistration(rejected, tx);
        if (application.duplicateFingerprint) tx.del(pendingDuplicateKey(application.duplicateFingerprint));
        await recordAudit(auditEvent({
            actor: req.user, action: "registration.rejected",
            resource: { type: "registration", id: application._id },
            jurisdiction: recordJurisdiction(application), assignmentId: coveringAssignmentId(assignments, application),
            before: { status: application.status, recommendation: application.fieldVerification?.recommendation ?? null },
            after: { status: "rejected" },
            note: reason
        }), tx);
        await tx.exec();
        res.json({ success: true, message: "Request rejected.", data: summarise(rejected) });
    } finally {
        await release();
    }
});

/**
 * BLO, ERO/AERO within their jurisdiction (see admin.routes.js). Streams one Form 6 document of an
 * application that is still held: "photo", "ageProof" or "addressProof". Documents are deleted
 * once the ERO/AERO decides.
 */
export const getRegistrationDocumentFile = asyncHandler(async (req, res) => {
    const { id, category } = req.params;
    if (!DOCUMENT_CATEGORIES.includes(category)) throw new ApiError(404, "Unknown document category.");
    const application = await getRegistration(id);
    if (!application) throw new ApiError(404, "Registration request not found.");
    assertCovers(req.authority.assignments, application, "This application");

    let mimeType, data;
    if (category === "addressProof") {
        const match = /^data:([^;]+);base64,(.+)$/.exec(application.referenceImage || "");
        if (match) [, mimeType, data] = match;
    } else {
        const doc = await getRegistrationDocument(id, category);
        if (doc) ({ mimeType, data } = doc);
    }
    if (!data) throw new ApiError(404, "This document is not stored (it was not supplied, or it was deleted after the decision).");

    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.type(mimeType);
    res.send(Buffer.from(data, "base64"));
});
