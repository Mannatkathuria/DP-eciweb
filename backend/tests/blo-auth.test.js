import test from "node:test";
import assert from "node:assert/strict";

// BLOs sign in like every other officer: their BLO ID (shaped like an EPIC, e.g. BLO1000001) and a
// one-time code. There is no password, no password change and no password reset. Older
// BLO-XX-NNNNNN accounts are renamed by the migration.
process.env.STEP_UP_REQUIRED = process.env.STEP_UP_REQUIRED ?? "false";
process.env.ACCESS_TOKEN_SECRET = "test";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
delete process.env.MONGODB_URI;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const blo = await import("../src/services/blo.service.js");

test("BLO IDs are shaped like an EPIC number; the old format is recognised only for migration", () => {
    assert.ok(blo.BLO_ID_PATTERN.test("BLO1000001"));
    assert.ok(/^[A-Z]{3}\d{7}$/.test("BLO1000001"), "the same shape as an EPIC");
    assert.ok(!blo.BLO_ID_PATTERN.test("BLO-PB-000001"));
    assert.ok(blo.LEGACY_BLO_ID_PATTERN.test("BLO-PB-000001"));
    assert.equal(blo.maskMobile("9876543210"), "******3210");
    assert.equal(blo.hashPassword, undefined, "there is no BLO password any more");
});

test("end-to-end: a new BLO signs in on the officer page with the BLO ID and a one-time code", needsRedis, async (t) => {
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { getUserByEpic } = await import("../src/repositories/user.repository.js");
    await connectRedis();
    const otps = [];
    const log = console.log;
    t.after(() => { console.log = log; });
    console.log = (...args) => { const m = String(args[0]).match(/^\[DEMO OTP\].*?([A-Z]{3}\d{7}).*: (\d{6})$/); if (m) otps.push({ key: m[1], otp: m[2] }); else log(...args); };

    const { bloId, maskedMobile } = await blo.createBlo({ name: "Test BLO", mobile: "+91 98765 43210", state: "up" });
    assert.match(bloId, /^BLO\d{7}$/);
    assert.equal(maskedMobile, "******3210");
    const stored = await getUserByEpic(bloId);
    assert.equal(stored.role, "blo");
    assert.equal(stored.passwordHash, undefined);
    assert.equal(stored.mustChangePassword, undefined);
    const second = await blo.createBlo({ name: "Second BLO", mobile: "9123456789", state: "PB" });
    assert.equal(Number(second.bloId.slice(3)), Number(bloId.slice(3)) + 1, "one national series");
    await assert.rejects(blo.createBlo({ name: "X Y", mobile: "12345", state: "UP" }), /Mobile/);

    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = async (method, path, body, cookie) => {
        const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", ...(cookie ? { Cookie: cookie } : {}) },
            body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
    };
    try {
        // The password routes are gone.
        for (const path of ["/auth/blo/login", "/auth/blo/verify", "/auth/blo/password", "/auth/blo/forgot", "/auth/blo/reset"]) {
            assert.equal((await call("POST", path, { bloId, password: "x" })).status, 404, path);
        }
        // Wrong portal: a BLO cannot sign in on, say, the RO page.
        assert.equal((await call("POST", "/auth/login", { epic: bloId, portal: "ro" })).status, 403);
        // The BLO page: ID in, one-time code out, code in, session out.
        const step1 = await call("POST", "/auth/login", { epic: bloId.toLowerCase(), portal: "blo" });
        assert.equal(step1.status, 200, JSON.stringify(step1.body));
        assert.equal(otps.at(-1).key, bloId);
        const wrong = otps.at(-1).otp === "000000" ? "111111" : "000000";
        assert.equal((await call("POST", "/verification/otp/verify", { electorId: bloId, otp: wrong })).status, 400);
        const signedIn = await call("POST", "/verification/otp/verify", { electorId: bloId, otp: otps.at(-1).otp });
        assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
        assert.equal(signedIn.body.user.role, "blo");
        assert.equal(signedIn.body.user.epic, bloId);
        assert.equal(signedIn.body.user.mustChangePassword, undefined);
        // The same code cannot be reused, and the BLO portal is open straight away.
        assert.equal((await call("POST", "/verification/otp/verify", { electorId: bloId, otp: otps.at(-1).otp })).status, 400);
        assert.equal((await call("GET", "/admin/registrations", null, signedIn.cookie)).status, 200);
    } finally {
        server.close();
    }
    await redis().quit();
});

test("migration: BLO-XX-NNNNNN accounts get BLO1000001-style IDs everywhere, and lose their passwords", needsRedis, async () => {
    const { createClient } = await import("redis");
    const r = createClient({ url: TEST_REDIS_URL });
    await r.connect();
    const old = "BLO-ZZ-000123";
    const user = { _id: "legacy-blo-1", epic: old, bloId: old, role: "blo", name: "Legacy BLO", passwordHash: "scrypt$aa$bb", mustChangePassword: false };
    await r.set(`user:${old}`, JSON.stringify(user));
    await r.set("user:id:legacy-blo-1", JSON.stringify(user));
    await r.set("assignment:legacy-a", JSON.stringify({ _id: "legacy-a", epic: old, role: "blo" }));
    await r.sAdd(`assignments:user:${old}`, "legacy-a");
    await r.set("registration:legacy-r", JSON.stringify({ _id: "legacy-r", approvedBy: old }));
    await r.rPush("audit:legacy-test", JSON.stringify({ actor: { epic: old }, action: "test" }));
    const { connectRedis, redis } = await import("../src/config/redis.js");
    await connectRedis();
    const { migrateBloIds } = await import("../src/migrations/bloIds.js");
    const out = await migrateBloIds({ log: () => {} });
    const next = out.map[old];
    assert.match(next, /^BLO\d{7}$/);
    const migrated = JSON.parse(await r.get(`user:${next}`));
    assert.equal(migrated.epic, next);
    assert.equal(migrated.bloId, next);
    assert.equal(migrated.passwordHash, undefined);
    assert.equal(await r.exists(`user:${old}`), 0);
    assert.equal(JSON.parse(await r.get("user:id:legacy-blo-1")).epic, next);
    assert.equal(JSON.parse(await r.get("assignment:legacy-a")).epic, next);
    assert.equal(await r.exists(`assignments:user:${next}`), 1, "key names are renamed too");
    assert.equal(JSON.parse(await r.get("registration:legacy-r")).approvedBy, next);
    assert.ok((await r.lRange("audit:legacy-test", -1, -1))[0].includes(old), "audit history keeps the old ID");
    assert.equal((await migrateBloIds({ log: () => {} })).renamed, 0, "running it again changes nothing");
    await r.quit();
    await redis().quit();
});
