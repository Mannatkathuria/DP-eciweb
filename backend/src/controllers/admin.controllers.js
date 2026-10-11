import { listVerifications as getAllVerifications, saveVerification, getVerification } from "../repositories/verification.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
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
        by: req.user._id, decision, note: String(note ?? "").slice(0, 500), at: new Date().toISOString()
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
