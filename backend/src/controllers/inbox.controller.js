// One inbox for every officer: the work waiting for them across the platform, with a due date,
// how long it has waited, a priority, and the desk tab where it is done. It reads the workflows'
// own records (nothing is copied), so an item leaves the inbox as soon as it is acted on.
//
// Priority: overdue -> high; due within a day (or a time-critical complaint) -> medium; else normal.
// Escalation: supervisors (DEO, CEO, the Commission) also see work in their area that is overdue
// by more than its whole time limit again, even though someone else must act on it.
//
// The workload view counts, per officer and per district, what was received, what is pending,
// how long decisions took, what waits for field verification, what is overdue or reassigned, and
// how complaints and grievances were disposed of.
import { listRegistrations } from "../repositories/registration.repository.js";
import { listTasks } from "../repositories/registrationTask.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { inScope, store } from "../services/workflow.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const H = 3600000;
// Time limits (hours) used for due dates. They are working targets for the demonstration, set from
// the Commission's guidance where there is one (cVIGIL 100 minutes; disposal of claims within the
// revision period), and are the same for every officer.
export const LIMITS = {
    field: 7 * 24, decide: 7 * 24, form6Field: 7 * 24, form6Decide: 7 * 24, flagEro: 7 * 24, flagBlo: 5 * 24,
    grievance: 72, complaintDispatch: 0.25, complaintInvestigate: 0.75, complaintDispose: 1.67,
    appeal: 15 * 24, permission: 24, indexCard: 72, issue: 48, task: 7 * 24
};

const areaOfEform = (f) => f.jurisdiction;
const areaOfReg = (r) => ({ state: r.state, district: r.district, constituency: r.assemblyConstituency });
const item = ({ id, kind, title, ref, status, area, since, limitH, tab, action }) => {
    if (!since || Number.isNaN(Date.parse(since))) return null; // an undated record cannot be timed
    const due = new Date(Date.parse(since) + limitH * H).toISOString();
    const waitedH = (Date.now() - Date.parse(since)) / H;
    const overdue = Date.now() > Date.parse(due);
    const priority = overdue ? "high" : (Date.parse(due) - Date.now() < 24 * H || limitH < 2) ? "medium" : "normal";
    return { id, kind, title, ref: ref ?? null, status, area, since, dueAt: due, waitedHours: Math.round(waitedH * 10) / 10, overdue, priority, tab, action,
        escalate: waitedH > limitH * 2 };
};
const label = (s) => String(s ?? "").replace(/_/g, " ");

/** Every open item in the caller's jurisdiction, with who must act on it. */
const collect = async (req) => {
    const can = (p) => hasPermission(req.user, p);
    const mine = [], others = [];
    const put = (actor, x) => x && (actor ? mine : others).push(x);
    const see = (a) => a && inScope(req, a);

    // Forms 2-8 (eforms)
    for (const f of await store("eform").list()) {
        if (!["submitted", "field_verified"].includes(f.status) || !see(areaOfEform(f))) continue;
        const field = f.status === "submitted";
        put(field ? can("verification:field-report") && !can("application:decide") : can("application:decide"), item({
            id: f._id, kind: field ? "Field verification" : "Decision", title: `${f.title}: ${f.subject?.name ?? f.subject?.targetName ?? ""}`.trim(), ref: f.referenceId,
            status: label(f.status), area: areaOfEform(f), since: field ? f.submittedAt : (f.fieldReport?.at ?? f.submittedAt), limitH: field ? LIMITS.field : LIMITS.decide,
            tab: field ? "formsField" : "formsDecide", action: field ? "Verify in the field" : "Decide"
        }));
    }
    // Form 6 registrations (the original pipeline)
    for (const r of await listRegistrations()) {
        if (!["pending", "field_verified"].includes(r.status) || !see(areaOfReg(r))) continue;
        const field = r.status === "pending";
        put(field ? can("verification:field-report") && !can("application:decide") : can("application:decide"), item({
            id: r._id, kind: field ? "Field verification" : "Decision", title: `Form 6: ${r.name ?? "new elector"}`, ref: r.referenceId ?? r._id.slice(0, 8),
            status: label(r.status), area: areaOfReg(r), since: field ? (r.createdAt ?? r.submittedAt) : (r.fieldVerification?.at ?? r.updatedAt ?? r.createdAt), limitH: field ? LIMITS.form6Field : LIMITS.form6Decide,
            tab: field ? "formsField" : "formsDecide", action: field ? "Verify in the field" : "Decide"
        }));
    }
    // New-voter tasks assigned to a BLO
    for (const t of await listTasks().catch(() => [])) {
        if (t.status !== "open" || !see(t.jurisdiction)) continue;
        const toMe = t.assignedTo?.epic === req.user.epic || t.assignedTo === req.user.epic;
        if (!toMe && !can("blo:assign") && !can("blo:supervise")) continue;
        put(toMe, item({ id: t._id, kind: "New-voter task", title: `Help ${t.person?.name ?? "a new voter"} register`, ref: null, status: t.assignedTo ? "assigned" : "unassigned",
            area: t.jurisdiction, since: t.assignedAt ?? t.createdAt, limitH: LIMITS.task, tab: toMe ? "formsField" : "bloTeam", action: toMe ? "Visit" : "Assign" }));
    }
    // Roll quality flags (PSE / DSE / deaths)
    for (const f of await docStore("roll_flags").find({ status: { $ne: "decided" } }).catch(() => [])) {
        if (!see(f.jurisdiction)) continue;
        const blo = ["field_check", "notice_issued"].includes(f.status);
        put(blo ? can("verification:field-report") && !can("application:decide") : can("application:decide"), item({
            id: f._id, kind: blo ? (f.status === "notice_issued" ? "Deliver notice" : "Field check") : "Roll quality", title: `${f.type.toUpperCase()}: ${f.entries.map((e) => e.name).join(" / ")}`.slice(0, 120),
            status: label(f.status), area: f.jurisdiction, since: f.updatedAt ?? f.createdAt, limitH: blo ? LIMITS.flagBlo : LIMITS.flagEro, tab: "rollQuality", action: blo ? "Act in the field" : "Decide"
        }));
    }
    // cVIGIL complaints: control room -> flying squad -> RO
    for (const c of await store("mcc-complaint").list()) {
        if (!["received", "assigned", "field_reported"].includes(c.status) || !see(c.jurisdiction)) continue;
        const stage = c.status === "received" ? ["Dispatch", can("complaint:dispatch"), LIMITS.complaintDispatch, c.receivedAt]
            : c.status === "assigned" ? ["Investigate", c.assignedTo?.epic === req.user.epic, LIMITS.complaintInvestigate, c.assignedTo?.at ?? c.receivedAt]
                : ["Dispose", can("complaint:dispose"), LIMITS.complaintDispose, c.receivedAt];
        if (c.status === "assigned" && !stage[1] && can("complaint:investigate")) continue; // another squad's case
        put(stage[1], item({ id: c._id, kind: `cVIGIL: ${stage[0].toLowerCase()}`, title: `${label(c.category)}${c.place ? ` at ${c.place}` : ""}`, ref: c.referenceId, status: label(c.status),
            area: c.jurisdiction, since: stage[3], limitH: stage[2], tab: "complaints", action: stage[0] }));
    }
    // Grievances
    if (can("grievance:handle")) {
        for (const g of await docStore("grievances").find({ status: { $in: ["open", "in_progress", "reopened"] } }).catch(() => [])) {
            if (!g.jurisdiction?.state || !see(g.jurisdiction)) continue;
            put(true, item({ id: g._id, kind: "Grievance", title: g.subject, ref: g.referenceId, status: label(g.status), area: g.jurisdiction, since: g.createdAt, limitH: LIMITS.grievance, tab: "grievances", action: "Respond" }));
        }
    }
    // Roll appeals
    for (const a of await store("roll-appeal").list()) {
        if (!see(a.jurisdiction)) continue;
        const who = a.status === "first_appeal" ? can("appeal:decide-first") : a.status === "second_appeal" ? can("appeal:decide-second") : a.status === "with_ero" ? can("application:decide") : null;
        if (who === null) continue;
        put(who, item({ id: a._id, kind: a.status === "with_ero" ? "Implement appeal order" : "Appeal", title: `Appeal ${a.referenceId ?? ""}`.trim(), ref: a.referenceId, status: label(a.status), area: a.jurisdiction,
            since: a.updatedAt ?? a.filedAt ?? a.createdAt, limitH: LIMITS.appeal, tab: "appeals", action: a.status === "with_ero" ? "Implement" : "Decide" }));
    }
    // Campaign permissions
    for (const p of await store("campaign-permission").list()) {
        if (!["applied", "with_ro"].includes(p.status) || !see(p.jurisdiction)) continue;
        const who = p.status === "applied" ? can("security:coordinate") || can("permission:police-remark") : can("permission:decide");
        put(who, item({ id: p._id, kind: p.status === "applied" ? "Police remarks" : "Permission", title: `${label(p.type)}: ${p.applicant?.name ?? p.candidateName ?? ""}`.trim(), ref: p.referenceId,
            status: label(p.status), area: p.jurisdiction, since: p.updatedAt ?? p.appliedAt ?? p.createdAt, limitH: LIMITS.permission, tab: "permStaff", action: p.status === "applied" ? "Remark" : "Decide" }));
    }
    // Index cards
    for (const c of await docStore("index_cards").find({ status: { $in: ["draft", "returned", "submitted", "ceo_verified"] } }).catch(() => [])) {
        if (!see(c.jurisdiction)) continue;
        const who = ["draft", "returned"].includes(c.status) ? can("index:prepare") : c.status === "submitted" ? can("index:examine") : can("index:finalise");
        put(who, item({ id: c._id, kind: "Index Card", title: `${c.jurisdiction.constituency}: ${c.electionName}`, ref: null, status: label(c.status), area: c.jurisdiction,
            since: c.submittedAt ?? c.createdAt, limitH: LIMITS.indexCard, tab: "indexCard", action: c.status === "submitted" ? "Examine" : c.status === "ceo_verified" ? "Finalise" : "Complete" }));
    }
    // Polling-station problems
    for (const i of await store("station-issue").list()) {
        if (i.status !== "open" || !see(i.jurisdiction ?? { state: i.state, district: i.district, constituency: i.constituency })) continue;
        put(can("district:manage"), item({ id: i._id, kind: "Station problem", title: `${label(i.category ?? i.kind ?? i.type)}: ${i.stationName ?? i.pollingStation ?? ""}`.trim(), ref: null, status: "open",
            area: i.jurisdiction ?? { state: i.state, district: i.district, constituency: i.constituency }, since: i.reportedAt ?? i.createdAt ?? i.at, limitH: LIMITS.issue, tab: "issuesClose", action: "Resolve" }));
    }
    return { mine, others };
};

const RANK = { high: 0, medium: 1, normal: 2 };

export const myInbox = asyncHandler(async (req, res) => {
    const { mine, others } = await collect(req);
    const supervisor = hasPermission(req.user, "district:manage") || hasPermission(req.user, "state:manage") || hasPermission(req.user, "national:manage") || hasPermission(req.user, "blo:supervise");
    const sort = (a, b) => RANK[a.priority] - RANK[b.priority] || a.dueAt.localeCompare(b.dueAt);
    const items = mine.sort(sort);
    const escalated = supervisor ? others.filter((x) => x.escalate).sort(sort).slice(0, 50) : [];
    res.json({ success: true, data: {
        items: items.slice(0, 200), total: items.length, escalated,
        counts: { total: items.length, overdue: items.filter((x) => x.overdue).length, high: items.filter((x) => x.priority === "high").length, dueToday: items.filter((x) => !x.overdue && Date.parse(x.dueAt) - Date.now() < 24 * H).length, escalated: escalated.length },
        limits: LIMITS
    } });
});

const hours = (a, b) => (Date.parse(b) - Date.parse(a)) / H;
const avg = (xs) => (xs.length ? Math.round((xs.reduce((n, x) => n + x, 0) / xs.length) * 10) / 10 : null);

/** Workload by officer and district (ERO, BLO supervisor, DEO, CEO, the Commission). */
export const workload = asyncHandler(async (req, res) => {
    const see = (a) => a && inScope(req, a);
    const forms = [
        ...(await store("eform").list()).filter((f) => see(f.jurisdiction)).map((f) => ({ area: f.jurisdiction, status: f.status, submittedAt: f.submittedAt, field: f.fieldReport, decision: f.decision, timeline: f.timeline ?? [], form: f.formCode })),
        ...(await listRegistrations()).filter((r) => see(areaOfReg(r))).map((r) => ({ area: areaOfReg(r), status: r.status === "pending" ? "submitted" : r.status, submittedAt: r.createdAt ?? r.submittedAt,
            field: r.fieldVerification ? { by: { epic: r.fieldVerification.by }, at: r.fieldVerification.at ?? r.updatedAt } : null,
            decision: r.decidedAt ? { by: { epic: r.decidedBy }, at: r.decidedAt, outcome: r.status } : null, timeline: [], form: "FORM_6" }))
    ].filter((f) => f.submittedAt);
    const open = forms.filter((f) => ["submitted", "field_verified"].includes(f.status));
    const decided = forms.filter((f) => f.decision?.at);
    const officers = {};
    const row = (epic, role) => (officers[`${role}:${epic}`] ??= { epic, role, received: 0, done: 0, pending: 0, hours: [] });
    for (const f of forms) {
        if (f.field?.by?.epic) { const r = row(f.field.by.epic, "field"); r.done += 1; r.hours.push(hours(f.submittedAt, f.field.at)); }
        if (f.decision?.by?.epic) { const r = row(f.decision.by.epic, "decision"); r.done += 1; r.hours.push(hours(f.field?.at ?? f.submittedAt, f.decision.at)); }
    }
    const districts = {};
    for (const f of forms) {
        const d = (districts[f.area.district ?? f.area.state] ??= { district: f.area.district ?? f.area.state, received: 0, pending: 0, overdue: 0 });
        d.received += 1;
        if (["submitted", "field_verified"].includes(f.status)) { d.pending += 1; if (hours(f.submittedAt, new Date().toISOString()) > LIMITS.field + LIMITS.decide) d.overdue += 1; }
    }
    const tasks = (await listTasks().catch(() => [])).filter((t) => see(t.jurisdiction));
    const complaints = (await store("mcc-complaint").list()).filter((c) => see(c.jurisdiction));
    const closed = complaints.filter((c) => ["disposed", "dropped"].includes(c.status));
    const mins = closed.map((c) => (Date.parse(c.disposal?.at ?? c.droppedAt ?? c.updatedAt ?? c.receivedAt) - Date.parse(c.receivedAt)) / 60000).filter((m) => m >= 0);
    const grievances = (await docStore("grievances").find({}).catch(() => [])).filter((g) => g.jurisdiction?.state && see(g.jurisdiction));
    const answered = grievances.filter((g) => g.response?.at);
    res.json({ success: true, data: {
        applications: {
            received: forms.length, pending: open.length, decided: decided.length,
            awaitingField: open.filter((f) => f.status === "submitted").length, awaitingDecision: open.filter((f) => f.status === "field_verified").length,
            overdue: open.filter((f) => hours(f.submittedAt, new Date().toISOString()) > LIMITS.field + LIMITS.decide).length,
            avgDisposalHours: avg(decided.map((f) => hours(f.submittedAt, f.decision.at))),
            repeatedVerification: forms.filter((f) => f.timeline.filter((t) => t.step === "field_verified").length > 1).length,
            reassigned: tasks.filter((t) => (t.reassignments ?? 0) > 0).length
        },
        officers: Object.values(officers).map(({ hours: hs, ...o }) => ({ ...o, avgHours: avg(hs) })).sort((a, b) => b.done - a.done).slice(0, 40),
        districts: Object.values(districts).sort((a, b) => b.pending - a.pending),
        complaints: { total: complaints.length, closed: closed.length, open: complaints.length - closed.length, within100: mins.filter((m) => m <= 100).length, avgMinutes: avg(mins) },
        grievances: { total: grievances.length, resolved: grievances.filter((g) => ["resolved", "closed", "referred_cvigil"].includes(g.status)).length, avgResponseHours: avg(answered.map((g) => hours(g.createdAt, g.response.at))) }
    } });
});
