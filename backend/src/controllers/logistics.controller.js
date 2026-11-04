// Polling logistics: movement of polling parties and custody of election material (EVMs, VVPATs,
// statutory forms) from dispatch to the strong room. Sector officers and sector police officers
// record each step for the stations of their sector; control-room officials read it.
// Each step is appended (never edited), so the chain of custody can be read back in order.
import { transaction } from "../config/redis.js";
import { getStation, listElections, listStations } from "../repositories/election.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { electionStage, requireElection, todayIST } from "../services/election.service.js";
import { actorOf, asRecord, assertScope, clean, inScope, newId, nowIso, oneOf, store } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const STEPS = {
    party_dispatched: "Polling party dispatched with material", party_reached: "Polling party reached the station",
    station_set_up: "Polling station set up", mock_poll_done: "Mock poll conducted", evm_replaced: "EVM or VVPAT replaced",
    poll_closed: "Poll closed and machines sealed", party_departed: "Polling party left the station",
    material_received: "Material received at the collection centre", strong_room_sealed: "Machines in the strong room, sealed"
};
const ORDER = Object.keys(STEPS);
const steps = store("logistics");

const stationArea = (s) => ({ state: s.state, district: s.district, constituency: s.constituency, pollingStation: s.name });

const chooseElection = async (q) => {
    if (q.electionId) return requireElection(q.electionId);
    const today = todayIST();
    const all = await listElections();
    return all.find((e) => electionStage(e, today) === "poll_day")
        ?? all.filter((e) => e.schedule.pollDate >= today).sort((a, b) => a.schedule.pollDate.localeCompare(b.schedule.pollDate))[0]
        ?? all[0] ?? null;
};

export const recordStep = asyncHandler(async (req, res) => {
    const election = await requireElection(req.body?.electionId);
    const station = await getStation(req.params.stationId);
    if (!station || station.status !== "ACTIVE") throw new ApiError(404, "Approved polling station not found.");
    assertScope(req, stationArea(station), "This polling station");
    if (!election.states.includes(station.state)) throw new ApiError(400, "This station is not in that election.");
    const step = oneOf(req.body?.step, STEPS, "step");
    const item = {
        _id: newId(), electionId: election._id, stationId: station._id, stationName: station.name, partNumber: station.partNumber,
        jurisdiction: { state: station.state, district: station.district, constituency: station.constituency }, step,
        note: clean(req.body?.note, 500) || null, sealNumbers: clean(req.body?.sealNumbers, 200) || null, vehicle: clean(req.body?.vehicle, 40) || null,
        by: actorOf(req.user), at: nowIso()
    };
    const tx = transaction();
    steps.save(item, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "logistics.step", resource: { type: "logistics", id: `${election._id}:${station._id}` }, jurisdiction: asRecord(stationArea(station)), after: { step } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: item });
});

export const logisticsOverview = asyncHandler(async (req, res) => {
    const election = await chooseElection(req.query);
    if (!election) return res.json({ success: true, data: { election: null, stations: [], steps: STEPS } });
    const stations = (await listStations()).filter((s) => s.status === "ACTIVE" && election.states.includes(s.state) && inScope(req, stationArea(s)));
    const all = (await steps.list()).filter((x) => x.electionId === election._id);
    const rows = stations.map((s) => {
        const timeline = all.filter((x) => x.stationId === s._id).sort((a, b) => a.at.localeCompare(b.at));
        const last = timeline.at(-1) ?? null;
        return { stationId: s._id, stationName: s.name, partNumber: s.partNumber, constituency: s.constituency, last, progress: last ? Math.round(((ORDER.indexOf(last.step) + 1) / ORDER.length) * 100) : 0, timeline };
    }).sort((a, b) => a.constituency.localeCompare(b.constituency) || Number(a.partNumber) - Number(b.partNumber));
    const byStep = Object.fromEntries(ORDER.map((k) => [k, rows.filter((r) => r.last?.step === k).length]));
    res.json({ success: true, data: { election: { _id: election._id, name: election.name, pollDate: election.schedule.pollDate, stage: electionStage(election) },
        stations: rows, byStep, steps: STEPS, can: { record: hasPermission(req.user, "logistics:track") } } });
});
