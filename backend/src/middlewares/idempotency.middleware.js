// Safe retries for citizen submissions. The browser sends an `Idempotency-Key` (one per
// application attempt, kept until it succeeds). The first request with a key is processed; a
// repeat while it is still running gets 409, and a repeat after it succeeded gets the same
// response again instead of a second application. Keys last 24 hours. Without the header the
// route behaves as before.
import { redis } from "../config/redis.js";

const TTL = 24 * 3600;
const KEY = /^[A-Za-z0-9-]{16,80}$/;

export const idempotent = (scope) => async (req, res, next) => {
    const key = req.get("Idempotency-Key");
    if (!key) return next();
    if (!KEY.test(key)) return res.status(400).json({ success: false, message: "Idempotency-Key must be 16 to 80 letters, digits or dashes." });
    const k = `idem:${scope}:${key}`;
    try {
        if (!(await redis().set(k, JSON.stringify({ state: "running" }), { NX: true, EX: TTL }))) {
            const saved = JSON.parse((await redis().get(k)) ?? "{}");
            if (saved.state === "done") { res.set("Idempotent-Replay", "true"); return res.status(saved.status).json(saved.body); }
            return res.status(409).json({ success: false, message: "This application is already being submitted. Wait a moment, then check its status." });
        }
    } catch { return next(); } // Redis trouble must not block a submission
    const json = res.json.bind(res);
    res.json = (body) => {
        const status = res.statusCode;
        // Keep successes so a retry replays them; forget failures so the citizen can fix and resend.
        const store = status < 300 ? redis().set(k, JSON.stringify({ state: "done", status, body }), { EX: TTL }) : redis().del(k);
        store.catch(() => {});
        return json(body);
    };
    return next();
};
