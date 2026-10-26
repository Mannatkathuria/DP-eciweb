import { listVerifications as getAllVerifications, saveVerification, getVerification } from "../repositories/verification.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
import { listRegistrations as getAllRegistrations, getRegistration, saveRegistration, lockRegistration } from "../repositories/registration.repository.js";
import { createVoterFromApplication } from "../services/registration.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const percentile = (sorted, p) => {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
};

export const listVerifications = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const all = await getAllVerifications();
    let items = all.filter((v) => !req.query.status || v.status === req.query.status);
    if (req.query.unresolved === "true") items = items.filter((v) => !v.resolution?.decision);
    items.sort((a, b) => new Date(b.createdAt || b.startedAt) - new Date(a.createdAt || a.startedAt));
    const total = items.length;
    items = items.slice((page - 1) * limit, page * limit);
    const electors = Object.fromEntries((await listElectors()).map(e => [e.epic, e]));
    items = items.map(v => ({ ...v, elector: electors[v.epic] || null }));
    res.json({ success: true, data: { items, total, page, limit } });
});

export const resolveVerification = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { decision, note } = req.body ?? {};
    if (!["cleared", "escalated"].includes(decision)) throw new ApiError(400, "decision must be 'cleared' or 'escalated'.");
    const verification = await getVerification(id);
    if (!verification) throw new ApiError(404, "Verification not found.");
    if (verification.status !== "review_required") throw new ApiError(409, "Only cases awaiting manual review can be resolved.");

    verification.resolution = {
        by: req.user._id, byEpic: req.user.epic, decision, note: String(note ?? "").slice(0, 500), at: new Date().toISOString()
    };
    await saveVerification(verification);
    res.json({ success: true, message: "Case updated.", data: verification });
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


// ---- Voter registration requests (BLO / admin) ----

const summarise = ({ referenceImage, ...rest }) => ({ ...rest, hasReferenceImage: Boolean(referenceImage) });

export const listRegistrationRequests = asyncHandler(async (req, res) => {
    const status = req.query.status || "pending";
    const items = (await getAllRegistrations())
        .filter((r) => status === "all" || r.status === status)
        .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt))
        .map(summarise);
    res.json({ success: true, data: { items, total: items.length } });
});

// Part numbers are positive integers within an assembly constituency.
const PART_NUMBER_PATTERN = /^[1-9]\d{0,3}$/;
const POLLING_STATION_MIN = 3;
const POLLING_STATION_MAX = 200;

/** Validates the part number and polling station a BLO assigns on approval. */
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

export const approveRegistration = asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Validate the BLO's booth assignment before taking the lock, so a correction can be resubmitted at once.
    const assignment = parseBoothAssignment(req.body);
    if (!(await lockRegistration(id))) throw new ApiError(409, "This request is already being processed.");

    const application = await getRegistration(id);
    if (!application) throw new ApiError(404, "Registration request not found.");
    if (application.status !== "pending") throw new ApiError(409, "This request has already been decided.");

    const { epic, biometricEnrolled } = await createVoterFromApplication(application, req.user, assignment);

    application.status = "approved";
    application.epic = epic;
    application.partNumber = assignment.partNumber;
    application.pollingStation = assignment.pollingStation;
    application.decidedBy = req.user.epic;
    application.decidedAt = new Date().toISOString();
    application.referenceImage = null;
    await saveRegistration(application);

    res.json({ success: true, message: "Voter approved. They can now sign in.", data: { epic, biometricEnrolled } });
});

export const rejectRegistration = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!(await lockRegistration(id))) throw new ApiError(409, "This request is already being processed.");

    const application = await getRegistration(id);
    if (!application) throw new ApiError(404, "Registration request not found.");
    if (application.status !== "pending") throw new ApiError(409, "This request has already been decided.");

    application.status = "rejected";
    application.decisionNote = String(req.body?.note ?? "").slice(0, 500);
    application.decidedBy = req.user.epic;
    application.decidedAt = new Date().toISOString();
    application.referenceImage = null;
    await saveRegistration(application);

    res.json({ success: true, message: "Request rejected.", data: summarise(application) });
});
