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

test("agents: the candidate appoints their election, polling and counting agents; the election agent appoints polling agents only", needsRedis, async () => {
    const { call, makeUser } = await setup();
    process.env.STEP_UP_REQUIRED = "false"; // appointments by the ECI below are not what this test is about
    try {
        const { todayIST } = await import("../src/services/election.service.js");
        const { saveStation } = await import("../src/repositories/election.repository.js");
        const { transaction } = await import("../src/config/redis.js");
        const day = (o) => { const d = new Date(`${todayIST()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + o); return d.toISOString().slice(0, 10); };
        const eci = await makeUser("eci");
        const area = { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana North" };
        const created = await call("POST", "/elections", { name: `Agents ${crypto.randomUUID()}`, type: "general_assembly", states: ["Punjab"],
            schedule: { notificationDate: day(-1), lastDateOfNominations: day(6), scrutinyDate: day(7), lastDateOfWithdrawal: day(9), pollDate: day(30), countingDate: day(33) } }, eci.token);
        assert.equal(created.status, 201, JSON.stringify(created.body));
        const election = created.body.data;
        const cand = await makeUser("candidate");
        assert.equal((await call("POST", "/assignments", { epic: cand.user.epic, role: "candidate", jurisdiction: area, election: election._id }, eci.token)).status, 201);
        const filed = await call("POST", "/nominations", { electionId: election._id, name: "Agent Test", dateOfBirth: "1975-01-01", party: "Demo Party", symbol: "Lamp",
            affidavit: { criminalCases: 0, assets: 1, liabilities: 0, education: "Graduate", declarationAccepted: true } }, cand.token);
        assert.equal(filed.status, 201, JSON.stringify(filed.body));
        const station = { _id: crypto.randomUUID(), code: `T-${crypto.randomUUID().slice(0, 6)}`, name: "Agent Test School", partNumber: String(crypto.randomInt(5000, 9999)), ...area, status: "ACTIVE", version: 1 };
        const tx = transaction(); saveStation(station, tx); await tx.exec();

        const ea = await makeUser("election_agent");
        const pa1 = await makeUser("polling_agent");
        const pa2 = await makeUser("polling_agent");
        const ca = await makeUser("counting_agent");
        const appoint = (who, body) => call("POST", "/agents", { electionId: election._id, ...body }, who.token);

        assert.equal((await appoint(ea, { type: "polling", epic: pa1.user.epic, stationId: station._id })).status, 403, "not yet an election agent");
        assert.equal((await appoint(cand, { type: "election", epic: pa1.user.epic })).status, 409, "account must be an election agent account");
        const eaAppt = await appoint(cand, { type: "election", epic: ea.user.epic });
        assert.equal(eaAppt.status, 201, JSON.stringify(eaAppt.body));
        assert.equal((await appoint(cand, { type: "election", epic: (await makeUser("election_agent")).user.epic })).status, 409, "only one election agent");
        assert.equal((await appoint(ea, { type: "election", epic: ea.user.epic })).status, 403, "only the candidate appoints the election agent");

        assert.equal((await appoint(ea, { type: "polling", epic: pa1.user.epic, stationId: "nope" })).status, 400);
        assert.equal((await appoint(ea, { type: "polling", epic: pa1.user.epic, stationId: station._id })).status, 201);
        assert.equal((await appoint(cand, { type: "polling", epic: pa2.user.epic, stationId: station._id })).status, 409, "one per station");
        assert.equal((await appoint(cand, { type: "counting", epic: ca.user.epic })).status, 201);

        const me = (await call("GET", "/assignments/me", undefined, pa1.token)).body.data.assignments;
        assert.equal(me.length, 1);
        assert.equal(me[0].jurisdiction.partNumber, station.partNumber);

        const mine = (await call("GET", `/agents/mine?electionId=${election._id}`, undefined, cand.token)).body.data.items;
        assert.equal(mine.length, 3);
        const eaSees = (await call("GET", `/agents/mine?electionId=${election._id}`, undefined, ea.token)).body.data.items;
        assert.equal(eaSees.length, 3);
        const other = await makeUser("candidate");
        assert.equal((await call("POST", `/agents/${eaAppt.body.data._id}/revoke`, { reason: "Changed" }, other.token)).status, 409, "no nomination of their own");
        assert.equal((await call("POST", `/agents/${eaAppt.body.data._id}/revoke`, { reason: "Changed" }, ea.token)).status, 403);

        const ro = await makeUser("ro");
        assert.equal((await call("POST", "/assignments", { epic: ro.user.epic, role: "ro", jurisdiction: area, election: election._id }, eci.token)).status, 201);
        const roSees = (await call("GET", `/agents?electionId=${election._id}`, undefined, ro.token)).body.data.items;
        assert.equal(roSees.length, 3);
        assert.equal(roSees[0].userId, undefined);

        assert.equal((await call("POST", `/agents/${eaAppt.body.data._id}/revoke`, { reason: "Changed my election agent" }, cand.token)).status, 200);
        assert.equal((await call("GET", "/assignments/me", undefined, ea.token)).body.data.assignments.length, 0);
        assert.equal((await appoint(ea, { type: "polling", epic: pa2.user.epic, stationId: station._id })).status, 403, "a revoked election agent can no longer appoint");
    } finally { process.env.STEP_UP_REQUIRED = "true"; }
});
