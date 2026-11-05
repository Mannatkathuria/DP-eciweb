// Renames BLO accounts from the old BLO-XX-NNNNNN IDs to EPIC-shaped IDs (BLO1000001, ...) and
// removes their passwords. Every reference in Redis is rewritten: key names, JSON values, set,
// sorted-set, list and hash members. The audit trail and the operational-event history are left
// as they were (they are a record of what happened, and the audit trail is hash-chained), so old
// entries keep the old ID. Document collections in MongoDB are rewritten and the read models are
// rebuilt. Safe to run more than once.
import { redis, scanKeys } from "../config/redis.js";
import { mongo, mongoConfigured, connectMongo } from "../config/mongo.js";
import { DOC_STORES } from "../config/docStores.js";
import { BLO_ID_PATTERN, LEGACY_BLO_ID_PATTERN } from "../services/blo.service.js";

const HISTORY = [/^audit:/, /^ops:events/, /^mongo:outbox/, /^audit-chain/];
const PASSWORD_FIELDS = ["passwordHash", "mustChangePassword", "failedPasswordAttempts", "lockedUntil", "passwordChangedAt"];

export const migrateBloIds = async ({ log = console.log } = {}) => {
    const r = redis();
    // 1. Old IDs and their new ones (BLO-PB-000001 becomes BLO1000001 when that is free).
    const userKeys = await scanKeys("user:*");
    const legacy = new Set();
    let stripped = 0;
    for (const key of userKeys) {
        const raw = await r.get(key).catch(() => null);
        if (!raw || raw[0] !== "{") continue;
        let u; try { u = JSON.parse(raw); } catch { continue; }
        if (u.role !== "blo" && !u.bloId) continue;
        for (const id of [u.epic, u.bloId, key.slice(5)]) if (LEGACY_BLO_ID_PATTERN.test(id ?? "")) legacy.add(id);
        if (PASSWORD_FIELDS.some((f) => f in u)) { for (const f of PASSWORD_FIELDS) delete u[f]; await r.set(key, JSON.stringify(u), { KEEPTTL: true }); stripped += 1; }
    }
    if (!legacy.size) { if (stripped) log(`BLO migration: removed passwords from ${stripped} account(s).`); return { renamed: 0, stripped }; }
    await r.set("blo:serial", "1000000", { NX: true });
    const map = new Map();
    const taken = async (id) => Boolean(await r.exists(`user:${id}`)) || [...map.values()].includes(id);
    for (const old of [...legacy].sort()) {
        let next = old === "BLO-PB-000001" && !(await taken("BLO1000001")) ? "BLO1000001" : null;
        while (!next) { const c = `BLO${await r.incr("blo:serial")}`; if (!(await taken(c))) next = c; }
        map.set(old, next);
    }
    const cur = Number(await r.get("blo:serial"));
    const maxNew = Math.max(...[...map.values()].map((x) => Number(x.slice(3))));
    if (maxNew > cur) await r.set("blo:serial", String(maxNew));
    const swap = (s) => { let out = s; for (const [a, b] of map) out = out.split(a).join(b); return out; };
    const has = (s) => [...map.keys()].some((a) => String(s).includes(a));

    // 2. Rewrite every reference outside the history.
    let changed = 0;
    for (const key of await scanKeys("*")) {
        if (HISTORY.some((re) => re.test(key))) continue;
        const type = await r.type(key);
        if (type === "string") {
            const v = await r.get(key);
            if (v && has(v)) { let nv = swap(v); if (key.startsWith("user:") && nv[0] === "{") { const u = JSON.parse(nv); for (const f of PASSWORD_FIELDS) delete u[f]; nv = JSON.stringify(u); } await r.set(key, nv, { KEEPTTL: true }); changed += 1; }
        } else if (type === "set") {
            for (const m of (await r.sMembers(key)).filter(has)) { await r.sRem(key, m); await r.sAdd(key, swap(m)); changed += 1; }
        } else if (type === "zset") {
            for (const { value, score } of (await r.zRangeWithScores(key, 0, -1)).filter((x) => has(x.value))) { await r.zRem(key, value); await r.zAdd(key, { score, value: swap(value) }); changed += 1; }
        } else if (type === "list") {
            const items = await r.lRange(key, 0, -1);
            if (items.some(has)) { const ttl = await r.pTTL(key); await r.multi().del(key).rPush(key, items.map(swap)).exec(); if (ttl > 0) await r.pExpire(key, ttl); changed += 1; }
        } else if (type === "hash") {
            const h = await r.hGetAll(key);
            for (const [f, v] of Object.entries(h)) if (has(f) || has(v)) { await r.hDel(key, f); await r.hSet(key, swap(f), swap(v)); changed += 1; }
        }
        if (has(key)) { const target = swap(key); if (!(await r.exists(target))) await r.rename(key, target); else await r.del(key); }
    }

    // 3. MongoDB: document collections hold references too; read models are rebuilt from Redis.
    if (mongoConfigured()) {
        await connectMongo();
        for (const name of DOC_STORES) {
            const col = mongo().collection(name);
            for await (const doc of col.find({})) {
                const s = JSON.stringify(doc);
                if (!has(s)) continue;
                const next = JSON.parse(swap(s));
                await col.replaceOne({ _id: doc._id }, { ...next, _id: doc._id });
            }
        }
        const { rebuildReadModels } = await import("../services/projector.service.js");
        await rebuildReadModels();
    }
    log(`BLO migration: ${[...map].map(([a, b]) => `${a} -> ${b}`).join(", ")} (${changed} references updated; passwords removed).`);
    return { renamed: map.size, map: Object.fromEntries(map), changed };
};

export const isBloId = (id) => BLO_ID_PATTERN.test(id ?? "");
