import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";

// Regression tests for BLO decisions (Form 6 and Form 8), mandatory proof documents, identity
// verification and polling-day checks. They call the real HTTP endpoints and inspect what is
// stored in Redis. They need their own, disposable Redis and never touch REDIS_URL from .env.
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = ""; // the AI review uses its built-in rule engine (no network)
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const runId = crypto.randomInt(0, 1e9);
let seq = 0;
const unique = (label) => `${label} ${runId} ${++seq}`;

let ctx; // shared server, Redis helpers and accounts, created once

const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis, jsonGet } = await import("../src/config/redis.js");
    const { saveUser, getUserByEpic } = await import("../src/repositories/user.repository.js");
    const { saveElector, getElectorByEpic, listElectors } = await import("../src/repositories/elector.repository.js");
    const { getRegistration, listRegistrations } = await import("../src/repositories/registration.repository.js");
    const { getChangeRequest } = await import("../src/repositories/changeRequest.repository.js");
    const { saveVerification, getVerification } = await import("../src/repositories/verification.repository.js");
    await connectRedis();

    const makeUser = async (role, extra = {}) => {
        const epic = extra.epic || `TST${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`;
        const user = { _id: crypto.randomUUID(), epic, role, name: `${role} ${runId}`, ...extra };
        await saveUser(user);
        return { user, token: jwt.sign({ _id: user._id, epic: user.epic, role }, "test") };
    };

    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    // Each request appears to come from its own client address, so the production rate limits
    // (for example 10 registrations per hour per address) do not stop the test suite.
    const clientAddress = () => `10.${crypto.randomInt(0, 255)}.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`;
    const call = async (method, path, body, token, headers = {}) => {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json", "X-Forwarded-For": clientAddress(),
                ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers
            },
            body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body))
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };

    const geo = (await call("GET", "/auth/geography")).body.data;
    const state = geo.states.find((s) => s.name === "Punjab");
    const district = state.districts.find((d) => d.constituencies.length);
    const application = (overrides = {}) => ({
        name: unique("Applicant"), dateOfBirth: "2000-01-15", gender: "Female",
        state: state.name, district: district.name, assemblyConstituency: district.constituencies[0],
        address: `House ${crypto.randomInt(1, 9999)}, Model Town, Ludhiana`, pinCode: "141002",
        referenceImage: PNG, ...overrides
    });
    const submit = async (overrides) => {
        const res = await call("POST", "/auth/register", application(overrides));
        assert.equal(res.status, 201, JSON.stringify(res.body));
        return res.body.data.referenceId;
    };

    ctx = {
        redis, jsonGet, call, application, submit, makeUser, server,
        getRegistration, listRegistrations, getElectorByEpic, listElectors, saveElector,
        getUserByEpic, getChangeRequest, saveVerification, getVerification,
        blo: await makeUser("blo", { mustChangePassword: false }),
        voter: await makeUser("voter"),
        eci: await makeUser("eci")
    };
    return ctx;
};

test.after(async () => {
    if (!ctx) return;
    ctx.server.close();
    await ctx.redis().quit();
});

const assignment = { partNumber: "42", pollingStation: "Govt Senior Secondary School, Model Town" };
const electorsFor = async (registrationId) =>
    (await ctx.listElectors()).filter((e) => e.registrationId === registrationId);

// ---------------------------------------------------------------- Form 6: rejection

test("reject: a blank or whitespace-only reason is refused and nothing changes", needsRedis, async () => {
    const { call, submit, getRegistration, blo } = await setup();
    const id = await submit();
    for (const body of [{}, { note: "" }, { note: "   \n\t " }, { note: null }]) {
        const res = await call("POST", `/admin/registrations/${id}/reject`, body, blo.token);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.match(res.body.message, /reason/i);
    }
    const stored = await getRegistration(id);
    assert.equal(stored.status, "pending");
    assert.equal(stored.decisionNote, undefined);
    // Still listed as pending for the BLO.
    const list = await call("GET", "/admin/registrations?status=pending", undefined, blo.token);
    assert.ok(list.body.data.items.some((r) => r._id === id));
});

test("reject: a valid reason is saved, shown to the applicant, and the item leaves the pending list", needsRedis, async () => {
    const { call, submit, getRegistration, blo } = await setup();
    const id = await submit();
    const res = await call("POST", `/admin/registrations/${id}/reject`, { note: "  Address proof is unreadable.  " }, blo.token);
    assert.equal(res.status, 200);

    const stored = await getRegistration(id);
    assert.equal(stored.status, "rejected");
    assert.equal(stored.decisionNote, "Address proof is unreadable.");
    assert.equal(stored.decidedBy, blo.user.epic);
    assert.equal(stored.referenceImage, null);

    const status = await call("GET", `/auth/register/${id}`);
    assert.equal(status.body.data.status, "rejected");
    assert.equal(status.body.data.note, "Address proof is unreadable.");

    const pending = await call("GET", "/admin/registrations?status=pending", undefined, blo.token);
    assert.ok(!pending.body.data.items.some((r) => r._id === id));
    const rejected = await call("GET", "/admin/registrations?status=rejected", undefined, blo.token);
    assert.ok(rejected.body.data.items.some((r) => r._id === id));
});

test("reject: repeated or simultaneous rejections are processed once", needsRedis, async () => {
    const { call, submit, getRegistration, blo } = await setup();
    const id = await submit();
    const results = await Promise.all([1, 2, 3].map((n) =>
        call("POST", `/admin/registrations/${id}/reject`, { note: `Reason ${n}` }, blo.token)));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 409, 409]);
    const winner = results.find((r) => r.status === 200);
    assert.equal((await getRegistration(id)).decisionNote, winner.body.data.decisionNote);

    const again = await call("POST", `/admin/registrations/${id}/reject`, { note: "Again" }, blo.token);
    assert.equal(again.status, 409);
    assert.match(again.body.message, /already been rejected/);
});

test("reject/approve: the lock is released after each attempt, so retries are not blocked", needsRedis, async () => {
    const { call, submit, redis, blo } = await setup();
    const id = await submit();
    // A decision that fails after taking the lock (unknown application -> 404) releases it.
    const unknownId = crypto.randomUUID();
    assert.equal((await call("POST", `/admin/registrations/${unknownId}/reject`, { note: "x" }, blo.token)).status, 404);
    assert.equal(await redis().exists(`registration:lock:${unknownId}`), 0);
    assert.equal((await call("POST", `/admin/registrations/${id}/reject`, { note: "Ok" }, blo.token)).status, 200);
    assert.equal(await redis().exists(`registration:lock:${id}`), 0);
    const retry = await call("POST", `/admin/registrations/${id}/approve`, assignment, blo.token);
    assert.equal(retry.status, 409);
    assert.match(retry.body.message, /already been rejected/); // not "being processed"
});

// ---------------------------------------------------------------- Form 6: approval

test("approve: missing or invalid booth assignment is refused and nothing is created", needsRedis, async () => {
    const { call, submit, getRegistration, blo } = await setup();
    const id = await submit();
    const bad = [
        {}, { pollingStation: assignment.pollingStation }, { partNumber: "42" },
        { partNumber: "0", pollingStation: "Govt School" }, { partNumber: "12a", pollingStation: "Govt School" },
        { partNumber: "10000", pollingStation: "Govt School" }, { partNumber: "12", pollingStation: "ab" },
        { partNumber: "12", pollingStation: "x".repeat(201) }
    ];
    for (const body of bad) {
        assert.equal((await call("POST", `/admin/registrations/${id}/approve`, body, blo.token)).status, 400, JSON.stringify(body));
    }
    assert.equal((await getRegistration(id)).status, "pending");
    assert.equal((await electorsFor(id)).length, 0);
});

test("approve: saves status, booth, EPIC, electoral-roll record (with address) and account together", needsRedis, async () => {
    const { call, submit, getRegistration, getElectorByEpic, getUserByEpic, blo, redis } = await setup();
    const id = await submit();
    const res = await call("POST", `/admin/registrations/${id}/approve`, { partNumber: " 42 ", pollingStation: assignment.pollingStation }, blo.token);
    assert.equal(res.status, 200);
    const { epic } = res.body.data;
    assert.match(epic, /^[A-Z]{3}\d{7}$/);

    const stored = await getRegistration(id);
    assert.equal(stored.status, "approved");
    assert.equal(stored.epic, epic);
    assert.equal(stored.partNumber, "42");
    assert.equal(stored.pollingStation, assignment.pollingStation);
    assert.equal(stored.referenceImage, null);

    const elector = await getElectorByEpic(epic);
    assert.equal(elector.registrationId, id);
    assert.equal(elector.partNumber, "42");
    assert.equal(elector.address, stored.address);
    assert.equal(elector.pinCode, "141002");
    assert.equal((await getUserByEpic(epic)).role, "voter");
    assert.equal(await redis().exists(`epic:allocated:${epic}`), 1);

    // Refreshing the BLO list shows the saved state: no longer pending.
    const pending = await call("GET", "/admin/registrations?status=pending", undefined, blo.token);
    assert.ok(!pending.body.data.items.some((r) => r._id === id));
    // Applicant status reflects it too.
    assert.equal((await call("GET", `/auth/register/${id}`)).body.data.epic, epic);
});

test("approve: simultaneous approvals create exactly one voter and one EPIC", needsRedis, async () => {
    const { call, submit, blo } = await setup();
    const id = await submit();
    const results = await Promise.all([1, 2, 3].map(() =>
        call("POST", `/admin/registrations/${id}/approve`, assignment, blo.token)));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
    assert.equal((await electorsFor(id)).length, 1);
    // An approved application cannot be approved or rejected afterwards.
    assert.equal((await call("POST", `/admin/registrations/${id}/approve`, assignment, blo.token)).status, 409);
    assert.equal((await call("POST", `/admin/registrations/${id}/reject`, { note: "Too late" }, blo.token)).status, 409);
});

test("approve: many approvals at once never share an EPIC", needsRedis, async () => {
    const { call, submit, blo } = await setup();
    const ids = [];
    for (let i = 0; i < 12; i += 1) ids.push(await submit());
    const results = await Promise.all(ids.map((id) => call("POST", `/admin/registrations/${id}/approve`, assignment, blo.token)));
    assert.ok(results.every((r) => r.status === 200));
    const epics = results.map((r) => r.body.data.epic);
    assert.equal(new Set(epics).size, epics.length);
});

test("authorization: only signed-in BLOs (with a permanent password) can decide applications", needsRedis, async () => {
    const { call, submit, makeUser, getRegistration, voter, eci } = await setup();
    const id = await submit();
    const newBlo = await makeUser("blo", { mustChangePassword: true });
    const forged = jwt.sign({ _id: crypto.randomUUID(), epic: "BLO0000009", role: "blo" }, "wrong-secret");
    for (const [token, expected] of [[undefined, 401], [forged, 401], [voter.token, 403], [eci.token, 403], [newBlo.token, 403]]) {
        assert.equal((await call("POST", `/admin/registrations/${id}/approve`, assignment, token)).status, expected);
        assert.equal((await call("POST", `/admin/registrations/${id}/reject`, { note: "No" }, token)).status, expected);
        assert.equal((await call("GET", "/admin/registrations", undefined, token)).status, expected);
    }
    assert.equal((await getRegistration(id)).status, "pending");
});

// ---------------------------------------------------------------- Registration and proof documents

test("registration: the proof document is mandatory and validated on the server", needsRedis, async () => {
    const { call, application, listRegistrations } = await setup();
    const before = (await listRegistrations()).length;
    const big = Buffer.alloc(4 * 1024 * 1024 + 1); big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const cases = {
        missing: application({ referenceImage: undefined }),
        empty: application({ referenceImage: "" }),
        notADataUrl: application({ referenceImage: "my-aadhaar.png" }),
        pdf: application({ referenceImage: "data:application/pdf;base64,JVBERi0xLjQK" }),
        fakePng: application({ referenceImage: `data:image/png;base64,${Buffer.from("not really an image").toString("base64")}` }),
        oversized: application({ referenceImage: `data:image/png;base64,${big.toString("base64")}` }),
        wrongType: application({ referenceImage: 12345 })
    };
    for (const [label, body] of Object.entries(cases)) {
        const res = await call("POST", "/auth/register", body);
        assert.equal(res.status, 400, `${label}: ${JSON.stringify(res.body)}`);
    }
    assert.equal((await listRegistrations()).length, before, "no application was stored");
});

test("registration: invalid required fields are refused by the backend", needsRedis, async () => {
    const { call, application } = await setup();
    for (const overrides of [{ name: "" }, { dateOfBirth: "2999-01-01" }, { dateOfBirth: "not a date" },
        { pinCode: "012345" }, { address: "short" }, { district: "Nowhere" }]) {
        assert.equal((await call("POST", "/auth/register", application(overrides))).status, 400, JSON.stringify(overrides));
    }
});

test("registration: a valid application is stored with its proof and AI review and reaches the BLO queue", needsRedis, async () => {
    const { call, application, getRegistration, blo } = await setup();
    const body = application();
    const res = await call("POST", "/auth/register", body);
    assert.equal(res.status, 201);
    const stored = await getRegistration(res.body.data.referenceId);
    assert.equal(stored.status, "pending");
    assert.equal(stored.referenceImage, PNG);
    assert.equal(stored.aiReview.source, "AI Rule Engine (Heuristic)"); // no Gemini key in tests
    assert.ok(!stored.aiReview.anomalies.some((a) => /No supporting identification document/.test(a)));
    const list = await call("GET", "/admin/registrations?status=pending", undefined, blo.token);
    const row = list.body.data.items.find((r) => r._id === stored._id);
    assert.equal(row.referenceImage, PNG);
});

test("registration: an identical application cannot be queued twice while the first is pending", needsRedis, async () => {
    const { call, application, blo } = await setup();
    const body = application();
    const results = await Promise.all([1, 2, 3].map(() => call("POST", "/auth/register", body)));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
    // Once decided, the same person may apply again.
    const first = results.find((r) => r.status === 201).body.data.referenceId;
    assert.equal((await call("POST", `/admin/registrations/${first}/reject`, { note: "Wrong constituency" }, blo.token)).status, 200);
    assert.equal((await call("POST", "/auth/register", body)).status, 201);
});

// ---------------------------------------------------------------- Form 8 change requests

const makeVoterWithRecord = async () => {
    const { submit, call, blo, getUserByEpic } = await setup();
    const id = await submit();
    const { epic } = (await call("POST", `/admin/registrations/${id}/approve`, assignment, blo.token)).body.data;
    const user = await getUserByEpic(epic);
    return { epic, token: jwt.sign({ _id: user._id, epic, role: "voter" }, "test") };
};

test("Form 8: proof is validated, rejection needs a reason, approval updates the roll once", needsRedis, async () => {
    const { call, blo, getChangeRequest, getElectorByEpic } = await setup();
    const voter = await makeVoterWithRecord();
    const change = { address: "Flat 7, Sarabha Nagar, Ludhiana", pinCode: "141001" };

    assert.equal((await call("POST", "/changes", { ...change, documentProof: "abc" }, voter.token)).status, 400);
    assert.equal((await call("POST", "/changes", { ...change }, voter.token)).status, 400);

    const first = await call("POST", "/changes", { ...change, documentProof: PNG }, voter.token);
    assert.equal(first.status, 201);
    const requestId = first.body.data.requestId;
    assert.equal((await getChangeRequest(requestId)).currentRecord.address.includes("Model Town"), true);

    assert.equal((await call("POST", `/admin/changes/${requestId}/reject`, { note: "  " }, blo.token)).status, 400);
    assert.equal((await getChangeRequest(requestId)).status, "pending");

    const approvals = await Promise.all([1, 2].map(() => call("POST", `/admin/changes/${requestId}/approve`, {}, blo.token)));
    assert.deepEqual(approvals.map((r) => r.status).sort(), [200, 409]);
    const elector = await getElectorByEpic(voter.epic);
    assert.equal(elector.address, change.address);
    assert.equal(elector.pinCode, "141001");
    assert.equal((await getChangeRequest(requestId)).status, "approved");

    // A rejected request keeps its reason for the voter.
    const second = await call("POST", "/changes", { address: "House 3, Civil Lines, Ludhiana", documentProof: PNG }, voter.token);
    const rejected = await call("POST", `/admin/changes/${second.body.data.requestId}/reject`, { note: "Proof does not show this address." }, blo.token);
    assert.equal(rejected.status, 200);
    const mine = await call("GET", "/changes/my", undefined, voter.token);
    assert.equal(mine.body.data.items.find((r) => r._id === second.body.data.requestId).decisionNote, "Proof does not show this address.");
});

test("electoral roll: public search hides the address; the voter sees their own", needsRedis, async () => {
    const { call } = await setup();
    const voter = await makeVoterWithRecord();
    const anonymous = await call("POST", "/electors/search", { method: "epic", epic: voter.epic });
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.body.data.partNumber, "42");
    assert.equal(anonymous.body.data.address, undefined);
    assert.equal(anonymous.body.data.registrationId, undefined);
    const own = await call("POST", "/electors/search", { method: "epic", epic: voter.epic }, voter.token);
    assert.ok(own.body.data.address.includes("Model Town"));
    // Pending and rejected applications are not on the roll.
    const { submit, blo } = ctx;
    const id = await submit();
    await call("POST", `/admin/registrations/${id}/reject`, { note: "Not eligible" }, blo.token);
    assert.equal((await electorsFor(id)).length, 0);
});

// ---------------------------------------------------------------- Identity verification

test("identity cases: resolving is done once; clearing marks the voter verified", needsRedis, async () => {
    const { call, saveVerification, getVerification, getUserByEpic, blo } = await setup();
    const voter = await makeVoterWithRecord();
    const caseId = `case-test-${runId}-${++seq}`;
    await saveVerification({ _id: caseId, epic: voter.epic, status: "review_required", createdAt: new Date().toISOString() });
    const results = await Promise.all([1, 2].map(() =>
        call("PATCH", `/admin/verifications/${caseId}/resolve`, { decision: "cleared", note: "" }, blo.token)));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await getVerification(caseId)).status, "verified");
    assert.equal((await getUserByEpic(voter.epic)).verified, true);
});

test("Persona: the browser cannot report its own verification result", needsRedis, async () => {
    const { call, getUserByEpic, jsonGet } = await setup();
    const voter = await makeVoterWithRecord();
    // Without Persona credentials the result cannot be confirmed, so nothing is marked verified.
    const res = await call("POST", "/persona/complete-verification", { inquiryId: "inq_fake", status: "approved" }, voter.token);
    assert.notEqual(res.status, 200);
    assert.notEqual((await getUserByEpic(voter.epic)).verified, true);
    const record = await jsonGet(`persona:user:${(await getUserByEpic(voter.epic))._id}`);
    assert.notEqual(record?.status, "approved");
});

test("Persona webhook: unsigned or wrongly signed events are refused; signed events are applied", needsRedis, async () => {
    const { call, jsonGet, getUserByEpic, getVerification } = await setup();
    const voter = await makeVoterWithRecord();
    const userId = (await getUserByEpic(voter.epic))._id;
    const inquiryId = `inq_${runId}_${++seq}`;
    const event = JSON.stringify({ data: { type: "event", attributes: { name: "inquiry.approved", payload: { data: {
        type: "inquiry", id: inquiryId, attributes: { status: "approved", "reference-id": userId, fields: {} }
    } } } } });

    delete process.env.PERSONA_WEBHOOK_SECRET;
    assert.equal((await call("POST", "/persona/webhook", event)).status, 503);

    process.env.PERSONA_WEBHOOK_SECRET = "wbhsec_test_secret";
    const t = Math.floor(Date.now() / 1000);
    const sign = (secret, ts = t) => `t=${ts},v1=${crypto.createHmac("sha256", secret).update(`${ts}.${event}`).digest("hex")}`;
    assert.equal((await call("POST", "/persona/webhook", event)).status, 401);
    assert.equal((await call("POST", "/persona/webhook", event, undefined, { "Persona-Signature": sign("wrong") })).status, 401);
    assert.equal((await call("POST", "/persona/webhook", event, undefined, { "Persona-Signature": sign("wbhsec_test_secret", t - 3600) })).status, 401);
    assert.equal(await jsonGet(`persona:user:${userId}`), null, "nothing stored from rejected events");

    const ok = await call("POST", "/persona/webhook", event, undefined, { "Persona-Signature": sign("wbhsec_test_secret") });
    assert.equal(ok.status, 200);
    assert.equal((await jsonGet(`persona:user:${userId}`)).status, "approved");
    assert.equal((await getVerification(inquiryId)).status, "verified");
    delete process.env.PERSONA_WEBHOOK_SECRET;
});

// ---------------------------------------------------------------- Polling day

test("polling day: no simulated identity step unless demo mode is on, and steps run in order", needsRedis, async () => {
    const { call, getElectorByEpic, eci } = await setup();
    const voter = await makeVoterWithRecord();
    delete process.env.PERSONA_DEMO_MODE;

    const session = (await call("POST", "/voting-verification/start", { epic: voter.epic }, eci.token)).body.data;
    assert.equal((await call("POST", `/voting-verification/${session.sessionId}/persona/start`, {}, eci.token)).status, 503);
    assert.equal((await call("POST", `/voting-verification/${session.sessionId}/persona/sync`, {}, eci.token)).status, 503);
    // Skipping straight to the fingerprint step is refused, and the retired shortcuts no longer work.
    const skip = await call("POST", `/voting-verification/${session.sessionId}/fingerprint`, { scanToken: `FP-${voter.epic}` }, eci.token);
    assert.equal(skip.status, 409);
    assert.equal((await call("POST", `/voting-verification/${session.sessionId}/face`, {}, eci.token)).status, 410);
    assert.equal((await call("POST", `/voting-verification/${session.sessionId}/document`, {}, eci.token)).status, 410);
    assert.notEqual((await getElectorByEpic(voter.epic)).hasVoted, true);
});

test("polling day (demo mode): results are labelled simulated and a voter can vote only once", needsRedis, async () => {
    const { call, getElectorByEpic, eci } = await setup();
    const voter = await makeVoterWithRecord();
    process.env.PERSONA_DEMO_MODE = "true";
    try {
        const open = async () => {
            const s = (await call("POST", "/voting-verification/start", { epic: voter.epic }, eci.token)).body.data;
            const persona = await call("POST", `/voting-verification/${s.sessionId}/persona/start`, {}, eci.token);
            assert.equal(persona.status, 200);
            assert.equal(persona.body.data.simulated, true);
            assert.equal(persona.body.data.personaResult, "simulated");
            return s.sessionId;
        };
        const [a, b] = [await open(), await open()];
        const votes = await Promise.all([a, b].map((id) =>
            call("POST", `/voting-verification/${id}/fingerprint`, { scanToken: `FP-${voter.epic}` }, eci.token)));
        assert.deepEqual(votes.map((r) => r.status).sort(), [200, 409]);
        assert.equal((await getElectorByEpic(voter.epic)).hasVoted, true);
        assert.equal((await call("POST", "/voting-verification/start", { epic: voter.epic }, eci.token)).status, 409);
    } finally {
        delete process.env.PERSONA_DEMO_MODE;
    }
});

// ---------------------------------------------------------------- Seed

test("seed: running it again does not duplicate demo data or undo real changes", needsRedis, async () => {
    const { listRegistrations, getElectorByEpic, saveElector, getRegistration } = await setup();
    const run = () => promisify(execFile)(process.execPath, ["src/seed.js"], {
        cwd: new URL("..", import.meta.url).pathname,
        env: { ...process.env, REDIS_URL: TEST_REDIS_URL }
    });
    await run();
    const elector = await getElectorByEpic("ABC1234567");
    await saveElector({ ...elector, hasVoted: true, votedAt: "2026-01-01T00:00:00.000Z", address: "Changed by Form 8" });
    const demoId = "00000000-0000-4000-8000-000000000006";
    const countDemo = async () => (await listRegistrations()).filter((r) => r.name === "Simran Kaur").length;
    const before = await countDemo();
    await run();
    assert.equal(await countDemo(), before, "no extra demo application");
    assert.ok(await getRegistration(demoId));
    const after = await getElectorByEpic("ABC1234567");
    assert.equal(after.hasVoted, true);
    assert.equal(after.address, "Changed by Form 8");
});
