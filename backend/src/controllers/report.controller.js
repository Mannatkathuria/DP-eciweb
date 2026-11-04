// Consolidated reports for the caller's jurisdiction: the DEO's district report to the CEO, the
// CEO's State report to the Commission, and the Commission's national picture (RP Act 1950 and
// 1951 supervision chain). Figures are counts only: no personal data and no vote figures.
// Everything is computed from the records themselves, scoped by the caller's assignments, and
// broken down one level below the caller (national -> State, State -> district,
// district -> constituency).
import { jsonGet, redis } from "../config/redis.js";
import { listAllAssignments } from "../repositories/assignment.repository.js";
import { listChangeRequests } from "../repositories/changeRequest.repository.js";
import { listElections, listNominations, listStations } from "../repositories/election.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
import { listIncidents } from "../repositories/poll.repository.js";
import { listRegistrations } from "../repositories/registration.repository.js";
import { listTasks } from "../repositories/registrationTask.repository.js";
import { assignmentInEffect, hasPermission } from "../services/authority.service.js";
import { electionStage } from "../services/election.service.js";
import { inScope, nowIso, store } from "../services/workflow.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const countBy = (items, fn) => items.reduce((acc, x) => { const k = fn(x) ?? "unknown"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
const areaOfRecord = (r) => ({ state: r.state, district: r.district, constituency: r.assemblyConstituency ?? r.constituency });

/** The level below the caller's widest assignment. */
const breakdownField = (req) => {
    const a = req.authority?.assignments ?? [];
    if (a.some((x) => x.nationwide)) return "state";
    if (a.some((x) => x.jurisdiction?.state && !x.jurisdiction?.district && !x.jurisdiction?.constituency && !x.jurisdiction?.parliamentaryConstituency)) return "district";
    return "constituency";
};

const loadSet = async (set, prefix) => (await Promise.all((await redis().sMembers(set)).map((id) => jsonGet(`${prefix}${id}`)))).filter(Boolean);

export const summary = asyncHandler(async (req, res) => {
    const see = (area) => inScope(req, area);
    const field = breakdownField(req);

    const [electors, registrations, changes, tasks, stations, nominations, elections, assignments, objections] = await Promise.all([
        listElectors(), listRegistrations(), listChangeRequests(), listTasks(), listStations(), listNominations(), listElections(), listAllAssignments(),
        loadSet("objections:all", "objection:")
    ]);
    const [eforms, permissions, expenditure, reports, directions, nodalTasks, complaints, appeals] = await Promise.all(
        ["eform", "campaign-permission", "expenditure", "observer-report", "direction", "nodal-task", "mcc-complaint", "roll-appeal"].map((k) => store(k).list()));

    const myElectors = electors.filter((e) => e.isActive !== false && see(areaOfRecord(e)));
    const myRegs = registrations.filter((r) => see(areaOfRecord(r)));
    const changeArea = (c) => areaOfRecord({ ...(c.currentRecord ?? {}), ...(c.requestedChanges?.assemblyConstituency ? c.requestedChanges : {}) });
    const myChanges = changes.filter((c) => see(changeArea(c)));
    const myObjections = objections.filter((o) => see(areaOfRecord(o.target ?? {})));
    const myForms = eforms.filter((f) => see(f.jurisdiction));
    const myTasks = tasks.filter((t) => see(t.jurisdiction ?? areaOfRecord(t)));
    const myStations = stations.filter((s) => see(s));
    const myNominations = nominations.filter((n) => see(n));
    const myAssignments = assignments.filter((a) => assignmentInEffect(a) && a.jurisdiction && see({ state: a.jurisdiction.state, district: a.jurisdiction.district, constituency: a.jurisdiction.constituency }));
    const myPermissions = permissions.filter((p) => see(p.jurisdiction));
    const myExpenditure = expenditure.filter((e) => !e.supersededBy && see(e.jurisdiction));
    const myDirections = directions.filter((d) => see(d.jurisdiction));
    const myNodal = nodalTasks.filter((t) => see(t.jurisdiction));

    const incidents = [];
    for (const e of elections) for (const i of await listIncidents(e._id)) if (see(i)) incidents.push(i);
    const openIncidents = incidents.filter((i) => i.status !== "resolved");

    const canObserver = ["observer:view", "national:view", "national:manage", "report:national"].some((p) => hasPermission(req.user, p));
    const myReports = canObserver ? reports.filter((r) => see(r.jurisdiction)) : [];

    const pendingApplications = myRegs.filter((r) => ["pending", "field_verified"].includes(r.status)).length
        + myChanges.filter((c) => ["pending", "field_verified"].includes(c.status)).length
        + myForms.filter((f) => ["submitted", "field_verified"].includes(f.status)).length
        + myObjections.filter((o) => ["notice", "pending_verification", "field_verified"].includes(o.status)).length;

    // One row per area one level down.
    const rows = new Map();
    const row = (name) => { if (!rows.has(name)) rows.set(name, { area: name, electors: 0, pendingApplications: 0, stations: 0, stationsPending: 0, openIncidents: 0, nominations: 0 }); return rows.get(name); };
    const key = (r) => r?.[field] ?? (field === "constituency" ? r?.assemblyConstituency : null);
    for (const e of myElectors) if (key(areaOfRecord(e))) row(key(areaOfRecord(e))).electors += 1;
    for (const r of myRegs.filter((x) => ["pending", "field_verified"].includes(x.status))) if (key(areaOfRecord(r))) row(key(areaOfRecord(r))).pendingApplications += 1;
    for (const f of myForms.filter((x) => ["submitted", "field_verified"].includes(x.status))) if (key(f.jurisdiction)) row(key(f.jurisdiction)).pendingApplications += 1;
    for (const s of myStations) { if (!key(s)) continue; if (s.status === "ACTIVE") row(key(s)).stations += 1; if (s.pendingChange) row(key(s)).stationsPending += 1; }
    for (const i of openIncidents) if (key(i)) row(key(i)).openIncidents += 1;
    for (const n of myNominations) if (key(n)) row(key(n)).nominations += 1;

    res.json({ success: true, data: {
        generatedAt: nowIso(), level: field, scope: (req.authority?.assignments ?? []).map((a) => a.nationwide ? { nationwide: true } : a.jurisdiction),
        roll: {
            electors: myElectors.length, byGender: countBy(myElectors, (e) => e.gender), serviceVoters: myElectors.filter((e) => e.electorCategory === "service_voter").length,
            overseasElectors: myElectors.filter((e) => e.electorCategory === "overseas_elector").length, pwd: myElectors.filter((e) => e.pwd).length,
            form6: countBy(myRegs, (r) => r.status), form8: countBy(myChanges, (c) => c.status), form7: countBy(myObjections, (o) => o.status),
            otherForms: countBy(myForms, (f) => `${f.formCode}:${f.status}`), newVoterTasks: countBy(myTasks, (t) => t.status), pendingApplications
        },
        stations: { byStatus: countBy(myStations, (s) => s.status), pendingChanges: myStations.filter((s) => s.pendingChange).length,
            byStage: countBy(myStations.filter((s) => s.pendingChange), (s) => s.pendingChange.stage ?? "DISTRICT_REVIEW") },
        staff: { active: myAssignments.length, byRole: countBy(myAssignments, (a) => a.role) },
        elections: elections.filter((e) => myStations.some((s) => e.states.includes(s.state)) || myNominations.some((n) => n.electionId === e._id) || (req.authority?.assignments ?? []).some((a) => a.nationwide))
            .map((e) => ({ _id: e._id, name: e.name, stage: electionStage(e), pollDate: e.schedule.pollDate, countingDate: e.schedule.countingDate })),
        nominations: countBy(myNominations, (n) => n.status),
        incidents: { open: openIncidents.length, bySeverity: countBy(openIncidents, (i) => i.severity), total: incidents.length },
        permissions: countBy(myPermissions, (p) => p.status),
        expenditure: { entries: myExpenditure.length, total: myExpenditure.reduce((n, e) => n + e.amount, 0), flagged: myExpenditure.filter((e) => e.flags?.length).length },
        observerReports: canObserver ? { total: myReports.length, open: myReports.filter((r) => r.status !== "closed").length, bySeverity: countBy(myReports.filter((r) => r.status !== "closed"), (r) => r.severity) } : null,
        directions: countBy(myDirections, (d) => d.status),
        nodalTasks: countBy(myNodal, (t) => t.status),
        complaints: countBy(complaints.filter((c) => see(c.jurisdiction)), (c) => c.status),
        seizures: complaints.filter((c) => see(c.jurisdiction)).flatMap((c) => c.seizures ?? []).reduce((n, x) => n + x.value, 0),
        appeals: countBy(appeals.filter((a) => see(a.jurisdiction)), (a) => a.status),
        breakdown: [...rows.values()].sort((a, b) => a.area.localeCompare(b.area))
    } });
});

/**
 * Booth level agents, BLOs and BLO supervisors: the roll of their part (or constituency), as it
 * is published: serial, EPIC, name, relative, gender, age. No addresses, documents or contact
 * details (Registration of Electors Rules, 1960: the roll is open to inspection; documents are not).
 */
export const rollForPart = asyncHandler(async (req, res) => {
    const mine = (req.authority?.assignments ?? []).filter((a) => a.jurisdiction?.constituency);
    if (!mine.length) return res.json({ success: true, data: { items: [], parts: [] } });
    const wantedPart = String(req.query.partNumber ?? "").trim();
    const electors = (await listElectors()).filter((e) => e.isActive !== false && mine.some((a) => {
        const j = a.jurisdiction;
        if (j.state !== e.state || j.constituency !== e.assemblyConstituency) return false;
        return !j.partNumber || String(j.partNumber) === String(e.partNumber);
    }));
    const parts = [...new Set(electors.map((e) => String(e.partNumber)))].sort((a, b) => Number(a) - Number(b));
    const items = electors.filter((e) => !wantedPart || String(e.partNumber) === wantedPart)
        .sort((a, b) => Number(a.partNumber) - Number(b.partNumber) || (a.serialNumber ?? 0) - (b.serialNumber ?? 0))
        .slice(0, 2000)
        .map((e) => ({ serialNumber: e.serialNumber ?? null, epic: e.epic, name: e.name, relativeName: e.relativeName ?? null, relationType: e.relationType ?? null,
            gender: e.gender, age: e.age ?? null, partNumber: e.partNumber, pollingStation: e.pollingStation, constituency: e.assemblyConstituency }));
    res.json({ success: true, data: { items, parts, total: items.length } });
});
