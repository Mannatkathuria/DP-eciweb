import crypto from "crypto";
import { transaction } from "../config/redis.js";
import { geography } from "../data/geography.js";
import { listElections, saveElection } from "../repositories/election.repository.js";
import { ELECTION_TYPES, electionStage, requireElection, todayIST, validateSchedule } from "../services/election.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const present = (e) => ({ ...e, stage: electionStage(e), today: todayIST() });

/** Public: elections and their schedule. */
export const listAllElections = asyncHandler(async (req, res) => {
    const items = (await listElections()).sort((a, b) => b.schedule.pollDate.localeCompare(a.schedule.pollDate)).map(present);
    res.json({ success: true, data: { items } });
});

/** ECI administrator announces an election with its full schedule. */
export const createElection = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 3 || name.length > 120) throw new ApiError(400, "Give the election a name (3 to 120 characters).");
    if (!ELECTION_TYPES.includes(body.type)) throw new ApiError(400, `type must be one of: ${ELECTION_TYPES.join(", ")}.`);
    const states = [...new Set((Array.isArray(body.states) ? body.states : []).map((s) => geography.states.find((g) => g.name.toLowerCase() === String(s).trim().toLowerCase())?.name))];
    if (!states.length || states.includes(undefined)) throw new ApiError(400, "List the States/UTs the election covers, by their official names.");
    if ((await listElections()).some((e) => e.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, "An election with this name already exists.");
    const election = {
        _id: crypto.randomUUID(), name, type: body.type, states, schedule: validateSchedule(body.schedule),
        createdBy: req.user.epic, createdAt: new Date().toISOString(), scheduleHistory: []
    };
    const tx = transaction();
    saveElection(election, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "election.created", resource: { type: "election", id: election._id }, after: { name, type: election.type, states, schedule: election.schedule } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: present(election) });
});

/** ECI administrator revises the schedule. The previous schedule and the reason are kept. */
export const reviseSchedule = asyncHandler(async (req, res) => {
    const election = await requireElection(req.params.id);
    const reason = requireReason(req.body?.reason, "schedule revision");
    const schedule = validateSchedule(req.body?.schedule);
    const updated = {
        ...election, schedule,
        scheduleHistory: [...(election.scheduleHistory ?? []), { schedule: election.schedule, replacedAt: new Date().toISOString(), by: req.user.epic, reason }]
    };
    const tx = transaction();
    saveElection(updated, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "election.schedule_revised", resource: { type: "election", id: election._id }, before: election.schedule, after: schedule, note: reason }), tx);
    await tx.exec();
    res.json({ success: true, data: present(updated) });
});
