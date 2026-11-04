import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { publishStation, forwardToCommission } from "./helpers/stationApproval.js";

// Directive phase 4: offline poll day. Signed, encrypted station packages for one registered
// device; an outbox synced with idempotency keys; conflicts kept for the presiding officer.
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
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.9.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    const ludhiana = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Ludhiana");
    const area = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[12] };
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
    const otherDeo = await makeUser("deo");
    await grant(otherDeo, "deo", { state: "Punjab", district: "Amritsar" });
    ctx = { otherDeo, deo, server, redis, call, makeUser, grant, getElectorByEpic, runId, area, eci, A, B, electors, election, team };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });



const { openPackage, canonicalManifest } = await import("../src/services/stationPackage.service.js");
const device = async (who) => {
    const r = await ctx.call("POST", "/devices/register", { label: "Tablet" }, who.token);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return { id: r.body.data.device._id, secret: r.body.data.deviceSecret, headers: { "X-Device-Id": r.body.data.device._id, "X-Device-Token": r.body.data.deviceSecret } };
};
const mark = (epic, key, extra = {}) => ({ idempotencyKey: key, type: "mark", epic, idDocument: "epic", checks: { photoMatches: true, inkApplied: true }, actedAt: new Date().toISOString(), ...extra });
let dev;

test("package: only a registered device of the station gets it; signed, encrypted, part only, no dates of birth", needsRedis, async () => {
    const { call, team, A, electors } = await setup();
    dev = await device(team.po);
    assert.equal((await call("GET", "/poll-day/package", undefined, team.po.token)).status, 401, "needs the device headers");
    assert.equal((await call("GET", "/poll-day/package", undefined, team.poB.token, dev.headers)).status, 403, "another station's officer");
    const r = await call("GET", "/poll-day/package", undefined, team.po.token, dev.headers);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const sealed = r.body.data;
    assert.equal(sealed.manifest.stationId, A._id);
    assert.equal(sealed.manifest.deviceId, dev.id);
    assert.equal(sealed.ciphertext.includes(electors[0]), false);
    const body = await openPackage(sealed, dev.secret);
    assert.deepEqual(body.electors.map((e) => e.epic).sort(), electors.slice(0, 4).sort(), "only part A");
    assert.equal(JSON.stringify(body).includes("dateOfBirth"), false);
    assert.ok(body.electors.every((e) => Number.isInteger(e.serial)));
    // A different device cannot open it; a changed manifest or ciphertext is detected.
    const other = await device(team.pro);
    await assert.rejects(openPackage(sealed, other.secret));
    await assert.rejects(openPackage({ ...sealed, manifest: { ...sealed.manifest, stationId: "x" } }, dev.secret), /signature/);
    const flipped = Buffer.from(sealed.ciphertext, "base64"); flipped[0] ^= 1;
    await assert.rejects(openPackage({ ...sealed, ciphertext: flipped.toString("base64") }, dev.secret), /altered/);
    // The public key verifies the manifest the same way a browser would.
    const pk = (await call("GET", "/poll-day/package/public-key", undefined, team.po.token)).body.data;
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pk.publicKey, "base64")]), format: "der", type: "spki" });
    assert.equal(crypto.verify(null, Buffer.from(canonicalManifest(sealed.manifest)), key, Buffer.from(sealed.signature, "base64")), true);
    assert.equal(pk.keyId, sealed.manifest.keyId);
});

test("sync: accepted once, repeats answered with the first result, clashes kept as conflicts, nothing overwritten", needsRedis, async () => {
    const { call, team, electors, makeUser } = await setup();
    dev = dev ?? await device(team.po);
    const send = (events, who = team.po, headers = dev.headers) => call("POST", "/poll-day/sync", { events, packageVersion: "v1" }, who.token, headers);
    assert.equal((await send([mark(electors[0], "before-open-0001")])).body.data.results[0].status, "rejected", "the poll is not open yet");
    assert.equal((await call("POST", "/poll-day/poll/status", { status: "mock_poll_done", note: "Mock poll with agents present; cleared" }, team.pro.token)).status, 200);
    assert.equal((await call("POST", "/poll-day/poll/status", { status: "open" }, team.pro.token)).status, 200);
    await new Promise((r) => setTimeout(r, 5));

    const first = await send([mark(electors[0], "k-0000-0001"), mark(electors[1], "k-0000-0002"), mark(electors[4], "k-0000-0003"), { type: "mark", epic: electors[2] }, mark(electors[2], "k-0000-0004", { checks: { photoMatches: true } })]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(first.body.data.results.map((r) => r.status), ["accepted", "accepted", "rejected", "rejected", "rejected"]);
    assert.match(first.body.data.results[2].message, /not on the roll of this part/);
    const serial0 = first.body.data.results[0].serial;

    // The same records again (a retry after a dropped connection): same answers, no new entries.
    const again = await send([mark(electors[0], "k-0000-0001"), mark(electors[1], "k-0000-0002")]);
    assert.deepEqual(again.body.data.results.map((r) => [r.status, r.duplicate, r.serial]), [["accepted", true, serial0], ["accepted", true, first.body.data.results[1].serial]]);
    const reg = async () => (await call("GET", "/poll-day/register", undefined, team.pro.token)).body.data.items;
    assert.equal((await reg()).length, 2);
    assert.equal((await reg())[0].deviceId, dev.id, "offline marks record the device and time");

    // A second device marks the same elector under a new key: kept as a conflict, register unchanged.
    const dev2 = await device(team.pro);
    const clash = await send([mark(electors[0], "k-0000-0099")], team.pro, dev2.headers);
    assert.equal(clash.body.data.results[0].status, "conflict");
    assert.equal((await reg()).length, 2);
    assert.equal(clash.body.data.voted.includes(electors[0]), true);
    // Agents and other stations cannot sync; a non-list is refused.
    assert.equal((await send([mark(electors[3], "k-0000-0005")], team.agent)).status, 403);
    assert.equal((await call("POST", "/poll-day/sync", { events: "x" }, team.po.token, dev.headers)).status, 400);

    // The presiding officer decides the conflict; a polling officer cannot.
    const list = (await call("GET", "/poll-day/sync-conflicts", undefined, team.pro.token)).body.data.items;
    const c = list.find((x) => x._id === clash.body.data.results[0].conflictId);
    assert.equal(c.kind, "already_marked");
    assert.equal(c.existing.serial, serial0);
    assert.equal((await call("POST", `/poll-day/sync-conflicts/${c._id}/resolve`, { decision: "duplicate_confirmed", note: "Same voter, recorded on two tablets" }, team.po.token)).status, 403);
    assert.equal((await call("POST", `/poll-day/sync-conflicts/${c._id}/resolve`, { decision: "duplicate_confirmed" }, team.pro.token)).status, 400, "a note is required");
    assert.equal((await call("POST", `/poll-day/sync-conflicts/${c._id}/resolve`, { decision: "duplicate_confirmed", note: "Same voter, recorded on two tablets" }, team.pro.token)).status, 200);
    assert.equal((await call("POST", `/poll-day/sync-conflicts/${c._id}/resolve`, { decision: "referred", note: "again" }, team.pro.token)).status, 409);

    // Records made while the poll was open still count when they arrive after it closed; later ones do not.
    const whileOpen = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 5));
    assert.equal((await call("POST", "/poll-day/poll/status", { status: "closed" }, team.pro.token)).status, 200);
    await new Promise((r) => setTimeout(r, 5));
    const late = await send([mark(electors[2], "k-0000-0006", { actedAt: whileOpen }), mark(electors[3], "k-0000-0007")]);
    assert.deepEqual(late.body.data.results.map((r) => r.status), ["accepted", "rejected"]);
    const synced = (await call("GET", `/events?since=${Date.now() - 60000}&types=SYNC_COMPLETED`, undefined, team.pro.token)).body.data.items;
    assert.ok(synced.some((e) => e.payload.deviceId === dev.id && e.payload.accepted >= 1));
    assert.equal(JSON.stringify(synced).includes(electors[0]), false, "events carry counts only");
});

test("presiding officer assistant: sourced procedures, checklists kept and audited, the polling party", needsRedis, async () => {
    const { call, team, A } = await setup();
    const lib = (await call("GET", "/poll-day/procedures?q=agent%20challenge", undefined, team.po.token)).body.data;
    assert.equal(lib.items[0].id, "challenged-vote");
    assert.ok(lib.items.every((p) => p.sources.length && p.version === lib.version && p.reviewStatus));
    assert.ok(lib.items[0].sources.every((s) => lib.sources[s.source]), "every source is listed");
    assert.match(lib.notice, /not the official text/);

    assert.equal((await call("GET", "/poll-day/assistant", undefined, team.po.token)).status, 403, "presiding officer only");
    const a = (await call("GET", "/poll-day/assistant", undefined, team.pro.token)).body.data;
    assert.deepEqual(Object.keys(a.checklists), ["readiness", "equipment", "closing"]);
    assert.ok(a.party.some((p) => p.role === "polling_officer") && a.party.some((p) => p.role === "presiding_officer"));
    assert.equal(a.party.some((p) => p.role === "polling_officer" && p.epic === team.poB.user.epic), false, "not another station's party");
    assert.equal((await call("POST", "/poll-day/checklists/readiness", { item: "nope", done: true }, team.pro.token)).status, 400);
    assert.equal((await call("POST", "/poll-day/checklists/readiness", { item: "layout", done: true, note: "Compartment moved to the window wall" }, team.pro.token)).status, 200);
    const again = (await call("GET", "/poll-day/assistant", undefined, team.pro.token)).body.data;
    assert.equal(again.checklists.readiness.items.find((i) => i.id === "layout").done.by, team.pro.user.epic);

    // Public queue view: no names, an explicit status.
    const q = (await call("GET", `/public/stations/${A._id}/queue`)).body.data;
    assert.ok(["closed", "not_open", "unknown", "stale", "estimated", "insufficient_data"].includes(q.estimate.status));
    assert.equal(JSON.stringify(q).includes(ctx.electors[0]), false);
});
