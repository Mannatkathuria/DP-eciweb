// Police and security arrangements (ECI Handbook for Police Officers; RP Act 1951, s. 28A).
//
//   security:plan        (district police officer, state police nodal officer)
//                        vulnerability assessment of polling stations (normal / sensitive /
//                        critical) and the force deployment plan.
//   security:coordinate  (sector police officer and the above)
//                        situation reports from the field: law and order, routes, strong rooms.
//
// Security information is internal: it is shown to the police chain, the civil election officers
// of the area (sector officer, RO, DEO, CEO), the Commission and observers who read records. It is
// never shown to candidates, agents or the public. Police roles never change election records.
import { transaction } from "../config/redis.js";
import { getStation, listStations } from "../repositories/election.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { actorOf, areaOf, asRecord, assertScope, clean, dateOf, inScope, newId, nowIso, oneOf, page, requireText, store } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const assessments = store("security-assessment");
const deployments = store("security-deployment");
const sitreps = store("security-sitrep");

export const CATEGORIES = { normal: "Normal", sensitive: "Sensitive", critical: "Critical (vulnerable)" };
export const VULNERABILITY_REASONS = {
    past_violence: "Violence or booth capturing in past elections", intimidation: "Reports of intimidation of voters",
    turnout_anomaly: "Very high or very low turnout, or one candidate taking most votes, in the past",
    missing_epic: "Many electors without EPIC or many deletions", remote: "Remote or difficult to reach",
    left_wing: "Area affected by extremism", communal: "Communal tension", other: "Other"
};
export const FORCE_TYPES = { capf: "Central Armed Police Forces", state_armed: "State Armed Police", district_police: "District police", home_guard: "Home Guards" };
export const DUTIES = { static: "Static guard at polling stations", sector_mobile: "Sector mobile party", qrt: "Quick reaction team", flying_squad: "Flying squad support", strong_room: "Strong room guard", escort: "Escort of polling parties and EVMs", checkpost: "Inter-state or district check post" };
export const SITREP_KINDS = { law_and_order: "Law and order", route: "Route and movement", strong_room: "Strong room status", threat: "Threat input", seizure: "Seizure (cash, liquor, drugs, freebies)", other: "Other" };
const SITREP_STATUS = ["normal", "alert", "incident"];

const stationArea = (s) => ({ state: s.state, district: s.district, constituency: s.constituency });

/** Planner: categorise one approved polling station. A new assessment supersedes the last one. */
export const assessStation = asyncHandler(async (req, res) => {
    const station = await getStation(req.params.stationId);
    if (!station || station.status !== "ACTIVE") throw new ApiError(404, "Approved polling station not found.");
    assertScope(req, stationArea(station), "This polling station");
    const body = req.body ?? {};
    const category = oneOf(body.category, CATEGORIES, "category");
    const reasons = (Array.isArray(body.reasons) ? body.reasons : []).filter((r) => VULNERABILITY_REASONS[r]);
    if (category !== "normal" && !reasons.length) throw new ApiError(400, "Give at least one reason for a sensitive or critical station.");
    const n = (v) => Math.max(0, Math.min(500, Number.parseInt(v, 10) || 0));
    const previous = (await assessments.list()).filter((a) => a.stationId === station._id && !a.supersededBy).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
    const item = {
        _id: newId(), stationId: station._id, stationName: station.name, partNumber: station.partNumber, jurisdiction: stationArea(station),
        category, reasons, note: clean(body.note, 800) || null,
        measures: { capf: n(body.capf), statePolice: n(body.statePolice), homeGuards: n(body.homeGuards), microObserver: body.microObserver === true, webcasting: body.webcasting === true },
        by: actorOf(req.user), at: nowIso(), supersededBy: null, previous: previous?._id ?? null
    };
    const tx = transaction();
    assessments.save(item, tx);
    if (previous) assessments.save({ ...previous, supersededBy: item._id }, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "security.station_assessed", resource: { type: "security_assessment", id: item._id }, jurisdiction: asRecord({ ...item.jurisdiction, pollingStation: station.name }),
        before: previous ? { category: previous.category } : null, after: { category, reasons } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: item });
});

/** Planner: a force deployment for an area and duty. */
export const addDeployment = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const area = areaOf(body, body.constituency ? "constituency" : "district");
    assertScope(req, area, "This area");
    const strength = Number.parseInt(body.strength, 10);
    if (!(strength >= 1 && strength <= 5000)) throw new ApiError(400, "Strength must be between 1 and 5000 personnel.");
    const from = dateOf(body.from, "From"), to = dateOf(body.to, "To");
    if (to < from) throw new ApiError(400, "The deployment must end on or after it starts.");
    const item = {
        _id: newId(), jurisdiction: area, electionId: clean(body.electionId, 80) || null, unit: requireText(body.unit, "Unit", { min: 2, max: 120 }),
        forceType: oneOf(body.forceType, FORCE_TYPES, "forceType"), duty: oneOf(body.duty, DUTIES, "duty"), strength, from, to,
        stations: (Array.isArray(body.stations) ? body.stations : []).map((s) => clean(s, 80)).filter(Boolean).slice(0, 200),
        inCharge: clean(body.inCharge, 120) || null, status: "planned", by: actorOf(req.user), at: nowIso(), updates: []
    };
    const tx = transaction();
    deployments.save(item, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "security.deployment_planned", resource: { type: "security_deployment", id: item._id }, jurisdiction: asRecord(area), after: { forceType: item.forceType, duty: item.duty, strength } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: item });
});

/** Police: mark a deployment as deployed, changed or withdrawn. */
export const updateDeployment = asyncHandler(async (req, res) => {
    const result = await deployments.withLock(req.params.id, async () => {
        const d = await deployments.get(req.params.id);
        if (!d) throw new ApiError(404, "Deployment not found.");
        assertScope(req, d.jurisdiction, "This deployment");
        const status = oneOf(req.body?.status, ["planned", "deployed", "withdrawn"], "status");
        const updated = { ...d, status, updates: [...d.updates, { status, note: clean(req.body?.note, 500) || null, by: actorOf(req.user), at: nowIso() }] };
        const tx = transaction();
        deployments.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "security.deployment_updated", resource: { type: "security_deployment", id: d._id }, jurisdiction: asRecord(d.jurisdiction), before: { status: d.status }, after: { status } }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: result });
});

/** Police in the field: a situation report. */
export const addSitrep = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const area = areaOf(body, body.constituency ? "constituency" : "district");
    assertScope(req, area, "This area");
    const item = {
        _id: newId(), jurisdiction: area, electionId: clean(body.electionId, 80) || null, kind: oneOf(body.kind, SITREP_KINDS, "kind"),
        status: oneOf(body.status ?? "normal", SITREP_STATUS, "status"), location: clean(body.location, 200) || null,
        details: requireText(body.details, "Details", { min: 5, max: 2000 }), by: actorOf(req.user), at: nowIso()
    };
    const tx = transaction();
    sitreps.save(item, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "security.sitrep", resource: { type: "security_sitrep", id: item._id }, jurisdiction: asRecord(area), after: { kind: item.kind, status: item.status } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: item });
});

/** Everyone allowed: the security picture of the caller's jurisdiction. */
export const securityOverview = asyncHandler(async (req, res) => {
    const stations = (await listStations()).filter((s) => s.status === "ACTIVE" && inScope(req, stationArea(s)));
    const current = (await assessments.list()).filter((a) => !a.supersededBy && inScope(req, a.jurisdiction));
    const byStation = new Map(current.map((a) => [a.stationId, a]));
    const rows = stations.map((s) => ({ stationId: s._id, stationName: s.name, partNumber: s.partNumber, constituency: s.constituency, district: s.district, assessment: byStation.get(s._id) ?? null }))
        .sort((a, b) => a.constituency.localeCompare(b.constituency) || Number(a.partNumber) - Number(b.partNumber));
    const counts = { normal: 0, sensitive: 0, critical: 0, unassessed: 0 };
    for (const r of rows) counts[r.assessment?.category ?? "unassessed"] += 1;
    const deps = (await deployments.list()).filter((d) => inScope(req, d.jurisdiction));
    const reps = (await sitreps.list()).filter((s) => inScope(req, s.jurisdiction));
    res.json({ success: true, data: {
        stations: rows, counts, deployments: page(deps, { limit: 200 }, "at"), sitreps: page(reps, req.query, "at"),
        force: deps.filter((d) => d.status !== "withdrawn").reduce((acc, d) => ({ ...acc, [d.forceType]: (acc[d.forceType] ?? 0) + d.strength }), {}),
        lists: { categories: CATEGORIES, reasons: VULNERABILITY_REASONS, forceTypes: FORCE_TYPES, duties: DUTIES, sitrepKinds: SITREP_KINDS },
        can: { plan: hasPermission(req.user, "security:plan"), coordinate: hasPermission(req.user, "security:coordinate") },
        notice: "Security information is internal. Do not share it with candidates, agents or the public."
    } });
});

export const listAllAssessments = () => assessments.list();
export const listAllSitreps = () => sitreps.list();
