import { transaction } from "../config/redis.js";
import { getTask, listTasks, lockTask, saveTask } from "../repositories/registrationTask.repository.js";
import { getProspect, saveProspect } from "../repositories/integration.repository.js";
import { getRegistration, listRegistrations } from "../repositories/registration.repository.js";
import { getUserByEpic } from "../repositories/user.repository.js";
import { activeBloAssignments } from "../services/ingestion.service.js";
import { assertCovers, covers, coversAny } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { REASON_MAX_LENGTH } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Outcomes a BLO can record. "contacted" keeps the task open; the others close it.
export const TASK_OUTCOMES = ["contacted", "form6_submitted", "declined", "not_found", "ineligible"];
const CLOSING = ["form6_submitted", "declined", "not_found", "ineligible"];
const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const asRecord = (task) => ({ ...task.jurisdiction, assemblyConstituency: task.jurisdiction.constituency });

/** The task's state as the people following it should see it, including the linked Form 6 result. */
const present = (task, applications) => {
    const application = task.applicationId ? applications.get(task.applicationId) : null;
    let stage = task.status;
    if (application?.status === "approved") stage = "registered";
    else if (application?.status === "rejected") stage = "application_rejected";
    else if (application) stage = `application_${application.status}`; // pending / field_verified
    return { ...task, stage, application: application ? { _id: application._id, status: application.status, epic: application.epic ?? null } : null };
};

export const listRegistrationTasks = asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "open");
    const { assignments } = req.authority;
    const applications = new Map((await listRegistrations()).map((a) => [a._id, a]));
    const items = (await listTasks())
        .filter((t) => coversAny(assignments, asRecord(t)))
        .filter((t) => status === "all" || t.status === status || (status === "unassigned" && !t.assignedTo && t.status === "open"))
        .sort((a, b) => a.dueBy.localeCompare(b.dueBy))
        .map((t) => present(t, applications));
    res.json({ success: true, data: { items, total: items.length } });
});

/** BLO records what happened. Only the assigned BLO may act (or any covering BLO while unassigned). */
export const recordTaskOutcome = asyncHandler(async (req, res) => {
    const outcome = String(req.body?.outcome ?? "");
    if (!TASK_OUTCOMES.includes(outcome)) throw new ApiError(400, `outcome must be one of: ${TASK_OUTCOMES.join(", ")}.`);
    const note = String(req.body?.note ?? "").trim().replace(/\s+/g, " ").slice(0, REASON_MAX_LENGTH) || null;
    if (["declined", "not_found", "ineligible"].includes(outcome) && !note) {
        throw new ApiError(400, "Add a short note explaining this outcome.");
    }
    const release = await lockTask(req.params.id);
    if (!release) throw new ApiError(409, "This task is being updated. Try again in a moment.");
    try {
        const task = await getTask(req.params.id);
        if (!task) throw new ApiError(404, "Task not found.");
        assertCovers(req.authority.assignments, asRecord(task), "This task");
        if (task.assignedTo && task.assignedTo.userId !== req.user._id) throw new ApiError(403, "This task is assigned to another BLO.");
        if (task.status !== "open") throw new ApiError(409, `This task is already closed (${task.status}).`);

        let application = null;
        if (outcome === "form6_submitted") {
            application = await getRegistration(String(req.body?.applicationId ?? "").trim());
            if (!application) throw new ApiError(400, "Give the reference ID of the Form 6 application the person filed.");
            const samePerson = norm(application.name) === norm(task.person.name)
                && String(application.dateOfBirth).slice(0, 10) === task.person.dateOfBirth
                && norm(application.assemblyConstituency) === norm(task.jurisdiction.constituency);
            if (!samePerson) throw new ApiError(400, "That application is for a different name, date of birth or constituency.");
            if ((await listTasks()).some((t) => t.applicationId === application._id && t._id !== task._id)) {
                throw new ApiError(409, "That application is already linked to another task.");
            }
        }

        const at = new Date().toISOString();
        const updated = {
            ...task,
            assignedTo: task.assignedTo ?? { userId: req.user._id, epic: req.user.epic, assignmentId: null },
            status: CLOSING.includes(outcome) ? outcome : "open",
            applicationId: application?._id ?? task.applicationId,
            outcomes: [...task.outcomes, { outcome, note, by: req.user.epic, at }],
            updatedAt: at
        };
        const tx = transaction();
        saveTask(updated, tx);
        const prospect = await getProspect(task.prospectId);
        if (prospect && application) {
            saveProspect({ ...prospect, registration: { ...prospect.registration, status: "APPLIED", applicationId: application._id } }, tx);
        }
        await recordAudit(auditEvent({
            actor: req.user, action: `regtask.${outcome}`, resource: { type: "regtask", id: task._id },
            jurisdiction: task.jurisdiction, before: { status: task.status }, after: { status: updated.status, applicationId: updated.applicationId }, note
        }), tx);
        await tx.exec();
        res.json({ success: true, data: updated });
    } finally {
        await release();
    }
});

/** ERO (blo:assign) or BLO supervisor (blo:supervise) routes a task to a BLO covering the person. */
export const assignTask = asyncHandler(async (req, res) => {
    const release = await lockTask(req.params.id);
    if (!release) throw new ApiError(409, "This task is being updated. Try again in a moment.");
    try {
        const task = await getTask(req.params.id);
        if (!task) throw new ApiError(404, "Task not found.");
        assertCovers(req.authority.assignments, asRecord(task), "This task");
        if (task.status !== "open") throw new ApiError(409, "Only open tasks can be reassigned.");
        const bloUser = await getUserByEpic(req.body?.epic);
        if (!bloUser || !["blo", "admin"].includes(bloUser.role)) throw new ApiError(404, "No BLO account found for that identifier.");
        const bloAssignment = (await activeBloAssignments()).find((a) => a.userId === bloUser._id && covers(a, asRecord(task)));
        if (!bloAssignment) throw new ApiError(409, "That BLO has no active assignment covering this person's area.");

        const updated = { ...task, assignedTo: { userId: bloUser._id, epic: bloUser.epic, assignmentId: bloAssignment._id }, updatedAt: new Date().toISOString() };
        const tx = transaction();
        saveTask(updated, tx);
        await recordAudit(auditEvent({
            actor: req.user, action: "regtask.assigned", resource: { type: "regtask", id: task._id }, jurisdiction: task.jurisdiction,
            before: { assignedTo: task.assignedTo?.epic ?? null }, after: { assignedTo: bloUser.epic }
        }), tx);
        await tx.exec();
        res.json({ success: true, data: updated });
    } finally {
        await release();
    }
});

