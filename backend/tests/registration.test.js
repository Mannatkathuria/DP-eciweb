import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

process.env.ACCESS_TOKEN_SECRET = "test";
// The end-to-end test needs its own, disposable Redis. It never uses REDIS_URL from .env,
// so running the tests cannot touch your development data.
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;

const { geography, validateGeography } = await import("../src/data/geography.js");
const { parseBoothAssignment } = await import("../src/controllers/admin.controllers.js");

const stateOf = (name) => geography.states.find((s) => s.name === name);
const sample = () => {
    const state = geography.states.find((s) => s.constituencies === "available");
    const district = state.districts.find((d) => d.constituencies.length > 0);
    return { state: state.name, district: district.name, assemblyConstituency: district.constituencies[0] };
};
const validRequest = (overrides = {}) => ({
    name: "Test Applicant", dateOfBirth: "2000-01-15", gender: "Female",
    ...sample(), address: "House 12, Sector 5, Test Nagar", pinCode: "201301", ...overrides
});

test("geography: every State/UT has districts; constituencies only where LGD maps them", () => {
    assert.equal(geography.states.length, 36);
    for (const s of geography.states) {
        assert.ok(s.districts.length > 0, `${s.name} has no districts`);
        if (s.constituencies !== "available") {
            assert.ok(s.districts.every((d) => d.constituencies.length === 0), `${s.name} lists constituencies`);
        }
    }
    assert.equal(stateOf("Ladakh").constituencies, "none");
    assert.equal(stateOf("Delhi").constituencies, "unavailable");
});

test("geography: known State -> District -> Constituency links", () => {
    assert.equal(validateGeography({ state: "Uttar Pradesh", district: "Gautam Buddha Nagar", assemblyConstituency: "Dadri" }), null);
    assert.equal(validateGeography({ state: "Punjab", district: "Sri Muktsar Sahib", assemblyConstituency: "Malout" }), null);
    // Right names, wrong parent: rejected.
    assert.ok(validateGeography({ state: "Uttar Pradesh", district: "Lucknow", assemblyConstituency: "Dadri" }));
    assert.ok(validateGeography({ state: "Punjab", district: "Gautam Buddha Nagar", assemblyConstituency: "Dadri" }));
    assert.ok(validateGeography({ state: "Nowhere", district: "X", assemblyConstituency: "Y" }));
    // States without (usable) constituency data cannot be submitted.
    assert.ok(validateGeography({ state: "Ladakh", district: stateOf("Ladakh").districts[0].name, assemblyConstituency: "Leh" }));
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
        const req = validRequest({ state: "Uttar Pradesh", district: "Gautam Buddha Nagar", assemblyConstituency: "Dadri",
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
        const second = await (await call("POST", "/auth/register", validRequest())).json();
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
