import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Gap fixes after the plan review: re-authentication ("step-up") before sensitive approvals.
process.env.STEP_UP_REQUIRED = "true";
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = "";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const { checkConfig } = await import("../src/config/appMode.js");

test("production refuses to start with step-up turned off", () => {
    const base = { NODE_ENV: "production", ACCESS_TOKEN_SECRET: "x".repeat(40), CLIENT_URL: "https://www.eciweb.in" };
    assert.deepEqual(checkConfig(base), []);
    assert.match(checkConfig({ ...base, STEP_UP_REQUIRED: "false" }).join(" "), /STEP_UP_REQUIRED/);
});

let ctx;
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    await connectRedis();
    const makeUser = async (role) => {
        const user = { _id: crypto.randomUUID(), epic: `TST${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`, role, name: role, mustChangePassword: false };
        await saveUser(user);
        return { user, token: jwt.sign({ _id: user._id, epic: user.epic, role }, "test") };
    };
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = async (method, path, body, token, extra = {}) => {
        const res = await fetch(`${base}${path}`, {
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.7.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    // The demo OTP is printed to the terminal; capture it the way an operator would read it.
    const otpFor = async (who) => {
        const log = console.log; let seen = null;
        console.log = (...args) => { const m = String(args[0]).match(/^\[DEMO OTP\] step-up (\S+): (\d{6})$/); if (m && m[1] === who.user.epic) seen = m[2]; else log(...args); };
        try { assert.equal((await call("POST", "/auth/step-up/request", {}, who.token)).status, 200); } finally { console.log = log; }
        return seen;
    };
    ctx = { redis, server, call, makeUser, otpFor };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });

test("step-up: sensitive approvals need a fresh code; the token is bound to the account and expires", needsRedis, async () => {
    const { call, makeUser, otpFor } = await setup();
    const eci = await makeUser("eci");
    const ero = await makeUser("ero");
    const grant = (headers) => call("POST", "/assignments", { epic: ero.user.epic, role: "ero", jurisdiction: { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South" }, election: `step-up ${crypto.randomUUID()}` }, eci.token, headers);

    const refused = await grant();
    assert.equal(refused.status, 401);
    assert.equal(refused.body.errors[0].code, "STEP_UP_REQUIRED");
    assert.equal((await call("POST", "/auth/step-up/request", {})).status, 401, "needs a session");

    const otp = await otpFor(eci);
    assert.match(otp, /^\d{6}$/);
    assert.equal((await call("POST", "/auth/step-up/verify", { otp: otp === "000000" ? "111111" : "000000" }, eci.token)).status, 400);
    const ok = await call("POST", "/auth/step-up/verify", { otp }, eci.token);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const stepUp = ok.body.data.stepUpToken;
    assert.equal((await call("POST", "/auth/step-up/verify", { otp }, eci.token)).status, 400, "codes are single use");

    assert.equal((await grant({ "X-Step-Up": stepUp })).status, 201);
    // Someone else's step-up token does not work, nor does a session token, nor an expired one.
    const otherOtp = await otpFor(ero);
    const eroStepUp = (await call("POST", "/auth/step-up/verify", { otp: otherOtp }, ero.token)).body.data.stepUpToken;
    assert.equal((await grant({ "X-Step-Up": eroStepUp })).status, 401);
    assert.equal((await grant({ "X-Step-Up": eci.token })).status, 401);
    const expired = jwt.sign({ _id: eci.user._id, purpose: "step-up", iat: Math.floor(Date.now() / 1000) - 3600 }, "test", { expiresIn: "10m" });
    assert.equal((await grant({ "X-Step-Up": expired })).status, 401);

    // Reading is never gated.
    assert.equal((await call("GET", "/assignments", undefined, eci.token)).status, 200);
    const audit = (await call("GET", `/audit/user/${eci.user._id}`, undefined, eci.token)).body.data.items.map((e) => e.action);
    assert.ok(audit.includes("auth.step-up"));
});
