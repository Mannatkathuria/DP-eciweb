// Independent oversight and Commission directions.
//
// OBSERVER REPORTS (RP Act 1951, s. 20B; ECI Handbook for Observers). General, police,
// expenditure, counting and micro observers file factual reports with a severity and a
// recommendation. Reports go to the Commission's channel and are confidential: the filer, the
// Commission (ECI, CEC, ECs) and, for the district, the DEO (who holds "observer:view") see them.
// A micro observer's report also goes to the general observer of the constituency. Observers
// never edit the records they observe.
//
// DIRECTIONS. The Commission (CEC and Election Commissioners) issues a direction to a field
// officer (CEO, DEO, RO, sector officer, police) about an observer report, an incident or a
// general matter, under a named legal basis (for example s. 57 adjournment, s. 58 fresh poll,
// s. 58A booth capturing). The addressee records compliance with evidence; the Commission closes
// it. A direction is never edited: each step is appended.
import { transaction } from "../config/redis.js";
import { hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { actorOf, areaOf, asRecord, assertScope, clean, dateOf, inScope, newId, nowIso, oneOf, page, primaryAssignment, requireText, store } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const reports = store("observer-report");
const directions = store("direction");

export const SEVERITY = ["routine", "concern", "serious", "critical"];
export const REPORT_TOPICS = {
    preparedness: "Election preparedness", nomination: "Nominations and scrutiny", campaign: "Campaign and Model Code of Conduct",
    law_and_order: "Law and order and security forces", expenditure: "Election expenditure", poll_day: "Poll day",
    counting: "Counting", roll: "Electoral roll", other: "Other"
};
const KIND_OF_ROLE = { general_observer: "general", police_observer: "police", expenditure_observer: "expenditure", counting_observer: "counting", micro_observer: "micro" };
const NATIONAL = (req) => ["national:manage", "national:view", "direction:issue", "report:national"].some((p) => hasPermission(req.user, p));

export const DIRECTION_BASIS = {
    article_324: "Article 324 (superintendence, direction and control)",
    s20b: "RP Act 1951, s. 20B (observer's report during counting)",
    s57: "RP Act 1951, s. 57 (adjournment of poll)",
    s58: "RP Act 1951, s. 58 (fresh poll)",
    s58a: "RP Act 1951, s. 58A (booth capturing)",
    mcc: "Model Code of Conduct",
    expenditure: "Expenditure monitoring instructions",
    administrative: "Administrative instruction"
};
export const ADDRESSEES = ["ceo", "deo", "ro", "ero", "sector_officer", "district_police_officer", "state_police_nodal", "presiding_officer"];
const D_STATUS = { issued: "Issued, awaiting compliance", complied: "Compliance reported", closed: "Closed by the Commission" };

// ---- Observer reports ----

const reportVisible = (req, r) => {
    if (r.filedBy.epic === req.user.epic) return true;
    if (NATIONAL(req)) return true;
    if (hasPermission(req.user, "observer:view") && inScope(req, r.jurisdiction)) return true;
    // A general observer receives the micro observers' reports from their constituency.
    if (req.user.role === "general_observer" && r.kind === "micro" && inScope(req, r.jurisdiction)) return true;
    return false;
};

export const fileReport = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const mine = primaryAssignment(req);
    const area = body.state ? areaOf(body, body.constituency ? "constituency" : body.district ? "district" : "state")
        : mine?.jurisdiction?.constituency ? areaOf(mine.jurisdiction, "constituency") : null;
    if (!area) throw new ApiError(400, "Name the area the report is about.");
    assertScope(req, area, "This area");
    const at = nowIso();
    const report = {
        _id: newId(), kind: KIND_OF_ROLE[req.user.role] ?? "general", electionId: clean(body.electionId, 80) || null, election: mine?.election ?? null,
        jurisdiction: area, pollingStation: clean(body.pollingStation, 200) || mine?.jurisdiction?.pollingStation || null,
        topic: oneOf(body.topic ?? "other", REPORT_TOPICS, "topic"), severity: oneOf(body.severity ?? "routine", SEVERITY, "severity"),
        title: requireText(body.title, "Title", { min: 5, max: 150 }), facts: requireText(body.facts, "Facts observed", { min: 20, max: 4000 }),
        recommendation: clean(body.recommendation, 1500) || null, reportTo: req.user.role === "micro_observer" ? ["general_observer", "commission"] : ["commission"],
        confidential: true, status: "submitted", filedBy: actorOf(req.user), filedAt: at, review: [], directionIds: []
    };
    const tx = transaction();
    reports.save(report, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "observer.report_filed", resource: { type: "observer_report", id: report._id }, jurisdiction: asRecord(area), after: { kind: report.kind, severity: report.severity, topic: report.topic } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: "Report filed to the Commission's observer channel.", data: report });
});

export const listReports = asyncHandler(async (req, res) => {
    const q = req.query;
    const items = (await reports.list()).filter((r) => reportVisible(req, r))
        .filter((r) => (!q.status || r.status === q.status) && (!q.severity || r.severity === q.severity) && (!q.kind || r.kind === q.kind));
    const counts = Object.fromEntries(SEVERITY.map((s) => [s, items.filter((r) => r.severity === s && r.status !== "closed").length]));
    res.json({ success: true, data: { items: page(items, q, "filedAt"), counts, topics: REPORT_TOPICS,
        can: { review: NATIONAL(req) && (hasPermission(req.user, "direction:issue") || hasPermission(req.user, "national:manage")), direct: hasPermission(req.user, "direction:issue"), file: hasPermission(req.user, "observer:report") } } });
});

/** Commission: acknowledge, ask for more, or close a report. */
export const reviewReport = asyncHandler(async (req, res) => {
    if (!(NATIONAL(req) && (hasPermission(req.user, "direction:issue") || hasPermission(req.user, "national:manage")))) throw new ApiError(403, "Only the Commission reviews observer reports.");
    const result = await reports.withLock(req.params.id, async () => {
        const r = await reports.get(req.params.id);
        if (!r) throw new ApiError(404, "Report not found.");
        if (r.status === "closed") throw new ApiError(409, "This report is closed.");
        const action = oneOf(req.body?.action, ["acknowledge", "seek_information", "close"], "action");
        const note = action === "acknowledge" ? clean(req.body?.note, 800) || null : requireText(req.body?.note, "Note", { min: 5, max: 800 });
        const at = nowIso();
        const status = action === "close" ? "closed" : action === "seek_information" ? "information_sought" : "acknowledged";
        const updated = { ...r, status, review: [...r.review, { action, note, by: actorOf(req.user), at }] };
        const tx = transaction();
        reports.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: `observer.report_${action}`, resource: { type: "observer_report", id: r._id }, jurisdiction: asRecord(r.jurisdiction), after: { status }, note }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: result });
});

/** The filer adds information the Commission asked for (appended, never an edit). */
export const supplementReport = asyncHandler(async (req, res) => {
    const result = await reports.withLock(req.params.id, async () => {
        const r = await reports.get(req.params.id);
        if (!r || r.filedBy.epic !== req.user.epic) throw new ApiError(404, "Report not found.");
        if (r.status === "closed") throw new ApiError(409, "This report is closed.");
        const note = requireText(req.body?.note, "Additional information", { min: 10, max: 2000 });
        const updated = { ...r, status: "submitted", review: [...r.review, { action: "supplement", note, by: actorOf(req.user), at: nowIso() }] };
        const tx = transaction();
        reports.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "observer.report_supplemented", resource: { type: "observer_report", id: r._id }, jurisdiction: asRecord(r.jurisdiction) }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: result });
});

// ---- Directions ----

const isAddressee = (req, d) => req.user.role === d.addressedTo && inScope(req, d.jurisdiction);
const directionVisible = (req, d) => NATIONAL(req) || isAddressee(req, d)
    || (hasPermission(req.user, "observer:report") && inScope(req, d.jurisdiction))
    || (["ceo", "deo"].includes(req.user.role) && inScope(req, d.jurisdiction));

export const issueDirection = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const area = areaOf(body, body.constituency ? "constituency" : body.district ? "district" : "state");
    const subject = { type: oneOf(body.subjectType ?? "general", ["general", "observer_report", "incident"], "subjectType"), id: clean(body.subjectId, 80) || null };
    if (subject.type !== "general" && !subject.id) throw new ApiError(400, "Name the report or incident this direction is about.");
    let report = null;
    if (subject.type === "observer_report") {
        report = await reports.get(subject.id);
        if (!report) throw new ApiError(404, "Observer report not found.");
    }
    const at = nowIso();
    const d = {
        _id: newId(), reference: `ECI/DIR/${new Date().getUTCFullYear()}/${Math.floor(Math.random() * 90000 + 10000)}`, subject, jurisdiction: area,
        addressedTo: oneOf(body.addressedTo, ADDRESSEES, "addressedTo"), legalBasis: oneOf(body.legalBasis ?? "administrative", DIRECTION_BASIS, "legalBasis"),
        instruction: requireText(body.instruction, "Instruction", { min: 10, max: 3000 }), dueDate: body.dueDate ? dateOf(body.dueDate, "Due date") : null,
        status: "issued", issuedBy: actorOf(req.user), issuedAt: at, compliance: [], closedAt: null
    };
    const tx = transaction();
    directions.save(d, tx);
    if (report) reports.save({ ...report, status: "direction_issued", directionIds: [...(report.directionIds ?? []), d._id] }, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "direction.issued", resource: { type: "direction", id: d._id }, jurisdiction: asRecord(area), after: { addressedTo: d.addressedTo, legalBasis: d.legalBasis, subject } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: { ...d, statusText: D_STATUS[d.status] } });
});

export const listDirections = asyncHandler(async (req, res) => {
    const q = req.query;
    const items = (await directions.list()).filter((d) => directionVisible(req, d))
        .filter((d) => (!q.status || d.status === q.status) && (!q.subjectId || d.subject.id === q.subjectId));
    res.json({ success: true, data: { items: page(items, q, "issuedAt").map((d) => ({ ...d, statusText: D_STATUS[d.status], mine: isAddressee(req, d) })),
        basis: DIRECTION_BASIS, addressees: ADDRESSEES, can: { issue: hasPermission(req.user, "direction:issue") } } });
});

/** The addressee reports what was done. */
export const complyDirection = asyncHandler(async (req, res) => {
    const result = await directions.withLock(req.params.id, async () => {
        const d = await directions.get(req.params.id);
        if (!d) throw new ApiError(404, "Direction not found.");
        if (!isAddressee(req, d)) throw new ApiError(403, "This direction is not addressed to you.");
        if (d.status === "closed") throw new ApiError(409, "This direction is closed.");
        const entry = { note: requireText(req.body?.note, "Action taken", { min: 10, max: 2000 }), evidence: clean(req.body?.evidence, 500) || null, by: actorOf(req.user), at: nowIso() };
        const updated = { ...d, status: "complied", compliance: [...d.compliance, entry] };
        const tx = transaction();
        directions.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "direction.complied", resource: { type: "direction", id: d._id }, jurisdiction: asRecord(d.jurisdiction), note: entry.note }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: { ...result, statusText: D_STATUS[result.status] } });
});

/** The Commission closes a direction once satisfied (or sends it back with a note). */
export const closeDirection = asyncHandler(async (req, res) => {
    const result = await directions.withLock(req.params.id, async () => {
        const d = await directions.get(req.params.id);
        if (!d) throw new ApiError(404, "Direction not found.");
        if (d.status !== "complied") throw new ApiError(409, "A direction is closed after compliance is reported.");
        const accept = req.body?.accept !== false;
        const note = accept ? clean(req.body?.note, 800) || null : requireText(req.body?.note, "Reason for returning", { min: 5, max: 800 });
        const at = nowIso();
        const updated = accept ? { ...d, status: "closed", closedAt: at, closedBy: actorOf(req.user), closingNote: note }
            : { ...d, status: "issued", compliance: [...d.compliance, { returned: true, note, by: actorOf(req.user), at }] };
        const tx = transaction();
        directions.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: accept ? "direction.closed" : "direction.returned", resource: { type: "direction", id: d._id }, jurisdiction: asRecord(d.jurisdiction), note }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: { ...result, statusText: D_STATUS[result.status] } });
});

export const getDirection = (id) => directions.get(id);
export const listAllReports = () => reports.list();
export const listAllDirections = () => directions.list();
