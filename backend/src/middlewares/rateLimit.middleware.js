import rateLimit from "express-rate-limit";
import { redis } from "../config/redis.js";

// Rate limits counted in Redis, so every server instance shares one count per client (an
// in-memory count would give each instance, or each serverless invocation, its own allowance).
//   rl:<name>:<client key>   hit counter, expires at the end of its window

// Under `node --test`, each test file runs in its own process against one shared Redis; scoping
// the counters by process keeps one file's requests from using up another file's allowance.
const scope = process.env.NODE_TEST_CONTEXT ? `${process.pid}:` : "";

// INCR and set the expiry on the first hit, atomically. Returns { hits, ttl in ms }.
const HIT_SCRIPT = `
local n = redis.call("INCR", KEYS[1])
if n == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then redis.call("PEXPIRE", KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return { n, ttl }`;

export class RedisRateLimitStore {
    constructor(name) { this.prefix = `rl:${scope}${name}:`; this.localKeys = false; }
    init(options) { this.windowMs = options.windowMs; }
    async increment(key) {
        const [hits, ttl] = await redis().eval(HIT_SCRIPT, { keys: [this.prefix + key], arguments: [String(this.windowMs)] });
        return { totalHits: Number(hits), resetTime: new Date(Date.now() + Number(ttl)) };
    }
    async decrement(key) { await redis().decr(this.prefix + key); }
    async resetKey(key) { await redis().del(this.prefix + key); }
}

/** A rate limiter whose counts live in Redis. `name` keeps each limiter's counts separate. */
export const limiter = (name, { windowMs, limit, message }) => rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message },
    store: new RedisRateLimitStore(name),
    // If Redis cannot be reached the request goes through: every route behind a limiter needs Redis
    // anyway, so it fails safely there, and validation errors still reach the caller.
    passOnStoreError: true
});
