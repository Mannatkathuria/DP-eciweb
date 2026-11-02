import crypto from "crypto";
import { transaction } from "../config/redis.js";
import { listElections, listStations } from "../repositories/election.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
import {
    addVisit, getIncident, getPollState, listIncidents, listPollCases, listVisits, lockIncident, registerLength, saveIncident
} from "../repositories/poll.repository.js";
import { electionStage, requireElection, todayIST } from "../services/election.service.js";
import { coversAny, hasPermission } from "../services/authority.service.js";
import { opsEvent, publishEvents, recordEvent } from "../services/events.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { listAllDevices } from "../repositories/device.repository.js";
import { stationDeviceSummary } from "../services/device.service.js";
import { sweepOfflineDevices } from "./device.controller.js";

// Control room: the poll across every station the caller's jurisdiction covers (a sector
// officer's or RO's constituency, a DEO's district, a CEO's State, the whole country for the
// Commission), with alerts, incidents and sector officers' visits. Reading is jurisdiction-
// limited; incidents are reported at a station and handled by sector officers, ROs and DEOs.

const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const clean = (v, max = 1000) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
export const INCIDENT_TYPES = {
    evm_malfunction: "EVM malfunction", vvpat_malfunction: "VVPAT malfunction", law_and_order: "Law and order",
    power_failure: "Power or lighting failure", staff_absent: "Polling staff absent", accessibility: "Accessibility problem",
    mcc_violation: "Model Code of Conduct violation near the station", other: "Other"
};
export const SEVERITIES = ["low", "medium", "high", "critical"];
// Who an incident is with; "escalate" moves it one step up.
export const ESCALATION_LEVELS = ["sector_officer", "returning_officer", "district_election_officer", "chief_electoral_officer"];
// Thresholds for alerts (minutes). Poll hours vary by election; 07:00 is the usual start.
const POLL_START = process.env.POLL_START_IST || "07:00";
const OPEN_GRACE = 30, QUEUE_STALE = 60, CASE_STALE = 30;

const stationRecord = (s) => ({ ...s, assemblyConstituency: s.constituency, pollingStation: s.name });
const minutesSince = (iso, now) => (now - new Date(iso).getTime()) / 60000;
const nowIstMinutes = (now) => { const d = new Date(now + 330 * 60000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const [startH, startM] = POLL_START.split(":").map(Number);

/** Stations (approved) the caller's assignments cover, in the election's States. */
const coveredStations = async (req, election) =>
    (await listStations()).filter((s) => s.status === "ACTIVE" && election.states.includes(s.state) && coversAny(req.authority.assignments, stationRecord(s)));

const chooseElection = async (req) => {
    if (req.query.electionId) return requireElection(req.query.electionId);
    const today = todayIST();
    const elections = await listElections();
    const pick = elections.find((e) => electionStage(e, today) === "poll_day")
        ?? elections.filter((e) => e.schedule.pollDate >= today).sort((a, b) => a.schedule.pollDate.localeCompare(b.schedule.pollDate))[0]
        ?? elections.sort((a, b) => b.schedule.pollDate.localeCompare(a.schedule.pollDate))[0];
    if (!pick) throw new ApiError(404, "No election has been announced.");
    return pick;
};

/** Alerts for one station, from its poll state, cases and incidents. */
export const stationAlerts = ({ onPollDay, state, cases, incidents, now }) => {
    const alerts = [];
    if (!onPollDay) return alerts;
    const status = state?.status ?? "not_started";
    if (["not_started", "mock_poll_done"].includes(status) && nowIstMinutes(now) >= startH * 60 + startM + OPEN_GRACE) alerts.push({ code: "not_open", text: "Poll not opened" });
    if (status === "open") {
        const openedAt = state.history.filter((h) => h.status === "open").at(-1)?.at;
        const last = state.queue?.at ?? openedAt;
        if (last && minutesSince(last, now) > QUEUE_STALE) alerts.push({ code: "queue_stale", text: "No queue report in the last hour" });
    }
    if (cases.some((c) => c.status === "open" && minutesSince(c.raisedAt, now) > CASE_STALE)) alerts.push({ code: "case_waiting", text: "A doubt or challenge has waited over 30 minutes" });
    if (incidents.some((i) => i.status !== "resolved" && ["high", "critical"].includes(i.severity))) alerts.push({ code: "serious_incident", text: "Serious incident unresolved" });
    return alerts;
};

/** The control-room picture: every covered station with status, turnout, queue, cases, incidents and alerts. */
export const overview = asyncHandler(async (req, res) => {
    const election = await chooseElection(req);
    const onPollDay = electionStage(election) === "poll_day";
    const now = Date.now();
    // Devices that stopped sending heartbeats are marked offline here too, so the sweep also runs
    // on serverless hosting where no timer runs between requests.
    await sweepOfflineDevices().catch(() => 0);
    const [stations, electors, incidents, devices] = await Promise.all([coveredStations(req, election), listElectors(), listIncidents(election._id), listAllDevices()]);
    const partKey = (state, constituency, part) => `${norm(state)}|${norm(constituency)}|${part}`;
    const sizes = new Map();
    for (const e of electors) if (e.isActive !== false) { const k = partKey(e.state, e.assemblyConstituency, String(e.partNumber)); sizes.set(k, (sizes.get(k) ?? 0) + 1); }

    const rows = await Promise.all(stations.map(async (s) => {
        const [state, voted, cases, visits] = await Promise.all([getPollState(election._id, s._id), registerLength(election._id, s._id), listPollCases(election._id, s._id), listVisits(election._id, s._id)]);
        const here = incidents.filter((i) => i.stationId === s._id);
        const total = sizes.get(partKey(s.state, s.constituency, s.partNumber)) ?? 0;
        return {
            stationId: s._id, stationCode: s.stationCode, name: s.name, state: s.state, district: s.district, constituency: s.constituency, partNumber: s.partNumber,
            poll: state?.status ?? "not_started", closing: state?.closing ?? null,
            turnout: { electors: total, voted, percent: total ? Math.round((voted / total) * 1000) / 10 : 0 },
            queue: state?.queue ?? null,
            openCases: cases.filter((c) => c.status === "open").length,
            openIncidents: here.filter((i) => i.status !== "resolved").length,
            lastVisit: visits.at(-1) ?? null,
            connectivity: stationDeviceSummary(devices.filter((d) => d.stationId === s._id), now),
            alerts: stationAlerts({ onPollDay, state, cases, incidents: here, now })
        };
    }));
    rows.sort((a, b) => b.alerts.length - a.alerts.length || a.constituency.localeCompare(b.constituency) || Number(a.partNumber) - Number(b.partNumber));
    const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
    const electorsTotal = sum((r) => r.turnout.electors); const votedTotal = sum((r) => r.turnout.voted);
    const ids = new Set(stations.map((s) => s._id));
    res.json({ success: true, data: {
        election: { _id: election._id, name: election.name, pollDate: election.schedule.pollDate, stage: electionStage(election) },
        elections: (await listElections()).map((e) => ({ _id: e._id, name: e.name, pollDate: e.schedule.pollDate })),
        onPollDay, generatedAt: new Date(now).toISOString(),
        summary: {
            stations: rows.length, open: rows.filter((r) => r.poll === "open").length, closed: rows.filter((r) => r.poll === "closed").length,
            notStarted: rows.filter((r) => ["not_started", "mock_poll_done"].includes(r.poll)).length,
            electors: electorsTotal, voted: votedTotal, percent: electorsTotal ? Math.round((votedTotal / electorsTotal) * 1000) / 10 : 0,
            alerts: sum((r) => r.alerts.length), openIncidents: sum((r) => r.openIncidents),
            connectivity: Object.fromEntries(["online", "synchronising", "sync_failed", "stale", "offline", "unknown"].map((c) => [c, rows.filter((r) => r.connectivity.status === c).length]))
        },
        stations: rows,
        incidents: incidents.filter((i) => ids.has(i.stationId)).sort((a, b) => (a.status === "resolved") - (b.status === "resolved") || SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity) || b.reportedAt.localeCompare(a.reportedAt)),
        incidentTypes: INCIDENT_TYPES,
        can: { manage: hasPermission(req.user, "incident:manage"), report: hasPermission(req.user, "incident:report"), visit: hasPermission(req.user, "polling:inspect") }
    } });
});

const stationForCaller = async (req, election, stationId) => {
    const s = (await listStations()).find((x) => x._id === stationId && x.status === "ACTIVE");
    if (!s || !election.states.includes(s.state)) throw new ApiError(404, "Polling station not found for this election.");
    if (!coversAny(req.authority.assignments, stationRecord(s))) throw new ApiError(403, "This polling station is outside your assigned jurisdiction.");
    return s;
};

/** Report an incident at a station (presiding officer, micro observer, sector officer). */
export const reportIncident = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const election = await requireElection(body.electionId);
    const station = await stationForCaller(req, election, String(body.stationId ?? ""));
    if (!INCIDENT_TYPES[body.type]) throw new ApiError(400, "Choose the type of incident.");
    if (!SEVERITIES.includes(body.severity)) throw new ApiError(400, `severity must be one of: ${SEVERITIES.join(", ")}.`);
    const description = clean(body.description);
    if (description.length < 5) throw new ApiError(400, "Describe the incident.");
    const at = new Date().toISOString();
    const incident = {
        _id: crypto.randomUUID(), electionId: election._id, stationId: station._id, stationCode: station.stationCode, stationName: station.name,
        state: station.state, district: station.district, constituency: station.constituency, partNumber: station.partNumber,
        type: body.type, severity: body.severity, description, status: "reported",
        reportedBy: { epic: req.user.epic, role: req.user.role }, reportedAt: at,
        timeline: [{ action: "reported", by: req.user.epic, at, note: description }],
        // Serious incidents start at the RO's level; others with the sector officer.
        escalationLevel: ["high", "critical"].includes(body.severity) ? 1 : 0
    };
    const tx = transaction();
    saveIncident(incident, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "incident.reported", resource: { type: "incident", id: incident._id }, jurisdiction: stationRecord(station), after: { type: incident.type, severity: incident.severity } }), tx);
    const event = recordEvent(opsEvent({ type: "INCIDENT_CREATED", jurisdiction: stationRecord(station), electionId: election._id, stationId: station._id,
        payload: { incidentId: incident._id, incidentType: incident.type, severity: incident.severity, level: ESCALATION_LEVELS[incident.escalationLevel] }, actor: req.user }), tx);
    await tx.exec();
    await publishEvents(event);
    res.status(201).json({ success: true, data: incident });
});

/** Acknowledge, update or resolve an incident (sector officer, RO, DEO, CEO within jurisdiction). */
export const updateIncident = asyncHandler(async (req, res) => {
    const action = String(req.body?.action ?? "");
    if (!["acknowledge", "update", "escalate", "resolve"].includes(action)) throw new ApiError(400, "action must be acknowledge, update, escalate or resolve.");
    const release = await lockIncident(req.params.id);
    if (!release) throw new ApiError(409, "This incident is being updated.");
    try {
        const incident = await getIncident(req.params.id);
        if (!incident) throw new ApiError(404, "Incident not found.");
        if (!coversAny(req.authority.assignments, { ...incident, assemblyConstituency: incident.constituency, pollingStation: incident.stationName })) {
            throw new ApiError(403, "This incident is outside your assigned jurisdiction.");
        }
        if (incident.status === "resolved") throw new ApiError(409, "This incident is already resolved.");
        if (action === "acknowledge" && incident.status !== "reported") throw new ApiError(409, "This incident has already been acknowledged.");
        const note = ["resolve", "escalate"].includes(action) ? requireReason(req.body?.note, action === "resolve" ? "resolution" : "escalation") : clean(req.body?.note) || null;
        if (action === "update" && !note) throw new ApiError(400, "Write the update.");
        const level = incident.escalationLevel ?? 0;
        if (action === "escalate" && level >= ESCALATION_LEVELS.length - 1) throw new ApiError(409, "This incident is already with the Chief Electoral Officer.");
        const at = new Date().toISOString();
        const status = action === "resolve" ? "resolved" : "acknowledged";
        const updated = { ...incident, status, timeline: [...incident.timeline, { action, by: req.user.epic, at, note, ...(action === "escalate" ? { to: ESCALATION_LEVELS[level + 1] } : {}) }],
            escalationLevel: action === "escalate" ? level + 1 : level, ...(action === "resolve" ? { resolvedAt: at, resolvedBy: req.user.epic } : {}) };
        const tx = transaction();
        saveIncident(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: `incident.${{ acknowledge: "acknowledged", update: "updated", escalate: "escalated", resolve: "resolved" }[action]}`, resource: { type: "incident", id: incident._id },
            jurisdiction: { ...incident, assemblyConstituency: incident.constituency, pollingStation: incident.stationName }, before: { status: incident.status, level: ESCALATION_LEVELS[level] }, after: { status, level: ESCALATION_LEVELS[updated.escalationLevel] }, note }), tx);
        const event = recordEvent(opsEvent({ type: action === "escalate" ? "INCIDENT_ESCALATED" : "INCIDENT_UPDATED", jurisdiction: { ...incident, pollingStation: incident.stationName },
            electionId: incident.electionId, stationId: incident.stationId, payload: { incidentId: incident._id, status, level: ESCALATION_LEVELS[updated.escalationLevel] }, actor: req.user }), tx);
        await tx.exec();
        await publishEvents(event);
        res.json({ success: true, data: updated });
    } finally { await release(); }
});

/** Sector officer records a visit to a station in the sector. */
export const recordVisit = asyncHandler(async (req, res) => {
    const election = await requireElection(req.body?.electionId);
    const station = await stationForCaller(req, election, req.params.stationId);
    const note = clean(req.body?.note, 500);
    if (note.length < 3) throw new ApiError(400, "Write what you found.");
    const visit = { electionId: election._id, stationId: station._id, by: req.user.epic, at: new Date().toISOString(), note };
    const tx = transaction();
    addVisit(visit, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "station.visited", resource: { type: "poll_station", id: `${election._id}:${station._id}` }, jurisdiction: stationRecord(station), note }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: visit });
});
