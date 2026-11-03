import crypto from "crypto";
import { isTraining } from "../config/appMode.js";
import { transaction } from "../config/redis.js";
import { getContestingList, listStations } from "../repositories/election.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
import { registerLength } from "../repositories/poll.repository.js";
import { getResultFeed, getResultSource, listResultSources, lockResultFeed, saveResultFeed, saveResultSource } from "../repositories/result.repository.js";
import { rollAreaKey } from "../repositories/rollVersion.repository.js";
import { requireElection, todayIST } from "../services/election.service.js";
import { validateJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { opsEvent, publishEvents, recordEvent } from "../services/events.service.js";

// Counting and results are READ-ONLY here. Counting is conducted by the Returning Officer and
// the result is declared by the RO (Form 21C/21E); this platform only shows what a registered
// result source sends: an authorised official feed, or a clearly labelled mock for demonstration.
// Rounds are append-only; a correction is a new entry with a reason, never an overwrite.
// Standings are a display sum of the source's numbers, and checks are flagged, never "fixed".

const clean = (v, max = 200) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const norm = (v) => clean(v).toLowerCase();
const MOCK_LABEL = "MOCK DATA for demonstration. This is not an election result.";
const labelFor = (source) => source.type === "mock" ? MOCK_LABEL
    : `Received from ${source.name}. Only the Returning Officer's declaration is the official result.`;
const PUBLICATION = ["not_started", "in_progress", "completed", "declared"];

/** ECI administrator registers a result source. An official feed needs a legal basis and agreement. */
export const registerResultSource = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const name = clean(body.name, 120);
    if (name.length < 3) throw new ApiError(400, "Give the source a name.");
    if (!["mock", "official_feed"].includes(body.type)) throw new ApiError(400, "type must be mock or official_feed.");
    if (isTraining() && body.type !== "mock") throw new ApiError(409, "The training environment only accepts mock result sources.");
    const legalBasis = clean(body.legalBasis, 300) || null; const agreementReference = clean(body.agreementReference, 120) || null;
    if (body.type === "official_feed" && (!legalBasis || !agreementReference)) throw new ApiError(400, "An official feed needs its legal basis and the agreement reference.");
    if ((await listResultSources()).some((x) => x.status === "active" && x.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, "An active result source already has this name.");
    const source = { _id: crypto.randomUUID(), name, type: body.type, legalBasis, agreementReference, status: "active", registeredBy: req.user.epic, registeredAt: new Date().toISOString() };
    const tx = transaction();
    saveResultSource(source, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "result_source.registered", resource: { type: "result_source", id: source._id }, after: { name, type: source.type } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: source });
});

export const listSources = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { items: (await listResultSources()).sort((a, b) => a.registeredAt.localeCompare(b.registeredAt)) } });
});

const contestingFor = async (election, area) => {
    const list = await getContestingList(election._id, rollAreaKey(area));
    if (!list) throw new ApiError(409, "The list of contesting candidates for this constituency has not been published.");
    return list;
};

/** Validates one block of votes against the contesting list: every candidate, whole numbers, nothing else. */
const parseVotes = (votes, list, label) => {
    if (!votes || typeof votes !== "object") throw new ApiError(400, `${label}: votes are missing.`);
    const serials = list.candidates.map((c) => String(c.serial));
    const extra = Object.keys(votes).filter((k) => !serials.includes(String(k)));
    if (extra.length) throw new ApiError(400, `${label}: serial ${extra.join(", ")} is not on the list of contesting candidates.`);
    const out = {};
    for (const s of serials) {
        const n = votes[s];
        if (!Number.isInteger(n) || n < 0 || n > 10_000_000) throw new ApiError(400, `${label}: give a whole number of votes for serial ${s}.`);
        out[s] = n;
    }
    return out;
};
const sumVotes = (v) => Object.values(v).reduce((a, b) => a + b, 0);

const loadSourceAndArea = async (req) => {
    const source = await getResultSource(req.params.sourceId);
    if (!source || source.status !== "active") throw new ApiError(404, "Result source not found.");
    const election = await requireElection(req.body?.electionId);
    const area = validateJurisdiction("ero", req.body ?? {});
    if (!election.states.includes(area.state)) throw new ApiError(400, "This election does not cover that State/UT.");
    return { source, election, area, areaKey: rollAreaKey(area) };
};

const newFeed = (source, election, area, areaKey, list) => ({
    electionId: election._id, areaKey, state: area.state, district: area.district ?? null, constituency: area.constituency,
    source: { id: source._id, name: source.name, type: source.type }, label: labelFor(source),
    candidates: list.candidates.map((c) => ({ serial: c.serial, name: c.name, party: c.party, symbol: c.symbol })),
    entries: [], publication: { status: "not_started", declaredWinnerSerial: null, declaredAt: null, history: [] }
});

/**
 * Receive one entry from the source: a counting round (EVM votes, by table if given), postal
 * ballots, or a correction to an earlier round (with the source's reason). Append-only.
 */
export const receiveEntry = asyncHandler(async (req, res) => {
    const { source, election, area, areaKey } = await loadSourceAndArea(req);
    if (todayIST() < election.schedule.countingDate && source.type !== "mock") throw new ApiError(409, `Counting is on ${election.schedule.countingDate}.`);
    const list = await contestingFor(election, area);
    const body = req.body;
    const kind = String(body.kind ?? "round");
    if (!["round", "postal", "correction"].includes(kind)) throw new ApiError(400, "kind must be round, postal or correction.");
    const release = await lockResultFeed(election._id, areaKey);
    if (!release) throw new ApiError(409, "Another entry for this constituency is being saved.");
    try {
        const feed = (await getResultFeed(election._id, areaKey)) ?? newFeed(source, election, area, areaKey, list);
        if (feed.source.id !== source._id) throw new ApiError(409, `Results for this constituency come from ${feed.source.name}.`);
        if (feed.publication.status === "declared") throw new ApiError(409, "The result has been declared; nothing more can be added.");
        const rounds = feed.entries.filter((e) => e.kind === "round");
        const entry = { kind, receivedAt: new Date().toISOString(), sourceTimestamp: clean(body.sourceTimestamp, 40) || null };
        if (kind === "round") {
            const round = Number(body.round);
            if (round !== rounds.length + 1) throw new ApiError(409, `Expected round ${rounds.length + 1}.`);
            entry.round = round;
            if (Array.isArray(body.tables) && body.tables.length) {
                if (body.tables.length > 30) throw new ApiError(400, "At most 30 counting tables per round.");
                entry.tables = body.tables.map((t, i) => ({ table: Number(t.table) || i + 1, pollingStations: (Array.isArray(t.pollingStations) ? t.pollingStations : []).map((p) => clean(p, 20)).slice(0, 5), votes: parseVotes(t.votes, list, `Round ${round}, table ${t.table ?? i + 1}`), nota: Number.isInteger(t.nota) && t.nota >= 0 ? t.nota : 0 }));
                entry.votes = Object.fromEntries(list.candidates.map((c) => [String(c.serial), entry.tables.reduce((n, t) => n + t.votes[c.serial], 0)]));
                entry.nota = entry.tables.reduce((n, t) => n + t.nota, 0);
                if (body.votes && sumVotes(parseVotes(body.votes, list, `Round ${round}`)) !== sumVotes(entry.votes)) throw new ApiError(400, `Round ${round}: the round total does not equal the sum of its tables.`);
            } else {
                entry.votes = parseVotes(body.votes, list, `Round ${round}`);
                entry.nota = Number.isInteger(body.nota) && body.nota >= 0 ? body.nota : 0;
            }
        } else if (kind === "postal") {
            if (feed.entries.some((e) => e.kind === "postal")) throw new ApiError(409, "Postal ballots have already been received; send a correction instead.");
            entry.votes = parseVotes(body.votes, list, "Postal ballots");
            entry.nota = Number.isInteger(body.nota) && body.nota >= 0 ? body.nota : 0;
            entry.rejected = Number.isInteger(body.rejected) && body.rejected >= 0 ? body.rejected : 0;
        } else {
            const target = String(body.corrects ?? "");
            const exists = target === "postal" ? feed.entries.some((e) => e.kind === "postal") : rounds.some((r) => String(r.round) === target);
            if (!exists) throw new ApiError(400, "corrects must name a round already received, or 'postal'.");
            const reason = clean(body.reason, 500);
            if (reason.length < 5) throw new ApiError(400, "A correction needs the source's reason.");
            entry.corrects = target; entry.reason = reason;
            entry.votes = parseVotes(body.votes, list, `Correction to ${target}`);
            entry.nota = Number.isInteger(body.nota) && body.nota >= 0 ? body.nota : 0;
        }
        if (feed.publication.status === "not_started") feed.publication = { ...feed.publication, status: "in_progress", history: [...feed.publication.history, { status: "in_progress", at: entry.receivedAt }] };
        feed.entries = [...feed.entries, entry];
        const tx = transaction();
        saveResultFeed(feed, tx);
        await recordAudit(auditEvent({ actor: req.user, action: `results.${kind}_received`, resource: { type: "results", id: `${election._id}:${areaKey}` }, jurisdiction: { ...area, assemblyConstituency: area.constituency },
            after: { source: source.name, kind, round: entry.round ?? entry.corrects ?? null, total: sumVotes(entry.votes) }, note: entry.reason }), tx);
        const liveEvent = recordEvent(opsEvent({ type: "COUNTING_UPDATE_IMPORTED", jurisdiction: area, electionId: election._id, payload: { kind, round: entry.round ?? null, mock: source.type === "mock" }, actor: req.user }), tx);
        await tx.exec();
        await publishEvents(liveEvent);
        res.status(201).json({ success: true, data: entry });
    } finally { await release(); }
});

/** Publication status from the source: counting completed, or the RO's declaration (winner by serial). */
export const receivePublication = asyncHandler(async (req, res) => {
    const { source, election, area, areaKey } = await loadSourceAndArea(req);
    const status = String(req.body?.status ?? "");
    if (!["completed", "declared"].includes(status)) throw new ApiError(400, "status must be completed or declared.");
    const release = await lockResultFeed(election._id, areaKey);
    if (!release) throw new ApiError(409, "Another entry for this constituency is being saved.");
    try {
        const feed = await getResultFeed(election._id, areaKey);
        if (!feed || feed.source.id !== source._id) throw new ApiError(404, "No results from this source for this constituency.");
        if (feed.publication.status === "declared") throw new ApiError(409, "The result has already been declared.");
        if (PUBLICATION.indexOf(status) < PUBLICATION.indexOf(feed.publication.status)) throw new ApiError(409, "Publication status cannot go backwards.");
        let declaredWinnerSerial = null;
        if (status === "declared") {
            declaredWinnerSerial = Number(req.body?.winnerSerial);
            if (!feed.candidates.some((c) => c.serial === declaredWinnerSerial)) throw new ApiError(400, "winnerSerial must be a contesting candidate's serial number.");
        }
        const at = new Date().toISOString();
        feed.publication = { status, declaredWinnerSerial, declaredAt: status === "declared" ? (clean(req.body?.declaredAt, 40) || at) : null, history: [...feed.publication.history, { status, at }] };
        const tx = transaction();
        saveResultFeed(feed, tx);
        await recordAudit(auditEvent({ actor: req.user, action: `results.${status}`, resource: { type: "results", id: `${election._id}:${areaKey}` }, jurisdiction: { ...area, assemblyConstituency: area.constituency }, after: { status, declaredWinnerSerial } }), tx);
        const liveEvent = recordEvent(opsEvent({ type: "OFFICIAL_RESULT_UPDATED", jurisdiction: area, electionId: election._id, payload: { status, mock: source.type === "mock" }, actor: req.user }), tx);
        await tx.exec();
        await publishEvents(liveEvent);
        res.json({ success: true, data: feed.publication });
    } finally { await release(); }
});

/** Builds a complete mock count from a mock source, for demonstration. Clearly labelled as mock. */
export const generateMock = asyncHandler(async (req, res) => {
    const { source, election, area, areaKey } = await loadSourceAndArea(req);
    if (source.type !== "mock") throw new ApiError(403, "Only a mock source can generate demonstration results.");
    const list = await contestingFor(election, area);
    if (await getResultFeed(election._id, areaKey)) throw new ApiError(409, "Results for this constituency already exist.");
    const feed = await mockFeed(source, election, area, areaKey, list, Number(req.body?.rounds) || 6);
    const tx = transaction();
    saveResultFeed(feed, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "results.mock_generated", resource: { type: "results", id: `${election._id}:${areaKey}` }, jurisdiction: { ...area, assemblyConstituency: area.constituency }, after: { rounds: feed.entries.length } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: { label: feed.label, entries: feed.entries.length } });
});

/** Deterministic pseudo-random mock count (same inputs, same numbers). */
export const mockFeed = async (source, election, area, areaKey, list, roundCount = 6) => {
    let seed = [...`${election._id}${areaKey}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const weights = list.candidates.map(() => 0.3 + rnd());
    const feed = newFeed(source, election, area, areaKey, list);
    const at = new Date().toISOString();
    const block = (size) => Object.fromEntries(list.candidates.map((c, i) => [String(c.serial), Math.round(size * weights[i] * (0.85 + rnd() * 0.3))]));
    feed.entries.push({ kind: "postal", receivedAt: at, sourceTimestamp: null, votes: block(120), nota: Math.round(rnd() * 8), rejected: Math.round(rnd() * 15) });
    for (let r = 1; r <= Math.min(Math.max(roundCount, 1), 30); r += 1) {
        const tables = Array.from({ length: 4 }, (_, t) => ({ table: t + 1, pollingStations: [String((r - 1) * 4 + t + 1)], votes: block(150), nota: Math.round(rnd() * 6) }));
        feed.entries.push({ kind: "round", round: r, receivedAt: at, sourceTimestamp: null, tables,
            votes: Object.fromEntries(list.candidates.map((c) => [String(c.serial), tables.reduce((n, t) => n + t.votes[c.serial], 0)])), nota: tables.reduce((n, t) => n + t.nota, 0) });
    }
    feed.publication = { status: "completed", declaredWinnerSerial: null, declaredAt: null, history: [{ status: "in_progress", at }, { status: "completed", at }] };
    return feed;
};

/** Effective numbers: a correction replaces the numbers of the round it names, but both stay on record. */
const effective = (feed) => {
    const latest = new Map();
    for (const e of feed.entries) {
        if (e.kind === "round") latest.set(String(e.round), e);
        else if (e.kind === "postal") latest.set("postal", e);
        else latest.set(e.corrects, { ...latest.get(e.corrects), votes: e.votes, nota: e.nota, correctedAt: e.receivedAt, correctionReason: e.reason });
    }
    return latest;
};

/** Public results for a constituency: as received, labelled, with standings and reconciliation checks. */
export const publicResults = asyncHandler(async (req, res) => {
    const election = await requireElection(req.query.electionId);
    const area = validateJurisdiction("ero", req.query);
    const areaKey = rollAreaKey(area);
    const feed = await getResultFeed(election._id, areaKey);
    if (!feed) return res.json({ success: true, data: { electionId: election._id, ...area, available: false } });
    const latest = effective(feed);
    const rounds = [...latest.entries()].filter(([k]) => k !== "postal").map(([, e]) => e).sort((a, b) => a.round - b.round);
    const postal = latest.get("postal") ?? null;
    let running = Object.fromEntries(feed.candidates.map((c) => [String(c.serial), postal ? postal.votes[c.serial] : 0]));
    const progression = rounds.map((r) => { running = Object.fromEntries(Object.entries(running).map(([s, n]) => [s, n + r.votes[s]])); return { round: r.round, cumulative: { ...running } }; });
    const evm = Object.fromEntries(feed.candidates.map((c) => [String(c.serial), rounds.reduce((n, r) => n + r.votes[c.serial], 0)]));
    const standings = feed.candidates.map((c) => ({ ...c, evm: evm[c.serial], postal: postal ? postal.votes[c.serial] : 0, total: evm[c.serial] + (postal ? postal.votes[c.serial] : 0) }))
        .sort((a, b) => b.total - a.total || a.serial - b.serial);
    const notaTotal = rounds.reduce((n, r) => n + (r.nota ?? 0), 0) + (postal?.nota ?? 0);

    // Reconciliation: flags only. EVM votes counted vs votes recorded in this platform's station registers.
    const checks = [];
    const evmTotal = Object.values(evm).reduce((a, b) => a + b, 0) + rounds.reduce((n, r) => n + (r.nota ?? 0), 0);
    const stations = (await listStations()).filter((s) => s.status === "ACTIVE" && norm(s.state) === norm(area.state) && norm(s.constituency) === norm(area.constituency));
    const polled = (await Promise.all(stations.map((s) => registerLength(election._id, s._id)))).reduce((a, b) => a + b, 0);
    if (polled > 0) checks.push({ code: "evm_vs_register", ok: evmTotal === polled, text: `EVM votes counted (${evmTotal}, including NOTA) ${evmTotal === polled ? "match" : "do not match"} the votes recorded in station registers here (${polled}).` });
    else checks.push({ code: "evm_vs_register", ok: null, text: "No station registers in this platform for this constituency to compare against." });
    const electors = (await listElectors()).filter((e) => e.isActive !== false && norm(e.state) === norm(area.state) && norm(e.assemblyConstituency) === norm(area.constituency)).length;
    // Mock figures are invented, so comparing them with the roll would only produce noise.
    if (feed.source.type !== "mock" && electors > 0 && evmTotal > electors) checks.push({ code: "over_electorate", ok: false, text: `More EVM votes (${evmTotal}) than electors on this platform's roll (${electors}).` });
    const corrections = feed.entries.filter((e) => e.kind === "correction");
    if (corrections.length) checks.push({ code: "corrections", ok: null, text: `${corrections.length} correction(s) received from the source; the original figures stay on record.` });
    const tableMismatch = rounds.filter((r) => r.tables && !r.correctedAt && r.tables.reduce((n, t) => n + Object.values(t.votes).reduce((a, b) => a + b, 0), 0) !== Object.values(r.votes).reduce((a, b) => a + b, 0));
    if (tableMismatch.length) checks.push({ code: "table_sum", ok: false, text: `Rounds ${tableMismatch.map((r) => r.round).join(", ")}: table figures do not add up to the round.` });

    const declared = feed.publication.status === "declared" ? feed.candidates.find((c) => c.serial === feed.publication.declaredWinnerSerial) : null;
    if (declared && standings[0] && standings[0].serial !== declared.serial) checks.push({ code: "declared_vs_figures", ok: false, text: "The declared winner is not the candidate with the most votes in the figures received; the figures may be incomplete." });
    res.json({ success: true, data: {
        available: true, electionId: election._id, electionName: election.name, ...area,
        label: feed.label, mock: feed.source.type === "mock", source: feed.source, publication: feed.publication,
        declaredWinner: declared ?? null,
        leading: feed.publication.status === "declared" ? null : (standings[0] && standings[1] && standings[0].total > standings[1].total ? { serial: standings[0].serial, name: standings[0].name, margin: standings[0].total - standings[1].total } : null),
        standings, nota: notaTotal, postal: postal ? { nota: postal.nota, rejected: postal.rejected ?? 0, corrected: Boolean(postal.correctedAt) } : null,
        rounds: rounds.map((r) => ({ round: r.round, votes: r.votes, nota: r.nota, tables: r.tables ?? null, receivedAt: r.receivedAt, correctedAt: r.correctedAt ?? null, correctionReason: r.correctionReason ?? null })),
        progression, entries: feed.entries.length, checks
    } });
});

/** Public turnout for a constituency, from this platform's station registers (approximate). */
export const publicTurnout = asyncHandler(async (req, res) => {
    const election = await requireElection(req.query.electionId);
    const area = validateJurisdiction("ero", req.query);
    const stations = (await listStations()).filter((s) => s.status === "ACTIVE" && norm(s.state) === norm(area.state) && norm(s.constituency) === norm(area.constituency));
    const electors = (await listElectors()).filter((e) => e.isActive !== false && norm(e.state) === norm(area.state) && norm(e.assemblyConstituency) === norm(area.constituency));
    const rows = await Promise.all(stations.map(async (s) => {
        const part = electors.filter((e) => String(e.partNumber) === s.partNumber);
        const voted = await registerLength(election._id, s._id);
        return { stationCode: s.stationCode, name: s.name, partNumber: s.partNumber, electors: part.length, voted, percent: part.length ? Math.round((voted / part.length) * 1000) / 10 : 0 };
    }));
    rows.sort((a, b) => Number(a.partNumber) - Number(b.partNumber));
    const e = rows.reduce((n, r) => n + r.electors, 0); const v = rows.reduce((n, r) => n + r.voted, 0);
    res.json({ success: true, data: { electionId: election._id, electionName: election.name, ...area, stations: rows, electors: e, voted: v, percent: e ? Math.round((v / e) * 1000) / 10 : 0,
        note: "Approximate, from the station registers in this prototype. Official turnout is published by the Election Commission." } });
});
