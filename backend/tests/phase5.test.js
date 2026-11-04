import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { publishStation, forwardToCommission } from "./helpers/stationApproval.js";

// Phase 5: counting and results are read-only. Results come only from a registered source (an
// authorised feed, or a clearly labelled mock); entries are append-only and checked, never edited.
process.env.STEP_UP_REQUIRED = process.env.STEP_UP_REQUIRED ?? "false"; // step-up is covered in phase7.test.js
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = "";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const { todayIST } = await import("../src/services/election.service.js");
const day = (offset) => { const d = new Date(`${todayIST()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const scheduleCountingIn = (n) => ({ notificationDate: day(n - 33), lastDateOfNominations: day(n - 26), scrutinyDate: day(n - 25), lastDateOfWithdrawal: day(n - 23), pollDate: day(n - 3), countingDate: day(n) });

let ctx;
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis, transaction } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    const { saveContestingList } = await import("../src/repositories/election.repository.js");
    const { appendRegister } = await import("../src/repositories/poll.repository.js");
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
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.5.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    const ludhiana = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Ludhiana");
    const area = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[9] };
    const area2 = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[10] };
    const eci = await makeUser("eci");
    const mkElection = async (label, schedule) => (await call("POST", "/elections", { name: `${label} ${runId}`, type: "bye_election", states: ["Punjab"], schedule }, eci.token)).body.data;
    const counted = await mkElection("Counted", scheduleCountingIn(0));
    const publish = async (election, a) => {
        const tx = transaction();
        saveContestingList({ electionId: election._id, areaKey: `${a.state.toLowerCase()}|${a.constituency.toLowerCase()}`, ...a, publishedBy: "TEST", publishedAt: new Date().toISOString(),
            candidates: [["Asha", "Party A"], ["Bhim", "Party B"], ["Chetan", "Independent"]].map(([name, party], i) => ({ serial: i + 1, nominationId: `n${i}`, name, party, symbol: null, affidavit: {} })) }, tx);
        await tx.exec();
    };
    ctx = { redis, server, call, makeUser, eci, area, area2, counted, mkElection, publish, appendRegister, transaction, runId };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });

test("result sources: only the ECI administrator registers one; an official feed needs a legal basis and agreement", needsRedis, async () => {
    const { call, makeUser, eci } = await setup();
    const ro = await makeUser("ro");
    assert.equal((await call("POST", "/results/sources", { name: "Feed", type: "mock" }, ro.token)).status, 403);
    assert.equal((await call("POST", "/results/sources", { name: "Feed", type: "scraper" }, eci.token)).status, 400);
    assert.equal((await call("POST", "/results/sources", { name: "Official feed", type: "official_feed" }, eci.token)).status, 400);
    const ok = await call("POST", "/results/sources", { name: `Official counting feed ${crypto.randomUUID().slice(0, 8)}`, type: "official_feed", legalBasis: "Written authorisation of the Commission", agreementReference: "ECI/RES/2026/01" }, eci.token);
    assert.equal(ok.status, 201);
    ctx.official = ok.body.data;
    ctx.mock = (await call("POST", "/results/sources", { name: `Mock feed ${crypto.randomUUID().slice(0, 8)}`, type: "mock" }, eci.token)).body.data;
});

test("official feed: rounds are validated against the candidate list, append-only, corrected with a reason, declared once", needsRedis, async () => {
    const { call, eci, area, counted, publish, official } = await setup();
    const send = (body) => call("POST", `/results/sources/${official._id}/entries`, { electionId: counted._id, ...area, ...body }, eci.token);
    assert.equal((await send({ kind: "round", round: 1, votes: { 1: 10, 2: 5, 3: 1 } })).status, 409, "no list of contesting candidates yet");
    await publish(counted, area);

    assert.equal((await send({ kind: "round", round: 2, votes: { 1: 10, 2: 5, 3: 1 } })).status, 409, "rounds in order");
    assert.equal((await send({ kind: "round", round: 1, votes: { 1: 10, 2: 5 } })).status, 400, "every candidate");
    assert.equal((await send({ kind: "round", round: 1, votes: { 1: 10, 2: 5, 3: 1, 4: 2 } })).status, 400, "nobody else");
    assert.equal((await send({ kind: "round", round: 1, votes: { 1: -1, 2: 5, 3: 1 } })).status, 400);
    assert.equal((await send({ kind: "round", round: 1, votes: { 1: 10, 2: 5, 3: 1 }, tables: [{ table: 1, votes: { 1: 6, 2: 2, 3: 1 } }, { table: 2, votes: { 1: 4, 2: 2, 3: 0 } }] })).status, 400, "tables must add up");
    assert.equal((await send({ kind: "round", round: 1, nota: 2, tables: [{ table: 1, votes: { 1: 6, 2: 3, 3: 1 }, nota: 1 }, { table: 2, votes: { 1: 4, 2: 2, 3: 0 }, nota: 1 }] })).status, 201);
    assert.equal((await send({ kind: "postal", votes: { 1: 1, 2: 4, 3: 0 }, rejected: 2 })).status, 201);
    assert.equal((await send({ kind: "postal", votes: { 1: 1, 2: 4, 3: 0 } })).status, 409, "postal once");
    assert.equal((await send({ kind: "round", round: 2, votes: { 1: 3, 2: 9, 3: 2 } })).status, 201);
    assert.equal((await send({ kind: "correction", corrects: "2", votes: { 1: 3, 2: 8, 3: 2 } })).status, 400, "reason needed");
    assert.equal((await send({ kind: "correction", corrects: "7", votes: { 1: 3, 2: 8, 3: 2 }, reason: "Table 3 recount" })).status, 400);
    assert.equal((await send({ kind: "correction", corrects: "2", votes: { 1: 3, 2: 8, 3: 2 }, reason: "Table 3 recount ordered by the RO" })).status, 201);

    const view = async () => (await call("GET", `/public/results?electionId=${counted._id}&state=Punjab&constituency=${encodeURIComponent(area.constituency)}`)).body.data;
    let r = await view();
    assert.equal(r.mock, false);
    assert.match(r.label, /Only the Returning Officer's declaration is the official result/);
    assert.deepEqual(r.standings.map((c) => [c.name, c.evm, c.postal, c.total]), [["Bhim", 13, 4, 17], ["Asha", 13, 1, 14], ["Chetan", 3, 0, 3]]);
    assert.equal(r.rounds[1].correctedAt !== null, true);
    assert.equal(r.rounds[1].correctionReason, "Table 3 recount ordered by the RO");
    assert.deepEqual(r.progression.map((p) => p.cumulative["2"]), [9, 17]);
    assert.deepEqual(r.leading, { serial: 2, name: "Bhim", margin: 3 });
    assert.equal(r.entries, 4, "the original round 2 stays on record");
    assert.equal(r.checks.some((c) => c.code === "corrections"), true);

    const pub = (body) => call("POST", `/results/sources/${official._id}/publication`, { electionId: counted._id, ...area, ...body }, eci.token);
    assert.equal((await pub({ status: "declared", winnerSerial: 9 })).status, 400);
    assert.equal((await pub({ status: "completed" })).status, 200);
    assert.equal((await pub({ status: "declared", winnerSerial: 2 })).status, 200);
    assert.equal((await pub({ status: "completed" })).status, 409);
    assert.equal((await send({ kind: "round", round: 3, votes: { 1: 1, 2: 1, 3: 1 } })).status, 409, "nothing after the declaration");
    r = await view();
    assert.equal(r.declaredWinner.name, "Bhim"); assert.equal(r.leading, null);
    assert.equal(r.publication.status, "declared");

    // There is no way to edit or delete results.
    for (const [m, p] of [["PUT", `/results/sources/${official._id}/entries`], ["DELETE", `/results/sources/${official._id}/entries`], ["PATCH", "/public/results"]]) {
        assert.equal((await call(m, p, {}, eci.token)).status, 404, `${m} ${p}`);
    }
    // A different source cannot write to this constituency.
    assert.equal((await call("POST", `/results/sources/${ctx.mock._id}/entries`, { electionId: counted._id, ...area, kind: "round", round: 3, votes: { 1: 1, 2: 1, 3: 1 } }, eci.token)).status, 409);
});

test("official feed: nothing before counting day; reconciliation flags votes counted against station registers", needsRedis, async () => {
    const { call, eci, area2, mkElection, publish, official, transaction, appendRegister } = await setup();
    const future = await mkElection("Future count", scheduleCountingIn(4));
    await publish(future, area2);
    assert.equal((await call("POST", `/results/sources/${official._id}/entries`, { electionId: future._id, ...area2, kind: "round", round: 1, votes: { 1: 1, 2: 1, 3: 1 } }, eci.token)).status, 409);

    const counted2 = await mkElection("Reconcile", scheduleCountingIn(0));
    await publish(counted2, area2);
    // Find any approved station in area2, or none: create one so the register comparison applies.
    const deo = await ctx.makeUser("deo");
    await call("POST", "/assignments", { epic: deo.user.epic, role: "deo", jurisdiction: { state: "Punjab", district: "Ludhiana" } }, eci.token);
    const st = await call("POST", "/polling-stations", { ...area2, partNumber: String(1 + (ctx.runId % 9000)), name: `Count School ${ctx.runId}`, address: "Ward 1, Pakhowal Road, Ludhiana 141002" }, deo.token);
    assert.equal((await publishStation(call, st.body.data._id, deo.token, eci.token)).status, 200);
    const tx = transaction();
    for (let i = 1; i <= 5; i += 1) appendRegister({ serial: i, electionId: counted2._id, stationId: st.body.data._id, epic: `X${i}`, name: "x", idDocument: "epic", at: new Date().toISOString(), by: "T" }, tx);
    await tx.exec();
    await call("POST", `/results/sources/${official._id}/entries`, { electionId: counted2._id, ...area2, kind: "round", round: 1, votes: { 1: 3, 2: 2, 3: 1 }, nota: 0 }, eci.token);
    const r = (await call("GET", `/public/results?electionId=${counted2._id}&state=Punjab&constituency=${encodeURIComponent(area2.constituency)}`)).body.data;
    const check = r.checks.find((c) => c.code === "evm_vs_register");
    assert.equal(check.ok, false);
    assert.match(check.text, /\(6, including NOTA\) do not match .* \(5\)/);
    const turnout = (await call("GET", `/public/turnout?electionId=${counted2._id}&state=Punjab&constituency=${encodeURIComponent(area2.constituency)}`)).body.data;
    assert.equal(turnout.voted >= 5, true);
    assert.match(turnout.note, /Approximate/);
});

test("mock results: only a mock source generates them, and they are labelled as mock everywhere", needsRedis, async () => {
    const { call, eci, mkElection, publish, mock, official, runId } = await setup();
    const area3 = { state: "Punjab", district: "Ludhiana", constituency: ctx.area.constituency };
    const e = await mkElection(`Mock demo ${runId}`, scheduleCountingIn(5)); // mock works before counting day: it is not a count
    await publish(e, area3);
    assert.equal((await call("POST", `/results/sources/${official._id}/mock`, { electionId: e._id, ...area3 }, eci.token)).status, 403);
    const g = await call("POST", `/results/sources/${mock._id}/mock`, { electionId: e._id, ...area3, rounds: 4 }, eci.token);
    assert.equal(g.status, 201, JSON.stringify(g.body));
    assert.match(g.body.data.label, /^MOCK DATA/);
    assert.equal((await call("POST", `/results/sources/${mock._id}/mock`, { electionId: e._id, ...area3 }, eci.token)).status, 409);
    const r = (await call("GET", `/public/results?electionId=${e._id}&state=Punjab&constituency=${encodeURIComponent(area3.constituency)}`)).body.data;
    assert.equal(r.mock, true); assert.match(r.label, /not an election result/);
    assert.equal(r.rounds.length, 4); assert.equal(r.publication.status, "completed"); assert.equal(r.declaredWinner, null);
    const none = (await call("GET", `/public/results?electionId=${e._id}&state=Punjab&constituency=${encodeURIComponent(ctx.area2.constituency)}`)).body.data;
    assert.equal(none.available, false);
});
