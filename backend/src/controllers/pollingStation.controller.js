import crypto from "crypto";
import { transaction } from "../config/redis.js";
import { getStation, listStations, lockStation, saveStation } from "../repositories/election.repository.js";
import { getElectorByEpic, listElectors, saveElector } from "../repositories/elector.repository.js";
import { assertCovers, coversAny, validateJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { opsEvent, publishEvents, recordEvent } from "../services/events.service.js";

// Polling stations are provided by the DEO with the prior approval of the Election Commission
// (RP Act 1951, s. 25). Here the DEO proposes a station or a relocation, and the ECI approves it;
// only approved (ACTIVE) stations are public or usable for assignments. Every approved change is
// versioned, and a relocation updates the electors of that part in the same transaction.

const ACCESSIBILITY = ["ramp", "wheelchair", "drinkingWater", "toilet", "shade", "signage"];
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const norm = (v) => clean(v).toLowerCase();
const slug = (v) => norm(v).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
const asRecord = (s) => ({ ...s, assemblyConstituency: s.constituency });
const OPEN = ["PROPOSED", "ACTIVE"];

/** The physical details of a station: name, address, optional location and accessibility. */
const parseDetails = (body = {}) => {
    const name = clean(body.name);
    if (name.length < 3 || name.length > 200) throw new ApiError(400, "Station name must be 3 to 200 characters.");
    const address = clean(body.address);
    if (address.length < 10 || address.length > 300) throw new ApiError(400, "Station address must be 10 to 300 characters.");
    let location = null;
    if (body.location && (body.location.lat !== undefined || body.location.lng !== undefined)) {
        const lat = Number(body.location.lat), lng = Number(body.location.lng);
        // Mainland India and islands lie within roughly 6-38 N and 68-98 E.
        if (!(lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98)) throw new ApiError(400, "Location must be a latitude and longitude inside India.");
        location = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
    }
    const accessibility = Object.fromEntries(ACCESSIBILITY.map((k) => [k, body.accessibility?.[k] === true]));
    return { name, address, location, accessibility };
};

const parseArea = (body = {}) => {
    if (!clean(body.district)) throw new ApiError(400, "Give the district.");
    const j = validateJurisdiction("ero", body);
    const partNumber = clean(body.partNumber);
    if (!/^[1-9]\d{0,3}$/.test(partNumber)) throw new ApiError(400, "Part number must be a whole number between 1 and 9999.");
    return { state: j.state, district: j.district, constituency: j.constituency, partNumber };
};

const publicView = (s) => ({
    _id: s._id, stationCode: s.stationCode, state: s.state, district: s.district, constituency: s.constituency, partNumber: s.partNumber,
    name: s.name, address: s.address, location: s.location, accessibility: s.accessibility,
    relocationNotice: s.relocationNotice ?? null, version: s.source?.version ?? null, verifiedAt: s.source?.verifiedAt ?? null
});

const proposeOne = (body, user, existing) => {
    const area = parseArea(body);
    const details = parseDetails(body);
    const clash = existing.find((s) => OPEN.includes(s.status) && norm(s.state) === norm(area.state)
        && norm(s.constituency) === norm(area.constituency) && s.partNumber === area.partNumber);
    if (clash) throw new ApiError(409, `Part ${area.partNumber} of ${area.constituency} already has a station (${clash.stationCode}).`);
    const now = new Date().toISOString();
    return {
        _id: crypto.randomUUID(), stationCode: `PS-${slug(area.state).slice(0, 6)}-${slug(area.constituency)}-${area.partNumber}`,
        ...area, ...details, status: "PROPOSED",
        pendingChange: { type: "create", proposed: details, reason: clean(body.reason) || null, by: user.epic, at: now },
        history: [], relocationNotice: null, source: null, createdBy: user.epic, createdAt: now
    };
};

/** DEO proposes one station inside their district. */
export const proposeStation = asyncHandler(async (req, res) => {
    const existing = await listStations();
    const station = proposeOne(req.body, req.user, existing);
    assertCovers(req.authority.assignments, asRecord(station), "This polling station");
    const tx = transaction();
    saveStation(station, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "station.proposed", resource: { type: "station", id: station._id }, jurisdiction: station, after: publicView(station) }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: "Station proposed. It becomes official once the ECI approves it.", data: station });
});

/** DEO imports a list of stations (up to 500). Valid rows are proposed; each invalid row is reported. */
export const importStations = asyncHandler(async (req, res) => {
    const rows = req.body?.stations;
    if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new ApiError(400, "Send 1 to 500 stations.");
    const existing = await listStations();
    const tx = transaction();
    const proposed = []; const rejected = [];
    for (const [index, row] of rows.entries()) {
        try {
            const station = proposeOne(row, req.user, existing);
            assertCovers(req.authority.assignments, asRecord(station), "This polling station");
            saveStation(station, tx);
            existing.push(station);
            proposed.push(station.stationCode);
        } catch (error) {
            if (!error.statusCode) throw error;
            rejected.push({ index, reason: error.message });
        }
    }
    await recordAudit(auditEvent({ actor: req.user, action: "station.imported", resource: { type: "station_import", id: crypto.randomUUID() }, after: { proposed: proposed.length, rejected: rejected.length } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: { proposed, rejected } });
});

/** DEO proposes relocating (or changing the details of) an active station, with a reason. */
export const proposeRelocation = asyncHandler(async (req, res) => {
    const reason = requireReason(req.body?.reason, "relocation");
    const details = parseDetails(req.body);
    const release = await lockStation(req.params.id);
    if (!release) throw new ApiError(409, "This station is being updated.");
    try {
        const station = await getStation(req.params.id);
        if (!station) throw new ApiError(404, "Polling station not found.");
        assertCovers(req.authority.assignments, asRecord(station), "This polling station");
        if (station.status !== "ACTIVE") throw new ApiError(409, "Only an approved station can be relocated.");
        if (station.pendingChange) throw new ApiError(409, "A change to this station is already awaiting approval.");
        const updated = { ...station, pendingChange: { type: "relocate", proposed: details, reason, by: req.user.epic, at: new Date().toISOString() } };
        const tx = transaction();
        saveStation(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "station.relocation_proposed", resource: { type: "station", id: station._id }, jurisdiction: station, before: { name: station.name, address: station.address }, after: { name: details.name, address: details.address }, note: reason }), tx);
        await tx.exec();
        res.json({ success: true, data: updated });
    } finally { await release(); }
});

/** ECI approves the pending change. A relocation also updates the electors of that part. */
export const approveStationChange = asyncHandler(async (req, res) => {
    const release = await lockStation(req.params.id);
    if (!release) throw new ApiError(409, "This station is being updated.");
    try {
        const station = await getStation(req.params.id);
        if (!station) throw new ApiError(404, "Polling station not found.");
        const change = station.pendingChange;
        if (!change) throw new ApiError(409, "Nothing is awaiting approval for this station.");
        if (change.by === req.user.epic) throw new ApiError(403, "The official who proposed a change cannot approve it.");
        const now = new Date().toISOString();
        const version = (station.source?.version ?? 0) + 1;
        const updated = {
            ...station, ...change.proposed, status: "ACTIVE", pendingChange: null,
            source: { authority: "Proposed by DEO, approved by ECI (RP Act 1951, s. 25)", version, verifiedAt: now, approvedBy: req.user.epic },
            history: [...station.history, { type: change.type, from: change.type === "relocate" ? { name: station.name, address: station.address, location: station.location } : null,
                to: change.proposed, reason: change.reason, proposedBy: change.by, approvedBy: req.user.epic, at: now, version }],
            relocationNotice: change.type === "relocate" ? { from: station.name, fromAddress: station.address, to: change.proposed.name, effectiveAt: now, reason: change.reason } : station.relocationNotice
        };
        const tx = transaction();
        saveStation(updated, tx);
        let electorsUpdated = 0;
        if (change.type === "relocate") {
            for (const e of await listElectors()) {
                if (norm(e.state) === norm(station.state) && norm(e.assemblyConstituency) === norm(station.constituency) && String(e.partNumber) === station.partNumber) {
                    saveElector({ ...e, pollingStation: updated.name, updatedAt: now }, tx);
                    electorsUpdated += 1;
                }
            }
        }
        await recordAudit(auditEvent({ actor: req.user, action: `station.${change.type === "create" ? "approved" : "relocated"}`, resource: { type: "station", id: station._id }, jurisdiction: station,
            before: change.type === "relocate" ? { name: station.name, address: station.address } : { status: station.status },
            after: { name: updated.name, address: updated.address, status: "ACTIVE", version, electorsUpdated }, note: change.reason }), tx);
        const liveEvent = recordEvent(opsEvent({ type: "POLLING_STATION_UPDATED", jurisdiction: { ...station, pollingStation: updated.name }, stationId: station._id, payload: { change: change.type, version }, actor: req.user }), tx);
        await tx.exec();
        await publishEvents(liveEvent);
        res.json({ success: true, message: change.type === "create" ? "Station approved." : `Relocation approved; ${electorsUpdated} electors updated.`, data: updated });
    } finally { await release(); }
});

/** ECI rejects the pending change, with a reason. A rejected new station is closed; a rejected relocation is dropped. */
export const rejectStationChange = asyncHandler(async (req, res) => {
    const reason = requireReason(req.body?.reason);
    const release = await lockStation(req.params.id);
    if (!release) throw new ApiError(409, "This station is being updated.");
    try {
        const station = await getStation(req.params.id);
        if (!station?.pendingChange) throw new ApiError(station ? 409 : 404, station ? "Nothing is awaiting approval for this station." : "Polling station not found.");
        const updated = {
            ...station, status: station.pendingChange.type === "create" ? "REJECTED" : station.status, pendingChange: null,
            history: [...station.history, { type: `${station.pendingChange.type}_rejected`, proposed: station.pendingChange.proposed, reason, rejectedBy: req.user.epic, at: new Date().toISOString() }]
        };
        const tx = transaction();
        saveStation(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "station.change_rejected", resource: { type: "station", id: station._id }, jurisdiction: station, note: reason }), tx);
        await tx.exec();
        res.json({ success: true, data: updated });
    } finally { await release(); }
});

/** Officials: stations in their jurisdiction, including proposals. */
export const listStationsForStaff = asyncHandler(async (req, res) => {
    const q = req.query;
    const items = (await listStations())
        .filter((s) => coversAny(req.authority.assignments, asRecord(s)))
        .filter((s) => (!q.status || s.status === q.status) && (!q.pending || Boolean(s.pendingChange)))
        .filter((s) => (!q.state || norm(s.state) === norm(q.state)) && (!q.district || norm(s.district) === norm(q.district)) && (!q.constituency || norm(s.constituency) === norm(q.constituency)))
        .sort((a, b) => a.constituency.localeCompare(b.constituency) || Number(a.partNumber) - Number(b.partNumber));
    res.json({ success: true, data: { items } });
});

/** Public: approved stations, searchable by area. */
export const searchPublicStations = asyncHandler(async (req, res) => {
    const { state, district, constituency } = req.query;
    if (!state) throw new ApiError(400, "Choose a State/UT.");
    const items = (await listStations())
        .filter((s) => s.status === "ACTIVE" && norm(s.state) === norm(state) && (!district || norm(s.district) === norm(district)) && (!constituency || norm(s.constituency) === norm(constituency)))
        .sort((a, b) => a.constituency.localeCompare(b.constituency) || Number(a.partNumber) - Number(b.partNumber))
        .slice(0, 200)
        .map(publicView);
    res.json({ success: true, data: { items } });
});

/** Public: the polling station for an EPIC. Returns only the part and station, no personal details. */
export const lookupStationByEpic = asyncHandler(async (req, res) => {
    const epic = String(req.params.epic ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}\d{7}$/.test(epic)) throw new ApiError(400, "Enter a valid EPIC number.");
    const elector = await getElectorByEpic(epic);
    if (!elector || elector.isActive === false) throw new ApiError(404, "No elector found with that EPIC number.");
    const station = (await listStations()).find((s) => s.status === "ACTIVE" && norm(s.state) === norm(elector.state)
        && norm(s.constituency) === norm(elector.assemblyConstituency) && s.partNumber === String(elector.partNumber));
    res.json({ success: true, data: {
        constituency: elector.assemblyConstituency, partNumber: elector.partNumber ?? null,
        pollingStation: station ? station.name : elector.pollingStation ?? null,
        station: station ? publicView(station) : null
    } });
});

/** Is there an approved station with this name in this part of the constituency? (for staff assignments) */
export const findActiveStation = async ({ state, constituency, pollingStation, partNumber }) =>
    (await listStations()).find((s) => s.status === "ACTIVE" && norm(s.state) === norm(state) && norm(s.constituency) === norm(constituency)
        && (norm(s.name) === norm(pollingStation)) && (!partNumber || s.partNumber === String(partNumber)));
export const constituencyHasStations = async ({ state, constituency }) =>
    (await listStations()).some((s) => s.status === "ACTIVE" && norm(s.state) === norm(state) && norm(s.constituency) === norm(constituency));
