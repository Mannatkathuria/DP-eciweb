import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

process.env.ACCESS_TOKEN_SECRET = "test";
// The end-to-end test needs its own, disposable Redis. It never uses REDIS_URL from .env,
// so running the tests cannot touch your development data.
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;

const { geography, validateGeography, resolveConstituency } = await import("../src/data/geography.js");
const { parseBoothAssignment } = await import("../src/controllers/admin.controllers.js");

const stateOf = (name) => geography.states.find((s) => s.name === name);
const sample = () => {
    const state = geography.states.find((s) => s.constituencies === "available");
    const district = state.districts.find((d) => d.constituencies.length > 0);
    return { state: state.name, district: district.name, assemblyConstituency: district.constituencies[0] };
};
// A 1x1 PNG: the smallest valid identity / address proof image.
const PROOF_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const validRequest = (overrides = {}) => ({
    name: "Test Applicant", dateOfBirth: "2000-01-15", gender: "Female",
    ...sample(), address: "House 12, Sector 5, Test Nagar", pinCode: "201301",
    referenceImage: PROOF_IMAGE, ...overrides
});

// Statutory strength of each Legislative Assembly (seats), used to cross-check the ECI dataset.
const ASSEMBLY_SEATS = {
    S01: 175, S02: 60, S03: 126, S04: 243, S05: 40, S06: 182, S07: 90, S08: 68, S10: 224, S11: 140, S12: 230,
    S13: 288, S14: 60, S15: 60, S16: 40, S17: 60, S18: 147, S19: 117, S20: 200, S21: 32, S22: 234, S23: 60,
    S24: 403, S25: 294, S26: 90, S27: 81, S28: 70, S29: 119, U05: 70, U07: 30, U08: 90
};
const PARLIAMENTARY_ONLY = ["U01", "U02", "U03", "U06", "U09"]; // UTs without a Legislative Assembly

test("geography: ECI dataset covers every State/UT with its full, uniquely numbered constituency list", () => {
    assert.equal(geography.states.length, 36);
    let total = 0;
    for (const s of geography.states) {
        assert.ok(s.districts.length > 0, `${s.name} has no districts`);
        assert.equal(s.constituencies, "available", s.name);
        const ids = new Map();
        for (const d of s.districts) {
            assert.ok(d.acs.length > 0, `${s.name} / ${d.name} offers no constituency`);
            assert.deepEqual(d.constituencies, d.acs.map((a) => a.name), `${s.name} / ${d.name} name list out of step`);
            for (const a of d.acs) {
                assert.equal(a.id, `${s.code}-${a.no}`);
                if (d.acScope === "district") ids.set(a.id, d.code);
            }
        }
        const nums = [...new Set(s.districts.flatMap((d) => d.acs.map((a) => a.no)))].sort((x, y) => x - y);
        assert.equal(nums.length, s.totalConstituencies, s.name);
        assert.deepEqual(nums, nums.map((_, i) => i + 1), `${s.name}: numbers are not 1..${nums.length}`);
        if (PARLIAMENTARY_ONLY.includes(s.code)) assert.equal(s.constituencyType, "parliamentary", s.name);
        else {
            assert.equal(s.constituencyType, "assembly", s.name);
            assert.equal(s.totalConstituencies, ASSEMBLY_SEATS[s.code], `${s.name}: ${s.totalConstituencies} seats, expected ${ASSEMBLY_SEATS[s.code]}`);
            total += s.totalConstituencies;
        }
    }
    assert.equal(total, 4123);
});

test("geography: known State -> District -> Constituency links (ECI numbers)", () => {
    const ok = (state, district, id, no, name) => {
        const r = resolveConstituency({ state, district, constituencyId: id });
        assert.equal(r.error, undefined, `${state} / ${district} / ${id}: ${r.error}`);
        assert.equal(r.constituency.no, no);
        assert.equal(r.constituency.name, name);
    };
    ok("NCT OF Delhi", "West", "U05-31", 31, "VIKASPURI");
    ok("Himachal Pradesh", "KANGRA", "S08-18", 18, "DHARAMSHALA");
    ok("Uttar Pradesh", "Gautam Buddha Nagar", "S24-62", 62, "Dadri");
    ok("Punjab", "Sri Muktsar Sahib", "S19-85", 85, "Malout");
    // Wrong parent, other State/UT, made-up number: rejected.
    assert.ok(resolveConstituency({ state: "Uttar Pradesh", district: "Lucknow", constituencyId: "S24-62" }).error);
    assert.ok(resolveConstituency({ state: "Punjab", district: "Sri Muktsar Sahib", constituencyId: "S24-62" }).error);
    assert.ok(resolveConstituency({ state: "NCT OF Delhi", district: "West", constituencyId: "U05-999" }).error);
    assert.ok(resolveConstituency({ state: "Nowhere", district: "X", constituencyId: "X-1" }).error);
    // Same name, different seats: each keeps its own number and district.
    const gujarat = stateOf("Gujarat");
    const mandvi = gujarat.districts.flatMap((d) => d.acs.filter((a) => a.name.toLowerCase() === "mandvi").map((a) => `${a.id}@${d.code}`));
    assert.equal(new Set(mandvi).size, 2, mandvi.join(", "));
    // UTs without a Legislative Assembly offer their Parliamentary Constituency.
    const chandigarh = stateOf("Chandigarh");
    assert.equal(chandigarh.constituencyType, "parliamentary");
    ok("Chandigarh", chandigarh.districts[0].name, "U02-1", 1, "CHANDIGARH");
    // Name-based check still works for the older request format and Form 8.
    assert.equal(validateGeography({ state: "Punjab", district: "Ludhiana", assemblyConstituency: "Ludhiana South" }), null);
    assert.ok(validateGeography({ state: "Punjab", district: "Ludhiana", assemblyConstituency: "Dadri" }));
});

test("booth assignment: both fields required and validated", () => {
    assert.throws(() => parseBoothAssignment({}), /both a part number and a polling station/);
    assert.throws(() => parseBoothAssignment({ partNumber: "12" }), /both/);
    assert.throws(() => parseBoothAssignment({ pollingStation: "Govt School" }), /both/);
    assert.throws(() => parseBoothAssignment({ partNumber: "0", pollingStation: "Govt School" }), /whole number/);
    assert.throws(() => parseBoothAssignment({ partNumber: "12a", pollingStation: "Govt School" }), /whole number/);
    assert.throws(() => parseBoothAssignment({ partNumber: "12", pollingStation: "ab" }), /between 3 and 200/);
    assert.deepEqual(parseBoothAssignment({ partNumber: " 42 ", pollingStation: "  Govt   School, Dadri " }),
        { partNumber: "42", pollingStation: "Govt School, Dadri" });
});

test("HTTP: geography endpoint and registration validation (no DB needed)", async () => {
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const register = (body) => fetch(`${base}/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    try {
        const geo = await fetch(`${base}/auth/geography`);
        assert.equal(geo.status, 200);
        assert.equal((await geo.json()).data.states.length, 36);

        const { address, ...noAddress } = validRequest();
        assert.equal((await register(noAddress)).status, 400);
        assert.equal((await register(validRequest({ pinCode: "12345" }))).status, 400);
        assert.equal((await register(validRequest({ pinCode: "012345" }))).status, 400);
        assert.equal((await register(validRequest({ address: "short" }))).status, 400);
        assert.equal((await register(validRequest({ district: "Lucknow", state: "Punjab" }))).status, 400);
        assert.equal((await register(validRequest({ assemblyConstituency: "Not A Real Seat" }))).status, 400);
    } finally {
        server.close();
    }
});

test("end-to-end: register -> BLO assigns booth on approval -> voter dashboard data and electoral roll",
    { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" }, async () => {
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    const { getElectorByEpic } = await import("../src/repositories/elector.repository.js");
    const { getRegistration } = await import("../src/repositories/registration.repository.js");
    await connectRedis();

    const makeUser = async (role) => {
        const user = { _id: crypto.randomUUID(), epic: `TST${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`, role, name: role };
        await saveUser(user);
        return { user, token: jwt.sign({ _id: user._id, epic: user.epic, role }, "test") };
    };
    const blo = await makeUser("blo");
    const otherVoter = await makeUser("voter");

    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = (method, path, body, token) => fetch(`${base}${path}`, {
        method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });

    try {
        // 1. Voter submits; address and PIN code are stored, no booth fields are taken from the voter.
        // Unique names per run: the disposable Redis may still hold applicants from earlier runs.
        const runId = crypto.randomInt(0, 1e9);
        const req = validRequest({ name: `Test Applicant ${runId}`, state: "Uttar Pradesh", district: "Gautam Buddha Nagar", assemblyConstituency: "Dadri",
            partNumber: "999", pollingStation: "Typed by applicant" });
        const submitted = await call("POST", "/auth/register", req);
        assert.equal(submitted.status, 201);
        const { referenceId } = (await submitted.json()).data;
        const stored = await getRegistration(referenceId);
        assert.equal(stored.address, req.address);
        assert.equal(stored.pinCode, "201301");
        assert.equal(stored.partNumber, undefined);
        assert.equal(stored.pollingStation, undefined);

        // 2. It appears in the BLO's pending list with the new fields.
        const list = await (await call("GET", "/admin/registrations", null, blo.token)).json();
        const row = list.data.items.find((r) => r._id === referenceId);
        assert.ok(row);
        assert.equal(row.address, req.address);
        assert.equal(row.pinCode, "201301");

        // 3. Only a BLO/admin can approve.
        const assignment = { partNumber: "57", pollingStation: "Government Inter College, Dadri - Room 2" };
        assert.equal((await call("POST", `/admin/registrations/${referenceId}/approve`, assignment)).status, 401);
        assert.equal((await call("POST", `/admin/registrations/${referenceId}/approve`, assignment, otherVoter.token)).status, 403);

        // 4. Approval without a complete, valid assignment is refused and leaves the request pending.
        assert.equal((await call("POST", `/admin/registrations/${referenceId}/approve`, {}, blo.token)).status, 400);
        assert.equal((await call("POST", `/admin/registrations/${referenceId}/approve`, { partNumber: "57" }, blo.token)).status, 400);
        assert.equal((await getRegistration(referenceId)).status, "pending");

        // 5. Approval with the assignment persists it on the request and the elector record.
        const approved = await call("POST", `/admin/registrations/${referenceId}/approve`, assignment, blo.token);
        assert.equal(approved.status, 200);
        const { epic } = (await approved.json()).data;
        const decided = await getRegistration(referenceId);
        assert.equal(decided.status, "approved");
        assert.equal(decided.partNumber, "57");
        assert.equal(decided.pollingStation, assignment.pollingStation);
        const elector = await getElectorByEpic(epic);
        assert.equal(elector.partNumber, "57");
        assert.equal(elector.pollingStation, assignment.pollingStation);
        assert.equal(elector.assemblyConstituency, "Dadri");

        // 6. A second approval is refused (no duplicate voter).
        assert.equal((await call("POST", `/admin/registrations/${referenceId}/approve`, assignment, blo.token)).status, 409);

        // 7. The new voter signs in again (fresh session) and their dashboard lookup returns the booth.
        const voterUser = (await redis().get(`user:${epic}`)) && JSON.parse(await redis().get(`user:${epic}`));
        const voterToken = jwt.sign({ _id: voterUser._id, epic, role: "voter" }, "test");
        const me = await (await call("GET", "/auth/me", null, voterToken)).json();
        assert.equal(me.data.epic, epic);
        const roll = await call("POST", "/electors/search", { method: "epic", epic: me.data.epic });
        assert.equal(roll.status, 200);
        const record = (await roll.json()).data;
        assert.equal(record.partNumber, "57");
        assert.equal(record.pollingStation, assignment.pollingStation);
        assert.equal(record.name, req.name);

        // 8. The details search in the electoral roll finds the same voter.
        const byDetails = await call("POST", "/electors/search", { method: "details", name: req.name, state: req.state,
            district: req.district, assemblyConstituency: req.assemblyConstituency });
        assert.equal((await byDetails.json()).data.epic, epic);

        // 9. Rejection still works without any booth assignment.
        const second = await (await call("POST", "/auth/register", validRequest({ name: `Second Applicant ${runId}` }))).json();
        const rejected = await call("POST", `/admin/registrations/${second.data.referenceId}/reject`, { note: "Duplicate" }, blo.token);
        assert.equal(rejected.status, 200);
        const status = await (await call("GET", `/auth/register/${second.data.referenceId}`)).json();
        assert.equal(status.data.status, "rejected");
        assert.equal(status.data.note, "Duplicate");
    } finally {
        server.close();
        await redis().quit();
    }
});
