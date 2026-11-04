// Nodal officers. A district or state nodal officer heads ONE subject (EVM management, training,
// transport, expenditure, MCC, media, SVEEP, postal ballots and so on), named in their assignment
// order. They report progress and work the tasks given to their subject; they cannot act on any
// other subject, and the title gives them no power over statutory officers.
//
// The DEO and Deputy DEO (district) and the CEO (state) coordinate nodal officers ("nodal:coordinate"):
// they give tasks to a subject and read every subject's reports in their jurisdiction.
import { transaction } from "../config/redis.js";
import { NODAL_FUNCTIONS } from "../config/roles.js";
import { hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { actorOf, areaOf, asRecord, assertScope, clean, dateOf, inScope, newId, nowIso, oneOf, page, requireText, store } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const reports = store("nodal-report");
const tasks = store("nodal-task");
const STATUS = ["on_track", "at_risk", "blocked"];
const TASK_STATUS = { open: "Open", in_progress: "In progress", done: "Done" };

/** The subject and area of the caller's nodal assignment(s). */
const myFunctions = (req) => (req.authority?.assignments ?? [])
    .filter((a) => ["district_nodal_officer", "state_nodal_officer"].includes(a.role))
    .map((a) => ({ function: a.function ?? req.user.nodalFunction ?? null, jurisdiction: a.jurisdiction }))
    .filter((f) => f.function && NODAL_FUNCTIONS[f.function]);

const coordinator = (req) => hasPermission(req.user, "nodal:coordinate");

const mineFor = (req, fn, area) => myFunctions(req).find((f) => f.function === fn && inScope({ authority: { assignments: [{ jurisdiction: f.jurisdiction }] } }, area));

export const nodalOverview = asyncHandler(async (req, res) => {
    const mine = myFunctions(req);
    if (!coordinator(req) && !mine.length) throw new ApiError(409, "Your assignment does not name a nodal subject yet. Ask the DEO or CEO who designated you.");
    const visible = (x) => inScope(req, x.jurisdiction) && (coordinator(req) || mine.some((f) => f.function === x.function));
    const rs = (await reports.list()).filter(visible);
    const ts = (await tasks.list()).filter(visible);
    const latest = {};
    for (const r of rs.sort((a, b) => a.at.localeCompare(b.at))) latest[`${r.function}|${r.jurisdiction.district ?? r.jurisdiction.state}`] = r;
    res.json({ success: true, data: { functions: NODAL_FUNCTIONS, mine, latest: Object.values(latest), reports: page(rs, req.query, "at"), tasks: page(ts, { limit: 200 }, "createdAt"),
        taskStatus: TASK_STATUS, can: { coordinate: coordinator(req), report: mine.length > 0 } } });
});

/** Nodal officer: a progress report for their own subject. */
export const fileNodalReport = asyncHandler(async (req, res) => {
    const mine = myFunctions(req);
    const fn = clean(req.body?.function) || mine[0]?.function;
    const assigned = mine.find((f) => f.function === fn);
    if (!assigned) throw new ApiError(403, "You can report only on the subject named in your nodal assignment.");
    const area = areaOf(assigned.jurisdiction, assigned.jurisdiction.district ? "district" : "state");
    const progress = Number(req.body?.progressPercent);
    if (!(progress >= 0 && progress <= 100)) throw new ApiError(400, "Progress must be between 0 and 100 per cent.");
    const metrics = Object.fromEntries(Object.entries(req.body?.metrics ?? {}).slice(0, 12).map(([k, v]) => [clean(k, 40), clean(v, 80)]).filter(([k, v]) => k && v));
    const item = {
        _id: newId(), function: fn, functionLabel: NODAL_FUNCTIONS[fn], jurisdiction: area, progressPercent: Math.round(progress),
        status: oneOf(req.body?.status ?? "on_track", STATUS, "status"), summary: requireText(req.body?.summary, "Summary", { min: 10, max: 2000 }),
        issues: clean(req.body?.issues, 1500) || null, metrics, by: actorOf(req.user), at: nowIso()
    };
    const tx = transaction();
    reports.save(item, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "nodal.report", resource: { type: "nodal_report", id: item._id }, jurisdiction: asRecord(area), after: { function: fn, progress: item.progressPercent, status: item.status } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: item });
});

/** DEO / Deputy DEO / CEO: give a task to one subject in their jurisdiction. */
export const createNodalTask = asyncHandler(async (req, res) => {
    if (!coordinator(req)) throw new ApiError(403, "Only the DEO, Deputy DEO or CEO gives tasks to nodal officers.");
    const body = req.body ?? {};
    const area = areaOf(body, body.district ? "district" : "state");
    assertScope(req, area, "This area");
    const item = {
        _id: newId(), function: oneOf(body.function, NODAL_FUNCTIONS, "function"), jurisdiction: area, title: requireText(body.title, "Title", { min: 5, max: 150 }),
        details: clean(body.details, 1500) || null, dueDate: body.dueDate ? dateOf(body.dueDate, "Due date") : null, status: "open",
        createdBy: actorOf(req.user), createdAt: nowIso(), updates: []
    };
    const tx = transaction();
    tasks.save(item, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "nodal.task_created", resource: { type: "nodal_task", id: item._id }, jurisdiction: asRecord(area), after: { function: item.function, title: item.title } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: item });
});

/** Nodal officer of that subject (or the coordinator): progress on a task. */
export const updateNodalTask = asyncHandler(async (req, res) => {
    const result = await tasks.withLock(req.params.id, async () => {
        const t = await tasks.get(req.params.id);
        if (!t) throw new ApiError(404, "Task not found.");
        assertScope(req, t.jurisdiction, "This task");
        if (!coordinator(req) && !mineFor(req, t.function, t.jurisdiction)) throw new ApiError(403, "This task belongs to another subject.");
        const status = oneOf(req.body?.status, TASK_STATUS, "status");
        const updated = { ...t, status, updates: [...t.updates, { status, note: clean(req.body?.note, 800) || null, by: actorOf(req.user), at: nowIso() }] };
        const tx = transaction();
        tasks.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "nodal.task_updated", resource: { type: "nodal_task", id: t._id }, jurisdiction: asRecord(t.jurisdiction), before: { status: t.status }, after: { status } }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: result });
});

export const listAllNodalTasks = () => tasks.list();
