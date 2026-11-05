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
import { nearbyStations, searchStations, stationsInBounds } from "../services/readModel.service.js";
import { store } from "../services/workflow.service.js";

// Polling stations are provided by the DEO with the prior approval of the Election Commission
// (RP Act 1951, s. 25). A proposal (a new station or a relocation) is a controlled change request
// that moves through these stages, each by a different authority:
//
//   DISTRICT_REVIEW           the DEO drafts it (sector officers, ROs, EROs, BLOs and party agents
//                             may report a problem with a station first: see station issues)
//   STAKEHOLDER_CONSULTATION  the DEO records the consultation with recognised political parties
//   SENT_TO_CEO               the DEO forwards the reasoned proposal to the Chief Electoral Officer
//   SENT_TO_ECI               the CEO scrutinises it and forwards it to the Commission (or returns it)
//   CLARIFICATION_REQUIRED    the Commission asks the DEO for more (the DEO answers and re-forwards)
//   ECI_APPROVED              the Commission's prior approval, with its order reference
//   (published)               the DEO issues the final order and publishes the list: only now does
//                             the station become ACTIVE (public, usable for staff and agents)
//
// The proposer can never approve their own change, nobody can skip a stage, and every step is
// audited. Each published change is a new version, and a relocation moves every elector of that
// part to the new station in the same transaction.

const ACCESSIBILITY = ["ramp", "wheelchair", "drinkingWater", "toilet", "shade", "signage"];
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const norm = (v) => clean(v).toLowerCase();
const slug = (v) => norm(v).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
const asRecord = (s) => ({ ...s, assemblyConstituency: s.constituency });
const OPEN = ["PROPOSED", "ACTIVE"];
export const STAGES = {
    DISTRICT_REVIEW: "Draft with the DEO",
    STAKEHOLDER_CONSULTATION: "Political parties consulted",
    SENT_TO_CEO: "With the Chief Electoral Officer",
    SENT_TO_ECI: "With the Election Commission",
    CLARIFICATION_REQUIRED: "Commission asked for clarification",
    ECI_APPROVED: "Approved by the Commission, awaiting the DEO's publication"
};
const stageOf = (change) => change?.stage ?? "DISTRICT_REVIEW";
const step = (change, stage, user, note = null, extra = {}) => ({
    ...change, stage, steps: [...(change.steps ?? []), { stage, by: user.epic, role: user.role, at: new Date().toISOString(), note, ...extra }]
});

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
    relocationNotice: s.relocationNotice ?? null, version: s.source?.version ?? null, verifiedAt: s.source?.verifiedAt ?? null,
    // The latest BLO facility survey: the score, what is missing and distances (no photo, no surveyor).
    facilitySurvey: s.facilitySurvey ? { at: s.facilitySurvey.at, amfScore: s.facilitySurvey.amfScore, missing: s.facilitySurvey.missing, distances: s.facilitySurvey.distances } : null
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
        pendingChange: { type: "create", proposed: details, reason: clean(body.reason) || null, by: user.epic, at: now, stage: "DISTRICT_REVIEW", steps: [{ stage: "DISTRICT_REVIEW", by: user.epic, role: user.role, at: now }], consultation: null },
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
    res.status(201).json({ success: true, message: "Station drafted. Record the consultation with political parties, then forward it to the CEO.", data: station });
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
        const at = new Date().toISOString();
        const updated = { ...station, pendingChange: { type: "relocate", proposed: details, reason, by: req.user.epic, at, stage: "DISTRICT_REVIEW", steps: [{ stage: "DISTRICT_REVIEW", by: req.user.epic, role: req.user.role, at }], consultation: null } };
        const tx = transaction();
        saveStation(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "station.relocation_proposed", resource: { type: "station", id: station._id }, jurisdiction: station, before: { name: station.name, address: station.address }, after: { name: details.name, address: details.address }, note: reason }), tx);
        await tx.exec();
        res.json({ success: true, data: updated });
    } finally { await release(); }
});

/** Runs `fn(station, change)` on a station with a pending change, under its lock and jurisdiction check. */
const withPending = async (req, fn, { scope = true } = {}) => {
    const release = await lockStation(req.params.id);
    if (!release) throw new ApiError(409, "This station is being updated.");
    try {
        const station = await getStation(req.params.id);
        if (!station) throw new ApiError(404, "Polling station not found.");
        if (scope) assertCovers(req.authority.assignments, asRecord(station), "This polling station");
        if (!station.pendingChange) throw new ApiError(409, "Nothing is awaiting a decision for this station.");
        return await fn(station, station.pendingChange);
    } finally { await release(); }
};
const saveStep = async (req, station, change, action, note) => {
    const updated = { ...station, pendingChange: change };
    const tx = transaction();
    saveStation(updated, tx);
    await recordAudit(auditEvent({ actor: req.user, action: `station.${action}`, resource: { type: "station", id: station._id }, jurisdiction: station,
        before: { stage: stageOf(station.pendingChange) }, after: { stage: change.stage, type: change.type }, note }), tx);
    await tx.exec();
    return updated;
};

/** DEO: record the consultation with recognised political parties (and other stakeholders). */
export const recordConsultation = asyncHandler(async (req, res) => {
    const updated = await withPending(req, async (station, change) => {
        if (!["DISTRICT_REVIEW", "STAKEHOLDER_CONSULTATION", "CLARIFICATION_REQUIRED"].includes(stageOf(change))) throw new ApiError(409, "The consultation is recorded before the proposal leaves the district.");
        const parties = clean(req.body?.parties).slice(0, 500);
        if (parties.length < 3) throw new ApiError(400, "Name the political parties and others consulted.");
        const meetingDate = clean(req.body?.meetingDate);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) throw new ApiError(400, "Give the date of the consultation (YYYY-MM-DD).");
        const outcome = requireReason(req.body?.outcome, "consultation outcome");
        const consultation = { parties, meetingDate, outcome, objections: clean(req.body?.objections).slice(0, 1000) || null, by: req.user.epic, at: new Date().toISOString() };
        const next = step({ ...change, consultation }, stageOf(change) === "CLARIFICATION_REQUIRED" ? "CLARIFICATION_REQUIRED" : "STAKEHOLDER_CONSULTATION", req.user, outcome);
        return saveStep(req, station, next, "consultation_recorded", outcome);
    });
    res.json({ success: true, message: "Consultation recorded. Forward the proposal to the CEO next.", data: updated });
});

/** DEO: forward the reasoned proposal to the CEO (after consultation, or with the clarification asked for). */
export const forwardToCeo = asyncHandler(async (req, res) => {
    const updated = await withPending(req, async (station, change) => {
        const stage = stageOf(change);
        if (!["STAKEHOLDER_CONSULTATION", "CLARIFICATION_REQUIRED"].includes(stage)) {
            throw new ApiError(409, stage === "DISTRICT_REVIEW" ? "Record the consultation with political parties first." : `The proposal is ${STAGES[stage].toLowerCase()}.`);
        }
        if (!change.consultation) throw new ApiError(409, "Record the consultation with political parties first.");
        const note = stage === "CLARIFICATION_REQUIRED" ? requireReason(req.body?.note, "clarification") : clean(req.body?.note).slice(0, 500) || null;
        return saveStep(req, station, step(change, "SENT_TO_CEO", req.user, note), "forwarded_to_ceo", note);
    });
    res.json({ success: true, message: "Sent to the Chief Electoral Officer.", data: updated });
});

/** CEO: forward to the Commission with remarks, or return to the DEO. */
export const ceoForward = asyncHandler(async (req, res) => {
    const updated = await withPending(req, async (station, change) => {
        if (stageOf(change) !== "SENT_TO_CEO") throw new ApiError(409, "This proposal is not with the CEO.");
        const remarks = requireReason(req.body?.remarks, "CEO's remarks");
        if (req.body?.return === true) return saveStep(req, station, step(change, "DISTRICT_REVIEW", req.user, remarks, { returned: true }), "returned_by_ceo", remarks);
        return saveStep(req, station, step(change, "SENT_TO_ECI", req.user, remarks), "forwarded_to_eci", remarks);
    });
    res.json({ success: true, message: updated.pendingChange.stage === "SENT_TO_ECI" ? "Forwarded to the Election Commission." : "Returned to the DEO.", data: updated });
});

/** Commission: ask the DEO for clarification. */
export const seekClarification = asyncHandler(async (req, res) => {
    const updated = await withPending(req, async (station, change) => {
        if (stageOf(change) !== "SENT_TO_ECI") throw new ApiError(409, "Only a proposal with the Commission can be sent back for clarification.");
        const note = requireReason(req.body?.note, "clarification request");
        return saveStep(req, station, step(change, "CLARIFICATION_REQUIRED", req.user, note), "clarification_sought", note);
    }, { scope: false });
    res.json({ success: true, data: updated });
});

/**
 * Commission: prior approval (RP Act 1951, s. 25), with the Commission's order reference. The
 * station does not change yet: the DEO publishes the approved change next.
 */
export const approveStationChange = asyncHandler(async (req, res) => {
    const updated = await withPending(req, async (station, change) => {
        if (change.by === req.user.epic) throw new ApiError(403, "The official who proposed a change cannot approve it.");
        if (stageOf(change) !== "SENT_TO_ECI") throw new ApiError(409, stageOf(change) === "ECI_APPROVED" ? "The Commission has already approved this change." : "The proposal has not reached the Commission through the CEO yet.");
        const eciReference = clean(req.body?.eciReference).slice(0, 120);
        if (eciReference.length < 4) throw new ApiError(400, "Give the reference of the Commission's approval order.");
        const note = clean(req.body?.note).slice(0, 500) || null;
        return saveStep(req, station, step({ ...change, eciApproval: { reference: eciReference, by: req.user.epic, at: new Date().toISOString(), note } }, "ECI_APPROVED", req.user, note), "eci_approved", eciReference);
    }, { scope: false });
    res.json({ success: true, message: "Prior approval recorded. The DEO now issues the final order and publishes the list.", data: updated });
});

/** DEO: final order and publication. Only now does the station (or its new location) take effect. */
export const publishStationChange = asyncHandler(async (req, res) => {
    const result = await withPending(req, async (station, change) => {
        if (stageOf(change) !== "ECI_APPROVED" || !change.eciApproval) throw new ApiError(409, "The Commission's prior approval is required before publication.");
        const orderReference = clean(req.body?.orderReference).slice(0, 120) || `DEO/${station.district}/${new Date().getUTCFullYear()}/${station.partNumber}`;
        const now = new Date().toISOString();
        const version = (station.source?.version ?? 0) + 1;
        const updated = {
            ...station, ...change.proposed, status: "ACTIVE", pendingChange: null,
            source: { authority: "Provided by the DEO with the prior approval of the ECI (RP Act 1951, s. 25)", version, verifiedAt: now, approvedBy: change.eciApproval.by, eciReference: change.eciApproval.reference, deoOrder: orderReference, publishedBy: req.user.epic },
            history: [...station.history, { type: change.type, from: change.type === "relocate" ? { name: station.name, address: station.address, location: station.location } : null,
                to: change.proposed, reason: change.reason, proposedBy: change.by, approvedBy: change.eciApproval.by, eciReference: change.eciApproval.reference,
                consultation: change.consultation, steps: change.steps, publishedBy: req.user.epic, deoOrder: orderReference, at: now, version }],
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
        await recordAudit(auditEvent({ actor: req.user, action: `station.${change.type === "create" ? "published" : "relocated"}`, resource: { type: "station", id: station._id }, jurisdiction: station,
            before: change.type === "relocate" ? { name: station.name, address: station.address } : { status: station.status },
            after: { name: updated.name, address: updated.address, status: "ACTIVE", version, electorsUpdated, eciReference: change.eciApproval.reference, deoOrder: orderReference }, note: change.reason }), tx);
        const liveEvent = recordEvent(opsEvent({ type: "POLLING_STATION_UPDATED", jurisdiction: { ...station, pollingStation: updated.name }, stationId: station._id, payload: { change: change.type, version }, actor: req.user }), tx);
        await tx.exec();
        await publishEvents(liveEvent);
        return { updated, electorsUpdated, type: change.type };
    });
    res.json({ success: true, message: result.type === "create" ? "Station published." : `Relocation published; ${result.electorsUpdated} electors updated.`, data: result.updated });
});

/** ECI rejects the pending change, with a reason. A rejected new station is closed; a rejected relocation is dropped. */
export const rejectStationChange = asyncHandler(async (req, res) => {
    const reason = requireReason(req.body?.reason);
    const release = await lockStation(req.params.id);
    if (!release) throw new ApiError(409, "This station is being updated.");
    try {
        const station = await getStation(req.params.id);
        if (!station?.pendingChange) throw new ApiError(station ? 409 : 404, station ? "Nothing is awaiting approval for this station." : "Polling station not found.");
        if (!["SENT_TO_ECI", "CLARIFICATION_REQUIRED"].includes(stageOf(station.pendingChange))) throw new ApiError(409, "The Commission decides a proposal once the CEO has forwarded it.");
        const updated = {
            ...station, status: station.pendingChange.type === "create" ? "REJECTED" : station.status, pendingChange: null,
            history: [...station.history, { type: `${station.pendingChange.type}_rejected`, proposed: station.pendingChange.proposed, reason, rejectedBy: req.user.epic, steps: station.pendingChange.steps ?? [], at: new Date().toISOString() }]
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
        .sort((a, b) => a.constituency.localeCompare(b.constituency) || Number(a.partNumber) - Number(b.partNumber))
        .map((s) => (s.pendingChange ? { ...s, pendingChange: { ...s.pendingChange, stage: stageOf(s.pendingChange), stageText: STAGES[stageOf(s.pendingChange)] } } : s));
    res.json({ success: true, data: { items, stages: STAGES } });
});

/** Public: approved stations, searchable by area and (optionally) by words in the name or address. */
export const searchPublicStations = asyncHandler(async (req, res) => {
    const { state, district, constituency } = req.query;
    if (!state) throw new ApiError(400, "Choose a State/UT.");
    const q = clean(req.query.q).slice(0, 100);
    const { items, source } = await searchStations({ state, district, constituency, q, limit: 200 });
    res.json({ success: true, data: { items: items.map(publicView), source } });
});

/** Public: approved stations nearest to a point (MongoDB 2dsphere index, or computed over Redis). */
export const nearbyPublicStations = asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!(lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98)) throw new ApiError(400, "Give a latitude and longitude inside India.");
    const radiusKm = req.query.radiusKm === undefined ? 5 : Number(req.query.radiusKm);
    if (!(radiusKm > 0 && radiusKm <= 50)) throw new ApiError(400, "Search radius must be between 0 and 50 km.");
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const { items, source } = await nearbyStations({ lat, lng, radiusKm, limit });
    res.json({ success: true, data: { items: items.map((s) => ({ ...publicView(s), distanceKm: s.distanceKm })), source, radiusKm } });
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

// ---- Station issues: anyone working in the area reports a problem; the DEO acts on it ----

const issues = store("station-issue");
export const ISSUE_KINDS = {
    damaged: "Building damaged or unsafe", unavailable: "Building no longer available", inaccessible: "Not accessible (ramp, distance, terrain)",
    overcrowded: "Too many electors for one station", facilities: "Missing assured minimum facilities", security: "Security concern", other: "Other"
};

/** Sector officer, RO, ERO, BLO, booth level agent, candidate...: report a problem with a station. */
export const reportStationIssue = asyncHandler(async (req, res) => {
    const station = await getStation(String(req.body?.stationId ?? ""));
    if (!station) throw new ApiError(404, "Polling station not found.");
    assertCovers(req.authority.assignments, asRecord(station), "This polling station");
    const kind = String(req.body?.kind ?? "");
    if (!ISSUE_KINDS[kind]) throw new ApiError(400, `kind must be one of: ${Object.keys(ISSUE_KINDS).join(", ")}.`);
    const details = clean(req.body?.details).slice(0, 1500);
    if (details.length < 10) throw new ApiError(400, "Describe the problem (at least 10 characters).");
    const issue = { _id: crypto.randomUUID(), stationId: station._id, stationName: station.name, partNumber: station.partNumber, state: station.state, district: station.district, constituency: station.constituency,
        kind, details, reportedBy: { epic: req.user.epic, role: req.user.role }, at: new Date().toISOString(), status: "open", resolution: null };
    const tx = transaction();
    issues.save(issue, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "station.issue_reported", resource: { type: "station", id: station._id }, jurisdiction: station, after: { kind } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: "Reported to the District Election Officer.", data: issue });
});

export const listStationIssues = asyncHandler(async (req, res) => {
    const items = (await issues.list()).filter((i) => coversAny(req.authority.assignments, asRecord(i)) && (!req.query.status || i.status === req.query.status))
        .sort((a, b) => b.at.localeCompare(a.at));
    // The approved stations the caller may report on.
    const stations = (await listStations()).filter((s) => s.status === "ACTIVE" && coversAny(req.authority.assignments, asRecord(s)))
        .sort((a, b) => a.constituency.localeCompare(b.constituency) || Number(a.partNumber) - Number(b.partNumber))
        .map((s) => ({ _id: s._id, name: s.name, partNumber: s.partNumber, constituency: s.constituency }));
    res.json({ success: true, data: { items, kinds: ISSUE_KINDS, stations } });
});

/** DEO: close an issue, saying what was done (for example, a relocation was proposed). */
export const closeStationIssue = asyncHandler(async (req, res) => {
    const result = await issues.withLock(req.params.issueId, async () => {
        const i = await issues.get(req.params.issueId);
        if (!i) throw new ApiError(404, "Issue not found.");
        assertCovers(req.authority.assignments, asRecord(i), "This issue");
        if (i.status !== "open") throw new ApiError(409, "This issue is already closed.");
        const resolution = requireReason(req.body?.resolution, "resolution");
        const updated = { ...i, status: "closed", resolution: { note: resolution, by: req.user.epic, at: new Date().toISOString() } };
        const tx = transaction();
        issues.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "station.issue_closed", resource: { type: "station", id: i.stationId }, jurisdiction: asRecord(i), note: resolution }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: result });
});

/**
 * Public: approved polling stations inside the visible map area.
 */
export const mapPublicStations = asyncHandler(async (req, res) => {
    const values = String(req.query.bbox ?? "")
        .split(",")
        .map(Number);

    if (
        values.length !== 4 ||
        !values.every(Number.isFinite)
    ) {
        throw new ApiError(
            400,
            "Give bbox as west,south,east,north."
        );
    }

    const [west, south, east, north] = values;

    if (
        west < 68 || east > 98 ||
        south < 6 || north > 38 ||
        west >= east || south >= north
    ) {
        throw new ApiError(400, "Invalid map bounds for India.");
    }

    const limit = Math.min(
        2000,
        Math.max(1, Number.parseInt(req.query.limit, 10) || 2000)
    );

    const { items, source } = await stationsInBounds({
        west,
        south,
        east,
        north,
        limit
    });

    res.json({
        success: true,
        data: {
            items: items.map(publicView),
            source,
            limit
        }
    });
});