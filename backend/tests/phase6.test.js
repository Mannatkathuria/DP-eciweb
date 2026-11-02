import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Phase 6: training environment and modules, tamper-evident audit trail, security headers and
// start-up configuration checks.
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = "";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const { checkConfig } = await import("../src/config/appMode.js");
const { MODULES } = await import("../src/config/training.js");

test("config: unsafe production settings are refused at start-up", () => {
    assert.deepEqual(checkConfig({ NODE_ENV: "development" }), []);
    const problems = checkConfig({ NODE_ENV: "production", ACCESS_TOKEN_SECRET: "short", PERSONA_DEMO_MODE: "true" });
    assert.equal(problems.length, 3);
    assert.deepEqual(checkConfig({ NODE_ENV: "production", ACCESS_TOKEN_SECRET: "x".repeat(40), CLIENT_URL: "https://example.org" }), []);
});

test("training content: every module has steps and questions with a valid answer", () => {
    for (const mod of MODULES) {
        assert.ok(mod.steps.length > 0 && mod.questions.length > 0, mod.id);
        for (const q of mod.questions) assert.ok(q.answer >= 0 && q.answer < q.options.length, `${mod.id}: ${q.text}`);
    }
    assert.equal(new Set(MODULES.map((m) => m.id)).size, MODULES.length);
});

let ctx;
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    await connectRedis();
    const runId = crypto.randomInt(0, 1e9);
    const makeUser = async (role) => {
        const user = { _id: crypto.randomUUID(), epic: `TST${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`, role, name: `${role} ${runId}`, mustChangePassword: false };
        await saveUser(user);
        return { user, token: jwt.sign({ _id: user._id, epic: user.epic, role }, "test") };
    };
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = async (method, path, body, token) => {
        const res = await fetch(`${base}${path}`, {
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.6.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
    };
    ctx = { redis, server, call, makeUser, eci: await makeUser("eci"), runId };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });

test("security headers on every response; the deployment mode is visible", needsRedis, async () => {
    const { call } = await setup();
    const r = await call("GET", "/health");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.equal(r.headers.get("x-powered-by"), null);
    assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(r.headers.get("x-app-mode"), "live");
    assert.equal(r.body.mode, "live");
});

test("training environment: labelled on every response, and only synthetic or mock sources can be connected", needsRedis, async () => {
    const { call, eci, runId } = await setup();
    process.env.APP_MODE = "training";
    try {
        const h = await call("GET", "/health");
        assert.equal(h.body.mode, "training"); assert.equal(h.headers.get("x-app-mode"), "training");
        assert.equal((await call("POST", "/integrations/sources", { name: `Gov feed ${runId}`, type: "approved_api", purpose: "Identify potential applicants", legalBasis: "x", agreementReference: "y" }, eci.token)).status, 409);
        assert.equal((await call("POST", "/results/sources", { name: "Official", type: "official_feed", legalBasis: "x", agreementReference: "y" }, eci.token)).status, 409);
        assert.equal((await call("POST", "/integrations/sources", { name: `Practice feed ${runId}`, type: "synthetic", purpose: "Training with invented people" }, eci.token)).status, 201);
        assert.equal((await call("POST", "/results/sources", { name: "Practice results", type: "mock" }, eci.token)).status, 201);
    } finally { delete process.env.APP_MODE; }
});

test("training modules: each role sees its own modules without answers; scores are kept; supervisors see their team", needsRedis, async () => {
    const { call, makeUser, eci } = await setup();
    const blo = await makeUser("blo");
    const area = { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South", pollingStation: "Government Girls Senior Secondary School, Ludhiana", partNumber: "18" };
    assert.equal((await call("POST", "/assignments", { epic: blo.user.epic, role: "blo", jurisdiction: area }, eci.token)).status, 201);

    const mine = (await call("GET", "/training/modules", undefined, blo.token)).body.data;
    assert.deepEqual(mine.items.map((m) => m.id), ["blo-field-verification", "blo-new-voters"]);
    assert.equal(mine.items[0].questions[0].answer, undefined, "answers stay on the server");
    assert.equal(mine.items[0].questions[0].explain, undefined);

    assert.equal((await call("POST", "/training/modules/polling-party/attempts", { answers: [1, 1, 1] }, blo.token)).status, 404, "another role's module");
    assert.equal((await call("POST", "/training/modules/blo-field-verification/attempts", { answers: [1] }, blo.token)).status, 400);
    const fail = await call("POST", "/training/modules/blo-field-verification/attempts", { answers: [0, 0, 1] }, blo.token);
    assert.equal(fail.body.data.passed, false);
    assert.deepEqual(fail.body.data.results.map((r) => r.correct), [false, false, true]);
    const pass = await call("POST", "/training/modules/blo-field-verification/attempts", { answers: [1, 1, 1] }, blo.token);
    assert.equal(pass.body.data.passed, true);
    assert.equal(pass.body.data.progress.attempts, 2);
    assert.ok(pass.body.data.progress.passedAt);
    const again = await call("POST", "/training/modules/blo-field-verification/attempts", { answers: [0, 0, 0] }, blo.token);
    assert.equal(again.body.data.progress.passedAt, pass.body.data.progress.passedAt, "a later failed attempt keeps the pass");

    const ero = await makeUser("ero");
    await call("POST", "/assignments", { epic: ero.user.epic, role: "ero", jurisdiction: { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South" } }, eci.token);
    const team = (await call("GET", "/training/team", undefined, ero.token)).body.data.items;
    const row = team.find((t) => t.epic === blo.user.epic);
    assert.equal(row.passed, 1); assert.equal(row.modules, 2);
    const otherEro = await makeUser("ero");
    await call("POST", "/assignments", { epic: otherEro.user.epic, role: "ero", jurisdiction: { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana North" } }, eci.token);
    assert.equal((await call("GET", "/training/team", undefined, otherEro.token)).body.data.items.some((t) => t.epic === blo.user.epic), false);
    const voter = await makeUser("voter");
    assert.equal((await call("GET", "/training/team", undefined, voter.token)).status, 403);
    assert.deepEqual((await call("GET", "/training/modules", undefined, voter.token)).body.data.items, []);
});

test("audit trail: every event carries a hash; an altered event is detected", needsRedis, async () => {
    const { call, redis, makeUser, eci } = await setup();
    const ero = await makeUser("ero");
    assert.equal((await call("GET", "/audit/integrity", undefined, ero.token)).status, 403, "ECI administrator only");
    const before = (await call("GET", "/audit/integrity", undefined, eci.token)).body.data;
    assert.equal(before.ok, true, JSON.stringify({ ...before, altered: before.altered.slice(0, 3) }));
    assert.ok(before.checked > 0);

    const id = (await redis().lRange("audit:events", -1, -1))[0];
    const original = await redis().get(`audit:event:${id}`);
    const event = JSON.parse(original);
    assert.match(event.hash, /^[0-9a-f]{64}$/);
    try {
        await redis().set(`audit:event:${id}`, JSON.stringify({ ...event, note: "edited afterwards" }));
        const after = (await call("GET", "/audit/integrity", undefined, eci.token)).body.data;
        assert.equal(after.ok, false);
        assert.deepEqual(after.altered, [id]);
    } finally { await redis().set(`audit:event:${id}`, original); }
    assert.equal((await call("GET", "/audit/integrity", undefined, eci.token)).body.data.ok, true);
});
