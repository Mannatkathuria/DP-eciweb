// Election planning (ePlan): what elections are coming, what must be ready by when, and where
// planning is falling behind. For the Commission's planning division and the CEOs.
//
//   VACANCIES   A seat falls vacant (death, resignation, disqualification, election set aside).
//               A bye-election is due within six months (RP Act 1951, s. 151A), unless less than a
//               year of the term remains or the Commission certifies it is difficult to hold.
//   PLANS       A planned general or bye-election with a proposed poll date. The planner builds the
//               preparation calendar (roll, EVMs, security, training, schedule) backwards from the
//               poll date, checks it against holidays, and tracks each activity.
//   ALERTS      Activities overdue or due within 7 days, per State.
//   MESSAGES    Planning updates to State officials by SMS and email (recorded here; delivery is
//               simulated in this demonstration).
//   ANNOUNCE    The Commission turns a plan into an election with its statutory schedule.
//
// MongoDB is the system of record (eplan_* collections); announcing writes the election to Redis.
import crypto from "crypto";
import { geography } from "../data/geography.js";
import { transaction } from "../config/redis.js";
import { listElections, saveElection } from "../repositories/election.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { ELECTION_TYPES, todayIST, validateSchedule } from "../services/election.service.js";
import { auditChange, clean, dateOf, newId, nowIso, oneOf, requireText } from "../services/workflow.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const vacancies = docStore("eplan_vacancies");
const holidays = docStore("eplan_holidays");
const activities = docStore("eplan_activities");
const messages = docStore("eplan_messages");
const plans = docStore("eplan_activities"); // plans are stored as activities of kind "plan"

export const VACANCY_REASONS = { death: "Death of the member", resignation: "Resignation", disqualification: "Disqualification", set_aside: "Election set aside by a court", other: "Other" };
export const HOUSES = { assembly: "Legislative Assembly", lok_sabha: "Lok Sabha" };
const PLAN_KINDS = { general_assembly: "General election to the Legislative Assembly", general_parliament: "General election to the Lok Sabha", bye_election: "Bye-election" };

// The preparation calendar, in days relative to the poll date (negative = before).
export const CALENDAR = [
    ["roll_final", "Final publication of the electoral roll", -75, "roll"],
    ["stations_final", "Polling-station list approved by the Commission", -70, "stations"],
    ["evm_flc", "First-level checking of EVMs and VVPATs", -60, "evm"],
    ["security_requisition", "Security force requisition (CAPF) sent to the Ministry of Home Affairs", -55, "security"],
    ["vulnerability_mapping", "Vulnerability mapping of polling stations", -50, "security"],
    ["training_1", "First training of polling personnel", -40, "training"],
    ["evm_rand_1", "First randomisation of EVMs (district to constituency)", -35, "evm"],
    ["notification", "Issue of the notification", -28, "schedule"],
    ["nominations_close", "Last date of nominations", -21, "schedule"],
    ["scrutiny", "Scrutiny of nominations", -20, "schedule"],
    ["withdrawal", "Last date of withdrawal; list of contesting candidates (Form 7A)", -18, "schedule"],
    ["etpb_dispatch", "Electronically transmitted postal ballots sent to service voters", -16, "postal"],
    ["training_2", "Second training of polling personnel", -14, "training"],
    ["evm_commission", "Commissioning of EVMs (candidate setting)", -10, "evm"],
    ["evm_rand_2", "Second randomisation of EVMs (constituency to polling station)", -8, "evm"],
    ["party_dispatch", "Dispatch of polling parties", -1, "poll"],
    ["poll", "Poll", 0, "poll"],
    ["counting", "Counting of votes", 3, "counting"],
    ["index_card", "Index Card filed (within 72 hours of the result)", 6, "statistics"]
];
const SCHEDULE_FROM = { notificationDate: "notification", lastDateOfNominations: "nominations_close", scrutinyDate: "scrutiny", lastDateOfWithdrawal: "withdrawal", pollDate: "poll", countingDate: "counting" };

const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const isSunday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
const stateName = (s) => geography.states.find((g) => g.name.toLowerCase() === String(s ?? "").trim().toLowerCase())?.name ?? null;

/** States the caller plans for: all for the Commission, their own for a CEO. */
const myStates = (req) => {
    if (hasPermission(req.user, "plan:manage") || (req.authority?.assignments ?? []).some((a) => a.nationwide)) return null;
    return [...new Set((req.authority?.assignments ?? []).map((a) => a.jurisdiction?.state).filter(Boolean))];
};
const visible = (req, state) => { const s = myStates(req); return !s || s.includes(state) || state === "ALL"; };
const requireManage = (req) => { if (!hasPermission(req.user, "plan:manage")) throw new ApiError(403, "Only the Commission's planning division does this."); };

const holidayClash = (list, states, date) => list.filter((h) => h.date === date && (h.state === "ALL" || states.includes(h.state)));

const withAlerts = (acts, today = todayIST()) => acts.map((a) => ({
    ...a, overdue: a.status !== "done" && a.dueOn < today, dueSoon: a.status !== "done" && a.dueOn >= today && a.dueOn <= addDays(today, 7)
}));

export const eplanOverview = asyncHandler(async (req, res) => {
    const states = myStates(req);
    const stateFilter = (field) => (states ? { [field]: { $in: [...states, "ALL"] } } : {});
    const [vac, hol, acts, msgs, elections, electors] = await Promise.all([
        vacancies.find(states ? { "seat.state": { $in: states } } : {}, { sort: { dueBy: 1 } }),
        holidays.find(stateFilter("state"), { sort: { date: 1 } }),
        activities.find({ kind: "activity", ...(states ? { states: { $in: states } } : {}) }, { sort: { dueOn: 1 } }),
        messages.find(states ? { states: { $in: states } } : {}, { sort: { createdAt: -1 }, limit: 50 }),
        listElections(), listElectors()
    ]);
    const planDocs = await plans.find({ kind: "plan", ...(states ? { states: { $in: states } } : {}) }, { sort: { pollDate: 1 } });
    const today = todayIST();
    const acted = withAlerts(acts, today);
    const byPlan = Object.groupBy ? Object.groupBy(acted, (a) => a.planId) : acted.reduce((m, a) => ((m[a.planId] ??= []).push(a), m), {});
    const planRows = planDocs.map((p) => {
        const list = byPlan[p._id] ?? [];
        return { ...p, activities: list, progress: { done: list.filter((a) => a.status === "done").length, total: list.length, overdue: list.filter((a) => a.overdue).length } };
    });
    // Electoral data at a glance, per State (from the roll).
    const electorData = {};
    for (const e of electors) {
        if (e.isActive === false || (states && !states.includes(e.state))) continue;
        const row = (electorData[e.state] ??= { state: e.state, electors: 0, women: 0, men: 0, third: 0, serviceVoters: 0, overseas: 0 });
        row.electors += 1;
        if (/^f/i.test(e.gender ?? "")) row.women += 1; else if (/^m/i.test(e.gender ?? "")) row.men += 1; else row.third += 1;
        if (e.electorCategory === "service_voter") row.serviceVoters += 1;
        if (e.electorCategory === "overseas_elector") row.overseas += 1;
    }
    const alerts = acted.filter((a) => a.overdue || a.dueSoon).map((a) => ({ planId: a.planId, planName: planDocs.find((p) => p._id === a.planId)?.name, title: a.title, dueOn: a.dueOn, overdue: a.overdue, states: a.states, area: a.area }));
    res.json({ success: true, data: {
        today, vacancies: vac.map((v) => ({ ...v, daysLeft: Math.round((Date.parse(v.dueBy) - Date.parse(today)) / 86400000) })),
        plans: planRows, holidays: hol, alerts, messages: msgs,
        upcomingElections: elections.filter((e) => e.schedule.countingDate >= today && (!states || e.states.some((s) => states.includes(s))))
            .map((e) => ({ _id: e._id, name: e.name, type: e.type, states: e.states, schedule: e.schedule })).sort((a, b) => a.schedule.pollDate.localeCompare(b.schedule.pollDate)),
        electorData: Object.values(electorData).sort((a, b) => b.electors - a.electors),
        lists: { reasons: VACANCY_REASONS, houses: HOUSES, kinds: PLAN_KINDS, calendar: CALENDAR.map(([key, title, offset, area]) => ({ key, title, offset, area })) },
        can: { manage: hasPermission(req.user, "plan:manage"), state: hasPermission(req.user, "plan:state") },
        store: vacancies.backend()
    } });
});

/** Record a vacancy. The bye-election is due within six months of it. */
export const addVacancy = asyncHandler(async (req, res) => {
    requireManage(req);
    const b = req.body ?? {};
    const state = stateName(b.state);
    if (!state) throw new ApiError(400, "Name the State/UT by its official name.");
    const house = oneOf(b.house, HOUSES, "house");
    const occurredOn = dateOf(b.occurredOn, "Date the seat fell vacant");
    const termEndsOn = b.termEndsOn ? dateOf(b.termEndsOn, "Date the House's term ends") : null;
    const due = addMonths(occurredOn, 6);
    const exempt = termEndsOn && termEndsOn <= addMonths(occurredOn, 12);
    const doc = {
        _id: newId(), seat: { state, house, constituency: requireText(b.constituency, "Constituency", { min: 2, max: 120 }), district: clean(b.district, 80) || null },
        member: clean(b.member, 120) || null, reason: oneOf(b.reason, VACANCY_REASONS, "reason"), occurredOn, termEndsOn,
        dueBy: due, exemption: exempt ? "Less than one year of the term remains (s. 151A proviso (a)): no bye-election needed." : null,
        status: exempt ? "exempt" : "open", planId: null, createdAt: nowIso(), createdBy: req.user.epic
    };
    await vacancies.insert(doc);
    await auditChange(req, "eplan.vacancy_recorded", { type: "vacancy", id: doc._id }, { state }, { after: { constituency: doc.seat.constituency, dueBy: due } });
    res.status(201).json({ success: true, message: exempt ? "Recorded. No bye-election is needed: less than a year of the term remains." : `Recorded. The bye-election is due by ${due}.`, data: doc });
});

/** Holidays that planning must avoid (a State's own or "ALL"). */
export const addHoliday = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const state = b.state === "ALL" ? "ALL" : stateName(b.state);
    if (!state) throw new ApiError(400, "Name the State/UT, or ALL for a national holiday.");
    if (!hasPermission(req.user, "plan:manage") && (state === "ALL" || !visible(req, state))) throw new ApiError(403, "A CEO records holidays of their own State only.");
    const doc = { _id: newId(), state, date: dateOf(b.date, "Date"), name: requireText(b.name, "Holiday", { min: 2, max: 120 }), createdAt: nowIso(), createdBy: req.user.epic };
    await holidays.insert(doc);
    await auditChange(req, "eplan.holiday_added", { type: "holiday", id: doc._id }, { state: state === "ALL" ? undefined : state }, { after: { date: doc.date, name: doc.name } });
    res.status(201).json({ success: true, message: "Holiday recorded.", data: doc });
});

/** A plan, with its preparation calendar built backwards from the poll date. */
export const createPlan = asyncHandler(async (req, res) => {
    requireManage(req);
    const b = req.body ?? {};
    const kind = oneOf(b.kind, PLAN_KINDS, "kind");
    const pollDate = dateOf(b.pollDate, "Proposed poll date");
    if (pollDate <= todayIST()) throw new ApiError(400, "The proposed poll date must be in the future.");
    const vacancyIds = Array.isArray(b.vacancyIds) ? b.vacancyIds.map(String) : [];
    const vac = vacancyIds.length ? await vacancies.find({ _id: { $in: vacancyIds } }) : [];
    if (vac.length !== vacancyIds.length) throw new ApiError(404, "One of the vacancies was not found.");
    if (vac.some((v) => v.status !== "open")) throw new ApiError(409, "A vacancy in the list is already planned for or exempt.");
    const late = vac.filter((v) => pollDate > v.dueBy);
    const states = [...new Set([...(Array.isArray(b.states) ? b.states : []).map(stateName), ...vac.map((v) => v.seat.state)])];
    if (!states.length || states.includes(null)) throw new ApiError(400, "List the States/UTs by their official names.");
    if (kind === "bye_election" && !vac.length) throw new ApiError(400, "A bye-election plan names the vacancies it fills.");
    const hol = await holidays.find({ state: { $in: [...states, "ALL"] } });
    const warnings = [];
    if (isSunday(pollDate)) warnings.push("The proposed poll date is a Sunday.");
    for (const h of holidayClash(hol, states, pollDate)) warnings.push(`The poll date clashes with ${h.name} (${h.state === "ALL" ? "national" : h.state}).`);
    for (const v of late) warnings.push(`The poll date is after the six-month limit for ${v.seat.constituency} (${v.dueBy}).`);
    const plan = {
        _id: newId(), kind: "plan", planKind: kind, name: requireText(b.name, "Plan name", { min: 3, max: 120 }), states, vacancyIds, pollDate,
        status: "planning", electionId: null, warnings, createdAt: nowIso(), createdBy: req.user.epic
    };
    const acts = CALENDAR.map(([key, title, offset, area]) => {
        let dueOn = addDays(pollDate, offset);
        const clash = holidayClash(hol, states, dueOn);
        if (clash.length && area === "schedule") dueOn = addDays(dueOn, -1); // statutory dates avoid holidays
        return { _id: newId(), kind: "activity", planId: plan._id, key, title, area, dueOn, states, status: "pending", note: null, createdAt: plan.createdAt, clashes: clash.map((h) => h.name) };
    });
    await plans.insert(plan);
    await activities.insertMany(acts);
    for (const v of vac) await vacancies.put({ ...v, status: "planned", planId: plan._id });
    await auditChange(req, "eplan.plan_created", { type: "election-plan", id: plan._id }, {}, { after: { name: plan.name, pollDate, states, activities: acts.length } });
    res.status(201).json({ success: true, message: `Plan created with ${acts.length} activities${warnings.length ? `; ${warnings.length} warning(s)` : ""}.`, data: { ...plan, activities: acts } });
});

/** Mark an activity done (or reopen it). CEOs update activities of their States. */
export const updateActivity = asyncHandler(async (req, res) => {
    const act = await activities.get(req.params.id);
    if (!act || act.kind !== "activity") throw new ApiError(404, "No such activity.");
    if (!act.states.some((s) => visible(req, s))) throw new ApiError(403, "This activity is outside your State.");
    const status = oneOf(req.body?.status, ["pending", "in_progress", "done"], "status");
    const next = { ...act, status, note: clean(req.body?.note, 400) || act.note, updatedAt: nowIso(), updatedBy: req.user.epic, ...(status === "done" ? { doneOn: todayIST() } : { doneOn: null }) };
    await activities.put(next);
    await auditChange(req, "eplan.activity_updated", { type: "plan-activity", id: act._id }, {}, { before: { status: act.status }, after: { status } });
    res.json({ success: true, message: status === "done" ? "Marked done." : "Updated.", data: next });
});

/** SMS / email to State officials, or reminders for every overdue activity. */
export const sendMessage = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const channel = oneOf(b.channel ?? "email", ["sms", "email"], "channel");
    let docs;
    if (b.overdueReminders) {
        requireManage(req);
        const overdue = withAlerts(await activities.find({ kind: "activity", status: { $ne: "done" } })).filter((a) => a.overdue);
        const byState = {};
        for (const a of overdue) for (const s of a.states) (byState[s] ??= []).push(a);
        docs = Object.entries(byState).map(([state, list]) => ({ _id: newId(), channel, states: [state], subject: `Overdue election activities: ${list.length}`,
            text: list.map((a) => `${a.title} (due ${a.dueOn})`).join("; "), automatic: true, delivery: "simulated", createdAt: nowIso(), createdBy: req.user.epic }));
        if (!docs.length) return res.json({ success: true, message: "Nothing is overdue; no reminders sent.", data: [] });
    } else {
        const states = (Array.isArray(b.states) ? b.states : [b.state]).map(stateName).filter(Boolean);
        if (!states.length) throw new ApiError(400, "Choose the States/UTs to message.");
        if (!hasPermission(req.user, "plan:manage") && !states.every((s) => visible(req, s))) throw new ApiError(403, "A CEO messages officials of their own State only.");
        docs = [{ _id: newId(), channel, states, subject: requireText(b.subject, "Subject", { min: 3, max: 120 }), text: requireText(b.text, "Message", { min: 3, max: channel === "sms" ? 320 : 4000 }),
            automatic: false, delivery: "simulated", createdAt: nowIso(), createdBy: req.user.epic }];
    }
    await messages.insertMany(docs);
    await auditChange(req, "eplan.message_sent", { type: "plan-message", id: docs[0]._id }, {}, { after: { channel, count: docs.length } });
    res.status(201).json({ success: true, message: `${docs.length} message(s) recorded for ${docs.flatMap((d) => d.states).join(", ")}.`, data: docs });
});

/** The Commission announces the election a plan prepared: the statutory schedule comes from the plan's calendar. */
export const announcePlan = asyncHandler(async (req, res) => {
    requireManage(req);
    if (!hasPermission(req.user, "election:manage")) throw new ApiError(403, "Announcing an election needs the election:manage permission.");
    const plan = await plans.get(req.params.id);
    if (!plan || plan.kind !== "plan") throw new ApiError(404, "No such plan.");
    if (plan.electionId) throw new ApiError(409, "This plan has already been announced.");
    requireReason(req.body?.orderReference, "Commission order reference");
    const acts = await activities.find({ planId: plan._id });
    const at = Object.fromEntries(acts.map((a) => [a.key, a.dueOn]));
    const schedule = validateSchedule(Object.fromEntries(Object.entries(SCHEDULE_FROM).map(([k, key]) => [k, at[key]])));
    if (!ELECTION_TYPES.includes(plan.planKind)) throw new ApiError(400, "Unknown election type.");
    if ((await listElections()).some((e) => e.name.toLowerCase() === plan.name.toLowerCase())) throw new ApiError(409, "An election with this name already exists.");
    const election = { _id: crypto.randomUUID(), name: plan.name, type: plan.planKind, states: plan.states, schedule, createdBy: req.user.epic, createdAt: nowIso(), scheduleHistory: [], planId: plan._id, orderReference: clean(req.body.orderReference, 120) };
    const tx = transaction();
    saveElection(election, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "election.created", resource: { type: "election", id: election._id }, after: { name: election.name, type: election.type, states: election.states, schedule, fromPlan: plan._id } }), tx);
    await tx.exec();
    await plans.put({ ...plan, status: "announced", electionId: election._id, announcedAt: nowIso() });
    for (const v of await vacancies.find({ planId: plan._id })) await vacancies.put({ ...v, status: "election_announced", electionId: election._id });
    res.status(201).json({ success: true, message: `Election "${election.name}" announced; the poll is on ${schedule.pollDate}.`, data: election });
});
