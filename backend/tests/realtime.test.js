import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Directive phase 5: live operational events (persisted log + Socket.IO, scoped by jurisdiction),
// polling-station device registration and verified heartbeats, connectivity in the control room.
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
    const call = async (method, path, body, token, extra = {}) => {
        const res = await fetch(`${base}${path}`, {
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.8.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    const ludhiana = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Ludhiana");
    const area = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[8] };
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
        assert.equal((await call("POST", `/polling-stations/${p.body.data._id}/approve`, {}, eci.token)).status, 200);
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
    const otherDeo = await makeUser("deo");
    await grant(otherDeo, "deo", { state: "Punjab", district: "Amritsar" });
    ctx = { otherDeo, deo, server, redis, call, makeUser, grant, getElectorByEpic, runId, area, eci, A, B, electors, election, team };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });


const since = () => Date.now() - 1;
const eventsFor = async (call, who, from, type) => (await call("GET", `/events?since=${from}${type ? `&types=${type}` : ""}`, undefined, who.token)).body?.data?.items ?? [];

test("devices: a polling-party member registers a device; heartbeats need its secret and the right station", needsRedis, async () => {
    const { call, team, A } = await setup();
    const from = since();
    const reg = await call("POST", "/devices/register", { label: "Tablet 1" }, team.po.token);
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    const { device, deviceSecret } = reg.body.data;
    assert.equal(device.stationId, A._id);
    assert.equal(device.connectivity, "unknown");
    assert.equal(device.tokenHash, undefined, "the secret's hash is never sent");
    const raw = JSON.parse(await (await import("../src/config/redis.js")).redis().get(`device:${device._id}`));
    assert.notEqual(raw.tokenHash, deviceSecret, "only a hash is stored");

    const beat = (who, secret = deviceSecret, body = {}) => call("POST", "/devices/heartbeat", { packageVersion: "pkg-1", pendingOutbox: 0, ...body }, who.token, { "X-Device-Id": device._id, "X-Device-Token": secret });
    assert.equal((await beat(team.po, "wrong")).status, 401);
    assert.equal((await beat(team.poB)).status, 403, "a member of another station's party cannot use it");
    assert.equal((await beat(team.agent)).status, 403, "agents have no device rights");
    const ok = await beat(team.po);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.connectivity, "online");
    assert.equal((await beat(team.pro, deviceSecret, { pendingOutbox: 3 })).body.data.connectivity, "synchronising", "another member of the same party can send it");
    assert.equal((await beat(team.pro, deviceSecret, { lastSyncError: "timeout" })).body.data.connectivity, "sync_failed");

    // STATION_ONLINE is recorded once, not on every heartbeat, and only those covering the station see it.
    const online = (await eventsFor(call, team.pro, from, "STATION_ONLINE")).filter((e) => e.payload.deviceId === device._id);
    assert.equal(online.length, 1);
    assert.equal(online[0].payload.packageVersion, "pkg-1");
    assert.equal((await eventsFor(call, ctx.deo, from, "STATION_ONLINE")).some((e) => e.payload.deviceId === device._id), true);
    assert.equal((await eventsFor(call, ctx.otherDeo, from, "STATION_ONLINE")).some((e) => e.payload.deviceId === device._id), false, "another district does not see it");
    assert.equal((await eventsFor(call, team.poB, from, "STATION_ONLINE")).some((e) => e.payload.deviceId === device._id), false, "another station does not see it");

    const mine = (await call("GET", "/devices/mine", undefined, team.pro.token)).body.data.items;
    assert.equal(mine.some((d) => d._id === device._id && d.lastHeartbeat.pendingOutbox === 0), true);
});

test("devices: a silent device goes offline once; the control room shows each station's connectivity", needsRedis, async () => {
    const { call, team, A, B, election, redis } = await setup();
    const reg = (await call("POST", "/devices/register", { label: "Laptop" }, team.poB.token)).body.data;
    const id = reg.device._id;
    assert.equal((await call("POST", "/devices/heartbeat", {}, team.poB.token, { "X-Device-Id": id, "X-Device-Token": reg.deviceSecret })).status, 200);
    const from = since();
    // Pretend the last heartbeat was 20 minutes ago.
    const stored = JSON.parse(await redis().get(`device:${id}`));
    stored.lastHeartbeat.at = new Date(Date.now() - 20 * 60000).toISOString();
    await redis().set(`device:${id}`, JSON.stringify(stored));

    const view = (await call("GET", `/control-room?electionId=${election._id}`, undefined, ctx.deo.token)).body.data;
    const rowB = view.stations.find((s) => s.stationId === B._id);
    assert.equal(rowB.connectivity.status, "offline");
    assert.ok(view.summary.connectivity.offline >= 1);
    assert.equal(view.stations.find((s) => s.stationId === A._id).connectivity.devices >= 1, true);
    await call("GET", `/control-room?electionId=${election._id}`, undefined, ctx.deo.token);
    const offline = (await eventsFor(call, ctx.deo, from, "STATION_OFFLINE")).filter((e) => e.payload.deviceId === id);
    assert.equal(offline.length, 1, "recorded once per outage");

    // Back online: STATION_ONLINE again.
    assert.equal((await call("POST", "/devices/heartbeat", {}, team.poB.token, { "X-Device-Id": id, "X-Device-Token": reg.deviceSecret })).body.data.connectivity, "online");
    assert.equal((await eventsFor(call, ctx.deo, from, "STATION_ONLINE")).filter((e) => e.payload.deviceId === id).length, 1);

    // Revoking: not by a member of another station, nor without a reason; then heartbeats are refused.
    assert.equal((await call("POST", `/devices/${id}/revoke`, { reason: "Lost tablet" }, team.pro.token)).status, 403);
    assert.equal((await call("POST", `/devices/${id}/revoke`, {}, ctx.deo.token)).status, 400);
    assert.equal((await call("POST", `/devices/${id}/revoke`, { reason: "Device replaced by the sector officer" }, ctx.deo.token)).status, 200);
    assert.equal((await call("POST", "/devices/heartbeat", {}, team.poB.token, { "X-Device-Id": id, "X-Device-Token": reg.deviceSecret })).status, 403);
    assert.equal((await call("POST", `/devices/${id}/revoke`, { reason: "again please" }, ctx.deo.token)).status, 409);
});

test("events: poll-day changes are logged and visible only within jurisdiction; voters cannot read them", needsRedis, async () => {
    const { call, team, makeUser } = await setup();
    const from = since();
    assert.equal((await call("POST", "/poll-day/poll/status", { status: "mock_poll_done", note: "Mock poll with agents present; cleared" }, team.pro.token)).status, 200);
    const mine = await eventsFor(call, team.pro, from, "POLL_STATUS_CHANGED");
    assert.equal(mine.length, 1);
    assert.equal(mine[0].actor.role, "presiding_officer");
    assert.equal((await eventsFor(call, ctx.deo, from, "POLL_STATUS_CHANGED")).length >= 1, true);
    assert.equal((await eventsFor(call, ctx.otherDeo, from, "POLL_STATUS_CHANGED")).length, 0);
    const voter = await makeUser("voter");
    assert.equal((await call("GET", "/events", undefined, voter.token)).status, 403);
    assert.equal((await call("GET", "/events")).status, 401);
});

test("socket: live events reach only connected officers whose jurisdiction covers them", needsRedis, async () => {
    const { call, team, makeUser } = await setup();
    const { attachRealtime } = await import("../src/realtime/socket.js");
    const http = await import("http");
    const { io: connect } = await import("socket.io-client");
    const srv = http.createServer(); await new Promise((r) => srv.listen(0, r));
    const rt = await attachRealtime(srv, { origins: ["http://localhost"] });
    const url = `http://127.0.0.1:${srv.address().port}`;
    const open = (token) => new Promise((resolve, reject) => {
        const s = connect(url, { auth: { token }, transports: ["websocket"], reconnection: false });
        s.on("hello", () => resolve(s)); s.on("connect_error", (e) => { s.close(); reject(e); });
    });
    const sockets = [];
    try {
        const voter = await makeUser("voter");
        await assert.rejects(open(voter.token), /forbidden/);
        await assert.rejects(open("not-a-token"), /unauthorised/);
        const deo = await open(ctx.deo.token); const other = await open(ctx.otherDeo.token); const poB = await open(team.poB.token);
        sockets.push(deo, other, poB);
        const got = { deo: [], other: [], poB: [] };
        deo.on("event", (e) => got.deo.push(e)); other.on("event", (e) => got.other.push(e)); poB.on("event", (e) => got.poB.push(e));
        const r = await call("POST", "/control-room/incidents", { electionId: ctx.election._id, stationId: ctx.A._id, type: "evm_malfunction", severity: "high", description: "Ballot unit not responding" }, team.pro.token);
        assert.equal(r.status, 201, JSON.stringify(r.body));
        await new Promise((res) => setTimeout(res, 300));
        assert.equal(got.deo.some((e) => e.type === "INCIDENT_CREATED" && e.stationId === ctx.A._id), true);
        assert.equal(got.other.some((e) => e.stationId === ctx.A._id), false, "another district");
        assert.equal(got.poB.some((e) => e.stationId === ctx.A._id), false, "another station");
        assert.equal(JSON.stringify(got.deo).includes(ctx.electors[0]), false, "events carry no elector identities");
    } finally {
        for (const s of sockets) s.close();
        await rt.close(); await new Promise((r) => srv.close(r));
    }
});
