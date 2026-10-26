import test from "node:test";
import assert from "node:assert/strict";

process.env.ACCESS_TOKEN_SECRET = "test";
// Uses its own disposable Redis (never REDIS_URL from .env), like registration.test.js.
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;

const blo = await import("../src/services/blo.service.js");

test("BLO passwords: hashed with a salt and verified in constant time", async () => {
    const a = await blo.hashPassword("Booth2026x");
    const b = await blo.hashPassword("Booth2026x");
    assert.notEqual(a, b);
    assert.ok(!a.includes("Booth2026x"));
    assert.equal(await blo.verifyPassword("Booth2026x", a), true);
    assert.equal(await blo.verifyPassword("Booth2026y", a), false);
    assert.equal(await blo.verifyPassword("Booth2026x", "not-a-hash"), false);
});

test("BLO password rules, temporary passwords, IDs and mobile masking", () => {
    assert.ok(blo.passwordProblem("short1"));
    assert.ok(blo.passwordProblem("lettersonly"));
    assert.ok(blo.passwordProblem("12345678"));
    assert.equal(blo.passwordProblem("Booth2026x"), null);
    for (let i = 0; i < 20; i += 1) assert.equal(blo.passwordProblem(blo.generateTemporaryPassword()), null);
    assert.ok(blo.BLO_ID_PATTERN.test("BLO-UP-000001"));
    assert.ok(!blo.BLO_ID_PATTERN.test("BLO1234567"));
    assert.equal(blo.maskMobile("9876543210"), "******3210");
    assert.equal(blo.BLO_OTP_TTL_MS, 120000);
});

test("end-to-end: BLO ID + password -> 2-minute mobile OTP -> forced password change -> dashboard",
    { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" }, async (t) => {
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { getUserByEpic, saveUser } = await import("../src/repositories/user.repository.js");
    await connectRedis();

    // Capture the demo OTPs the backend prints instead of sending an SMS.
    const otps = [];
    const log = console.log;
    t.after(() => { console.log = log; });
    console.log = (...args) => {
        const m = String(args[0]).match(/^\[DEMO OTP\] BLO (?:PASSWORD RESET )?(\S+) \(mobile (\S+)\): (\d{6})$/);
        if (m) otps.push({ bloId: m[1], mobile: m[2], otp: m[3] }); else log(...args);
    };
    const lastOtp = () => otps.at(-1).otp;

    const { bloId, temporaryPassword, maskedMobile } = await blo.createBlo({ name: "Test BLO", mobile: "+91 98765 43210", state: "up" });
    assert.match(bloId, /^BLO-UP-\d{6}$/);
    assert.equal(maskedMobile, "******3210");
    const stored = await getUserByEpic(bloId);
    assert.equal(stored.role, "blo");
    assert.equal(stored.mobile, "9876543210");
    assert.equal(stored.mustChangePassword, true);
    assert.ok(!JSON.stringify(stored).includes(temporaryPassword));

    // A second BLO in the same state gets the next serial.
    const second = await blo.createBlo({ name: "Second BLO", mobile: "9123456789", state: "UP" });
    assert.notEqual(second.bloId, bloId);
    await assert.rejects(blo.createBlo({ name: "X Y", mobile: "12345", state: "UP" }), /Mobile/);

    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = async (method, path, body, cookie) => {
        const res = await fetch(`${base}${path}`, {
            method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        return { status: res.status, body: await res.json().catch(() => null), cookie: res.headers.get("set-cookie")?.split(";")[0] };
    };

    try {
        // Wrong password / unknown ID: same generic answer, no OTP issued.
        assert.equal((await call("POST", "/auth/blo/login", { bloId, password: "wrong-pass1" })).status, 401);
        assert.equal((await call("POST", "/auth/blo/login", { bloId: "BLO-UP-999999", password: temporaryPassword })).status, 401);
        assert.equal(otps.length, 0);

        // BLO accounts cannot use the EPIC-only OTP routes to skip the password.
        assert.equal((await call("POST", "/verification/otp/send", { electorId: bloId })).status, 403);
        assert.equal((await call("POST", "/verification/otp/verify", { electorId: bloId, otp: "123456" })).status, 403);
        await saveUser({ _id: "legacy-blo", epic: "BLO7654321", role: "blo", name: "Legacy" });
        assert.equal((await call("POST", "/auth/login", { epic: "BLO7654321", portal: "blo" })).status, 403);

        // Correct ID + password -> OTP to the masked mobile, valid 2 minutes.
        const step1 = await call("POST", "/auth/blo/login", { bloId: bloId.toLowerCase(), password: temporaryPassword });
        assert.equal(step1.status, 200);
        assert.equal(step1.body.data.maskedMobile, "******3210");
        assert.equal(step1.body.data.expiresInSeconds, 120);
        assert.equal(otps.at(-1).bloId, bloId);
        assert.equal(otps.at(-1).mobile, "******3210");
        const { challenge } = step1.body.data;

        // The OTP alone (without the password step's challenge) is useless.
        assert.equal((await call("POST", "/auth/blo/verify", { otp: lastOtp() })).status, 401);
        assert.equal((await call("POST", "/auth/blo/verify", { challenge: "forged", otp: lastOtp() })).status, 401);
        // Resend is refused during the cooldown.
        assert.equal((await call("POST", "/auth/blo/resend", { challenge })).status, 429);
        // Wrong OTP is refused.
        const wrong = lastOtp() === "000000" ? "111111" : "000000";
        assert.equal((await call("POST", "/auth/blo/verify", { challenge, otp: wrong })).status, 400);

        // An OTP older than 2 minutes is refused.
        const realNow = Date.now;
        const expiredOtp = lastOtp();
        Date.now = () => realNow() + 121_000;
        try {
            assert.equal((await call("POST", "/auth/blo/verify", { challenge, otp: expiredOtp })).status, 400);
        } finally { Date.now = realNow; }

        // After the cooldown a new OTP can be sent, and it signs the BLO in.
        await redis().del(`blo:otp:cooldown:${bloId}`);
        assert.equal((await call("POST", "/auth/blo/resend", { challenge })).status, 200);
        const signedIn = await call("POST", "/auth/blo/verify", { challenge, otp: lastOtp() });
        assert.equal(signedIn.status, 200);
        assert.equal(signedIn.body.user.role, "blo");
        assert.equal(signedIn.body.user.epic, bloId);
        assert.equal(signedIn.body.user.mustChangePassword, true);
        const session = signedIn.cookie;
        // The same OTP cannot be reused.
        assert.equal((await call("POST", "/auth/blo/verify", { challenge, otp: lastOtp() })).status, 400);

        // Until the temporary password is replaced, the BLO portal is closed.
        assert.equal((await call("GET", "/admin/registrations", null, session)).status, 403);
        assert.equal((await call("POST", "/auth/blo/password", { currentPassword: "nope", newPassword: "Booth2026x" }, session)).status, 400);
        assert.equal((await call("POST", "/auth/blo/password", { currentPassword: temporaryPassword, newPassword: "short" }, session)).status, 400);
        assert.equal((await call("POST", "/auth/blo/password", { currentPassword: temporaryPassword, newPassword: temporaryPassword }, session)).status, 400);
        const changed = await call("POST", "/auth/blo/password", { currentPassword: temporaryPassword, newPassword: "Booth2026x" }, session);
        assert.equal(changed.status, 200);
        assert.equal(changed.body.data.mustChangePassword, false);
        // The password change renews the session cookie.
        assert.ok(changed.cookie?.startsWith("accessToken="));
        assert.equal((await call("GET", "/admin/registrations", null, changed.cookie)).status, 200);
        assert.equal((await call("GET", "/auth/me", null, changed.cookie)).body.data.mustChangePassword, false);

        // The temporary password no longer works; the new one does.
        assert.equal((await call("POST", "/auth/blo/login", { bloId, password: temporaryPassword })).status, 401);
        assert.equal((await call("POST", "/auth/blo/login", { bloId, password: "Booth2026x" })).status, 200);

        // Forgot password: OTP to the registered mobile, then a new password (typed twice in the UI).
        assert.equal((await call("POST", "/auth/blo/forgot", { bloId: "BLO-UP-999999" })).status, 404);
        const forgot = await call("POST", "/auth/blo/forgot", { bloId });
        assert.equal(forgot.status, 200);
        assert.equal(forgot.body.data.maskedMobile, "******3210");
        assert.equal(forgot.body.data.expiresInSeconds, 120);
        const resetLine = otps.at(-1);
        assert.equal(resetLine.bloId, bloId);
        const reset = forgot.body.data.challenge;
        // Reset and sign-in OTPs/challenges cannot stand in for each other.
        assert.equal((await call("POST", "/auth/blo/verify", { challenge: reset, otp: resetLine.otp })).status, 401);
        assert.equal((await call("POST", "/auth/blo/reset", { challenge, otp: resetLine.otp, newPassword: "Fresh2026z" })).status, 401);
        // Cooldown on immediate re-request.
        assert.equal((await call("POST", "/auth/blo/forgot", { bloId })).status, 429);
        // Weak password is refused without using up the OTP; wrong OTP is refused.
        assert.equal((await call("POST", "/auth/blo/reset", { challenge: reset, otp: resetLine.otp, newPassword: "weak" })).status, 400);
        const wrongReset = resetLine.otp === "000000" ? "111111" : "000000";
        assert.equal((await call("POST", "/auth/blo/reset", { challenge: reset, otp: wrongReset, newPassword: "Fresh2026z" })).status, 400);
        // Correct OTP replaces the password in the database and signs out older sessions.
        const before = (await getUserByEpic(bloId)).passwordHash;
        await new Promise((r) => setTimeout(r, 1100));
        assert.equal((await call("POST", "/auth/blo/reset", { challenge: reset, otp: resetLine.otp, newPassword: "Fresh2026z" })).status, 200);
        const afterReset = await getUserByEpic(bloId);
        assert.notEqual(afterReset.passwordHash, before);
        assert.equal(await blo.verifyPassword("Fresh2026z", afterReset.passwordHash), true);
        assert.equal((await call("GET", "/auth/me", null, changed.cookie)).status, 401);
        assert.equal((await call("POST", "/auth/blo/reset", { challenge: reset, otp: resetLine.otp, newPassword: "Again2026q" })).status, 400);
        assert.equal((await call("POST", "/auth/blo/login", { bloId, password: "Booth2026x" })).status, 401);
        assert.equal((await call("POST", "/auth/blo/login", { bloId, password: "Fresh2026z" })).status, 200);

        // Five wrong passwords lock the account, even for the right password.
        for (let i = 0; i < 4; i += 1) assert.equal((await call("POST", "/auth/blo/login", { bloId, password: "Wrong12345" })).status, 401);
        assert.equal((await call("POST", "/auth/blo/login", { bloId, password: "Wrong12345" })).status, 423);
        assert.equal((await call("POST", "/auth/blo/login", { bloId, password: "Fresh2026z" })).status, 423);
        // A reset via the registered mobile also clears the lock.
        await redis().del(`blo-reset:otp:cooldown:${bloId}`);
        const unlock = await call("POST", "/auth/blo/forgot", { bloId });
        assert.equal((await call("POST", "/auth/blo/reset", { challenge: unlock.body.data.challenge, otp: otps.at(-1).otp, newPassword: "Unlock2026k" })).status, 200);
        assert.equal((await call("POST", "/auth/blo/login", { bloId, password: "Unlock2026k" })).status, 200);

        // Voters are unaffected: a voter cannot use the BLO password endpoint.
        await saveUser({ _id: "voter-x", epic: "VOT1234567", role: "voter", name: "Voter" });
        const jwt = (await import("jsonwebtoken")).default;
        const voterCookie = `accessToken=${jwt.sign({ _id: "voter-x", epic: "VOT1234567", role: "voter" }, "test")}`;
        assert.equal((await call("POST", "/auth/blo/password", { currentPassword: "x", newPassword: "Booth2026x" }, voterCookie)).status, 403);
    } finally {
        server.close();
        await redis().quit();
    }
});
