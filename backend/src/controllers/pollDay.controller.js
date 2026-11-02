import crypto from "crypto";
import { transaction } from "../config/redis.js";
import { listElections, listStations } from "../repositories/election.repository.js";
import { getElectorByEpic, listElectors, saveElector } from "../repositories/elector.repository.js";
import {
    appendRegister, getPollCase, getPollState, listIncidents, listPollCases, listRegister, registerLength, savePollCase, savePollState, votedAt, withStationLock
} from "../repositories/poll.repository.js";
import { assignmentInElection, electionStage, todayIST } from "../services/election.service.js";
import { hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Poll day at one polling station. Everything here is scoped to the caller's own station
// assignment: a polling officer sees and marks only the electors of their part. The poll runs
// in order (mock poll, open, closed) under the presiding officer; an elector is marked once per
// election; doubts and challenges stop the marking until the presiding officer decides.

const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const clean = (v, max = 500) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

/** Identity documents accepted at the polling station: the EPIC, or one of the alternatives ECI notifies. */
export const ID_DOCUMENTS = {
    epic: "Elector Photo Identity Card (EPIC)", aadhaar: "Aadhaar card", mnrega: "MNREGA job card",
    passbook: "Bank or post office passbook with photograph", health_card: "Health insurance smart card (Ministry of Labour)",
    driving_licence: "Driving licence", pan: "PAN card", npr: "Smart card issued by RGI under NPR", passport: "Indian passport",
    pension: "Pension document with photograph", service_id: "Service identity card (Central/State government, PSU, public company)",
    legislator_id: "Official identity card issued to MPs, MLAs or MLCs", udid: "Unique Disability ID (UDID) card"
};
export const CASE_TYPES = ["identity_doubt", "challenged_vote", "tendered_vote", "assisted_voter", "not_in_roll", "other"];
const BLOCKING = ["identity_doubt", "challenged_vote"];
const POLL_STEPS = { not_started: ["mock_poll_done"], mock_poll_done: ["open"], open: ["closed"], closed: [] };

const ageOf = (dob) => {
    if (!dob) return null;
    const d = new Date(dob); const now = new Date();
    return now.getUTCFullYear() - d.getUTCFullYear() - ((now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) ? 1 : 0);
};
const inPart = (station) => (e) => e.isActive !== false && norm(e.state) === norm(station.state)
    && norm(e.assemblyConstituency) === norm(station.constituency) && String(e.partNumber) === station.partNumber;

/**
 * The caller's station and the election being polled there. Chooses the election on its poll day
 * if there is one, otherwise the next poll (so the screen can say when poll day is).
 */
const stationContext = async (req) => {
    const own = req.authority.assignments.filter((a) => a.jurisdiction?.pollingStation);
    if (!own.length) throw new ApiError(403, "You are not assigned to a polling station.");
    const stations = (await listStations()).filter((s) => s.status === "ACTIVE");
    const wanted = String(req.query.stationId ?? req.body?.stationId ?? "");
    const pairs = own.map((a) => [a, stations.find((s) => norm(s.state) === norm(a.jurisdiction.state) && norm(s.constituency) === norm(a.jurisdiction.constituency)
        && norm(s.name) === norm(a.jurisdiction.pollingStation) && (!a.jurisdiction.partNumber || s.partNumber === String(a.jurisdiction.partNumber)))]).filter(([, s]) => s);
    const pick = wanted ? pairs.find(([, s]) => s._id === wanted) : pairs[0];
    if (!pick) throw new ApiError(wanted ? 403 : 404, wanted ? "This polling station is outside your assignment." : "Your polling station has not been approved yet.");
    const [assignment, station] = pick;
    const today = todayIST();
    const elections = (await listElections()).filter((e) => e.states.includes(station.state) && assignmentInElection(assignment, e));
    const election = elections.find((e) => electionStage(e, today) === "poll_day")
        ?? elections.filter((e) => e.schedule.pollDate > today).sort((a, b) => a.schedule.pollDate.localeCompare(b.schedule.pollDate))[0]
        ?? elections.sort((a, b) => b.schedule.pollDate.localeCompare(a.schedule.pollDate))[0];
    if (!election) throw new ApiError(404, "No election is scheduled for your polling station.");
    return { assignment, station, election, onPollDay: electionStage(election, today) === "poll_day", stations: pairs.map(([, s]) => s) };
};

const emptyState = (election, station) => ({ electionId: election._id, stationId: station._id, status: "not_started", history: [], queue: null, queueHistory: [], closing: null });
const loadState = async (election, station) => (await getPollState(election._id, station._id)) ?? emptyState(election, station);
const stationRecord = (station) => ({ ...station, assemblyConstituency: station.constituency, pollingStation: station.name });

/** Station dashboard: poll state, turnout so far, queue and open cases. */
export const getStation = asyncHandler(async (req, res) => {
    const { station, election, onPollDay, stations } = await stationContext(req);
    const [state, voted, electors, cases, incidents] = await Promise.all([
        loadState(election, station), registerLength(election._id, station._id), listElectors(), listPollCases(election._id, station._id), listIncidents(election._id)
    ]);
    const total = electors.filter(inPart(station)).length;
    res.json({ success: true, data: {
        station: { _id: station._id, stationCode: station.stationCode, name: station.name, address: station.address, state: station.state, district: station.district, constituency: station.constituency, partNumber: station.partNumber, accessibility: station.accessibility },
        stations: stations.map((s) => ({ _id: s._id, name: s.name, partNumber: s.partNumber, constituency: s.constituency })),
        election: { _id: election._id, name: election.name, pollDate: election.schedule.pollDate, stage: electionStage(election) },
        onPollDay, poll: { status: state.status, history: state.history, closing: state.closing },
        queue: state.queue, queueHistory: state.queueHistory.slice(-12),
        turnout: { electors: total, voted, percent: total ? Math.round((voted / total) * 1000) / 10 : 0 },
        openCases: cases.filter((c) => c.status === "open").length,
        incidents: incidents.filter((i) => i.stationId === station._id).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),
        idDocuments: ID_DOCUMENTS,
        can: {
            conduct: hasPermission(req.user, "polling:conduct"),
            mark: hasPermission(req.user, "polling:mark-register") || hasPermission(req.user, "polling:conduct"),
            identify: hasPermission(req.user, "polling:identify-voter") || hasPermission(req.user, "polling:conduct"),
            object: hasPermission(req.user, "polling:object"),
            reportIncident: hasPermission(req.user, "incident:report")
        }
    } });
});

/** Station-scoped elector search (polling party, and the BLO at the voter assistance booth). */
export const searchElectors = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const q = norm(req.query.q);
    const pollingStaff = hasPermission(req.user, "polling:identify-voter") || hasPermission(req.user, "polling:mark-register") || hasPermission(req.user, "polling:conduct");
    const part = (await listElectors()).filter(inPart(station)).sort((a, b) => a.name.localeCompare(b.name));
    const serial = new Map(part.map((e, i) => [e.epic, i + 1])); // serial in the part, by name (prototype)
    const matches = part.filter((e) => !q || norm(e.name).includes(q) || norm(e.epic) === q).slice(0, 50);
    const cases = pollingStaff ? await listPollCases(election._id, station._id) : [];
    const items = await Promise.all(matches.map(async (e) => ({
        epic: e.epic, name: e.name, age: ageOf(e.dateOfBirth), gender: e.gender, serial: serial.get(e.epic),
        partNumber: station.partNumber, pollingStation: station.name,
        ...(pollingStaff ? {
            voted: Boolean(await votedAt(election._id, e.epic)),
            openCase: cases.find((c) => c.epic === e.epic && c.status === "open" && BLOCKING.includes(c.type))?.type ?? null
        } : {})
    })));
    res.json({ success: true, data: { items, total: part.length } });
});

/**
 * Polling officer marks an elector in the register after the guided check: identity document
 * seen, face matches the roll photograph, indelible ink applied. Only while the poll is open,
 * only for electors of this part, and only once per election.
 */
export const markVoter = asyncHandler(async (req, res) => {
    const { station, election, onPollDay } = await stationContext(req);
    const epic = String(req.params.epic ?? "").trim().toUpperCase();
    const idDocument = String(req.body?.idDocument ?? "");
    if (!ID_DOCUMENTS[idDocument]) throw new ApiError(400, "Choose the identity document the elector showed.");
    const checks = req.body?.checks ?? {};
    if (checks.photoMatches !== true) throw new ApiError(400, "Confirm that the elector matches the photograph in the roll or document.");
    if (checks.inkApplied !== true) throw new ApiError(400, "Confirm that indelible ink has been applied.");
    if (!onPollDay) throw new ApiError(409, `Poll day is ${election.schedule.pollDate}.`);

    const result = await withStationLock(election._id, station._id, async () => {
        const state = await loadState(election, station);
        if (state.status !== "open") throw new ApiError(409, state.status === "closed" ? "The poll has closed." : "The presiding officer has not opened the poll.");
        const elector = await getElectorByEpic(epic);
        if (!elector || !inPart(station)(elector)) throw new ApiError(404, "This elector is not on the roll of this part.");
        const previous = await votedAt(election._id, epic);
        if (previous) throw new ApiError(409, "This elector has already been marked as voted. If the person insists, the presiding officer can record a tendered vote.");
        const cases = (await listPollCases(election._id, station._id)).filter((c) => c.epic === epic && BLOCKING.includes(c.type));
        if (cases.some((c) => c.status === "open")) throw new ApiError(409, "A doubt or challenge about this elector is waiting for the presiding officer.");
        if (cases.some((c) => ["refused", "upheld"].includes(c.decision))) throw new ApiError(409, "The presiding officer has decided that this person may not vote as this elector.");
        const at = new Date().toISOString();
        const entry = { serial: (await registerLength(election._id, station._id)) + 1, electionId: election._id, stationId: station._id, epic, name: elector.name, idDocument, at, by: req.user.epic };
        const tx = transaction();
        appendRegister(entry, tx);
        saveElector({ ...elector, hasVoted: true, votedAt: at, votedBooth: station.name, updatedAt: at }, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "poll.voter_marked", resource: { type: "poll_station", id: `${election._id}:${station._id}` }, jurisdiction: stationRecord(station), after: { epic, serial: entry.serial, idDocument } }), tx);
        await tx.exec();
        return entry;
    });
    if (!result) throw new ApiError(503, "The station register is busy. Try again.");
    res.status(201).json({ success: true, message: `${result.name} marked at serial ${result.serial}.`, data: result });
});

/** Presiding officer moves the poll forward: mock poll held, poll open, poll closed. */
export const setPollStatus = asyncHandler(async (req, res) => {
    const { station, election, onPollDay } = await stationContext(req);
    const status = String(req.body?.status ?? "");
    if (!Object.hasOwn(POLL_STEPS, status) || status === "not_started") throw new ApiError(400, "status must be mock_poll_done, open or closed.");
    if (!onPollDay) throw new ApiError(409, `Poll day is ${election.schedule.pollDate}.`);
    const result = await withStationLock(election._id, station._id, async () => {
        const state = await loadState(election, station);
        if (!POLL_STEPS[state.status].includes(status)) throw new ApiError(409, `The poll is ${state.status.replace(/_/g, " ")}; it cannot move to ${status.replace(/_/g, " ")}.`);
        const at = new Date().toISOString();
        const votes = await registerLength(election._id, station._id);
        const updated = {
            ...state, status, history: [...state.history, { status, at, by: req.user.epic, note: clean(req.body?.note) || null }],
            closing: status === "closed" ? { at, votesInRegister: votes, by: req.user.epic } : state.closing,
            queue: status === "closed" ? null : state.queue
        };
        const tx = transaction();
        savePollState(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: `poll.${status}`, resource: { type: "poll_station", id: `${election._id}:${station._id}` }, jurisdiction: stationRecord(station), before: { status: state.status }, after: { status, ...(status === "closed" ? { votesInRegister: votes } : {}) } }), tx);
        await tx.exec();
        return updated;
    });
    if (!result) throw new ApiError(503, "The station is busy. Try again.");
    res.json({ success: true, data: { status: result.status, history: result.history, closing: result.closing } });
});

/** Queue report: how many people are waiting, while the poll is open. */
export const reportQueue = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const waiting = Number(req.body?.waiting);
    if (!Number.isInteger(waiting) || waiting < 0 || waiting > 5000) throw new ApiError(400, "waiting must be a whole number from 0 to 5000.");
    const result = await withStationLock(election._id, station._id, async () => {
        const state = await loadState(election, station);
        if (state.status !== "open") throw new ApiError(409, "Queue reports are taken while the poll is open.");
        const report = { waiting, at: new Date().toISOString(), by: req.user.epic };
        const tx = transaction();
        savePollState({ ...state, queue: report, queueHistory: [...state.queueHistory, report].slice(-50) }, tx);
        await tx.exec();
        return report;
    });
    if (!result) throw new ApiError(503, "The station is busy. Try again.");
    res.json({ success: true, data: result });
});

/** Exceptions raised at the station. Polling agents may only challenge an elector's identity. */
export const raiseCase = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const type = String(req.body?.type ?? "");
    if (!CASE_TYPES.includes(type)) throw new ApiError(400, `type must be one of: ${CASE_TYPES.join(", ")}.`);
    const isAgent = hasPermission(req.user, "polling:object") && !hasPermission(req.user, "polling:identify-voter") && !hasPermission(req.user, "polling:conduct");
    if (isAgent && type !== "challenged_vote") throw new ApiError(403, "A polling agent can only challenge an elector's identity.");
    if (type === "tendered_vote" && !hasPermission(req.user, "polling:conduct")) throw new ApiError(403, "Only the presiding officer records a tendered vote.");
    const note = clean(req.body?.note);
    const state = await loadState(election, station);
    if (state.status !== "open" && type !== "other") throw new ApiError(409, "This can only be recorded while the poll is open.");

    let epic = null; let name = null;
    if (type !== "not_in_roll" && type !== "other") {
        epic = String(req.body?.epic ?? "").trim().toUpperCase();
        const elector = await getElectorByEpic(epic);
        if (!elector || !inPart(station)(elector)) throw new ApiError(404, "This elector is not on the roll of this part.");
        name = elector.name;
        const voted = Boolean(await votedAt(election._id, epic));
        if (type === "tendered_vote" && !voted) throw new ApiError(409, "A tendered vote is only for an elector who is already marked as voted.");
        if (BLOCKING.includes(type) && voted) throw new ApiError(409, "This elector has already been marked as voted.");
        if (BLOCKING.includes(type) && (await listPollCases(election._id, station._id)).some((c) => c.epic === epic && c.status === "open" && BLOCKING.includes(c.type))) {
            throw new ApiError(409, "A doubt or challenge about this elector is already open.");
        }
    }
    if (["identity_doubt", "challenged_vote", "not_in_roll", "other"].includes(type) && note.length < 3) throw new ApiError(400, "Describe what happened.");
    const companionName = type === "assisted_voter" ? clean(req.body?.companionName, 100) : null;
    if (type === "assisted_voter" && companionName.length < 2) throw new ApiError(400, "Give the companion's name (Rule 49N).");

    const c = {
        _id: crypto.randomUUID(), electionId: election._id, stationId: station._id, type, epic, name, note: note || null, companionName,
        status: ["tendered_vote", "assisted_voter", "not_in_roll"].includes(type) ? "recorded" : "open",
        raisedBy: { epic: req.user.epic, role: req.user.role }, raisedAt: new Date().toISOString(), decision: null, decidedBy: null, decidedAt: null, decisionNote: null
    };
    const tx = transaction();
    savePollCase(c, tx);
    await recordAudit(auditEvent({ actor: req.user, action: `poll.case_${type}`, resource: { type: "poll_case", id: c._id }, jurisdiction: stationRecord(station), after: { type, epic, status: c.status }, note: c.note }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: c });
});

export const listCases = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const isAgent = !hasPermission(req.user, "polling:conduct") && !hasPermission(req.user, "polling:identify-voter") && !hasPermission(req.user, "polling:mark-register") && !hasPermission(req.user, "observer:report");
    const items = (await listPollCases(election._id, station._id))
        .filter((c) => !isAgent || c.raisedBy.epic === req.user.epic)
        .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
    res.json({ success: true, data: { items } });
});

const DECISIONS = { identity_doubt: ["allowed", "refused"], challenged_vote: ["rejected", "upheld"], other: ["closed"] };

/** Presiding officer decides an open case. Refusing an elector or upholding a challenge needs a reason. */
export const resolveCase = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const result = await withStationLock(election._id, station._id, async () => {
        const c = await getPollCase(req.params.id);
        if (!c || c.stationId !== station._id || c.electionId !== election._id) throw new ApiError(404, "Case not found at your polling station.");
        if (c.status !== "open") throw new ApiError(409, "This case has already been decided.");
        const decision = String(req.body?.decision ?? "");
        if (!DECISIONS[c.type]?.includes(decision)) throw new ApiError(400, `decision must be one of: ${(DECISIONS[c.type] ?? []).join(", ")}.`);
        const decisionNote = ["refused", "upheld"].includes(decision) ? requireReason(req.body?.note, "decision") : clean(req.body?.note) || null;
        const updated = { ...c, status: "decided", decision, decisionNote, decidedBy: req.user.epic, decidedAt: new Date().toISOString() };
        const tx = transaction();
        savePollCase(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "poll.case_decided", resource: { type: "poll_case", id: c._id }, jurisdiction: stationRecord(station), before: { status: "open" }, after: { decision }, note: decisionNote }), tx);
        await tx.exec();
        return updated;
    });
    if (!result) throw new ApiError(503, "The station is busy. Try again.");
    res.json({ success: true, data: result });
});

/** Presiding officer: the register of electors who voted (confidential; Form 17A in the prototype). */
export const getRegister = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const items = await listRegister(election._id, station._id);
    res.json({ success: true, data: { items: items.map((e) => ({ ...e, idDocumentLabel: ID_DOCUMENTS[e.idDocument] })) } });
});
