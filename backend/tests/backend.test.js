import test from "node:test";
import assert from "node:assert/strict";
import { compareIdentity, nameSimilarity, fetchCredential } from "../src/services/identity.service.js";

process.env.ACCESS_TOKEN_SECRET = "test";

const elector = {
    epic: "MNO1357924", name: "Kabir Singh", gender: "Male", dateOfBirth: new Date("2000-06-19")
};

test("identical credential is consistent", () => {
    const r = compareIdentity(elector, { ...elector, source: "t" });
    assert.equal(r.status, "consistent");
});

test("small name typo is a minor discrepancy", () => {
    const r = compareIdentity(elector, { ...elector, name: "Kabir Sing" });
    assert.equal(r.status, "minor_discrepancy");
});

test("different DOB is significant (-> BLO review)", () => {
    const r = compareIdentity(elector, { ...elector, dateOfBirth: new Date("2000-06-20") });
    assert.equal(r.status, "significant_discrepancy");
});

test("missing credential is 'unavailable'", () => {
    assert.equal(compareIdentity(elector, null).status, "unavailable");
});

test("name similarity", () => {
    assert.equal(nameSimilarity("A B", "a  b"), 1);
    assert.ok(nameSimilarity("Aarav Sharma", "Zzzz Qqqq") < 0.3);
});

test("sandbox overrides produce the demo outcomes", async () => {
    const cred = await fetchCredential("pan", elector);
    assert.equal(compareIdentity(elector, cred).status, "minor_discrepancy");
});

test("HTTP: health, 404, validation (no DB needed)", async () => {
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    try {
        assert.equal((await fetch(`${base}/health`)).status, 200);
        assert.equal((await fetch(`${base}/nope`)).status, 404);

        const bad = await fetch(`${base}/verification/identity`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ electorId: "x", method: "pan" })
        });
        assert.equal(bad.status, 400);

        assert.equal((await fetch(`${base}/admin/stats`)).status, 401); // JWT required
    } finally {
        server.close();
    }
});


test("HTTP: sign-in is EPIC-only and approval is BLO-only (no DB needed)", async () => {
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const post = (path, body) => fetch(`${base}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    try {
        // Missing / malformed EPIC is rejected before any lookup.
        assert.equal((await post("/auth/login", {})).status, 400);
        assert.equal((await post("/auth/login", { epic: "not-an-epic" })).status, 400);
        // A username/password pair is no longer a valid way in.
        assert.equal((await post("/auth/login", { username: "blo", password: "x" })).status, 400);
        // Registration is a public request form, but incomplete requests are rejected.
        assert.equal((await post("/auth/register", { name: "A" })).status, 400);
        // Reviewing / approving requests requires a signed-in BLO or admin.
        assert.equal((await fetch(`${base}/admin/registrations`)).status, 401);
        assert.equal((await post("/admin/registrations/abc/approve", {})).status, 401);
    } finally {
        server.close();
    }
});
