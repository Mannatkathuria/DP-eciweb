import crypto from "crypto";
import { transaction } from "../config/redis.js";
import {
    getContestingList, getNomination, listNominations, lockNomination, saveContestingList, saveNomination
} from "../repositories/election.repository.js";
import { rollAreaKey } from "../repositories/rollVersion.repository.js";
import { assignmentInElection, requireElection, todayIST } from "../services/election.service.js";
import { assertCovers, validateJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Nominations: the candidate files within the nomination period; the Returning Officer scrutinises
// on or after the scrutiny date; the candidate may withdraw until the last date of withdrawal;
// after that the RO publishes the list of contesting candidates, which is then fixed.
// Minimum age to contest an Assembly or Lok Sabha seat is 25 (Constitution, Arts. 84 and 173).

const MIN_AGE = 25;
const clean = (v, max = 120) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const asRecord = (n) => ({ ...n, assemblyConstituency: n.constituency });
const ageOn = (dob, on) => {
    const [y, m, d] = dob.split("-").map(Number); const [Y, M, D] = on.split("-").map(Number);
    return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
};

/** Public summary of a nomination (affidavit headline figures, as published by ECI). */
const publicView = (n) => ({
    _id: n._id, name: n.name, party: n.party, independent: n.independent, symbol: n.symbol, age: n.age,
    constituency: n.constituency, state: n.state, status: n.status, affidavit: n.affidavit
});

/** Candidate files a nomination for the constituency of their assignment in this election. */
export const fileNomination = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const election = await requireElection(body.electionId);
    const today = todayIST();
    if (today < election.schedule.notificationDate || today > election.schedule.lastDateOfNominations) {
        throw new ApiError(409, `Nominations for this election are accepted from ${election.schedule.notificationDate} to ${election.schedule.lastDateOfNominations}.`);
    }
    const assignment = req.authority.assignments.find((a) => a.jurisdiction?.constituency && assignmentInElection(a, election));
    if (!assignment) throw new ApiError(403, "Your candidate account is not assigned to a constituency in this election.");
    const area = validateJurisdiction("ero", assignment.jurisdiction);
    if (!election.states.includes(area.state)) throw new ApiError(409, "This election does not cover your constituency's State/UT.");

    const dateOfBirth = String(body.dateOfBirth ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) throw new ApiError(400, "Give your date of birth (YYYY-MM-DD).");
    const age = ageOn(dateOfBirth, election.schedule.scrutinyDate);
    if (!(age >= MIN_AGE && age < 120)) throw new ApiError(400, `A candidate must be at least ${MIN_AGE} years old on the date of scrutiny.`);
    const independent = body.independent === true;
    const party = independent ? "Independent" : clean(body.party);
    if (!party || party.length < 2) throw new ApiError(400, "Name your party, or file as an independent.");
    const symbol = clean(body.symbol, 60) || null;
    const a = body.affidavit ?? {};
    const num = (v, label) => { const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `${label} must be zero or more.`); return Math.round(n); };
    const affidavit = {
        criminalCases: num(a.criminalCases ?? 0, "Criminal cases"),
        assets: num(a.assets ?? 0, "Assets"), liabilities: num(a.liabilities ?? 0, "Liabilities"),
        education: clean(a.education, 80) || "Not stated"
    };
    if (a.declarationAccepted !== true) throw new ApiError(400, "Confirm the affidavit declaration (Form 26).");

    const mine = (await listNominations()).filter((n) => n.userId === req.user._id && n.electionId === election._id && n.status !== "rejected" && n.status !== "withdrawn");
    if (mine.length) throw new ApiError(409, "You already have a nomination in this election.");

    const nomination = {
        _id: crypto.randomUUID(), electionId: election._id, userId: req.user._id, epic: req.user.epic,
        name: clean(body.name) || req.user.name, dateOfBirth, age, party, independent, symbol, affidavit,
        ...area, status: "filed", filedAt: new Date().toISOString(), scrutiny: null, withdrawnAt: null
    };
    const tx = transaction();
    saveNomination(nomination, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "nomination.filed", resource: { type: "nomination", id: nomination._id }, jurisdiction: area, after: publicView(nomination) }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: "Nomination filed. The Returning Officer will scrutinise it.", data: nomination });
});

export const myNominations = asyncHandler(async (req, res) => {
    const items = (await listNominations()).filter((n) => n.userId === req.user._id).sort((a, b) => b.filedAt.localeCompare(a.filedAt));
    res.json({ success: true, data: { items } });
});

/** RO / ARO: nominations in their constituency. */
export const listNominationsForRo = asyncHandler(async (req, res) => {
    const items = (await listNominations())
        .filter((n) => !req.query.electionId || n.electionId === req.query.electionId)
        .filter((n) => { try { assertCovers(req.authority.assignments, asRecord(n)); return true; } catch { return false; } })
        .sort((a, b) => a.filedAt.localeCompare(b.filedAt));
    res.json({ success: true, data: { items } });
});

/** RO scrutiny: accept, or reject with a reason, on or after the scrutiny date and before withdrawals close. */
export const scrutinise = asyncHandler(async (req, res) => {
    const decision = String(req.body?.decision ?? "");
    if (!["accepted", "rejected"].includes(decision)) throw new ApiError(400, "decision must be 'accepted' or 'rejected'.");
    const reason = decision === "rejected" ? requireReason(req.body?.reason) : clean(req.body?.reason, 500) || null;
    const release = await lockNomination(req.params.id);
    if (!release) throw new ApiError(409, "This nomination is being processed.");
    try {
        const nomination = await getNomination(req.params.id);
        if (!nomination) throw new ApiError(404, "Nomination not found.");
        assertCovers(req.authority.assignments, asRecord(nomination), "This nomination");
        const election = await requireElection(nomination.electionId);
        const today = todayIST();
        if (today < election.schedule.scrutinyDate) throw new ApiError(409, `Scrutiny takes place on ${election.schedule.scrutinyDate}.`);
        if (today > election.schedule.lastDateOfWithdrawal) throw new ApiError(409, "The scrutiny period is over.");
        if (nomination.status !== "filed") throw new ApiError(409, `This nomination has already been ${nomination.status}.`);
        const updated = { ...nomination, status: decision, scrutiny: { decision, reason, by: req.user.epic, at: new Date().toISOString() } };
        const tx = transaction();
        saveNomination(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: `nomination.${decision}`, resource: { type: "nomination", id: nomination._id }, jurisdiction: nomination, before: { status: "filed" }, after: { status: decision }, note: reason }), tx);
        await tx.exec();
        res.json({ success: true, data: updated });
    } finally { await release(); }
});

/** Candidate withdraws their own nomination, until the last date of withdrawal. */
export const withdraw = asyncHandler(async (req, res) => {
    const release = await lockNomination(req.params.id);
    if (!release) throw new ApiError(409, "This nomination is being processed.");
    try {
        const nomination = await getNomination(req.params.id);
        if (!nomination || nomination.userId !== req.user._id) throw new ApiError(404, "Nomination not found.");
        const election = await requireElection(nomination.electionId);
        if (todayIST() > election.schedule.lastDateOfWithdrawal) throw new ApiError(409, "The last date of withdrawal has passed.");
        if (!["filed", "accepted"].includes(nomination.status)) throw new ApiError(409, `This nomination is ${nomination.status}.`);
        const updated = { ...nomination, status: "withdrawn", withdrawnAt: new Date().toISOString() };
        const tx = transaction();
        saveNomination(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "nomination.withdrawn", resource: { type: "nomination", id: nomination._id }, jurisdiction: nomination, before: { status: nomination.status }, after: { status: "withdrawn" } }), tx);
        await tx.exec();
        res.json({ success: true, data: updated });
    } finally { await release(); }
});

/**
 * RO publishes the list of contesting candidates once withdrawals have closed. Every nomination
 * must have been scrutinised. Order: party candidates, then independents, alphabetically within.
 */
export const publishContesting = asyncHandler(async (req, res) => {
    const election = await requireElection(req.body?.electionId);
    const area = validateJurisdiction("ero", req.body ?? {});
    assertCovers(req.authority.assignments, { ...area, assemblyConstituency: area.constituency }, "This constituency");
    if (todayIST() <= election.schedule.lastDateOfWithdrawal) throw new ApiError(409, `The list can be published after the last date of withdrawal (${election.schedule.lastDateOfWithdrawal}).`);
    const areaKey = rollAreaKey(area);
    if (await getContestingList(election._id, areaKey)) throw new ApiError(409, "The list of contesting candidates has already been published.");
    const here = (await listNominations()).filter((n) => n.electionId === election._id && rollAreaKey(n) === areaKey);
    if (here.some((n) => n.status === "filed")) throw new ApiError(409, "Some nominations have not been scrutinised.");
    const contesting = here.filter((n) => n.status === "accepted")
        .sort((a, b) => Number(a.independent) - Number(b.independent) || a.name.localeCompare(b.name))
        .map((n, i) => ({ serial: i + 1, nominationId: n._id, ...publicView(n) }));
    if (!contesting.length) throw new ApiError(409, "There are no accepted nominations to publish.");
    const list = { electionId: election._id, areaKey, ...area, candidates: contesting, publishedBy: req.user.epic, publishedAt: new Date().toISOString() };
    const tx = transaction();
    saveContestingList(list, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "candidates.published", resource: { type: "contesting", id: `${election._id}:${areaKey}` }, jurisdiction: area, after: { count: contesting.length } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: list });
});

/** Public: the published list of contesting candidates for a constituency. */
export const publicCandidates = asyncHandler(async (req, res) => {
    const election = await requireElection(req.query.electionId);
    const area = validateJurisdiction("ero", req.query);
    const list = await getContestingList(election._id, rollAreaKey(area));
    res.json({ success: true, data: list ?? { electionId: election._id, ...area, candidates: [], publishedAt: null } });
});


