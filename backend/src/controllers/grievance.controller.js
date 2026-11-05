// National Grievance Services Portal (NGSP): complaints about election administration from
// citizens, electors, parties, candidates, the media and election officials.
//
//   1. FILE      Anyone files with a category, a description, a mobile number and up to two
//                documents. A reference is issued and an acknowledgement is sent (SMS/email,
//                simulated). The grievance is routed by where it is about: a constituency goes to
//                its ERO (roll matters) or RO (everything else), a district to the DEO, a State to
//                the CEO, otherwise to the Commission.
//   2. ROUTE     An officer may re-route it to the right level or office, with a note.
//   3. RESPOND   The officer records action and a response; the complainant sees it and the time
//                taken. A complaint that is really a Model Code of Conduct violation is referred
//                to cVIGIL rather than handled as a general grievance.
//   4. REOPEN    Within 7 days of a response, the complainant may reopen it once, with reasons.
//
// MongoDB is the system of record (`grievances`).
import { hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { actorOf, areaOf, auditChange, clean, inScope, newId, nowIso, oneOf, page, referenceOf, requireText } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const grievances = docStore("grievances", { textFields: ["subject", "description", "referenceId"] });
export const CATEGORIES = { electoral_registration: "Electoral registration and EPIC", polling_booth: "Polling station and facilities", evm: "EVM and VVPAT", expenditure: "Election expenditure", malpractice: "Electoral malpractice", other: "Other election administration" };
export const STAKEHOLDERS = { citizen: "Citizen", elector: "Elector", political_party: "Political party", candidate: "Candidate", media: "Media", election_official: "Election official" };
export const STATUS = { open: "Received", in_progress: "Under action", resolved: "Resolved", referred_cvigil: "Referred to cVIGIL (MCC violation)", reopened: "Reopened by the complainant", closed: "Closed" };
const LEVELS = { constituency: "Constituency (ERO/RO)", district: "District (DEO)", state: "State (CEO)", national: "Commission" };
const DOC = /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/]+={0,2}$/;
const REOPEN_DAYS = 7;

const routeFor = (category, area) => {
    if (area.constituency) return { level: "constituency", office: category === "electoral_registration" ? "ero" : "ro" };
    if (area.district) return { level: "district", office: "deo" };
    if (area.state) return { level: "state", office: "ceo" };
    return { level: "national", office: "eci" };
};
const minutesBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);
const publicView = (g) => ({
    referenceId: g.referenceId, category: g.category, categoryText: CATEGORIES[g.category], subject: g.subject, status: g.status, statusText: STATUS[g.status],
    routedTo: LEVELS[g.route.level], filedAt: g.createdAt, response: g.response ? { text: g.response.text, at: g.response.at } : null,
    responseMinutes: g.response ? minutesBetween(g.createdAt, g.response.at) : null, canReopen: canReopen(g), timeline: g.timeline.map((t) => ({ step: t.step, at: t.at }))
});
const canReopen = (g) => ["resolved", "closed"].includes(g.status) && !g.reopened && g.response && Date.now() - Date.parse(g.response.at) < REOPEN_DAYS * 86400000;
const officerView = ({ documents, ...g }) => ({ ...g, statusText: STATUS[g.status], categoryText: CATEGORIES[g.category], stakeholderText: STAKEHOLDERS[g.stakeholder],
    documentCount: documents?.length ?? 0, ageHours: Math.round((Date.now() - Date.parse(g.createdAt)) / 3600000), responseMinutes: g.response ? minutesBetween(g.createdAt, g.response.at) : null });

export const grievanceLists = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { categories: CATEGORIES, stakeholders: STAKEHOLDERS, statuses: STATUS, levels: LEVELS } });
});

export const fileGrievance = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const mobile = clean(b.mobile, 10);
    if (!/^[6-9]\d{9}$/.test(mobile)) throw new ApiError(400, "Give a 10-digit mobile number so you can track the grievance.");
    const email = clean(b.email, 120);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, "The email address does not look right.");
    const area = b.state ? areaOf(b, b.constituency ? "constituency" : b.district ? "district" : "state") : {};
    const docs = (Array.isArray(b.documents) ? b.documents : []).slice(0, 2);
    for (const d of docs) if (!DOC.test(d) || d.length > 3_000_000) throw new ApiError(400, "Each document must be a JPEG, PNG, WEBP or PDF under 2 MB.");
    const category = oneOf(b.category, CATEGORIES, "category");
    const at = nowIso();
    const g = {
        _id: newId(), referenceId: referenceOf("GRV"), stakeholder: oneOf(b.stakeholder ?? "citizen", STAKEHOLDERS, "stakeholder"), category,
        subject: requireText(b.subject, "Subject", { min: 5, max: 150 }), description: requireText(b.description, "Description", { min: 20, max: 4000 }),
        complainant: { name: clean(b.name, 120) || null, mobile, email: email || null, epic: req.user?.epic ?? null }, jurisdiction: area,
        route: routeFor(category, area), documents: docs, status: "open", response: null, reopened: false,
        acknowledgement: { channels: ["sms", ...(email ? ["email"] : [])], delivery: "simulated", at },
        timeline: [{ step: "filed", at }], createdAt: at
    };
    await grievances.insert(g);
    const mcc = category === "malpractice" && /cash|liquor|money|gift|freebie|bribe|distribut/i.test(g.description);
    res.status(201).json({ success: true, message: `Grievance ${g.referenceId} received and sent to the ${LEVELS[g.route.level]}. An acknowledgement has been sent to ${mobile}.`,
        data: { ...publicView(g), cvigilHint: mcc ? "If this is happening now (cash, liquor or gifts being distributed), report it on cVIGIL with a photo so a flying squad reaches the spot within 100 minutes." : null } });
});

export const trackGrievance = asyncHandler(async (req, res) => {
    const g = await grievances.findOne({ referenceId: clean(req.params.ref, 30).toUpperCase() });
    if (!g || g.complainant.mobile !== clean(req.query.mobile, 10)) throw new ApiError(404, "No grievance with that reference and mobile number.");
    res.json({ success: true, data: publicView(g) });
});

export const reopenGrievance = asyncHandler(async (req, res) => {
    const g = await grievances.findOne({ referenceId: clean(req.params.ref, 30).toUpperCase() });
    if (!g || g.complainant.mobile !== clean(req.body?.mobile, 10)) throw new ApiError(404, "No grievance with that reference and mobile number.");
    if (!canReopen(g)) throw new ApiError(409, `A grievance can be reopened once, within ${REOPEN_DAYS} days of the response.`);
    const reason = requireText(req.body?.reason, "Why you are not satisfied", { min: 10, max: 1000 });
    const next = { ...g, status: "reopened", reopened: true, reopenReason: reason, timeline: [...g.timeline, { step: "reopened", at: nowIso(), note: reason }] };
    await grievances.put(next);
    res.json({ success: true, message: "Reopened. The officer will look at it again.", data: publicView(next) });
});

/** Is this grievance for the caller's office? Level and jurisdiction must both fit. */
const forMe = (req, g) => {
    if ((req.authority?.assignments ?? []).some((a) => a.nationwide)) return true;
    if (g.route.level === "national") return false;
    return inScope(req, g.jurisdiction);
};

export const listGrievances = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = oneOf(req.query.status, STATUS, "status");
    if (req.query.category) filter.category = oneOf(req.query.category, CATEGORIES, "category");
    const all = (await grievances.find(filter, { q: clean(req.query.q, 100) || null, sort: { createdAt: -1 }, limit: 3000 })).filter((g) => forMe(req, g));
    const open = all.filter((g) => ["open", "in_progress", "reopened"].includes(g.status));
    const answered = all.filter((g) => g.response);
    res.json({ success: true, data: {
        items: page(all, req.query).map(officerView),
        counts: all.reduce((m, g) => ((m[g.status] = (m[g.status] ?? 0) + 1), m), {}), byCategory: all.reduce((m, g) => ((m[g.category] = (m[g.category] ?? 0) + 1), m), {}),
        pendingOver72h: open.filter((g) => Date.now() - Date.parse(g.createdAt) > 72 * 3600000).length,
        avgResponseHours: answered.length ? Math.round(answered.reduce((n, g) => n + minutesBetween(g.createdAt, g.response.at), 0) / answered.length / 6) / 10 : null,
        lists: { categories: CATEGORIES, statuses: STATUS, levels: LEVELS, stakeholders: STAKEHOLDERS }, can: { handle: hasPermission(req.user, "grievance:handle") }, store: grievances.backend()
    } });
});

const loadForOfficer = async (req) => {
    const g = await grievances.get(req.params.id);
    if (!g || !forMe(req, g)) throw new ApiError(404, "No such grievance in your jurisdiction.");
    return g;
};

export const routeGrievance = asyncHandler(async (req, res) => {
    const level = oneOf(req.body?.level, LEVELS, "level");
    const updated = await grievances.withLock(req.params.id, async () => {
        const g = await loadForOfficer(req);
        if (["resolved", "closed", "referred_cvigil"].includes(g.status)) throw new ApiError(409, "This grievance is already disposed of.");
        const area = level === "national" ? {} : areaOf({ ...g.jurisdiction, ...(req.body ?? {}) }, level === "constituency" ? "constituency" : level === "district" ? "district" : "state");
        const route = level === "constituency" ? { level, office: oneOf(req.body?.office ?? "ro", ["ro", "ero"], "office") } : routeFor(g.category, area);
        const note = requireText(req.body?.note, "Why it is being re-routed", { min: 5, max: 400 });
        const next = { ...g, route, jurisdiction: area, status: "open", timeline: [...g.timeline, { step: `routed_${level}`, at: nowIso(), by: actorOf(req.user), note }] };
        await grievances.put(next);
        return next;
    });
    await auditChange(req, "grievance.routed", { type: "grievance", id: updated._id }, updated.jurisdiction, { after: { level } });
    res.json({ success: true, message: `Routed to the ${LEVELS[level]}.`, data: officerView(updated) });
});

export const respondGrievance = asyncHandler(async (req, res) => {
    const status = oneOf(req.body?.status ?? "resolved", ["in_progress", "resolved", "referred_cvigil", "closed"], "status");
    const updated = await grievances.withLock(req.params.id, async () => {
        const g = await loadForOfficer(req);
        if (["closed", "referred_cvigil"].includes(g.status)) throw new ApiError(409, "This grievance is closed.");
        const text = requireText(req.body?.response, "Response to the complainant", { min: 10, max: 2000 });
        const at = nowIso();
        const next = { ...g, status, actionTaken: clean(req.body?.actionTaken, 1000) || g.actionTaken || null,
            response: status === "in_progress" ? g.response : { text, at, by: actorOf(req.user) },
            timeline: [...g.timeline, { step: status, at, by: actorOf(req.user), note: status === "in_progress" ? text : null }] };
        await grievances.put(next);
        return next;
    });
    await auditChange(req, `grievance.${status}`, { type: "grievance", id: updated._id }, updated.jurisdiction);
    res.json({ success: true, message: status === "in_progress" ? "Noted as under action." : "Response sent to the complainant (SMS, simulated).", data: officerView(updated) });
});

export const grievanceDocument = asyncHandler(async (req, res) => {
    const g = await loadForOfficer(req);
    const d = g.documents?.[Number(req.params.n)];
    if (!d) throw new ApiError(404, "No such document.");
    res.json({ success: true, data: { dataUrl: d } });
});
