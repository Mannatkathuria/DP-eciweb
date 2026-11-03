import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Form 7 (objection / deletion), server-side sign-out, OTPs and rate limits in Redis.
process.env.STEP_UP_REQUIRED = process.env.STEP_UP_REQUIRED ?? "false"; // step-up is covered in phase7.test.js
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = "";
process.env.FORM7_NOTICE_DAYS = "7";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

let ctx;
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    const elec = await import("../src/repositories/elector.repository.js");
    await connectRedis();
    const runId = crypto.randomInt(0, 1e9);
    const epic = (p) => `${p}${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`;
    const makeUser = async (role, e = epic("TST")) => {
        const user = { _id: crypto.randomUUID(), epic: e, role, name: `${role} ${runId}`, mustChangePassword: false };
        await saveUser(user);
        return { user, token: jwt.sign({ _id: user._id, epic: user.epic, role }, "test") };
    };
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = async (method, path, body, token, headers = {}) => {
        const res = await fetch(`${base}${path}`, {
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.14.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    // Patiala district is used by no other test file, so this file's records never mix with theirs.
    const patiala = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Patiala");
    const area = { state: "Punjab", district: "Patiala", assemblyConstituency: patiala.constituencies[0] };
    const other = { state: "Punjab", district: "Patiala", assemblyConstituency: patiala.constituencies[1] };
    const elector = async (where, partNumber = "7") => {
        const e = { _id: crypto.randomUUID(), epic: epic("FSV"), name: `Elector ${crypto.randomInt(0, 1e6)}`, gender: "Female", age: 40, ...where, partNumber, isActive: true };
        await elec.saveElector(e);
        return e;
    };
    const eci = await makeUser("eci");
    const grant = async (who, role, jurisdiction) => {
        const r = await call("POST", "/assignments", { epic: who.user.epic, role, jurisdiction }, eci.token);
        assert.equal(r.status, 201, JSON.stringify(r.body));
    };
    const ac = { state: area.state, district: area.district, constituency: area.assemblyConstituency };
    const ero = await makeUser("ero"); await grant(ero, "ero", ac);
    const blo = await makeUser("blo"); await grant(blo, "blo", ac);
    const outsideEro = await makeUser("ero"); await grant(outsideEro, "ero", { ...ac, constituency: other.assemblyConstituency });
    ctx = { redis, elec, makeUser, call, area, other, elector, ero, blo, outsideEro, grant, ac, server };
    return ctx;
};

test("Form 7: objection with notice, reply, field report and a non-destructive deletion", needsRedis, async () => {
    const { call, area, other, elector, makeUser, ero, blo, outsideEro, elec, redis } = await setup();
    const objectorEntry = await elector(area);
    const targetEntry = await elector(area);
    const farEntry = await elector(other);
    const objector = await makeUser("voter", objectorEntry.epic);
    const target = await makeUser("voter", targetEntry.epic);
    const body = { targetEpic: targetEntry.epic, ground: "shifted", details: "Moved to Chandigarh in 2024; house sold to a new family.", declaration: true };

    // Validation and eligibility.
    assert.equal((await call("POST", "/objections", { ...body, declaration: false }, objector.token)).status, 400);
    assert.equal((await call("POST", "/objections", { ...body, ground: "dislike" }, objector.token)).status, 400);
    assert.equal((await call("POST", "/objections", { ...body, details: "short" }, objector.token)).status, 400);
    assert.equal((await call("POST", "/objections", { ...body, targetEpic: farEntry.epic }, objector.token)).status, 403, "other constituency");
    assert.equal((await call("POST", "/objections", { ...body, targetEpic: "ZZZ0000000" }, objector.token)).status, 404);
    assert.equal((await call("POST", "/objections", body, ero.token)).status, 403, "an ERO does not file objections");

    const filed = await call("POST", "/objections", body, objector.token);
    assert.equal(filed.status, 201, JSON.stringify(filed.body));
    const id = filed.body.data._id;
    assert.equal(filed.body.data.status, "notice");
    assert.ok(Date.parse(filed.body.data.noticeUntil) > Date.now() + 6 * 86400000);
    assert.equal((await call("POST", "/objections", body, objector.token)).status, 409, "one open objection per entry");

    // The elector objected to sees it (objector named, no documents) and replies once.
    const mine = await call("GET", "/objections/my", undefined, target.token);
    assert.equal(mine.body.data.against[0]._id, id);
    assert.equal(mine.body.data.against[0].objector.name, objectorEntry.name);
    assert.equal(mine.body.data.against[0].documentProof, undefined);
    assert.equal((await call("POST", `/objections/${id}/reply`, { reply: "I still live here; see my ration card." }, objector.token)).status, 404, "only the elector objected to replies");
    assert.equal((await call("POST", `/objections/${id}/reply`, { reply: "I still live here; see my ration card." }, target.token)).status, 200);
    assert.equal((await call("POST", `/objections/${id}/reply`, { reply: "Second reply is refused." }, target.token)).status, 409);

    // Jurisdiction and order of steps.
    assert.equal((await call("GET", "/objections/staff", undefined, outsideEro.token)).body.data.items.some((o) => o._id === id), false);
    assert.equal((await call("POST", `/objections/staff/${id}/decide`, { outcome: "accepted", reason: "Shifted as reported." }, outsideEro.token)).status, 403);
    assert.equal((await call("POST", `/objections/staff/${id}/decide`, { outcome: "accepted", reason: "Shifted as reported." }, ero.token)).status, 409, "needs the field report");
    assert.equal((await call("POST", `/objections/staff/${id}/field-report`, { finding: "maybe", notes: "Visited twice." }, blo.token)).status, 400);
    assert.equal((await call("POST", `/objections/staff/${id}/field-report`, { finding: "confirmed", notes: "Neighbours confirm the family moved out in 2024." }, blo.token)).status, 200);
    const early = await call("POST", `/objections/staff/${id}/decide`, { outcome: "accepted", reason: "Shifted as reported." }, ero.token);
    assert.equal(early.status, 409, "not before the notice period ends");
    assert.match(early.body.message, /notice period/);

    // End of the notice period (moved back in the stored record), then the ERO accepts.
    const stored = JSON.parse(await redis().get(`objection:${id}`));
    await redis().set(`objection:${id}`, JSON.stringify({ ...stored, noticeUntil: new Date(Date.now() - 1000).toISOString() }));
    const decided = await call("POST", `/objections/staff/${id}/decide`, { outcome: "accepted", reason: "Field report confirms the shift; reply not supported by proof." }, ero.token);
    assert.equal(decided.status, 200, JSON.stringify(decided.body));
    const after = await elec.getElectorByEpic(targetEntry.epic);
    assert.equal(after.isActive, false, "marked deleted");
    assert.equal(after.name, targetEntry.name, "the entry itself is kept");
    assert.equal(after.deletion.objectionId, id);
    assert.equal((await call("POST", `/objections/staff/${id}/decide`, { outcome: "rejected", reason: "Second decision." }, ero.token)).status, 409);
    const history = await call("GET", `/audit/elector/${targetEntry.epic}`, undefined, ero.token);
    assert.ok(history.body.data.items.some((e) => e.action === "elector.deleted"));
});

test("Form 7: self-deletion, withdrawal, rejection, and the booth level agent's daily limit", needsRedis, async () => {
    const { call, area, elector, makeUser, ero, blo, grant, ac, elec } = await setup();
    const me = await elector(area);
    const voter = await makeUser("voter", me.epic);
    assert.equal((await call("POST", "/objections", { targetEpic: me.epic, ground: "deceased", details: "Testing a ground that cannot apply to oneself.", declaration: true }, voter.token)).status, 400);
    const self = await call("POST", "/objections", { targetEpic: me.epic, ground: "duplicate", details: "I am also enrolled in Ludhiana North part 12.", declaration: true }, voter.token);
    assert.equal(self.status, 201);
    assert.equal(self.body.data.status, "pending_verification");
    assert.equal(self.body.data.noticeUntil, null);
    assert.equal((await call("POST", `/objections/${self.body.data._id}/withdraw`, {}, voter.token)).status, 200);
    assert.equal((await call("POST", `/objections/${self.body.data._id}/withdraw`, {}, voter.token)).status, 409);

    // Rejected: the entry stays.
    const other = await elector(area);
    const again = await call("POST", "/objections", { targetEpic: other.epic, ground: "absent", details: "Never seen at this address by the neighbours.", declaration: true }, voter.token);
    assert.equal(again.status, 201);
    await call("POST", `/objections/staff/${again.body.data._id}/field-report`, { finding: "not_confirmed", notes: "Elector met at home with documents." }, blo.token);
    assert.equal((await call("POST", `/objections/staff/${again.body.data._id}/decide`, { outcome: "rejected", reason: "Elector found resident at the address." }, ero.token)).status, 200);
    assert.equal((await elec.getElectorByEpic(other.epic)).isActive, true);

    // A booth level agent files only in their part, at most 10 a day.
    const bla = await makeUser("bla");
    await grant(bla, "bla", { ...ac, pollingStation: "Any Station" });
    const outside = await elector(ctx.other);
    assert.equal((await call("POST", "/objections", { targetEpic: outside.epic, ground: "absent", details: "Agent objection outside the part.", declaration: true }, bla.token)).status, 403);
    for (let i = 0; i < 10; i++) {
        const e = await elector(area);
        const r = await call("POST", "/objections", { targetEpic: e.epic, ground: "deceased", details: `Death reported by family, entry ${i}.`, declaration: true }, bla.token);
        assert.equal(r.status, 201, JSON.stringify(r.body));
    }
    const eleventh = await elector(area);
    assert.equal((await call("POST", "/objections", { targetEpic: eleventh.epic, ground: "deceased", details: "Eleventh objection of the day.", declaration: true }, bla.token)).status, 429);
});

test("Sessions are revoked on sign-out; 'sign out everywhere' ends older sessions", needsRedis, async () => {
    const { call, makeUser } = await setup();
    const { user } = await makeUser("voter");
    const sign = () => jwt.sign({ _id: user._id, epic: user.epic, role: "voter" }, "test", { expiresIn: "1h", jwtid: crypto.randomUUID() });
    const a = sign(); const b = sign();
    assert.equal((await call("GET", "/auth/me", undefined, a)).status, 200);
    assert.equal((await call("POST", "/auth/logout", {}, a)).status, 200);
    const refused = await call("GET", "/auth/me", undefined, a);
    assert.equal(refused.status, 401);
    assert.match(refused.body.message, /signed out/);
    assert.equal((await call("GET", "/auth/me", undefined, b)).status, 200, "other sessions continue");
    assert.equal((await call("POST", "/auth/logout-all", {}, b)).status, 200);
    assert.equal((await call("GET", "/auth/me", undefined, b)).status, 401);
    await new Promise((r) => setTimeout(r, 1100)); // tokens carry whole-second issue times
    assert.equal((await call("GET", "/auth/me", undefined, sign())).status, 200, "a new sign-in works");
});

test("OTPs are stored hashed in Redis and rate limits are counted in Redis", needsRedis, async () => {
    const { redis, call } = await setup();
    const otp = await import("../src/services/otp.service.js");
    const log = console.log; let code;
    console.log = (line) => { const m = String(line).match(/\[DEMO OTP\] test-otp: (\d{6})/); if (m) code = m[1]; else log(line); };
    try { await otp.issueOtp("test:otp-key", { logLabel: "test-otp" }); } finally { console.log = log; }
    const stored = await redis().hGetAll("otp:test:otp-key");
    assert.ok(stored.digest && !JSON.stringify(stored).includes(code), "the code itself is not stored");
    await assert.rejects(otp.checkOtp("test:otp-key", code === "000000" ? "111111" : "000000"), /Incorrect/);
    await otp.checkOtp("test:otp-key", code);
    await assert.rejects(otp.checkOtp("test:otp-key", code), /expired/, "used once");

    // The public limiter (60 a minute) counts in Redis for one client address.
    const ip = `10.99.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`;
    let last;
    for (let i = 0; i < 61; i++) last = await call("GET", "/public/elections", undefined, undefined, { "X-Forwarded-For": ip });
    assert.equal(last.status, 429);
    const keys = await redis().keys(`rl:*public:${ip}`);
    assert.equal(keys.length, 1);
});
