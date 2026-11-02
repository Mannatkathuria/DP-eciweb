import { jsonGet, redis } from "../config/redis.js";
import { MODULES, PASS_MARK, modulesFor } from "../config/training.js";
import { listAllAssignments } from "../repositories/assignment.repository.js";
import { containsJurisdiction, hasPermission } from "../services/authority.service.js";
import { APP_MODE } from "../config/appMode.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Training modules and progress. A person sees the modules for their own role; supervisors see
// the progress of the staff they may appoint, inside their own jurisdiction.

const progressKey = (userId) => `training:progress:${userId}`;
const getProgress = async (userId) => (await jsonGet(progressKey(userId))) ?? {};
const strip = (mod) => ({ ...mod, steps: mod.steps.map(([text, link]) => ({ text, link })), questions: mod.questions.map(({ text, options }) => ({ text, options })) });

export const myModules = asyncHandler(async (req, res) => {
    const progress = await getProgress(req.user._id);
    res.json({ success: true, data: { mode: APP_MODE, passMark: PASS_MARK, items: modulesFor(req.user.role).map((mod) => ({ ...strip(mod), progress: progress[mod.id] ?? null })) } });
});

export const attempt = asyncHandler(async (req, res) => {
    const mod = modulesFor(req.user.role).find((x) => x.id === req.params.id);
    if (!mod) throw new ApiError(404, "This module is not part of your role's training.");
    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length !== mod.questions.length || !answers.every((a) => Number.isInteger(a))) {
        throw new ApiError(400, `Answer all ${mod.questions.length} questions.`);
    }
    const results = mod.questions.map((qq, i) => ({ correct: answers[i] === qq.answer, explain: qq.explain }));
    const score = results.filter((r) => r.correct).length / mod.questions.length;
    const passed = score >= PASS_MARK;
    const progress = await getProgress(req.user._id);
    const before = progress[mod.id];
    progress[mod.id] = {
        attempts: (before?.attempts ?? 0) + 1, bestScore: Math.max(before?.bestScore ?? 0, score), lastScore: score,
        passedAt: before?.passedAt ?? (passed ? new Date().toISOString() : null), lastAttemptAt: new Date().toISOString()
    };
    await redis().set(progressKey(req.user._id), JSON.stringify(progress));
    res.json({ success: true, data: { score, passed, results, progress: progress[mod.id] } });
});

// Which roles each supervisory permission oversees for training.
const OVERSEES = {
    "blo:assign": ["blo"], "blo:supervise": ["blo"],
    "staff:assign": ["presiding_officer", "polling_officer", "sector_officer", "counting_supervisor", "counting_assistant"],
    "polling:arrange": ["presiding_officer", "polling_officer"]
};

export const teamProgress = asyncHandler(async (req, res) => {
    const roles = [...new Set(Object.entries(OVERSEES).filter(([p]) => hasPermission(req.user, p)).flatMap(([, r]) => r))];
    if (!roles.length) throw new ApiError(403, "Your role does not supervise staff training.");
    const team = (await listAllAssignments()).filter((a) => a.status === "active" && roles.includes(a.role === "admin" ? "blo" : a.role) && containsJurisdiction(req.authority.assignments, a.jurisdiction));
    const items = await Promise.all(team.map(async (a) => {
        const progress = await getProgress(a.userId);
        const mods = modulesFor(a.role);
        return { epic: a.epic, role: a.role, jurisdiction: a.jurisdiction, modules: mods.length, passed: mods.filter((x) => progress[x.id]?.passedAt).length,
            detail: mods.map((x) => ({ id: x.id, title: x.title, passedAt: progress[x.id]?.passedAt ?? null, bestScore: progress[x.id]?.bestScore ?? null })) };
    }));
    items.sort((x, y) => x.passed / (x.modules || 1) - y.passed / (y.modules || 1) || x.epic.localeCompare(y.epic));
    res.json({ success: true, data: { items, catalogue: MODULES.map((x) => ({ id: x.id, title: x.title, roles: x.roles })) } });
});
