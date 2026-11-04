import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { publishStation, forwardToCommission } from "./helpers/stationApproval.js";

// Directive phase 6: counting operations. Plan, randomised staff allocation, rounds, discrepancy
// reports, observer reports and the VVPAT draw. No vote figures are recorded.
process.env.STEP_UP_REQUIRED = process.env.STEP_UP_REQUIRED ?? "false"; // step-up is covered in phase7.test.js
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = "";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const { todayIST } = await import("../src/services/election.service.js");
const day = (offset) => { const d = new Date(`${todayIST()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const scheduleWithPollIn = (n) => ({ notificationDate: day(n - 30), lastDateOfNominations: day(n - 23), scrutinyDate: day(n - 22), lastDateOfWithdrawal: day(n - 20), pollDate: day(n), countingDate: day(n + 3) });

let ctx;
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    const { saveElector, getElectorByEpic } = await import("../src/repositories/elector.repository.js");
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
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.11.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    const ludhiana = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Ludhiana");
    const area = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[13] };
    const eci = await makeUser("eci");
    const deo = await makeUser("deo");
    const grant = async (who, role, jurisdiction, election) => {
        const r = await call("POST", "/assignments", { epic: who.user.epic, role, jurisdiction, election }, eci.token);
        assert.equal(r.status, 201, JSON.stringify(r.body));
    };
    await grant(deo, "deo", { state: "Punjab", district: "Ludhiana" });
    // Two approved stations (parts A and B) of this run.
    const station = async (n) => {
        const partNumber = String(1 + ((runId + n) % 9000));
        const name = `Poll School ${runId}-${n}`;
        const p = await call("POST", "/polling-stations", { ...area, partNumber, name, address: `Ward ${n}, Sarabha Nagar, Ludhiana 141001` }, deo.token);
        assert.equal(p.status, 201, JSON.stringify(p.body));
        assert.equal((await publishStation(call, p.body.data._id, deo.token, eci.token, area.state)).status, 200);
        return { ...area, partNumber, pollingStation: name, _id: p.body.data._id };
    };
        const stations = [await station(0), await station(1), await station(2)];
    const created = await call("POST", "/elections", { name: `Counting today ${runId}`, type: "bye_election", states: ["Punjab"], schedule: scheduleWithPollIn(-3) }, eci.token);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const election = created.body.data;
    const ac = { state: area.state, district: area.district, constituency: area.constituency };
    const team = {};
    for (const [key, role] of [["ro", "ro"], ["s1", "counting_supervisor"], ["s2", "counting_supervisor"], ["a1", "counting_assistant"], ["a2", "counting_assistant"], ["agent", "counting_agent"], ["obs", "counting_observer"]]) {
        team[key] = await makeUser(role);
        await grant(team[key], role, ac, election._id);
    }
    team.otherRo = await makeUser("ro");
    await grant(team.otherRo, "ro", { ...ac, constituency: ludhiana.constituencies[1] }, election._id);
    ctx = { redis, server, call, makeUser, runId, ac, election, team, stations };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });

test("counting: RO plans, staff are randomised to tables, rounds advance in order, discrepancies block a round until decided", needsRedis, async () => {
    const { call, ac, election, team } = await setup();
    const url = `/counting/${election._id}`;
    const q = `?state=${encodeURIComponent(ac.state)}&district=${encodeURIComponent(ac.district)}&constituency=${encodeURIComponent(ac.constituency)}`;
    assert.equal((await call("GET", url + q, undefined, team.ro.token)).body.data.plan, null);
    assert.equal((await call("GET", url + q, undefined, team.otherRo.token)).status, 403, "another constituency's RO");

    const plan = { ...ac, centre: { name: "Govt College for Women", address: "Ferozepur Road, Ludhiana 141001" }, halls: [{ name: "Hall A", tables: 2 }] };
    assert.equal((await call("POST", `${url}/plan`, plan, team.s1.token)).status, 403);
    assert.equal((await call("POST", `${url}/plan`, plan, team.obs.token)).status, 403, "an observer can view, not plan");
    assert.equal((await call("POST", `${url}/plan`, plan, team.agent.token)).status, 403, "a counting agent cannot edit counting records");
    const saved = await call("POST", `${url}/plan`, plan, team.ro.token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const rounds = saved.body.data.rounds;
    assert.ok(rounds.length >= 2, "three or more stations over two tables");
    assert.equal(rounds[0].tables.length, 2);

    assert.equal((await call("POST", `${url}/randomise`, { ...ac, supervisors: [team.s1.user.epic], assistants: [team.a1.user.epic, team.a2.user.epic] }, team.ro.token)).status, 400, "not enough supervisors");
    assert.equal((await call("POST", `${url}/randomise`, { ...ac, supervisors: [team.s1.user.epic, team.agent.user.epic], assistants: [team.a1.user.epic, team.a2.user.epic] }, team.ro.token)).status, 400, "an agent is not a supervisor");
    const staffed = await call("POST", `${url}/randomise`, { ...ac, supervisors: [team.s1.user.epic, team.s2.user.epic], assistants: [team.a1.user.epic, team.a2.user.epic] }, team.ro.token);
    assert.equal(staffed.status, 200, JSON.stringify(staffed.body));
    assert.match(staffed.body.data.randomisation.seed, /^[0-9a-f]{32}$/);
    const tables = staffed.body.data.halls[0].tables;
    assert.deepEqual(tables.map((t) => t.supervisor.epic).sort(), [team.s1.user.epic, team.s2.user.epic].sort());

    const mine = (await call("GET", url + q, undefined, team.s1.token)).body.data.myTable;
    const myNo = mine.no; const otherNo = myNo === 1 ? 2 : 1;
    const record = (round, table, who, body = { form17cPart2Signed: true }) => call("POST", `${url}/rounds/${round}/tables/${table}`, { ...ac, ...body }, who.token);
    assert.equal((await record(1, otherNo, team.s1)).status, 403, "not their table");
    assert.equal((await record(1, myNo, team.agent)).status, 403, "a counting agent cannot record a table");
    assert.equal((await record(1, myNo, team.obs)).status, 403, "an observer cannot record a table");
    assert.equal((await record(1, myNo, team.s1, {})).status, 400, "Form 17C Part II confirmation required");
    assert.equal((await record(2, 1, team.ro)).status, 409, "round 1 first");
    assert.equal((await record(1, myNo, team.s1)).status, 200);
    assert.equal((await record(1, myNo, team.s1)).status, 409, "once");
    assert.equal((await call("POST", `${url}/rounds/1/complete`, ac, team.ro.token)).status, 409, "a table is missing");
    assert.equal((await record(1, otherNo, team.ro)).status, 200, "the RO can record any table");
    assert.equal((await call("POST", `${url}/plan`, plan, team.ro.token)).status, 409, "the plan is fixed once counting starts");

    // A counting agent reports a discrepancy; the round cannot close until the RO decides it.
    assert.equal((await call("POST", `${url}/discrepancies`, { ...ac, round: 1, table: myNo, type: "seal", description: "x" }, team.agent.token)).status, 400);
    const d = await call("POST", `${url}/discrepancies`, { ...ac, round: 1, table: myNo, type: "seal", description: "Green paper seal number does not match Form 17C" }, team.agent.token);
    assert.equal(d.status, 201, JSON.stringify(d.body));
    assert.equal((await call("POST", `${url}/rounds/1/complete`, ac, team.ro.token)).status, 409);
    assert.equal((await call("POST", `${url}/discrepancies/${d.body.data._id}/decide`, { ...ac, decision: "rejected", note: "Seal checked with the presiding officer's diary" }, team.s1.token)).status, 403);
    assert.equal((await call("POST", `${url}/discrepancies/${d.body.data._id}/decide`, { ...ac, decision: "rejected", note: "Seal checked against the presiding officer's diary; matches" }, team.ro.token)).status, 200);
    assert.equal((await call("POST", `${url}/rounds/1/complete`, ac, team.obs.token)).status, 403);
    const done = await call("POST", `${url}/rounds/1/complete`, ac, team.ro.token);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.data.status, "completed");

    // Observers report; agents cannot file observer reports.
    assert.equal((await call("POST", `${url}/observer-reports`, { ...ac, note: "Round 1 conducted in order" }, team.agent.token)).status, 403);
    assert.equal((await call("POST", `${url}/observer-reports`, { ...ac, note: "Round 1 conducted in order", severity: "routine", round: 1 }, team.obs.token)).status, 201);
    const view = (await call("GET", url + q, undefined, team.obs.token)).body.data;
    assert.equal(view.observerReports.length, 1);
    assert.equal(view.discrepancies[0].decision, "rejected");
    assert.equal(/"votes"|"voteCount"|"candidateVotes"/.test(JSON.stringify(view)), false, "no vote figures anywhere");
});

test("results: a candidate or counting agent cannot register sources or send result entries", needsRedis, async () => {
    const { call, team, makeUser } = await setup();
    const candidate = await makeUser("candidate");
    for (const who of [candidate, team.agent, team.ro]) {
        assert.equal((await call("POST", "/results/sources", { name: "x", kind: "mock" }, who.token)).status, 403);
        assert.equal((await call("POST", "/results/sources/anything/entries", { kind: "round", round: 1, votes: { 1: 5 } }, who.token)).status, 403);
    }
});

test("counting: the VVPAT draw is by lot, witnessed, recorded with its seed and made once", needsRedis, async () => {
    const { call, ac, election, team } = await setup();
    const url = `/counting/${election._id}`;
    assert.equal((await call("POST", `${url}/vvpat-draw`, { ...ac, witnesses: "" }, team.ro.token)).status, 400);
    assert.equal((await call("POST", `${url}/vvpat-draw`, { ...ac, witnesses: "Agents of all candidates, counting observer" }, team.s1.token)).status, 403);
    const draw = await call("POST", `${url}/vvpat-draw`, { ...ac, witnesses: "Agents of all candidates, counting observer" }, team.ro.token);
    assert.equal(draw.status, 200, JSON.stringify(draw.body));
    assert.equal(draw.body.data.drawn.length, Math.min(5, draw.body.data.of));
    assert.equal(new Set(draw.body.data.drawn.map((x) => x.stationId)).size, draw.body.data.drawn.length);
    assert.equal((await call("POST", `${url}/vvpat-draw`, { ...ac, witnesses: "Agents of all candidates" }, team.ro.token)).status, 409);
});
