import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Phase 4: control room across a jurisdiction, alerts, incidents and sector officers' visits.
process.env.STEP_UP_REQUIRED = process.env.STEP_UP_REQUIRED ?? "false"; // step-up is covered in phase7.test.js
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = "";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const { todayIST } = await import("../src/services/election.service.js");
const { stationAlerts } = await import("../src/controllers/controlRoom.controller.js");
const day = (offset) => { const d = new Date(`${todayIST()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

test("alerts: poll not opened after 07:30 IST, stale queue, waiting cases, serious incidents", () => {
    const at = (hhmm) => new Date(`2026-11-02T${hhmm}:00+05:30`).getTime();
    const iso = (hhmm) => new Date(at(hhmm)).toISOString();
    const codes = (args) => stationAlerts({ onPollDay: true, cases: [], incidents: [], ...args }).map((a) => a.code);
    assert.deepEqual(codes({ state: null, now: at("07:20") }), []);
    assert.deepEqual(codes({ state: null, now: at("07:31") }), ["not_open"]);
    const open = { status: "open", history: [{ status: "open", at: iso("07:00") }], queue: null };
    assert.deepEqual(codes({ state: open, now: at("07:50") }), []);
    assert.deepEqual(codes({ state: open, now: at("08:05") }), ["queue_stale"]);
    assert.deepEqual(codes({ state: { ...open, queue: { waiting: 3, at: iso("09:30") } }, now: at("10:00") }), []);
    assert.deepEqual(codes({ state: { ...open, queue: { waiting: 3, at: iso("09:30") } }, now: at("10:00"),
        cases: [{ status: "open", raisedAt: iso("09:20") }], incidents: [{ status: "acknowledged", severity: "high" }, { status: "reported", severity: "low" }] }), ["case_waiting", "serious_incident"]);
    assert.deepEqual(stationAlerts({ onPollDay: false, state: null, cases: [], incidents: [], now: at("12:00") }), []);
});

let ctx;
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    const { saveElector } = await import("../src/repositories/elector.repository.js");
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
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.4.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    const ludhiana = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Ludhiana");
    const X = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[7] };
    const Y = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[8] };
    const eci = await makeUser("eci");
    const grant = async (who, role, jurisdiction, election) => {
        const r = await call("POST", "/assignments", { epic: who.user.epic, role, jurisdiction, election }, eci.token);
        assert.equal(r.status, 201, JSON.stringify(r.body));
    };
    const deo = await makeUser("deo");
    await grant(deo, "deo", { state: "Punjab", district: "Ludhiana" });
    const stations = [];
    for (const [n, area] of [[0, X], [1, X], [2, Y]]) {
        const partNumber = String(1 + ((runId + n) % 9000));
        const name = `Control School ${runId}-${n}`;
        const p = await call("POST", "/polling-stations", { ...area, partNumber, name, address: `Ward ${n}, BRS Nagar, Ludhiana 141012` }, deo.token);
        assert.equal(p.status, 201, JSON.stringify(p.body));
        await call("POST", `/polling-stations/${p.body.data._id}/approve`, {}, eci.token);
        stations.push({ _id: p.body.data._id, ...area, partNumber, pollingStation: name });
        await saveElector({ _id: crypto.randomUUID(), epic: `CR${String.fromCharCode(65 + n)}${String(runId % 1e7).padStart(7, "0")}`, name: `Elector ${n}`, dateOfBirth: "1980-01-01T00:00:00.000Z", gender: "Male",
            state: area.state, district: area.district, assemblyConstituency: area.constituency, partNumber, pollingStation: name, isActive: true });
    }
    const election = (await call("POST", "/elections", { name: `Control room ${runId}`, type: "bye_election", states: ["Punjab"],
        schedule: { notificationDate: day(-30), lastDateOfNominations: day(-23), scrutinyDate: day(-22), lastDateOfWithdrawal: day(-20), pollDate: day(0), countingDate: day(3) } }, eci.token)).body.data;
    const team = { deo, eci };
    for (const [key, role, j] of [["sector", "sector_officer", X], ["ro", "ro", Y], ["ceo", "ceo", { state: "Punjab" }], ["observer", "general_observer", X],
        ["pro", "presiding_officer", { ...X, pollingStation: stations[0].pollingStation, partNumber: stations[0].partNumber }], ["po", "polling_officer", { ...X, pollingStation: stations[0].pollingStation, partNumber: stations[0].partNumber }]]) {
        team[key] = await makeUser(role);
        await grant(team[key], role, j, election._id);
    }
    ctx = { redis, server, call, makeUser, election, stations, team, X, Y };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });

test("control room: each official sees exactly the stations of their jurisdiction, with live poll figures", needsRedis, async () => {
    const { call, election, stations, team } = await setup();
    const view = async (who) => (await call("GET", `/control-room?electionId=${election._id}`, undefined, who.token));
    const ids = async (who) => new Set((await view(who)).body.data.stations.map((s) => s.stationId));

    const sector = await ids(team.sector);
    assert.equal(sector.has(stations[0]._id) && sector.has(stations[1]._id), true);
    assert.equal(sector.has(stations[2]._id), false);
    const ro = await ids(team.ro);
    assert.equal(ro.has(stations[2]._id), true); assert.equal(ro.has(stations[0]._id), false);
    for (const who of [team.deo, team.ceo, team.eci]) { const s = await ids(who); assert.equal(stations.every((x) => s.has(x._id)), true); }
    assert.equal((await ids(team.observer)).has(stations[2]._id), false);
    assert.equal((await view(team.po)).status, 403, "polling officers have no control room");
    const voter = await ctx.makeUser("voter");
    assert.equal((await view(voter)).status, 403);

    // Poll progress at station 0 shows up.
    await call("POST", "/poll-day/poll/status", { status: "mock_poll_done" }, team.pro.token);
    await call("POST", "/poll-day/poll/status", { status: "open" }, team.pro.token);
    const list = (await call("GET", "/poll-day/electors", undefined, team.po.token)).body.data.items;
    assert.equal((await call("POST", `/poll-day/electors/${list[0].epic}/mark`, { idDocument: "epic", checks: { photoMatches: true, inkApplied: true } }, team.po.token)).status, 201);
    await call("POST", "/poll-day/queue", { waiting: 9 }, team.po.token);
    const row = (await view(team.sector)).body.data.stations.find((s) => s.stationId === stations[0]._id);
    assert.equal(row.poll, "open");
    assert.deepEqual(row.turnout, { electors: 1, voted: 1, percent: 100 });
    assert.equal(row.queue.waiting, 9);
    const summary = (await view(team.sector)).body.data.summary;
    assert.equal(summary.open >= 1, true);
});

test("incidents: reported at a station, handled inside the jurisdiction, resolved once with a note", needsRedis, async () => {
    const { call, election, stations, team } = await setup();
    const report = (who, stationId, extra = {}) => call("POST", "/control-room/incidents", { electionId: election._id, stationId, type: "evm_malfunction", severity: "high", description: "Ballot unit not responding", ...extra }, who.token);
    assert.equal((await report(team.pro, stations[1]._id)).status, 403, "only at their own station");
    assert.equal((await report(team.pro, stations[0]._id, { type: "riot" })).status, 400);
    assert.equal((await report(team.pro, stations[0]._id, { severity: "extreme" })).status, 400);
    assert.equal((await report(team.po, stations[0]._id)).status, 403, "polling officers report through the presiding officer");
    const r = await report(team.pro, stations[0]._id);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const id = r.body.data._id;

    // Visible to the station team and the control rooms above it, not to the RO of another constituency.
    assert.equal((await call("GET", "/poll-day/station", undefined, team.po.token)).body.data.incidents[0]._id, id);
    const sectorView = (await call("GET", `/control-room?electionId=${election._id}`, undefined, team.sector.token)).body.data;
    assert.equal(sectorView.incidents.some((i) => i._id === id), true);
    assert.deepEqual(sectorView.stations.find((s) => s.stationId === stations[0]._id).alerts.map((a) => a.code), ["serious_incident"]);
    assert.equal((await call("GET", `/control-room?electionId=${election._id}`, undefined, team.ro.token)).body.data.incidents.some((i) => i._id === id), false);

    assert.equal((await call("POST", `/control-room/incidents/${id}`, { action: "acknowledge" }, team.ro.token)).status, 403, "outside the RO's constituency");
    assert.equal((await call("POST", `/control-room/incidents/${id}`, { action: "acknowledge" }, team.observer.token)).status, 403, "observers read only");
    assert.equal((await call("POST", `/control-room/incidents/${id}`, { action: "acknowledge", note: "Reserve EVM on the way" }, team.sector.token)).status, 200);
    assert.equal((await call("POST", `/control-room/incidents/${id}`, { action: "acknowledge" }, team.deo.token)).status, 409);
    assert.equal((await call("POST", `/control-room/incidents/${id}`, { action: "update" }, team.deo.token)).status, 400);
    assert.equal((await call("POST", `/control-room/incidents/${id}`, { action: "resolve" }, team.sector.token)).status, 400, "resolution note needed");
    const done = await call("POST", `/control-room/incidents/${id}`, { action: "resolve", note: "Ballot unit replaced; poll resumed after mock check" }, team.sector.token);
    assert.equal(done.status, 200);
    assert.deepEqual(done.body.data.timeline.map((t) => t.action), ["reported", "acknowledge", "resolve"]);
    assert.equal((await call("POST", `/control-room/incidents/${id}`, { action: "update", note: "late" }, team.deo.token)).status, 409);
    const audit = (await call("GET", `/audit/incident/${id}`, undefined, team.eci.token)).body.data.items.map((e) => e.action);
    assert.deepEqual(audit.sort(), ["incident.acknowledged", "incident.reported", "incident.resolved"]);
});

test("visits: a sector officer records visits only to stations in their sector", needsRedis, async () => {
    const { call, election, stations, team } = await setup();
    assert.equal((await call("POST", `/control-room/stations/${stations[2]._id}/visits`, { electionId: election._id, note: "All fine" }, team.sector.token)).status, 403);
    assert.equal((await call("POST", `/control-room/stations/${stations[1]._id}/visits`, { electionId: election._id, note: "" }, team.sector.token)).status, 400);
    assert.equal((await call("POST", `/control-room/stations/${stations[1]._id}/visits`, { electionId: election._id, note: "Ramp in place, queue orderly" }, team.sector.token)).status, 201);
    assert.equal((await call("POST", `/control-room/stations/${stations[1]._id}/visits`, { electionId: election._id, note: "x y z" }, team.deo.token)).status, 403, "visits are the sector officer's");
    const row = (await call("GET", `/control-room?electionId=${election._id}`, undefined, team.deo.token)).body.data.stations.find((s) => s.stationId === stations[1]._id);
    assert.equal(row.lastVisit.note, "Ramp in place, queue orderly");
});
