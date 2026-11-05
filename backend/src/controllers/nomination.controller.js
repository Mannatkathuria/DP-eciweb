import crypto from "crypto";
import { transaction } from "../config/redis.js";
import {
    getContestingList, getNomination, getScrutinyDelegation, listNominations, lockNomination, saveContestingList,
    saveNomination, saveScrutinyDelegation
} from "../repositories/election.repository.js";
import { getUserByEpic } from "../repositories/user.repository.js";
import { listAssignmentsForUser } from "../repositories/assignment.repository.js";
import { rollAreaKey } from "../repositories/rollVersion.repository.js";
import { assignmentInElection, requireElection, todayIST } from "../services/election.service.js";
import { assertCovers, covers, validateJurisdiction } from "../services/authority.service.js";
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

// Security deposit (RP Act 1951, s. 34): Lok Sabha ₹25,000, Assembly ₹10,000; half for SC/ST candidates.
export const depositRequired = (election, category) => {
    const full = election.type === "general_parliament" ? 25000 : 10000;
    return category === "sc" || category === "st" ? full / 2 : full;
};
const depositOf = (d, election) => {
    const category = ["general", "sc", "st"].includes(d.category) ? d.category : "general";
    const amount = Number(d.amount);
    const required = depositRequired(election, category);
    if (!Number.isFinite(amount) || amount < required) throw new ApiError(400, `The security deposit for a ${category.toUpperCase()} candidate is ₹${required.toLocaleString("en-IN")}.`);
    const mode = ["cash", "treasury_challan", "rbi_challan"].includes(d.mode) ? d.mode : "cash";
    const receipt = clean(d.receiptNumber, 40);
    if (!receipt) throw new ApiError(400, "Give the deposit receipt or challan number.");
    return { category, amount, required, mode, receiptNumber: receipt, recordedAt: new Date().toISOString() };
};
// Criminal antecedents (Form 26 and the publicity in Form C-1 to C-2): each pending case, and the
// three newspaper / TV declarations a candidate with cases must publish.
const antecedentsOf = (list, count) => {
    const cases = (Array.isArray(list?.cases) ? list.cases : []).slice(0, 50).map((c) => ({ firNumber: clean(c.firNumber, 60), court: clean(c.court, 120), sections: clean(c.sections, 200), status: ["pending", "convicted"].includes(c.status) ? c.status : "pending" }))
        .filter((c) => c.firNumber || c.sections);
    const publicity = (Array.isArray(list?.publicity) ? list.publicity : []).slice(0, 6).map((p) => ({ medium: clean(p.medium, 80), date: clean(p.date, 10) })).filter((p) => p.medium && /^\d{4}-\d{2}-\d{2}$/.test(p.date));
    return { declared: count, cases, publicity, publicityDue: count > 0 ? 3 : 0 };
};
export const SYMBOL_CATEGORIES = { recognised_national: "Recognised national party", recognised_state: "Recognised State party", registered_unrecognised: "Registered unrecognised party", independent: "Independent" };
// Free symbols notified by the Commission (an illustrative subset).
export const FREE_SYMBOLS = ["Almirah", "Balloon", "Bangles", "Battery torch", "Bucket", "Cake", "Camera", "Carrot", "Chair", "Clock", "Coconut farm", "Cup and saucer", "Diamond", "Football", "Gas cylinder", "Glass tumbler", "Kite", "Ladder", "Laptop", "Pressure cooker", "Ring", "Scissors", "Table", "Television", "Whistle"];
const CATEGORY_ORDER = Object.keys(SYMBOL_CATEGORIES);
const categoryOf = (n) => n.partyCategory ?? (n.independent ? "independent" : "registered_unrecognised");

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

    const deposit = body.deposit ? depositOf(body.deposit, election) : null;
    const mine = (await listNominations()).filter((n) => n.userId === req.user._id && n.electionId === election._id && n.status !== "rejected" && n.status !== "withdrawn");
    if (mine.length) throw new ApiError(409, "You already have a nomination in this election.");

    const nomination = {
        _id: crypto.randomUUID(), electionId: election._id, userId: req.user._id, epic: req.user.epic,
        name: clean(body.name) || req.user.name, dateOfBirth, age, party, independent, symbol, affidavit,
        criminalAntecedents: antecedentsOf(body.criminalAntecedents, affidavit.criminalCases), deposit, sets: 1, source: "online",
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

/**
 * Election agent: the nomination of the candidate they were appointed for, read only, with the
 * scrutiny outcome, so they can help prepare papers and attend scrutiny (RP Act 1951, s. 36).
 */
export const assistedNomination = asyncHandler(async (req, res) => {
    const { listAssignmentsForUser } = await import("../repositories/assignment.repository.js");
    const mine = (await listAssignmentsForUser(req.user._id)).filter((a) => a.role === "election_agent" && a.status === "active" && a.appointedFor);
    const items = (await listNominations()).filter((n) => mine.some((a) => a.appointedFor === n._id))
        .map(({ affidavit, ...n }) => ({ ...n, affidavit: affidavit ? { declared: true } : null }));
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
        let capacity = "returning_officer";
        if (req.user.role !== "ro") {
            const delegation = await getScrutinyDelegation(nomination.electionId, rollAreaKey(nomination));
            if (!delegation || delegation.revokedAt || delegation.aroUserId !== req.user._id) {
                throw new ApiError(403, "An Assistant Returning Officer may scrutinise nominations only when the Returning Officer has recorded that they are unavoidably prevented and named you (RP Act 1951, s.22(2)).");
            }
            capacity = "assistant_returning_officer_ro_prevented";
        }
        const updated = { ...nomination, status: decision, scrutiny: { decision, reason, by: req.user.epic, capacity, at: new Date().toISOString() } };
        const tx = transaction();
        saveNomination(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: `nomination.${decision}`, resource: { type: "nomination", id: nomination._id }, jurisdiction: nomination, before: { status: "filed" }, after: { status: decision }, note: reason }), tx);
        await tx.exec();
        res.json({ success: true, data: updated });
    } finally { await release(); }
});

const delegationArea = async (req, source) => {
    const election = await requireElection(source?.electionId);
    const area = validateJurisdiction("ero", source ?? {});
    assertCovers(req.authority.assignments, { ...area, assemblyConstituency: area.constituency }, "This constituency");
    return { election, area, areaKey: rollAreaKey(area) };
};

/**
 * RO records that they are unavoidably prevented from scrutinising, and names the ARO of the same
 * constituency who will scrutinise instead. Only one delegation is active per area at a time.
 */
export const delegateScrutiny = asyncHandler(async (req, res) => {
    const { election, area, areaKey } = await delegationArea(req, req.body);
    const reason = requireReason(req.body?.reason);
    const aro = await getUserByEpic(String(req.body?.aroEpic ?? "").trim().toUpperCase());
    if (!aro || aro.role !== "aro") throw new ApiError(404, "No Assistant Returning Officer has that EPIC.");
    const record = { ...area, assemblyConstituency: area.constituency };
    const aroAssigned = (await listAssignmentsForUser(aro._id))
        .some((a) => a.status === "active" && a.role === "aro" && assignmentInElection(a, election) && covers(a, record));
    if (!aroAssigned) throw new ApiError(409, "That Assistant Returning Officer is not assigned to this constituency for this election.");
    const current = await getScrutinyDelegation(election._id, areaKey);
    if (current && !current.revokedAt) throw new ApiError(409, "A delegation is already active. Withdraw it first.");
    const delegation = { electionId: election._id, areaKey, ...area, aroUserId: aro._id, aroEpic: aro.epic, aroName: aro.name ?? null,
        reason, by: req.user.epic, at: new Date().toISOString(), revokedAt: null, revokedBy: null, revokeReason: null };
    const tx = transaction();
    saveScrutinyDelegation(delegation, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "scrutiny.delegated", resource: { type: "scrutiny-delegation", id: `${election._id}:${areaKey}` }, jurisdiction: area, after: { aroEpic: aro.epic }, note: reason }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: delegation });
});

/** RO withdraws the delegation once they can act again. */
export const revokeScrutinyDelegation = asyncHandler(async (req, res) => {
    const { election, area, areaKey } = await delegationArea(req, req.body);
    const reason = requireReason(req.body?.reason);
    const current = await getScrutinyDelegation(election._id, areaKey);
    if (!current || current.revokedAt) throw new ApiError(404, "There is no active delegation for this constituency.");
    const updated = { ...current, revokedAt: new Date().toISOString(), revokedBy: req.user.epic, revokeReason: reason };
    const tx = transaction();
    saveScrutinyDelegation(updated, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "scrutiny.delegation-revoked", resource: { type: "scrutiny-delegation", id: `${election._id}:${areaKey}` }, jurisdiction: area, before: { aroEpic: current.aroEpic }, note: reason }), tx);
    await tx.exec();
    res.json({ success: true, data: updated });
});

/** RO or ARO: the delegation for one constituency, if any. */
export const getDelegation = asyncHandler(async (req, res) => {
    const { election, areaKey } = await delegationArea(req, req.query);
    res.json({ success: true, data: (await getScrutinyDelegation(election._id, areaKey)) ?? null });
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
    // Form 7A order: recognised national parties, recognised State parties, registered unrecognised
    // parties, then independents; alphabetically within each group.
    const contesting = here.filter((n) => n.status === "accepted")
        .sort((a, b) => CATEGORY_ORDER.indexOf(categoryOf(a)) - CATEGORY_ORDER.indexOf(categoryOf(b)) || a.name.localeCompare(b.name))
        .map((n, i) => ({ serial: i + 1, nominationId: n._id, ...publicView(n), partyCategory: categoryOf(n), partyCategoryText: SYMBOL_CATEGORIES[categoryOf(n)] }));
    if (!contesting.length) throw new ApiError(409, "There are no accepted nominations to publish.");
    const seen = {};
    const symbolIssues = [];
    for (const c of contesting) {
        if (!c.symbol) symbolIssues.push(`${c.name} has no symbol allotted.`);
        else if (seen[c.symbol.toLowerCase()]) symbolIssues.push(`${c.name} and ${seen[c.symbol.toLowerCase()]} have the same symbol (${c.symbol}).`);
        else seen[c.symbol.toLowerCase()] = c.name;
    }
    const list = { form: "7A", electionId: election._id, areaKey, ...area, candidates: contesting, symbolIssues, publishedBy: req.user.epic, publishedAt: new Date().toISOString() };
    const tx = transaction();
    saveContestingList(list, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "candidates.published", resource: { type: "contesting", id: `${election._id}:${areaKey}` }, jurisdiction: area, after: { count: contesting.length } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: list });
});

/** RO: allot a symbol after withdrawals close (reserved symbol for a recognised party; free symbol otherwise). */
export const allotSymbol = asyncHandler(async (req, res) => {
    const category = String(req.body?.partyCategory ?? "");
    if (!SYMBOL_CATEGORIES[category]) throw new ApiError(400, `partyCategory must be one of: ${Object.keys(SYMBOL_CATEGORIES).join(", ")}.`);
    const symbol = clean(req.body?.symbol, 60);
    if (!symbol) throw new ApiError(400, "Name the symbol.");
    const release = await lockNomination(req.params.id);
    if (!release) throw new ApiError(409, "This nomination is being processed.");
    try {
        const n = await getNomination(req.params.id);
        if (!n) throw new ApiError(404, "Nomination not found.");
        assertCovers(req.authority.assignments, asRecord(n), "This nomination");
        if (n.status !== "accepted") throw new ApiError(409, "Symbols are allotted to accepted candidates only.");
        if (await getContestingList(n.electionId, rollAreaKey(n))) throw new ApiError(409, "The list of contesting candidates is already published; symbols are fixed.");
        if ((category === "independent" || category === "registered_unrecognised") && !FREE_SYMBOLS.some((f) => f.toLowerCase() === symbol.toLowerCase())) {
            throw new ApiError(400, "Independents and registered unrecognised parties get one of the free symbols.");
        }
        const others = (await listNominations()).filter((x) => x._id !== n._id && x.electionId === n.electionId && rollAreaKey(x) === rollAreaKey(n) && x.status === "accepted");
        const clash = others.find((x) => x.symbol && x.symbol.toLowerCase() === symbol.toLowerCase() && x.symbolAllotted);
        if (clash) throw new ApiError(409, `${symbol} is already allotted to ${clash.name}.`);
        const updated = { ...n, symbol, partyCategory: category, symbolAllotted: { by: req.user.epic, at: new Date().toISOString() } };
        const tx = transaction();
        saveNomination(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "nomination.symbol_allotted", resource: { type: "nomination", id: n._id }, jurisdiction: n, before: { symbol: n.symbol }, after: { symbol, partyCategory: category } }), tx);
        await tx.exec();
        res.json({ success: true, message: `${symbol} allotted to ${n.name}.`, data: updated });
    } finally { await release(); }
});

/** RO: record the security deposit paid at the RO's office (or correct one). */
export const recordDeposit = asyncHandler(async (req, res) => {
    const release = await lockNomination(req.params.id);
    if (!release) throw new ApiError(409, "This nomination is being processed.");
    try {
        const n = await getNomination(req.params.id);
        if (!n) throw new ApiError(404, "Nomination not found.");
        assertCovers(req.authority.assignments, asRecord(n), "This nomination");
        const election = await requireElection(n.electionId);
        const deposit = { ...depositOf(req.body ?? {}, election), recordedBy: req.user.epic };
        const updated = { ...n, deposit };
        const tx = transaction();
        saveNomination(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "nomination.deposit_recorded", resource: { type: "nomination", id: n._id }, jurisdiction: n, after: { amount: deposit.amount, receipt: deposit.receiptNumber } }), tx);
        await tx.exec();
        res.json({ success: true, message: "Deposit recorded.", data: updated });
    } finally { await release(); }
});

/** RO: digitise a nomination delivered on paper (the legal filing is the paper one). */
export const digitiseNomination = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const election = await requireElection(body.electionId);
    const area = validateJurisdiction("ero", body);
    assertCovers(req.authority.assignments, { ...area, assemblyConstituency: area.constituency }, "This constituency");
    const today = todayIST();
    if (today < election.schedule.notificationDate || today > election.schedule.lastDateOfNominations) throw new ApiError(409, "Outside the nomination period.");
    const dateOfBirth = String(body.dateOfBirth ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) throw new ApiError(400, "Give the candidate's date of birth (YYYY-MM-DD).");
    const age = ageOn(dateOfBirth, election.schedule.scrutinyDate);
    if (!(age >= MIN_AGE && age < 120)) throw new ApiError(400, `A candidate must be at least ${MIN_AGE} years old on the date of scrutiny.`);
    const name = clean(body.name);
    if (name.length < 3) throw new ApiError(400, "Give the candidate's name.");
    const independent = body.independent === true;
    const a = body.affidavit ?? {};
    const affidavit = { criminalCases: Math.max(0, Math.round(Number(a.criminalCases) || 0)), assets: Math.max(0, Math.round(Number(a.assets) || 0)), liabilities: Math.max(0, Math.round(Number(a.liabilities) || 0)), education: clean(a.education, 80) || "Not stated" };
    const nomination = {
        _id: crypto.randomUUID(), electionId: election._id, userId: null, epic: clean(body.candidateEpic, 20).toUpperCase() || null, name, dateOfBirth, age,
        party: independent ? "Independent" : clean(body.party) || "Independent", independent, symbol: clean(body.symbol, 60) || null, affidavit,
        criminalAntecedents: antecedentsOf(body.criminalAntecedents, affidavit.criminalCases), deposit: body.deposit ? { ...depositOf(body.deposit, election), recordedBy: req.user.epic } : null,
        sets: Math.min(4, Math.max(1, Number(body.sets) || 1)), source: "physical", digitisedBy: req.user.epic, ...area, status: "filed", filedAt: new Date().toISOString(), scrutiny: null, withdrawnAt: null
    };
    const tx = transaction();
    saveNomination(nomination, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "nomination.digitised", resource: { type: "nomination", id: nomination._id }, jurisdiction: area, after: publicView(nomination) }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: "Paper nomination digitised. It goes to scrutiny like any other.", data: nomination });
});

/** Candidate: file another nomination paper (up to four sets, RP Act 1951, s. 33(6)). */
export const addNominationSet = asyncHandler(async (req, res) => {
    const release = await lockNomination(req.params.id);
    if (!release) throw new ApiError(409, "This nomination is being processed.");
    try {
        const n = await getNomination(req.params.id);
        if (!n || n.userId !== req.user._id) throw new ApiError(404, "Nomination not found.");
        const election = await requireElection(n.electionId);
        if (todayIST() > election.schedule.lastDateOfNominations) throw new ApiError(409, "The nomination period is over.");
        if ((n.sets ?? 1) >= 4) throw new ApiError(409, "A candidate may file at most four nomination papers.");
        const updated = { ...n, sets: (n.sets ?? 1) + 1 };
        const tx = transaction();
        saveNomination(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "nomination.set_added", resource: { type: "nomination", id: n._id }, jurisdiction: n, after: { sets: updated.sets } }), tx);
        await tx.exec();
        res.json({ success: true, message: `Nomination paper ${updated.sets} of 4 recorded.`, data: updated });
    } finally { await release(); }
});

export const symbolLists = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { categories: SYMBOL_CATEGORIES, freeSymbols: FREE_SYMBOLS } });
});

/** Public: the published list of contesting candidates for a constituency. */
export const publicCandidates = asyncHandler(async (req, res) => {
    const election = await requireElection(req.query.electionId);
    const area = validateJurisdiction("ero", req.query);
    const list = await getContestingList(election._id, rollAreaKey(area));
    res.json({ success: true, data: list ?? { electionId: election._id, ...area, candidates: [], publishedAt: null } });
});


