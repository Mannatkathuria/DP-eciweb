import crypto from "crypto";
import { redis } from "../config/redis.js";
import { ApiError } from "../utils/ApiErrors.js";

// One-time codes, kept in Redis so they work across server instances and restarts.
//   otp:<key>         hash with the code's SHA-256 digest (never the code itself) and the attempt count
//                     expires with the code
//   otp:notify:<key>  the demo notification feed for that code (same lifetime)
// Codes are delivered only to the server log and the demo notification feed: there is no SMS
// gateway (see docs/KNOWN_LIMITATIONS.md).

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const codeKey = (key) => `otp:${key}`;
const feedKey = (key) => `otp:notify:${key}`;
const digest = (key, otp) => crypto.createHash("sha256").update(`${key}:${otp}`).digest("hex");

// Counts one attempt and returns [attempts, storedDigest]; nothing if the code has expired.
const ATTEMPT_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 0 then return nil end
local n = redis.call("HINCRBY", KEYS[1], "attempts", 1)
return { n, redis.call("HGET", KEYS[1], "digest") }`;

/**
 * Issues a one-time code for `key` (an EPIC or another sign-in key), replacing any earlier code.
 * Options set a shorter lifetime and the log label (e.g. BLO sign-in: 2 minutes, sent to a mobile).
 */
export const issueOtp = async (key, { ttlMs = OTP_TTL_MS, logLabel = `EPIC ${key}` } = {}) => {
    const otp = String(crypto.randomInt(100000, 1000000));
    const notification = {
        id: crypto.randomUUID(), app: "ECI Verification", icon: "🗳️", title: "Your verification OTP",
        body: `Your OTP is ${otp}. It expires in ${Math.round(ttlMs / 60000)} minutes.`, createdAt: new Date().toISOString()
    };
    await redis().multi()
        .del(codeKey(key))
        .hSet(codeKey(key), { digest: digest(key, otp), attempts: "0" })
        .pExpire(codeKey(key), ttlMs)
        .set(feedKey(key), JSON.stringify([notification]), { PX: ttlMs })
        .exec();
    // Demo only: there is no SMS gateway, so the code is printed for the tester.
    console.log(`[DEMO OTP] ${logLabel}: ${otp}`);
};

/** The demo notification feed for a key (codes that have not expired). */
export const getNotifications = async (key) => {
    const raw = await redis().get(feedKey(key));
    return raw ? JSON.parse(raw).map((n) => ({ ...n, time: "now" })) : [];
};

const discard = (key) => redis().del([codeKey(key), feedKey(key)]);

/** Checks a code. Throws if it is expired, wrong, or tried too often; a correct code is used up. */
export const checkOtp = async (key, otp) => {
    const result = await redis().eval(ATTEMPT_SCRIPT, { keys: [codeKey(key)] });
    if (!result) {
        await discard(key);
        throw new ApiError(400, "OTP expired. Request a new one.");
    }
    const [attempts, stored] = [Number(result[0]), String(result[1])];
    if (attempts > MAX_ATTEMPTS) {
        await discard(key);
        throw new ApiError(429, "Too many attempts. Request a new OTP.");
    }
    const a = Buffer.from(stored, "hex");
    const b = Buffer.from(digest(key, String(otp)), "hex");
    if (!(a.length === b.length && crypto.timingSafeEqual(a, b))) {
        if (attempts >= MAX_ATTEMPTS) await discard(key);
        throw new ApiError(400, "Incorrect OTP. Please try again.");
    }
    await discard(key);
};
