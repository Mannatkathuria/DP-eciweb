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

// ---- Scenario simulator (synthetic, timed; never touches live records) ----
import crypto from "crypto";
import { SCENARIOS, SCENARIO_PASS, scenariosFor } from "../config/scenarios.js";

const runKey = (id) => `training:run:${id}`;
const historyKey = (userId) => `training:scenario-history:${userId}`;
const publicScenario = (sc) => ({ id: sc.id, title: sc.title, roles: sc.roles, minutes: sc.minutes, situation: sc.situation, steps: sc.steps.map((st) => ({ prompt: st.prompt, options: st.options.map((o) => o.text) })) });

export const listScenarios = asyncHandler(async (req, res) => {
    const history = (await jsonGet(historyKey(req.user._id))) ?? {};
    res.json({ success: true, data: { mode: APP_MODE, passMark: SCENARIO_PASS, items: scenariosFor(req.user.role).map((sc) => ({ ...publicScenario(sc), best: history[sc.id] ?? null })) } });
});

/** Starts a timed run; the clock is the server's. */
export const startScenario = asyncHandler(async (req, res) => {
    const sc = scenariosFor(req.user.role).find((x) => x.id === req.params.id);
    if (!sc) throw new ApiError(404, "This scenario is not part of your role's training.");
    const run = { _id: crypto.randomUUID(), scenarioId: sc.id, userId: req.user._id, startedAt: new Date().toISOString() };
    await redis().set(runKey(run._id), JSON.stringify(run), { EX: 3600 });
    res.status(201).json({ success: true, data: { runId: run._id, startedAt: run.startedAt, minutes: sc.minutes, scenario: publicScenario(sc) } });
});

export const submitScenario = asyncHandler(async (req, res) => {
    const run = await jsonGet(runKey(String(req.params.runId)));
    if (!run || run.userId !== req.user._id) throw new ApiError(404, "This exercise run was not found or has expired. Start again.");
    const sc = SCENARIOS.find((x) => x.id === run.scenarioId);
    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length !== sc.steps.length || !answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < sc.steps[i].options.length)) {
        throw new ApiError(400, `Choose one option for each of the ${sc.steps.length} steps.`);
    }
    await redis().del(runKey(run._id)); // one submission per run
    const seconds = Math.round((Date.now() - Date.parse(run.startedAt)) / 1000);
    const overTime = seconds > sc.minutes * 60;
    const steps = sc.steps.map((st, i) => {
        const chosen = st.options[answers[i]]; const right = st.options.find((o) => o.correct);
        return { prompt: st.prompt, chosen: chosen.text, correct: chosen.correct, feedback: chosen.feedback, rightAnswer: chosen.correct ? null : right.text, rightFeedback: chosen.correct ? null : right.feedback, ref: chosen.ref ?? right.ref ?? null };
    });
    const accuracy = steps.filter((x) => x.correct).length / steps.length;
    const score = Math.round(accuracy * (overTime ? 0.9 : 1) * 100) / 100; // 10% off for running over time
    const passed = score >= SCENARIO_PASS;
    const history = (await jsonGet(historyKey(req.user._id))) ?? {};
    const before = history[sc.id];
    history[sc.id] = { attempts: (before?.attempts ?? 0) + 1, bestScore: Math.max(before?.bestScore ?? 0, score), lastScore: score, lastSeconds: seconds,
        passedAt: before?.passedAt ?? (passed ? new Date().toISOString() : null), lastAttemptAt: new Date().toISOString() };
    await redis().set(historyKey(req.user._id), JSON.stringify(history));
    res.json({ success: true, data: { scenarioId: sc.id, score, passed, seconds, overTime, steps, progress: history[sc.id] } });
});

/**
 * Performance report for the signed-in person, with a completion certificate once every scenario
 * for their role is passed. The certificate is a training record of this application, not an
 * official ECI certification.
 */
export const scenarioReport = asyncHandler(async (req, res) => {
    const history = (await jsonGet(historyKey(req.user._id))) ?? {};
    const mine = scenariosFor(req.user.role);
    const rows = mine.map((sc) => ({ id: sc.id, title: sc.title, ...(history[sc.id] ?? { attempts: 0, bestScore: null, passedAt: null }) }));
    const complete = mine.length > 0 && rows.every((r) => r.passedAt);
    const certificate = complete ? {
        id: crypto.createHash("sha256").update(`${req.user._id}:${rows.map((r) => `${r.id}@${r.passedAt}`).join(",")}`).digest("hex").slice(0, 20),
        name: req.user.name ?? req.user.epic, role: req.user.role, issuedAt: rows.map((r) => r.passedAt).sort().at(-1), scenarios: rows.length,
        note: "Training record of the ECIWEB simulator using synthetic data. It is not an official certification by the Election Commission of India."
    } : null;
    res.json({ success: true, data: { items: rows, passed: rows.filter((r) => r.passedAt).length, total: rows.length, averageBest: rows.length ? Math.round(rows.reduce((n, r) => n + (r.bestScore ?? 0), 0) / rows.length * 100) / 100 : 0, certificate } });
});
