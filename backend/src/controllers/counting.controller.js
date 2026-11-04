import crypto from "crypto";
import { acquireLock, jsonGet, redis, transaction } from "../config/redis.js";
import { listStations } from "../repositories/election.repository.js";
import { listAssignmentsForUser } from "../repositories/assignment.repository.js";
import { getUserByEpic } from "../repositories/user.repository.js";
import { rollAreaKey } from "../repositories/rollVersion.repository.js";
import { assignmentInElection, electionStage, requireElection } from "../services/election.service.js";
import { assignmentInEffect, covers, hasPermission, validateJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { opsEvent, publishEvents, recordEvent } from "../services/events.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Counting operations for one assembly constituency of an election: the counting centre, halls
// and tables, randomised allocation of counting supervisors and assistants to tables, the
// round plan (which polling stations' control units go to which table in which round), round
// progress, discrepancy reports, counting observers' reports and the draw of polling stations
// for VVPAT slip verification.
//
// ECIWEB does NOT count votes and holds no vote figures. It does not connect to EVMs. The count
// is the Returning Officer's; vote figures reach the public only from the official result
// source (see result.controller.js), labelled with that source.

const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const clean = (v, max = 500) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const planKey = (e, a) => `counting:plan:${e}:${a}`;
const itemKey = (kind, id) => `counting:${kind}:${id}`;
const listKey = (kind, e, a) => `counting:${kind}s:${e}:${a}`;
const MAX_TABLES = 30;
export const VVPAT_DRAW_SIZE = 5; // polling stations per assembly constituency (Supreme Court order of 8 April 2019)
export const DISCREPANCY_TYPES = {
    form17c_mismatch: "Votes on the control unit differ from Form 17C Part I",
    seal: "Seal or tag of the control unit not intact or not matching",
    cu_display: "Control unit does not display the result",
    serial_mismatch: "Control unit number differs from the records",
    postal_ballot: "Postal ballot handling",
    recount_request: "Rule 63: written request for a recount, with grounds",
    other: "Other"
};

/** The constituency the request is about, checked against the caller's assignments. */
const contextFor = async (req, src) => {
    const election = await requireElection(req.params.electionId);
    const area = validateJurisdiction("ero", { state: src.state, district: src.district, constituency: src.constituency });
    const record = { ...area, assemblyConstituency: area.constituency };
    const mine = req.authority.assignments.filter((a) => assignmentInElection(a, election) && covers(a, record));
    if (!mine.length) throw new ApiError(403, "This constituency is outside your assignment for this election.");
    return { election, area, record, areaKey: rollAreaKey(area), mine };
};
const isRo = (req) => hasPermission(req.user, "counting:supervise") || hasPermission(req.user, "result:declare");

const stationsOf = async (area) => (await listStations())
    .filter((s) => s.status === "ACTIVE" && norm(s.state) === norm(area.state) && norm(s.constituency) === norm(area.constituency))
    .sort((a, b) => Number(a.partNumber) - Number(b.partNumber));

/** Rounds: polling stations in part order, one per table per round (the usual allocation). */
export const roundPlan = (stations, tables) => {
    const rounds = [];
    for (let i = 0; i < stations.length; i += tables) rounds.push(stations.slice(i, i + tables).map((s, t) => ({ table: t + 1, stationId: s._id, partNumber: s.partNumber, station: s.name })));
    return rounds;
};

const loadPlan = async (election, areaKey) => jsonGet(planKey(election._id, areaKey));
const listOf = async (kind, election, areaKey) => (await Promise.all((await redis().sMembers(listKey(kind, election._id, areaKey))).map((id) => jsonGet(itemKey(kind, id))))).filter(Boolean)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const withPlanLock = async (election, areaKey, fn) => {
    const release = await acquireLock(`counting:lock:${election._id}:${areaKey}`, 10);
    if (!release) throw new ApiError(503, "The counting record is busy. Try again.");
    try { return await fn(); } finally { await release(); }
};

export const getCounting = asyncHandler(async (req, res) => {
    const { election, area, areaKey } = await contextFor(req, req.query);
    const [plan, discrepancies, reports] = await Promise.all([loadPlan(election, areaKey), listOf("discrepancy", election, areaKey), listOf("observer-report", election, areaKey)]);
    const stations = await stationsOf(area);
    const myTable = plan?.halls.flatMap((h) => h.tables.map((t) => ({ ...t, hall: h.name }))).find((t) => t.supervisor?.epic === req.user.epic || t.assistant?.epic === req.user.epic) ?? null;
    res.json({ success: true, data: {
        election: { _id: election._id, name: election.name, countingDate: election.schedule.countingDate, stage: electionStage(election) },
        area, plan, stations: stations.length, myTable, discrepancies, observerReports: reports, discrepancyTypes: DISCREPANCY_TYPES,
        notice: "Operational record of the count only. Vote figures are the Returning Officer's and are published from the official result source.",
        can: {
            plan: isRo(req), supervise: hasPermission(req.user, "counting:supervise-table") || isRo(req),
            object: hasPermission(req.user, "counting:object") || hasPermission(req.user, "counting:supervise-table") || hasPermission(req.user, "observer:report"),
            report: hasPermission(req.user, "observer:report"), decide: isRo(req)
        }
    } });
});

/** RO: counting centre, halls and number of tables. Staff are allocated by the randomisation. */
export const savePlan = asyncHandler(async (req, res) => {
    if (!isRo(req)) throw new ApiError(403, "Only the Returning Officer plans the count.");
    const { election, area, record, areaKey } = await contextFor(req, req.body);
    if (electionStage(election) === "completed") throw new ApiError(409, "Counting for this election is over.");
    const centre = { name: clean(req.body?.centre?.name, 150), address: clean(req.body?.centre?.address, 300) };
    if (centre.name.length < 3 || centre.address.length < 10) throw new ApiError(400, "Give the counting centre's name and full address.");
    const halls = Array.isArray(req.body?.halls) ? req.body.halls : [];
    if (!halls.length || halls.length > 10) throw new ApiError(400, "Give between 1 and 10 counting halls.");
    const tablesTotal = halls.reduce((n, h) => n + (Number.parseInt(h.tables, 10) || 0), 0);
    if (halls.some((h) => !clean(h.name) || !(Number.parseInt(h.tables, 10) >= 1)) || tablesTotal > MAX_TABLES) throw new ApiError(400, `Each hall needs a name and at least one table (at most ${MAX_TABLES} tables in all).`);
    const plan = await withPlanLock(election, areaKey, async () => {
        const current = await loadPlan(election, areaKey);
        if (current?.rounds?.some((r) => r.status !== "pending")) throw new ApiError(409, "Counting has started; the plan can no longer change.");
        const stations = await stationsOf(area);
        let n = 0;
        const next = {
            electionId: election._id, areaKey, ...area, centre, version: (current?.version ?? 0) + 1, updatedAt: new Date().toISOString(), updatedBy: req.user.epic,
            halls: halls.map((h, i) => ({ id: `H${i + 1}`, name: clean(h.name, 80), tables: Array.from({ length: Number.parseInt(h.tables, 10) }, () => ({ no: ++n, supervisor: null, assistant: null })) })),
            randomisation: null,
            rounds: roundPlan(stations, tablesTotal).map((tables, i) => ({ no: i + 1, status: "pending", tables: tables.map((t) => ({ ...t, status: "pending" })) }))
        };
        const tx = transaction();
        tx.set(planKey(election._id, areaKey), JSON.stringify(next));
        await recordAudit(auditEvent({ actor: req.user, action: "counting.plan_saved", resource: { type: "counting", id: `${election._id}:${areaKey}` }, jurisdiction: record, after: { centre: centre.name, halls: next.halls.length, tables: tablesTotal, rounds: next.rounds.length, version: next.version } }), tx);
        await tx.exec();
        return next;
    });
    res.json({ success: true, data: plan });
});

/** Staff assigned for counting in this constituency and election, by role. */
const pool = async (epics, role, election, record) => {
    const out = [];
    for (const epic of [...new Set(epics.map((e) => String(e).trim().toUpperCase()).filter(Boolean))]) {
        const user = await getUserByEpic(epic);
        const ok = user && (await listAssignmentsForUser(user._id)).some((a) => a.role === role && assignmentInEffect(a) && assignmentInElection(a, election) && covers(a, record));
        if (!ok) throw new ApiError(400, `${epic} is not assigned as ${role.replace("_", " ")} for this constituency and election.`);
        out.push({ epic, name: user.name ?? null });
    }
    return out;
};

/**
 * RO: allocates supervisors and assistants to tables at random (the counting-day
 * randomisation). The random seed is recorded so the allocation can be re-derived and checked.
 */
export const randomise = asyncHandler(async (req, res) => {
    if (!isRo(req)) throw new ApiError(403, "Only the Returning Officer allocates counting staff.");
    const { election, record, areaKey } = await contextFor(req, req.body);
    const supervisors = await pool(req.body?.supervisors ?? [], "counting_supervisor", election, record);
    const assistants = await pool(req.body?.assistants ?? [], "counting_assistant", election, record);
    const plan = await withPlanLock(election, areaKey, async () => {
        const current = await loadPlan(election, areaKey);
        if (!current) throw new ApiError(409, "Save the counting plan first.");
        if (current.rounds.some((r) => r.status !== "pending")) throw new ApiError(409, "Counting has started; staff can no longer be reallocated.");
        const tables = current.halls.reduce((n, h) => n + h.tables.length, 0);
        if (supervisors.length < tables || assistants.length < tables) throw new ApiError(400, `${tables} tables need at least ${tables} supervisors and ${tables} assistants.`);
        const seed = crypto.randomBytes(16).toString("hex");
        const shuffle = (list, salt) => list.map((x) => ({ x, k: crypto.createHmac("sha256", seed).update(`${salt}:${x.epic}`).digest("hex") })).sort((a, b) => a.k.localeCompare(b.k)).map((y) => y.x);
        const s = shuffle(supervisors, "supervisor"); const a = shuffle(assistants, "assistant");
        let i = 0;
        const next = { ...current, halls: current.halls.map((h) => ({ ...h, tables: h.tables.map((t) => { const out = { ...t, supervisor: s[i], assistant: a[i] }; i += 1; return out; }) })),
            reserve: { supervisors: s.slice(tables), assistants: a.slice(tables) },
            randomisation: { at: new Date().toISOString(), by: req.user.epic, seed, method: "HMAC-SHA256(seed, role:EPIC) order", note: clean(req.body?.note, 300) || null } };
        const tx = transaction();
        tx.set(planKey(election._id, areaKey), JSON.stringify(next));
        await recordAudit(auditEvent({ actor: req.user, action: "counting.staff_randomised", resource: { type: "counting", id: `${election._id}:${areaKey}` }, jurisdiction: record, after: { seed, tables, supervisors: supervisors.length, assistants: assistants.length } }), tx);
        await tx.exec();
        return next;
    });
    res.json({ success: true, data: plan });
});

/**
 * Counting supervisor (of that table) or the RO: the control unit of the round's polling station
 * has been counted at this table and Form 17C Part II signed. No vote figures are recorded here.
 */
export const recordTable = asyncHandler(async (req, res) => {
    const { election, record, areaKey } = await contextFor(req, req.body);
    if (electionStage(election) !== "counting_day") throw new ApiError(409, `Counting is on ${election.schedule.countingDate}.`);
    const roundNo = Number.parseInt(req.params.round, 10); const tableNo = Number.parseInt(req.params.table, 10);
    if (req.body?.form17cPart2Signed !== true) throw new ApiError(400, "Confirm that Form 17C Part II has been completed and signed for this control unit.");
    const result = await withPlanLock(election, areaKey, async () => {
        const plan = await loadPlan(election, areaKey);
        const round = plan?.rounds.find((r) => r.no === roundNo);
        const slot = round?.tables.find((t) => t.table === tableNo);
        if (!slot) throw new ApiError(404, "No such round and table in the counting plan.");
        const table = plan.halls.flatMap((h) => h.tables).find((t) => t.no === tableNo);
        if (!isRo(req) && table.supervisor?.epic !== req.user.epic) throw new ApiError(403, "Only the supervisor of this table or the Returning Officer records it.");
        if (round.status === "completed") throw new ApiError(409, "This round is already completed.");
        const earlier = plan.rounds.find((r) => r.no < roundNo && r.status !== "completed");
        if (earlier) throw new ApiError(409, `Round ${earlier.no} is not completed yet.`);
        if (slot.status === "counted") throw new ApiError(409, "This table is already recorded for this round.");
        slot.status = "counted"; slot.countedAt = new Date().toISOString(); slot.by = req.user.epic; slot.note = clean(req.body?.note, 300) || null;
        round.status = round.tables.every((t) => t.status === "counted") ? "all_tables_counted" : "in_progress";
        const tx = transaction();
        tx.set(planKey(election._id, areaKey), JSON.stringify(plan));
        await recordAudit(auditEvent({ actor: req.user, action: "counting.table_recorded", resource: { type: "counting", id: `${election._id}:${areaKey}` }, jurisdiction: record, after: { round: roundNo, table: tableNo, partNumber: slot.partNumber } }), tx);
        const ev = recordEvent(opsEvent({ type: "COUNTING_UPDATE_IMPORTED", jurisdiction: record, electionId: election._id, payload: { kind: "table_counted", round: roundNo, table: tableNo } , actor: req.user }), tx);
        await tx.exec();
        return { round, ev };
    });
    await publishEvents(result.ev);
    res.json({ success: true, data: result.round });
});

/** RO: closes a round once every table has been recorded and no discrepancy for it is open. */
export const completeRound = asyncHandler(async (req, res) => {
    if (!isRo(req)) throw new ApiError(403, "Only the Returning Officer completes a round.");
    const { election, record, areaKey } = await contextFor(req, req.body);
    const roundNo = Number.parseInt(req.params.round, 10);
    const open = (await listOf("discrepancy", election, areaKey)).filter((d) => d.round === roundNo && d.status === "open");
    if (open.length) throw new ApiError(409, `${open.length} discrepancy report(s) for round ${roundNo} must be decided first.`);
    const result = await withPlanLock(election, areaKey, async () => {
        const plan = await loadPlan(election, areaKey);
        const round = plan?.rounds.find((r) => r.no === roundNo);
        if (!round) throw new ApiError(404, "No such round.");
        if (round.status !== "all_tables_counted") throw new ApiError(409, round.status === "completed" ? "This round is already completed." : "Every table must be recorded first.");
        round.status = "completed"; round.completedAt = new Date().toISOString(); round.completedBy = req.user.epic;
        const tx = transaction();
        tx.set(planKey(election._id, areaKey), JSON.stringify(plan));
        await recordAudit(auditEvent({ actor: req.user, action: "counting.round_completed", resource: { type: "counting", id: `${election._id}:${areaKey}` }, jurisdiction: record, after: { round: roundNo } }), tx);
        const ev = recordEvent(opsEvent({ type: "COUNTING_UPDATE_IMPORTED", jurisdiction: record, electionId: election._id, payload: { kind: "round_completed", round: roundNo, of: plan.rounds.length }, actor: req.user }), tx);
        await tx.exec();
        return { round, ev };
    });
    await publishEvents(result.ev);
    res.json({ success: true, data: result.round });
});

/** Counting agent, supervisor or counting observer: a discrepancy at a table. */
export const reportDiscrepancy = asyncHandler(async (req, res) => {
    const allowed = hasPermission(req.user, "counting:object") || hasPermission(req.user, "counting:supervise-table") || hasPermission(req.user, "observer:report");
    if (!allowed) throw new ApiError(403, "You cannot report counting discrepancies.");
    const { election, record, areaKey } = await contextFor(req, req.body);
    const type = String(req.body?.type ?? "");
    if (!DISCREPANCY_TYPES[type]) throw new ApiError(400, `type must be one of ${Object.keys(DISCREPANCY_TYPES).join(", ")}.`);
    const description = clean(req.body?.description, 1000);
    if (description.length < 10) throw new ApiError(400, "Describe the discrepancy (at least 10 characters).");
    const plan = await loadPlan(election, areaKey);
    const round = Number.parseInt(req.body?.round, 10); const table = Number.parseInt(req.body?.table, 10);
    const slot = plan?.rounds.find((r) => r.no === round)?.tables.find((t) => t.table === table);
    if (!slot) throw new ApiError(400, "Name the round and table from the counting plan.");
    const agent = req.authority.assignments.find((a) => a.role === "counting_agent");
    const item = {
        _id: crypto.randomUUID(), electionId: election._id, areaKey, round, table, partNumber: slot.partNumber, station: slot.station, type, description,
        by: req.user.epic, byRole: req.user.role, candidateName: agent?.candidateName ?? null, status: "open", createdAt: new Date().toISOString()
    };
    const tx = transaction();
    tx.set(itemKey("discrepancy", item._id), JSON.stringify(item)); tx.sAdd(listKey("discrepancy", election._id, areaKey), item._id);
    await recordAudit(auditEvent({ actor: req.user, action: "counting.discrepancy_reported", resource: { type: "counting_discrepancy", id: item._id }, jurisdiction: record, after: { round, table, type } }), tx);
    const ev = recordEvent(opsEvent({ type: "EXCEPTION_CREATED", jurisdiction: record, electionId: election._id, payload: { kind: "counting_discrepancy", round, table }, actor: req.user }), tx);
    await tx.exec();
    await publishEvents(ev);
    res.status(201).json({ success: true, data: item });
});

const DECISIONS = { accepted: "Accepted: action taken as recorded", rejected: "Rejected", referred: "Referred to the Commission" };
export const decideDiscrepancy = asyncHandler(async (req, res) => {
    if (!isRo(req)) throw new ApiError(403, "Only the Returning Officer decides a discrepancy.");
    const { election, record, areaKey } = await contextFor(req, req.body);
    const item = await jsonGet(itemKey("discrepancy", req.params.id));
    if (!item || item.electionId !== election._id || item.areaKey !== areaKey) throw new ApiError(404, "Discrepancy not found.");
    if (item.status !== "open") throw new ApiError(409, "This discrepancy has already been decided.");
    const decision = String(req.body?.decision ?? "");
    if (!DECISIONS[decision]) throw new ApiError(400, `decision must be one of ${Object.keys(DECISIONS).join(", ")}.`);
    const note = requireReason(req.body?.note, "decision");
    const updated = { ...item, status: "decided", decision, decisionText: DECISIONS[decision], note, decidedBy: req.user.epic, decidedAt: new Date().toISOString() };
    const tx = transaction();
    tx.set(itemKey("discrepancy", item._id), JSON.stringify(updated));
    await recordAudit(auditEvent({ actor: req.user, action: "counting.discrepancy_decided", resource: { type: "counting_discrepancy", id: item._id }, jurisdiction: record, before: { status: "open" }, after: { decision }, note }), tx);
    const ev = recordEvent(opsEvent({ type: "EXCEPTION_RESOLVED", jurisdiction: record, electionId: election._id, payload: { kind: "counting_discrepancy", decision }, actor: req.user }), tx);
    await tx.exec();
    await publishEvents(ev);
    res.json({ success: true, data: updated });
});

/** Counting observer: a report to the Commission about the count (kept with the counting record). */
export const observerReport = asyncHandler(async (req, res) => {
    if (!hasPermission(req.user, "observer:report")) throw new ApiError(403, "Only observers file observer reports.");
    const { election, record, areaKey } = await contextFor(req, req.body);
    const note = requireReason(req.body?.note, "report");
    const severity = ["routine", "concern", "serious"].includes(req.body?.severity) ? req.body.severity : "routine";
    const round = req.body?.round ? Number.parseInt(req.body.round, 10) : null;
    const item = { _id: crypto.randomUUID(), electionId: election._id, areaKey, round, severity, note, by: req.user.epic, byRole: req.user.role, createdAt: new Date().toISOString() };
    const tx = transaction();
    tx.set(itemKey("observer-report", item._id), JSON.stringify(item)); tx.sAdd(listKey("observer-report", election._id, areaKey), item._id);
    await recordAudit(auditEvent({ actor: req.user, action: "counting.observer_report", resource: { type: "counting_observer_report", id: item._id }, jurisdiction: record, after: { severity, round } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: item });
});

/**
 * RO: draws the polling stations whose VVPAT slips are counted (five per assembly constituency,
 * by lot). The seed is recorded so the draw can be checked; the draw happens once.
 */
export const vvpatDraw = asyncHandler(async (req, res) => {
    if (!isRo(req)) throw new ApiError(403, "Only the Returning Officer conducts the draw.");
    const { election, area, record, areaKey } = await contextFor(req, req.body);
    const witnesses = clean(req.body?.witnesses, 300);
    if (witnesses.length < 5) throw new ApiError(400, "Record who witnessed the draw (candidates or agents present, observer).");
    const plan = await withPlanLock(election, areaKey, async () => {
        const current = await loadPlan(election, areaKey);
        if (!current) throw new ApiError(409, "Save the counting plan first.");
        if (current.vvpatDraw) throw new ApiError(409, "The draw has already been made.");
        const stations = await stationsOf(area);
        const seed = crypto.randomBytes(16).toString("hex");
        const drawn = stations.map((s) => ({ s, k: crypto.createHmac("sha256", seed).update(s._id).digest("hex") })).sort((a, b) => a.k.localeCompare(b.k))
            .slice(0, VVPAT_DRAW_SIZE).map(({ s }) => ({ stationId: s._id, partNumber: s.partNumber, station: s.name, status: "pending" }));
        const next = { ...current, vvpatDraw: { at: new Date().toISOString(), by: req.user.epic, seed, witnesses, of: stations.length, drawn, basis: "Five polling stations per assembly constituency, drawn by lot (Supreme Court order of 8 April 2019)" } };
        const tx = transaction();
        tx.set(planKey(election._id, areaKey), JSON.stringify(next));
        await recordAudit(auditEvent({ actor: req.user, action: "counting.vvpat_draw", resource: { type: "counting", id: `${election._id}:${areaKey}` }, jurisdiction: record, after: { seed, parts: drawn.map((d) => d.partNumber) }, note: witnesses }), tx);
        await tx.exec();
        return next;
    });
    res.json({ success: true, data: plan.vvpatDraw });
});

/** For the RO's screen: counting supervisors and assistants assigned to this constituency. */
export const staffPool = asyncHandler(async (req, res) => {
    if (!isRo(req)) throw new ApiError(403, "Only the Returning Officer allocates counting staff.");
    const { election, record } = await contextFor(req, req.query);
    const { listAllAssignments } = await import("../repositories/assignment.repository.js");
    const all = (await listAllAssignments()).filter((a) => ["counting_supervisor", "counting_assistant"].includes(a.role) && assignmentInEffect(a) && assignmentInElection(a, election) && covers(a, record));
    res.json({ success: true, data: { supervisors: [...new Set(all.filter((a) => a.role === "counting_supervisor").map((a) => a.epic))], assistants: [...new Set(all.filter((a) => a.role === "counting_assistant").map((a) => a.epic))] } });
});
