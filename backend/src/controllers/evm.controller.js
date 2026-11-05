// EVM Management System (EMS 2.0): every ballot unit (BU), control unit (CU) and VVPAT by serial
// number, from the district warehouse to the polling station.
//
//   1. RECEIVE      Units arriving at the district warehouse are registered by serial number.
//   2. FLC          First-level checking by the manufacturer's engineers: each unit passes (FLC OK)
//                   or is rejected as defective.
//   3. RANDOMISE 1  The DEO allots FLC-OK units at random from the district warehouse to each
//                   assembly constituency (stations plus a reserve), in the presence of the parties'
//                   representatives, who are named on the record.
//   4. RANDOMISE 2  The RO allots the constituency's units at random to its polling stations, one
//                   BU, CU and VVPAT each; the rest are the reserve.
//   5. COMMISSION   After Form 7A, the units are prepared for the candidates (ballot units needed:
//                   one per 16 candidates including NOTA) and a mock poll is recorded.
//   The presiding officer checks the serial numbers received against the station's list.
//
// Units and randomisation records live in MongoDB; each randomisation holds a Redis lock so two
// officers can never draw from the same pool at once.
import crypto from "crypto";
import { acquireLock } from "../config/redis.js";
import { getContestingList, getStation, listStations } from "../repositories/election.repository.js";
import { rollAreaKey } from "../repositories/rollVersion.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { requireElection } from "../services/election.service.js";
import { actorOf, areaOf, assertScope, auditChange, clean, inScope, newId, nowIso, oneOf, page } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const units = docStore("evm_units");
const draws = docStore("evm_randomisations");
export const UNIT_TYPES = { BU: "Ballot unit", CU: "Control unit", VVPAT: "VVPAT" };
export const MANUFACTURERS = { BEL: "Bharat Electronics Ltd", ECIL: "Electronics Corporation of India Ltd" };
export const UNIT_STATUS = {
    received: "In the warehouse, awaiting FLC", flc_ok: "FLC passed", flc_rejected: "FLC rejected (defective)", allotted_ac: "Allotted to a constituency (1st randomisation)",
    allotted_station: "Allotted to a polling station (2nd randomisation)", reserve: "Constituency reserve", commissioned: "Commissioned for the poll"
};
// Reserve over the number of polling stations (illustrative of ECI norms).
export const RESERVE = { BU: 0.25, CU: 0.25, VVPAT: 0.35 };
const MAX_CANDIDATES_PER_BU = 16;

const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const witnessesOf = (list) => {
    const w = (Array.isArray(list) ? list : String(list ?? "").split(/[,;\n]/)).map((x) => clean(x, 120)).filter(Boolean).slice(0, 30);
    if (!w.length) throw new ApiError(400, "Name the political parties' representatives who witnessed the randomisation (or record that none attended).");
    return w;
};
const histo = (u, step, by, extra = {}) => ({ ...u, ...extra, history: [...(u.history ?? []), { step, by, at: nowIso() }] });
const withLock = async (key, fn) => {
    const release = await acquireLock(`evm:lock:${key}`, 120);
    if (!release) throw new ApiError(409, "A randomisation is already running here. Try again in a minute.");
    try { return await fn(); } finally { await release(); }
};

export const evmOverview = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.state) filter["location.state"] = clean(req.query.state, 80);
    if (req.query.district) filter["location.district"] = clean(req.query.district, 80);
    if (req.query.constituency) filter["location.constituency"] = clean(req.query.constituency, 120);
    if (req.query.status) filter.status = oneOf(req.query.status, UNIT_STATUS, "status");
    if (req.query.unitType) filter.unitType = oneOf(req.query.unitType, UNIT_TYPES, "unitType");
    const all = (await units.find(filter, { sort: { serial: 1 }, limit: 20000 })).filter((u) => inScope(req, u.location));
    const summary = {};
    for (const u of all) { const row = (summary[u.unitType] ??= Object.fromEntries(Object.keys(UNIT_STATUS).map((k) => [k, 0]))); row[u.status] += 1; }
    const byAc = {};
    for (const u of all) if (u.location.constituency) { const r = (byAc[u.location.constituency] ??= { BU: 0, CU: 0, VVPAT: 0, stations: 0, toStations: 0 }); r[u.unitType] += 1; if (u.status === "allotted_station" || u.status === "commissioned") r.toStations += 1; }
    const randomisations = (await draws.find({}, { sort: { createdAt: -1 }, limit: 100 })).filter((d) => inScope(req, d.jurisdiction)).map(({ allocations, ...d }) => ({ ...d, allocationCount: allocations?.length ?? 0 }));
    res.json({ success: true, data: { summary, byConstituency: byAc, total: all.length, items: page(all, { limit: req.query.limit ?? 200 }, "serial").map(({ history, ...u }) => u), randomisations, // eslint-disable-line no-unused-vars
        lists: { unitTypes: UNIT_TYPES, manufacturers: MANUFACTURERS, statuses: UNIT_STATUS, reserve: RESERVE },
        can: { manage: hasPermission(req.user, "evm:manage"), allocate: hasPermission(req.user, "evm:allocate") }, store: units.backend() } });
});

/** Register units received at the district warehouse (serials listed or generated from a prefix). */
export const receiveUnits = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const area = areaOf(b, "district");
    assertScope(req, area, "This district");
    const unitType = oneOf(b.unitType, UNIT_TYPES, "unitType");
    const manufacturer = oneOf(b.manufacturer, MANUFACTURERS, "manufacturer");
    let serials = (Array.isArray(b.serials) ? b.serials : String(b.serials ?? "").split(/[\s,;]+/)).map((s) => clean(s, 30).toUpperCase()).filter(Boolean);
    if (!serials.length && b.count) {
        const count = Math.min(2000, Math.max(1, Number(b.count) || 0));
        const start = Math.max(1, Number(b.startAt) || 1);
        serials = Array.from({ length: count }, (_, i) => `${unitType}${manufacturer[0]}${String(start + i).padStart(7, "0")}`);
    }
    if (!serials.length) throw new ApiError(400, "List the serial numbers, or give a count to number them.");
    if (serials.length > 2000) throw new ApiError(400, "At most 2,000 units at a time.");
    if (new Set(serials).size !== serials.length) throw new ApiError(400, "The list repeats a serial number.");
    const clash = await units.find({ serial: { $in: serials } });
    if (clash.length) throw new ApiError(409, `Already registered: ${clash.slice(0, 5).map((u) => u.serial).join(", ")}${clash.length > 5 ? " …" : ""}.`);
    const at = nowIso();
    const docs = serials.map((serial) => ({ _id: newId(), serial, unitType, manufacturer, model: clean(b.model, 10) || "M3", location: { ...area, constituency: null, warehouse: clean(b.warehouse, 120) || `${area.district} district EVM warehouse` },
        status: "received", flc: null, allocation: null, history: [{ step: "received", by: req.user.epic, at }], createdAt: at }));
    await units.insertMany(docs);
    await auditChange(req, "evm.units_received", { type: "evm", id: `${area.state}:${area.district}` }, area, { after: { unitType, count: docs.length } });
    res.status(201).json({ success: true, message: `${docs.length} ${UNIT_TYPES[unitType].toLowerCase()}(s) registered in the warehouse.`, data: { count: docs.length } });
});

/** First-level checking results. */
export const recordFlc = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const result = oneOf(b.result, ["ok", "rejected"], "result");
    const serials = (Array.isArray(b.serials) ? b.serials : String(b.serials ?? "").split(/[\s,;]+/)).map((s) => clean(s, 30).toUpperCase()).filter(Boolean);
    let list;
    if (serials.length) list = await units.find({ serial: { $in: serials } });
    else if (b.allPending && b.state && b.district) list = await units.find({ status: "received", "location.state": b.state, "location.district": b.district });
    else throw new ApiError(400, "List the serial numbers checked (or choose all units awaiting FLC in a district).");
    const engineer = clean(b.engineer, 120) || "Manufacturer's engineer";
    let done = 0;
    for (const u of list) {
        if (!inScope(req, u.location)) throw new ApiError(403, `${u.serial} is outside your district.`);
        if (u.status !== "received") continue;
        await units.put(histo(u, result === "ok" ? "flc_ok" : "flc_rejected", req.user.epic, { status: result === "ok" ? "flc_ok" : "flc_rejected", flc: { result, defect: result === "rejected" ? clean(b.defect, 200) || "Defect noted" : null, engineer, by: req.user.epic, at: nowIso() } }));
        done += 1;
    }
    if (list[0]) await auditChange(req, `evm.flc_${result}`, { type: "evm", id: `${list[0].location.state}:${list[0].location.district}` }, list[0].location, { after: { count: done } });
    res.json({ success: true, message: `FLC ${result === "ok" ? "passed" : "rejected"} for ${done} unit(s).`, data: { count: done } });
});

/** DEO: first randomisation, district warehouse to constituencies. */
export const firstRandomisation = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const election = await requireElection(b.electionId);
    const area = areaOf(b, "district");
    assertScope(req, area, "This district");
    const witnesses = witnessesOf(b.witnesses);
    const out = await withLock(`d:${area.state}:${area.district}`, async () => {
        const stations = (await listStations()).filter((s) => s.status === "ACTIVE" && s.state === area.state && s.district === area.district);
        const acs = [...new Set(stations.map((s) => s.constituency))].sort();
        if (!acs.length) throw new ApiError(409, "The district has no approved polling stations.");
        const pool = await units.find({ status: "flc_ok", "location.state": area.state, "location.district": area.district });
        const allocations = [];
        const at = nowIso();
        for (const type of Object.keys(UNIT_TYPES)) {
            const available = shuffle(pool.filter((u) => u.unitType === type));
            const need = acs.map((ac) => ({ ac, n: Math.ceil(stations.filter((s) => s.constituency === ac).length * (1 + RESERVE[type])) }));
            const total = need.reduce((x, r) => x + r.n, 0);
            if (available.length < total) throw new ApiError(409, `Not enough FLC-passed ${UNIT_TYPES[type].toLowerCase()}s: ${total} needed (stations + ${Math.round(RESERVE[type] * 100)}% reserve), ${available.length} available.`);
            let i = 0;
            for (const { ac, n } of need) for (let k = 0; k < n; k += 1) {
                const u = available[i++];
                await units.put(histo(u, "allotted_ac", req.user.epic, { status: "allotted_ac", location: { ...u.location, constituency: ac }, allocation: { electionId: election._id, constituency: ac, firstRandomisationAt: at } }));
                allocations.push({ serial: u.serial, unitType: type, constituency: ac });
            }
        }
        const doc = { _id: newId(), round: 1, electionId: election._id, electionName: election.name, jurisdiction: area, witnesses, allocations, summary: acs.map((ac) => ({ constituency: ac, stations: stations.filter((s) => s.constituency === ac).length,
            BU: allocations.filter((x) => x.constituency === ac && x.unitType === "BU").length, CU: allocations.filter((x) => x.constituency === ac && x.unitType === "CU").length, VVPAT: allocations.filter((x) => x.constituency === ac && x.unitType === "VVPAT").length })),
            by: actorOf(req.user), createdAt: at };
        await draws.insert(doc);
        return doc;
    });
    await auditChange(req, "evm.randomised_first", { type: "evm-randomisation", id: out._id }, area, { after: { units: out.allocations.length, constituencies: out.summary.length } });
    res.status(201).json({ success: true, message: `First randomisation done: ${out.allocations.length} units allotted to ${out.summary.length} constituencies.`, data: { ...out, allocations: undefined } });
});

/** RO: second randomisation, constituency units to polling stations. */
export const secondRandomisation = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const election = await requireElection(b.electionId);
    const area = areaOf(b, "constituency");
    assertScope(req, area, "This constituency");
    const witnesses = witnessesOf(b.witnesses);
    const out = await withLock(`ac:${area.state}:${area.constituency}`, async () => {
        const stations = (await listStations()).filter((s) => s.status === "ACTIVE" && s.state === area.state && s.constituency === area.constituency)
            .sort((a, z) => Number(a.partNumber) - Number(z.partNumber));
        const pool = await units.find({ status: "allotted_ac", "location.state": area.state, "location.constituency": area.constituency, "allocation.electionId": election._id });
        const at = nowIso();
        const allocations = [];
        for (const type of Object.keys(UNIT_TYPES)) {
            const available = shuffle(pool.filter((u) => u.unitType === type));
            if (available.length < stations.length) throw new ApiError(409, `Only ${available.length} ${UNIT_TYPES[type].toLowerCase()}s for ${stations.length} stations. Run the first randomisation first.`);
            for (const [i, u] of available.entries()) {
                const s = stations[i];
                if (s) {
                    await units.put(histo(u, "allotted_station", req.user.epic, { status: "allotted_station", allocation: { ...u.allocation, stationId: s._id, partNumber: s.partNumber, stationName: s.name, secondRandomisationAt: at } }));
                    allocations.push({ serial: u.serial, unitType: type, stationId: s._id, partNumber: s.partNumber });
                } else {
                    await units.put(histo(u, "reserve", req.user.epic, { status: "reserve", allocation: { ...u.allocation, stationId: null, reserve: true, secondRandomisationAt: at } }));
                    allocations.push({ serial: u.serial, unitType: type, reserve: true });
                }
            }
        }
        const doc = { _id: newId(), round: 2, electionId: election._id, electionName: election.name, jurisdiction: area, witnesses, allocations, stations: stations.length,
            reserve: allocations.filter((x) => x.reserve).length, by: actorOf(req.user), createdAt: at };
        await draws.insert(doc);
        return doc;
    });
    await auditChange(req, "evm.randomised_second", { type: "evm-randomisation", id: out._id }, area, { after: { stations: out.stations, reserve: out.reserve } });
    res.status(201).json({ success: true, message: `Second randomisation done: machines allotted to ${out.stations} stations; ${out.reserve} units in reserve.`, data: { ...out, allocations: undefined } });
});

/** RO: commission the constituency's machines for the candidates, with the mock poll recorded. */
export const commissionUnits = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const election = await requireElection(b.electionId);
    const area = areaOf(b, "constituency");
    assertScope(req, area, "This constituency");
    const list = await getContestingList(election._id, rollAreaKey({ ...area, assemblyConstituency: area.constituency }));
    if (!list) throw new ApiError(409, "Publish the list of contesting candidates (Form 7A) before commissioning.");
    const ballotUnitsPerStation = Math.ceil((list.candidates.length + 1) / MAX_CANDIDATES_PER_BU);
    const mockPollVotes = Math.max(0, Math.round(Number(b.mockPollVotes) || 1000));
    const ready = await units.find({ status: { $in: ["allotted_station", "reserve"] }, "location.state": area.state, "location.constituency": area.constituency, "allocation.electionId": election._id });
    if (!ready.length) throw new ApiError(409, "No machines allotted to stations yet. Run the second randomisation first.");
    const at = nowIso();
    for (const u of ready) {
        if (u.status !== "allotted_station") continue;
        await units.put(histo(u, "commissioned", req.user.epic, { status: "commissioned", commissioning: { candidates: list.candidates.length, nota: true, ballotUnitsPerStation, mockPollVotes: u.unitType === "CU" ? mockPollVotes : null, at, by: req.user.epic } }));
    }
    await auditChange(req, "evm.commissioned", { type: "evm", id: `${area.state}:${area.constituency}` }, area, { after: { units: ready.filter((u) => u.status === "allotted_station").length, ballotUnitsPerStation } });
    res.json({ success: true, message: `Machines commissioned for ${list.candidates.length} candidates and NOTA (${ballotUnitsPerStation} ballot unit(s) per station).`,
        data: { candidates: list.candidates.length, ballotUnitsPerStation, warning: ballotUnitsPerStation > 1 ? `More than ${MAX_CANDIDATES_PER_BU - 1} candidates: each station needs ${ballotUnitsPerStation} ballot units; draw the extra ones from the reserve.` : null } });
});

/** The machines allotted to one polling station (the presiding officer checks the serials). */
export const stationMachines = asyncHandler(async (req, res) => {
    const station = await getStation(req.params.stationId);
    if (!station) throw new ApiError(404, "No such polling station.");
    assertScope(req, { state: station.state, district: station.district, constituency: station.constituency, pollingStation: station.name }, "This polling station");
    const list = await units.find({ "allocation.stationId": station._id });
    res.json({ success: true, data: { station: { _id: station._id, name: station.name, partNumber: station.partNumber }, machines: list.map((u) => ({ serial: u.serial, unitType: u.unitType, manufacturer: u.manufacturer, status: u.status, statusText: UNIT_STATUS[u.status], commissioning: u.commissioning ?? null })) } });
});

export const randomisationDetail = asyncHandler(async (req, res) => {
    const d = await draws.get(req.params.id);
    if (!d || !inScope(req, d.jurisdiction)) throw new ApiError(404, "No such randomisation.");
    res.json({ success: true, data: d });
});
