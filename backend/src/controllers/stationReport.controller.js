// What the polling party records about the poll itself (Conduct of Elections Rules, 1961, rules
// 49S and 56C; ECI Handbook for Presiding Officers):
//
//   MACHINE LOG   (polling officer operating the machines, presiding officer)  each event on
//                 the control unit, ballot unit or VVPAT: mock poll and clearing, sealing,
//                 replacement after a fault, the close button, sealing after the poll.
//   PO REPORT     (presiding officer: "polling:report")  the Presiding Officer's diary and the
//                 account of votes recorded (Form 17C, Part I): electors assigned, votes
//                 recorded in the machine, tendered and challenged votes, seals, remarks.
//                 Submitted once after the close; a correction is a new version with a reason.
//
// The account is compared with the station's own register (electors marked) and a difference is
// flagged for the Returning Officer. No candidate-wise figure is ever recorded here.
import { transaction } from "../config/redis.js";
import { listRegister } from "../repositories/poll.repository.js";
import { listStations } from "../repositories/election.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { actorOf, clean, inScope, newId, nowIso, oneOf, page, requireText, store } from "../services/workflow.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { loadState, stationContext, stationRecord } from "./pollDay.controller.js";

const machineLog = store("machine-event");
const reports = store("po-report");

export const MACHINE_EVENTS = {
    mock_poll_done: "Mock poll held before agents", mock_poll_cleared: "Mock poll data cleared, VVPAT slips removed",
    sealed_before_poll: "Machines sealed before the poll", replaced: "Unit replaced after a fault", malfunction: "Malfunction noticed",
    close_pressed: "Close button pressed at the end of the poll", sealed_after_poll: "Machines sealed after the poll"
};
const UNITS = ["control_unit", "ballot_unit", "vvpat"];
const n = (v, label, max = 100000) => {
    const x = Number.parseInt(v, 10);
    if (!Number.isFinite(x) || x < 0 || x > max) throw new ApiError(400, `${label} must be a whole number between 0 and ${max}.`);
    return x;
};

/** Polling officer operating the machines, or the presiding officer: one machine event. */
export const recordMachineEvent = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const item = {
        _id: newId(), electionId: election._id, stationId: station._id, stationName: station.name, partNumber: station.partNumber,
        jurisdiction: { state: station.state, district: station.district, constituency: station.constituency },
        event: oneOf(req.body?.event, MACHINE_EVENTS, "event"), unit: oneOf(req.body?.unit ?? "control_unit", UNITS, "unit"),
        serial: clean(req.body?.serial, 40) || null, note: clean(req.body?.note, 500) || null, by: actorOf(req.user), at: nowIso()
    };
    if (item.event === "replaced" && !item.note) throw new ApiError(400, "Record why the unit was replaced and the new unit's serial.");
    const tx = transaction();
    machineLog.save(item, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "poll.machine_event", resource: { type: "station", id: station._id }, jurisdiction: stationRecord(station), after: { event: item.event, unit: item.unit, serial: item.serial } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: item });
});

const flagsFor = (report, marked) => {
    const f = [];
    if (report.votesRecorded !== marked) f.push(`Votes recorded in the machine (${report.votesRecorded}) differ from electors marked in the register (${marked}).`);
    if (report.votesRecorded > report.electorsAssigned) f.push("More votes recorded than electors assigned to the station.");
    if (report.tenderedVotes > 0) f.push(`${report.tenderedVotes} tendered vote(s): see the tendered votes list.`);
    return f;
};

/** Presiding officer: the diary and account of votes recorded, after the close of poll. */
export const submitPoReport = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const state = await loadState(election, station);
    if (state.status !== "closed") throw new ApiError(409, "The Presiding Officer's report is made after the poll is closed.");
    const previous = (await reports.list()).filter((r) => r.electionId === election._id && r.stationId === station._id && !r.supersededBy)[0] ?? null;
    const reason = previous ? requireReason(req.body?.correctionReason, "correction") : null;
    const b = req.body ?? {};
    const marked = (await listRegister(election._id, station._id)).length;
    const report = {
        _id: newId(), electionId: election._id, electionName: election.name, stationId: station._id, stationName: station.name, partNumber: station.partNumber,
        jurisdiction: { state: station.state, district: station.district, constituency: station.constituency },
        electorsAssigned: n(b.electorsAssigned, "Electors assigned"), votesRecorded: n(b.votesRecorded, "Votes recorded"),
        tenderedVotes: n(b.tenderedVotes ?? 0, "Tendered votes", 1000), challengedVotes: n(b.challengedVotes ?? 0, "Challenged votes", 1000),
        votersAfterClose: n(b.votersAfterClose ?? 0, "Electors given slips at the close", 5000),
        seals: clean(b.seals, 300) || null, controlUnit: clean(b.controlUnit, 40) || null, vvpat: clean(b.vvpat, 40) || null,
        pollStartedAt: clean(b.pollStartedAt, 5) || null, pollClosedAt: clean(b.pollClosedAt, 5) || null,
        visitors: clean(b.visitors, 500) || null, remarks: requireText(b.remarks ?? "Poll conducted peacefully.", "Remarks", { min: 3, max: 2000 }),
        registerMarked: marked, by: actorOf(req.user), at: nowIso(), version: (previous?.version ?? 0) + 1, previous: previous?._id ?? null, correctionReason: reason, supersededBy: null
    };
    report.flags = flagsFor(report, marked);
    const tx = transaction();
    reports.save(report, tx);
    if (previous) reports.save({ ...previous, supersededBy: report._id }, tx);
    await recordAudit(auditEvent({ actor: req.user, action: previous ? "poll.po_report_corrected" : "poll.po_report", resource: { type: "station", id: station._id }, jurisdiction: stationRecord(station),
        after: { votesRecorded: report.votesRecorded, electorsAssigned: report.electorsAssigned, flags: report.flags.length, version: report.version }, note: reason }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: report.flags.length ? "Report submitted. Differences are flagged for the Returning Officer." : "Report submitted.", data: report });
});

/** Presiding officer: their own station's machine log and report. */
export const myStationRecords = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const log = (await machineLog.list()).filter((x) => x.electionId === election._id && x.stationId === station._id).sort((a, b) => a.at.localeCompare(b.at));
    const report = (await reports.list()).find((r) => r.electionId === election._id && r.stationId === station._id && !r.supersededBy) ?? null;
    const state = await loadState(election, station);
    res.json({ success: true, data: { station: { _id: station._id, name: station.name, partNumber: station.partNumber }, election: { _id: election._id, name: election.name },
        pollStatus: state.status, log, report, events: MACHINE_EVENTS, units: UNITS,
        can: { report: hasPermission(req.user, "polling:report"), machine: hasPermission(req.user, "polling:operate-evm") || hasPermission(req.user, "polling:conduct") } } });
});

/** RO, DEO, CEO, observers: reports and machine logs of the stations in their jurisdiction. */
export const listStationReports = asyncHandler(async (req, res) => {
    const q = req.query;
    const all = (await reports.list()).filter((r) => !r.supersededBy && inScope(req, r.jurisdiction) && (!q.electionId || r.electionId === q.electionId));
    const logs = (await machineLog.list()).filter((x) => inScope(req, x.jurisdiction) && (!q.electionId || x.electionId === q.electionId));
    const stations = (await listStations()).filter((s) => s.status === "ACTIVE" && inScope(req, s));
    res.json({ success: true, data: {
        items: page(all, { limit: 200 }, "at"), flagged: all.filter((r) => r.flags.length).length, stations: stations.length,
        replacements: logs.filter((x) => x.event === "replaced").length, malfunctions: logs.filter((x) => x.event === "malfunction").length,
        log: page(logs, { limit: 100 }, "at"), events: MACHINE_EVENTS
    } });
});
