import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// MongoDB read models and their Redis fallbacks: nearest polling stations (2dsphere), station text
// search, operational-event history, audit search, and the audit hash chain anchored in MongoDB.
// Runs in Redis-fallback mode by default; set TEST_MONGODB_URI to a disposable MongoDB to run the
// same checks against MongoDB, plus tamper detection through the anchored chain.
process.env.STEP_UP_REQUIRED = process.env.STEP_UP_REQUIRED ?? "false";
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = "";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI;
if (TEST_MONGODB_URI) process.env.MONGODB_URI = TEST_MONGODB_URI; else delete process.env.MONGODB_URI;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };
const needsMongo = { skip: TEST_REDIS_URL && TEST_MONGODB_URI ? false : "set TEST_REDIS_URL and TEST_MONGODB_URI to run" };
const SOURCE = TEST_MONGODB_URI ? "mongodb" : "redis";

let ctx;
test.after(async () => {
    if (!ctx) return;
    ctx.server.close();
    await ctx.redis().quit();
    if (TEST_MONGODB_URI) await (await import("../src/config/mongo.js")).closeMongo();
});
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis } = await import("../src/config/redis.js");
    await connectRedis();
    if (TEST_MONGODB_URI) {
        const { connectMongo } = await import("../src/config/mongo.js");
        await connectMongo();
        await (await import("../src/services/projector.service.js")).rebuildReadModels();
    }
    const { saveUser } = await import("../src/repositories/user.repository.js");
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
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.15.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    // Bathinda district is used by no other test file.
    const bathinda = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Bathinda");
    const area = { state: "Punjab", district: "Bathinda", constituency: bathinda.constituencies[0] };
    const eci = await makeUser("eci");
    const deo = await makeUser("deo");
    const r = await call("POST", "/assignments", { epic: deo.user.epic, role: "deo", jurisdiction: { state: "Punjab", district: "Bathinda" } }, eci.token);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    // Three approved stations around Bathinda (about 1 km, 3 km and 20 km from the search point) and one proposal.
    const centre = { lat: 30.2110, lng: 74.9455 };
    const rows = [
        [`Govt Senior Secondary School ${runId}`, { lat: 30.2200, lng: 74.9455 }, true],
        [`Rose Garden Community Hall ${runId}`, { lat: 30.2380, lng: 74.9455 }, true],
        [`Goniana Mandi Primary School ${runId}`, { lat: 30.3910, lng: 74.9455 }, true],
        [`Proposed Ward Office ${runId}`, { lat: 30.2111, lng: 74.9456 }, false]
    ];
    const stations = [];
    for (const [i, [name, location, approve]] of rows.entries()) {
        const p = await call("POST", "/polling-stations", { ...area, partNumber: String(1 + ((runId + i) % 9000)), name, address: `Ward ${i + 1}, Bathinda city, Punjab 151001`, location }, deo.token);
        assert.equal(p.status, 201, JSON.stringify(p.body));
        if (approve) assert.equal((await call("POST", `/polling-stations/${p.body.data._id}/approve`, {}, eci.token)).status, 200);
        stations.push(p.body.data);
    }
    ctx = { redis, call, makeUser, eci, deo, area, centre, stations, runId, server };
    return ctx;
};

test("nearest approved polling stations, nearest first, within the radius", needsRedis, async () => {
    const { call, centre, stations, runId } = await setup();
    const near = await call("GET", `/public/stations/near?lat=${centre.lat}&lng=${centre.lng}&radiusKm=5`);
    assert.equal(near.status, 200, JSON.stringify(near.body));
    assert.equal(near.body.data.source, SOURCE);
    const mine = near.body.data.items.filter((s) => s.name.includes(String(runId)));
    assert.deepEqual(mine.map((s) => s._id), [stations[0]._id, stations[1]._id], "the 20 km station and the proposal are left out");
    assert.ok(mine[0].distanceKm > 0.9 && mine[0].distanceKm < 1.1, `about 1 km, got ${mine[0].distanceKm}`);
    assert.ok(mine[1].distanceKm > 2.9 && mine[1].distanceKm < 3.1);
    const wide = await call("GET", `/public/stations/near?lat=${centre.lat}&lng=${centre.lng}&radiusKm=25`);
    assert.ok(wide.body.data.items.some((s) => s._id === stations[2]._id));
    assert.equal((await call("GET", "/public/stations/near?lat=51.5&lng=-0.1")).status, 400, "outside India");
    assert.equal((await call("GET", `/public/stations/near?lat=${centre.lat}&lng=${centre.lng}&radiusKm=500`)).status, 400);
});

test("public station search by words in the name or address", needsRedis, async () => {
    const { call, area, stations } = await setup();
    const hit = await call("GET", `/public/stations?state=Punjab&district=Bathinda&constituency=${encodeURIComponent(area.constituency)}&q=garden`);
    assert.equal(hit.status, 200);
    assert.equal(hit.body.data.source, SOURCE);
    assert.ok(hit.body.data.items.some((s) => s._id === stations[1]._id));
    assert.ok(!hit.body.data.items.some((s) => s._id === stations[0]._id));
    const all = await call("GET", `/public/stations?state=Punjab&district=Bathinda`);
    assert.ok(all.body.data.items.length >= 3);
    assert.ok(!all.body.data.items.some((s) => s._id === stations[3]._id), "proposals are not public");
});

test("event history and audit search are filtered and limited to the caller's jurisdiction", needsRedis, async () => {
    const { call, makeUser, eci, deo, stations, area } = await setup();
    const hist = await call("GET", `/events/history?types=POLLING_STATION_UPDATED&stationId=${stations[0]._id}`, undefined, eci.token);
    assert.equal(hist.status, 200, JSON.stringify(hist.body));
    assert.equal(hist.body.data.source, SOURCE);
    assert.equal(hist.body.data.items.length, 1);
    assert.equal(hist.body.data.items[0].payload.change, "create");
    assert.equal((await call("GET", "/events/history?types=NOPE", undefined, eci.token)).status, 400);
    assert.equal((await call("GET", "/events/history?from=yesterday", undefined, eci.token)).status, 400);
    // A sector officer elsewhere does not see Bathinda events.
    const so = await makeUser("sector_officer");
    const amritsar = (await call("GET", "/auth/geography")).body.data.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Amritsar");
    const granted = await call("POST", "/assignments", { epic: so.user.epic, role: "sector_officer", jurisdiction: { state: "Punjab", district: "Amritsar", constituency: amritsar.constituencies[0] } }, eci.token);
    assert.equal(granted.status, 201, JSON.stringify(granted.body));
    const hidden = await call("GET", `/events/history?stationId=${stations[0]._id}`, undefined, so.token);
    assert.equal(hidden.body.data.items.length, 0);

    const audit = await call("GET", `/audit/search?action=station.&resourceId=${stations[0]._id}`, undefined, deo.token);
    assert.equal(audit.status, 200, JSON.stringify(audit.body));
    assert.equal(audit.body.data.source, SOURCE);
    assert.deepEqual(audit.body.data.items.map((e) => e.action).sort(), ["station.approved", "station.proposed"]);
    const byActor = await call("GET", `/audit/search?actor=${eci.user.epic}&action=station.approved`, undefined, eci.token);
    assert.equal(byActor.body.data.items.length, 3);
    assert.equal((await call("GET", "/audit/search?actor=nobody", undefined, eci.token)).status, 400);
    assert.ok(area.constituency);
});

test("health and audit integrity report both stores", needsRedis, async () => {
    const { call, eci } = await setup();
    const health = await call("GET", "/health");
    assert.equal(health.body.database.redis, "ok");
    assert.equal(health.body.database.mongodb, TEST_MONGODB_URI ? "ok" : "not configured");
    const integrity = await call("GET", "/audit/integrity", undefined, eci.token);
    assert.equal(integrity.status, 200);
    assert.equal(integrity.body.data.chain.checked, Boolean(TEST_MONGODB_URI));
    if (TEST_MONGODB_URI) assert.equal(integrity.body.data.chain.ok, true, JSON.stringify(integrity.body.data.chain));
});

test("MongoDB: the anchored hash chain exposes a rewritten audit entry, even with a recomputed hash", needsMongo, async () => {
    const { call, eci, redis } = await setup();
    const { hashEvent } = await import("../src/services/audit.service.js");
    const { drainProjector } = await import("../src/services/projector.service.js");
    await drainProjector();
    const ids = await redis().lRange("audit:events", 0, -1);
    const id = ids[Math.floor(ids.length / 2)];
    const original = await redis().get(`audit:event:${id}`);
    const forged = { ...JSON.parse(original), note: "rewritten after the fact" };
    forged.hash = hashEvent(forged); // the per-event check alone cannot see this
    await redis().set(`audit:event:${id}`, JSON.stringify(forged));
    try {
        const res = await call("GET", "/audit/integrity", undefined, eci.token);
        assert.equal(res.body.data.altered.length, 0, "per-event hashes still match");
        assert.equal(res.body.data.chain.ok, false);
        assert.equal(res.body.data.chain.firstBreak.eventId, id);
        assert.equal(res.body.data.ok, false);
    } finally {
        await redis().set(`audit:event:${id}`, original);
    }
    assert.equal((await call("GET", "/audit/integrity", undefined, eci.token)).body.data.chain.ok, true);
});
