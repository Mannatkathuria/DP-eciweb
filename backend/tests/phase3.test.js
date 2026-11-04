import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { publishStation, forwardToCommission } from "./helpers/stationApproval.js";

// Phase 3: poll day at a polling station. Station-scoped search, guided marking, the poll's
// order (mock poll, open, closed), queue reports and exceptions decided by the presiding officer.
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
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.3.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    const ludhiana = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Ludhiana");
    const area = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[6] };
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
    const A = await station(0); const B = await station(1);
    const electors = [];
    for (const [i, s] of [[0, A], [1, A], [2, A], [3, A], [4, B]]) {
        const epic = `PD${String.fromCharCode(65 + i)}${String((runId + i) % 1e7).padStart(7, "0")}`;
        await saveElector({ _id: crypto.randomUUID(), epic, name: `Voter ${i} ${runId}`, dateOfBirth: "1990-05-05T00:00:00.000Z", gender: "Female", state: s.state, district: s.district,
            assemblyConstituency: s.constituency, partNumber: s.partNumber, pollingStation: s.pollingStation, isActive: true });
        electors.push(epic);
    }
    const created = await call("POST", "/elections", { name: `Poll today ${runId}`, type: "bye_election", states: ["Punjab"], schedule: scheduleWithPollIn(0) }, eci.token);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const election = created.body.data;
    const at = (s) => ({ state: s.state, district: s.district, constituency: s.constituency, pollingStation: s.pollingStation, partNumber: s.partNumber });
    const team = {};
    for (const [key, role, s] of [["pro", "presiding_officer", A], ["po", "polling_officer", A], ["agent", "polling_agent", A], ["poB", "polling_officer", B], ["blo", "blo", A], ["micro", "micro_observer", A]]) {
        team[key] = await makeUser(role);
        await grant(team[key], role, at(s), role === "blo" ? undefined : election._id);
    }
    ctx = { redis, server, call, makeUser, grant, getElectorByEpic, runId, area, eci, A, B, electors, election, team };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });

test("station: each member of the team sees only their own station; search is limited to the part", needsRedis, async () => {
    const { call, team, A, B, electors, election } = await setup();
    const s = await call("GET", "/poll-day/station", undefined, team.po.token);
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.data.station._id, A._id);
    assert.equal(s.body.data.election._id, election._id);
    assert.equal(s.body.data.onPollDay, true);
    assert.deepEqual(s.body.data.turnout, { electors: 4, voted: 0, percent: 0 });
    assert.equal(s.body.data.poll.status, "not_started");

    const found = (await call("GET", "/poll-day/electors", undefined, team.po.token)).body.data.items.map((e) => e.epic);
    assert.deepEqual(found.sort(), electors.slice(0, 4).sort());
    assert.equal((await call("GET", `/poll-day/electors?q=${electors[4]}`, undefined, team.po.token)).body.data.items.length, 0, "part B's elector is not visible at A");
    assert.equal((await call("GET", "/poll-day/electors", undefined, team.poB.token)).body.data.items[0].epic, electors[4]);
    assert.equal((await call("GET", `/poll-day/station?stationId=${B._id}`, undefined, team.po.token)).status, 403);

    // The BLO at the voter assistance booth can find an elector's serial, but not who has voted.
    const vab = (await call("GET", `/poll-day/electors?q=${electors[0]}`, undefined, team.blo.token)).body.data.items[0];
    assert.equal(vab.serial > 0, true); assert.equal(vab.voted, undefined);
    // Agents and observers cannot search or mark; voters and others are refused.
    assert.equal((await call("GET", "/poll-day/electors", undefined, team.agent.token)).status, 403);
    assert.equal((await call("POST", `/poll-day/electors/${electors[0]}/mark`, {}, team.micro.token)).status, 403);
    const voter = await ctx.makeUser("voter");
    assert.equal((await call("GET", "/poll-day/station", undefined, voter.token)).status, 403);
    const unassigned = await ctx.makeUser("polling_officer");
    assert.equal((await call("GET", "/poll-day/station", undefined, unassigned.token)).status, 403);
});

test("poll: mock poll, open, mark each elector once with the guided checks, queue, close", needsRedis, async () => {
    const { call, team, electors, getElectorByEpic, A } = await setup();
    const mark = (epic, body, who = team.po) => call("POST", `/poll-day/electors/${epic}/mark`, body, who.token);
    const ok = { idDocument: "aadhaar", checks: { photoMatches: true, inkApplied: true } };

    assert.equal((await mark(electors[0], ok)).status, 409, "the poll is not open yet");
    assert.equal((await call("POST", "/poll-day/poll/status", { status: "open" }, team.pro.token)).status, 409, "mock poll first");
    assert.equal((await call("POST", "/poll-day/poll/status", { status: "mock_poll_done" }, team.po.token)).status, 403, "only the presiding officer");
    assert.equal((await call("POST", "/poll-day/poll/status", { status: "mock_poll_done", note: "Mock poll with agents present; cleared" }, team.pro.token)).status, 200);
    assert.equal((await call("POST", "/poll-day/queue", { waiting: 5 }, team.po.token)).status, 409, "queue only while open");
    assert.equal((await call("POST", "/poll-day/poll/status", { status: "open" }, team.pro.token)).status, 200);

    assert.equal((await mark(electors[0], { ...ok, idDocument: "library_card" })).status, 400);
    assert.equal((await mark(electors[0], { ...ok, checks: { photoMatches: true } })).status, 400);
    assert.equal((await mark(electors[4], ok)).status, 404, "an elector of another part");
    const first = await mark(electors[0], ok);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.data.serial, 1);
    assert.equal((await mark(electors[0], ok)).status, 409, "never twice");
    assert.equal((await getElectorByEpic(electors[0])).votedBooth, A.pollingStation);

    // Simultaneous marking of the same elector: exactly one succeeds; serials stay unique.
    const results = await Promise.all([mark(electors[1], ok), mark(electors[1], ok, team.pro), mark(electors[1], ok)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);

    assert.equal((await call("POST", "/poll-day/queue", { waiting: -1 }, team.po.token)).status, 400);
    assert.equal((await call("POST", "/poll-day/queue", { waiting: 12 }, team.po.token)).status, 200);
    const s = (await call("GET", "/poll-day/station", undefined, team.micro.token)).body.data;
    assert.deepEqual(s.turnout, { electors: 4, voted: 2, percent: 50 });
    assert.equal(s.queue.waiting, 12);

    const register = (await call("GET", "/poll-day/register", undefined, team.pro.token)).body.data.items;
    assert.deepEqual(register.map((e) => e.serial), [1, 2]);
    assert.equal(register[0].idDocumentLabel, "Aadhaar card");
    assert.equal((await call("GET", "/poll-day/register", undefined, team.po.token)).status, 403);
    const searched = (await call("GET", `/poll-day/electors?q=${electors[0]}`, undefined, team.po.token)).body.data.items[0];
    assert.equal(searched.voted, true);
});

test("exceptions: doubts and challenges stop marking until the presiding officer decides; tendered and assisted votes are recorded", needsRedis, async () => {
    const { call, team, electors } = await setup();
    const ok = { idDocument: "epic", checks: { photoMatches: true, inkApplied: true } };
    const raise = (body, who) => call("POST", "/poll-day/cases", body, who.token);

    // A polling agent challenges an elector's identity (only that).
    assert.equal((await raise({ type: "identity_doubt", epic: electors[2], note: "x y z" }, team.agent)).status, 403);
    assert.equal((await raise({ type: "challenged_vote", epic: electors[2] }, team.agent)).status, 400, "a reason is needed");
    const challenge = await raise({ type: "challenged_vote", epic: electors[2], note: "Not the person on the roll; challenge fee paid" }, team.agent);
    assert.equal(challenge.status, 201, JSON.stringify(challenge.body));
    assert.equal((await raise({ type: "identity_doubt", epic: electors[2], note: "Photo unclear" }, team.po)).status, 409, "already open");
    assert.equal((await call("POST", `/poll-day/electors/${electors[2]}/mark`, ok, team.po.token)).status, 409, "blocked while open");
    assert.equal((await call("POST", `/poll-day/cases/${challenge.body.data._id}/resolve`, { decision: "rejected" }, team.po.token)).status, 403);
    assert.equal((await call("POST", `/poll-day/cases/${challenge.body.data._id}/resolve`, { decision: "upheld" }, team.pro.token)).status, 400, "reason needed");
    assert.equal((await call("POST", `/poll-day/cases/${challenge.body.data._id}/resolve`, { decision: "rejected", note: "Identity confirmed from the EPIC" }, team.pro.token)).status, 200);
    assert.equal((await call("POST", `/poll-day/electors/${electors[2]}/mark`, ok, team.po.token)).status, 201, "allowed after the challenge failed");

    // A doubt the presiding officer upholds keeps the elector from being marked.
    const doubt = await raise({ type: "identity_doubt", epic: electors[3], note: "Face does not match the photo" }, team.po);
    assert.equal((await call("POST", `/poll-day/cases/${doubt.body.data._id}/resolve`, { decision: "refused", note: "Could not establish identity" }, team.pro.token)).status, 200);
    assert.equal((await call("POST", `/poll-day/electors/${electors[3]}/mark`, ok, team.po.token)).status, 409);
    assert.equal((await call("POST", `/poll-day/cases/${doubt.body.data._id}/resolve`, { decision: "allowed" }, team.pro.token)).status, 409, "decided once");

    // Tendered vote: only for an elector already marked, recorded by the presiding officer.
    assert.equal((await raise({ type: "tendered_vote", epic: electors[3] }, team.pro)).status, 409);
    assert.equal((await raise({ type: "tendered_vote", epic: electors[0] }, team.po)).status, 403);
    const tendered = await raise({ type: "tendered_vote", epic: electors[0], note: "Person says someone else voted in their name" }, team.pro);
    assert.equal(tendered.body.data.status, "recorded");
    assert.equal((await raise({ type: "assisted_voter", epic: electors[2] }, team.po)).status, 400, "companion's name needed");
    assert.equal((await raise({ type: "assisted_voter", epic: electors[2], companionName: "Ravi Kumar" }, team.po)).status, 201);

    // The agent sees only their own cases; the presiding officer sees all.
    assert.equal((await call("GET", "/poll-day/cases", undefined, team.agent.token)).body.data.items.length, 1);
    assert.equal((await call("GET", "/poll-day/cases", undefined, team.pro.token)).body.data.items.length, 4);

    // Close: nothing more can be marked; closing records the register count.
    const closed = await call("POST", "/poll-day/poll/status", { status: "closed" }, team.pro.token);
    assert.equal(closed.status, 200);
    assert.equal(closed.body.data.closing.votesInRegister, 3);
    assert.equal((await call("POST", "/poll-day/poll/status", { status: "open" }, team.pro.token)).status, 409);
    assert.equal((await call("POST", `/poll-day/electors/${electors[3]}/mark`, ok, team.pro.token)).status, 409);
    const audit = (await call("GET", `/audit/poll_case/${challenge.body.data._id}`, undefined, ctx.eci.token)).body.data.items.map((e) => e.action);
    assert.deepEqual(audit.sort(), ["poll.case_challenged_vote", "poll.case_decided"]);
});

test("poll day: nothing can be done before the poll date", needsRedis, async () => {
    const { call, makeUser, grant, eci, A, electors, runId } = await setup();
    const later = await call("POST", "/elections", { name: `Poll later ${runId}`, type: "bye_election", states: ["Punjab"], schedule: scheduleWithPollIn(5) }, eci.token);
    const pro = await makeUser("presiding_officer");
    await grant(pro, "presiding_officer", { state: A.state, district: A.district, constituency: A.constituency, pollingStation: A.pollingStation, partNumber: A.partNumber }, later.body.data._id);
    const s = (await call("GET", "/poll-day/station", undefined, pro.token)).body.data;
    assert.equal(s.onPollDay, false); assert.equal(s.election.pollDate, day(5));
    assert.equal((await call("POST", "/poll-day/poll/status", { status: "mock_poll_done" }, pro.token)).status, 409);
    assert.equal((await call("POST", `/poll-day/electors/${electors[3]}/mark`, { idDocument: "epic", checks: { photoMatches: true, inkApplied: true } }, pro.token)).status, 409);
});

test("search: spelling variants, relative's name, house number and roll serial find the elector, only within the part", needsRedis, async () => {
    const { call, team, A, B, runId } = await setup();
    const { saveElector } = await import("../src/repositories/elector.repository.js");
    const add = async (suffix, s, extra) => {
        const epic = `PZ${suffix}${String(runId % 1e7).padStart(7, "0")}`;
        await saveElector({ _id: crypto.randomUUID(), epic, dateOfBirth: "1980-01-01T00:00:00.000Z", gender: "Female", state: s.state, district: s.district,
            assemblyConstituency: s.constituency, partNumber: s.partNumber, pollingStation: s.pollingStation, isActive: true, ...extra });
        return epic;
    };
    const lakshmi = await add("A", A, { name: "Lakshmi Iyer", relativeName: "Venkatesh Iyer", relationType: "Husband", houseNumber: "14-B", serialNumber: 901 });
    const rafi = await add("B", A, { name: "Mohammad Rafi", relativeName: "Abdul Rafi", relationType: "Father", houseNumber: "7" });
    await add("C", B, { name: "Lakshmi Narayan", relativeName: "Hari Narayan", houseNumber: "14-B" });
    const find = async (q, field) => (await call("GET", `/poll-day/electors?q=${encodeURIComponent(q)}${field ? `&field=${field}` : ""}`, undefined, team.po.token)).body.data.items;

    assert.equal((await find("laxmi"))[0].epic, lakshmi, "spelling variant");
    assert.equal((await find("Lakshmi")).length, 1, "the part B elector of the same name is not visible");
    assert.equal((await find("mohd rafi"))[0].epic, rafi, "abbreviation");
    const byRelative = await find("venkatesh", "relative");
    assert.equal(byRelative[0].epic, lakshmi);
    assert.equal(byRelative[0].matchedOn, "relative");
    assert.equal(byRelative[0].relationType, "Husband");
    assert.equal((await find("14-b", "house"))[0].epic, lakshmi);
    assert.equal((await find("901", "serial"))[0].epic, lakshmi);
    assert.equal((await find("venkatesh", "name")).length, 0, "a field limits the search");
    assert.equal((await find("qqqzzz")).length, 0);
});

test("voter assistance booth: the BLO prints a slip whose QR holds only an opaque reference; only the station's polling party can look it up", needsRedis, async () => {
    const { call, team, electors, makeUser, grant, B, election } = await setup();
    assert.equal((await call("POST", `/poll-day/vab-slips/${electors[1]}`, {}, team.po.token)).status, 403, "only the BLO issues slips");
    assert.equal((await call("POST", `/poll-day/vab-slips/${electors[4]}`, {}, team.blo.token)).status, 404, "another part's elector");
    const slip = await call("POST", `/poll-day/vab-slips/${electors[1]}`, {}, team.blo.token);
    assert.equal(slip.status, 201, JSON.stringify(slip.body));
    assert.match(slip.body.data.qr, /^ECIWEB-SLIP:[A-Za-z0-9_-]+$/);
    assert.ok(!slip.body.data.qr.includes(electors[1]), "no EPIC in the QR");
    const look = await call("GET", `/poll-day/vab-slips/${encodeURIComponent(slip.body.data.qr)}`, undefined, team.po.token);
    assert.equal(look.status, 200);
    assert.equal(look.body.data.epic, electors[1]);
    assert.equal(look.body.data.serial, slip.body.data.serial);
    assert.equal((await call("GET", `/poll-day/vab-slips/${slip.body.data.slipId}`, undefined, team.poB.token)).status, 404, "not valid at another station");
    assert.equal((await call("GET", `/poll-day/vab-slips/${slip.body.data.slipId}`, undefined, team.agent.token)).status, 403);
    assert.equal((await call("GET", "/poll-day/vab-slips/not-a-real-slip", undefined, team.po.token)).status, 404);
});
