import crypto from "crypto";
import { acquireLock, jsonGet, redis } from "../config/redis.js";
import { connectMongo, mongo, mongoConfigured, mongoReady } from "../config/mongo.js";

// The projector copies committed Redis records into MongoDB read models. It is the only writer to
// MongoDB, runs as one instance at a time (Redis lock), and is idempotent: every write is an upsert
// by id, so running it twice, or after a crash, gives the same result.
//
// What feeds it (all written by Redis in the same transaction as the change itself, so nothing
// committed can be missed):
//   mongo:outbox:stations  sorted set of station ids changed (score = time queued)
//   mongo:outbox:events    list of operational event ids, oldest first
//   audit:events           the audit trail itself (append-only list); mongo:cursor:audit is how
//                          many entries have been archived
//
// Audit archive entries carry a hash chain (chain_n = SHA-256(chain_{n-1} + hash_n)) and each run
// stores a checkpoint of the chain in MongoDB, a second database. Rewriting audit history in Redis,
// even with recomputed per-event hashes and counter, then no longer matches the checkpoints.

export const STATION_OUTBOX = "mongo:outbox:stations";
export const EVENT_OUTBOX = "mongo:outbox:events";
const AUDIT_CURSOR = "mongo:cursor:audit";
const AUDIT_CHAIN = "mongo:chain:audit";        // chain value after the last archived entry
const LOCK = "mongo:projector:lock";
const BATCH = 500;
export const GENESIS = "0".repeat(64);

/** Called inside a Redis transaction when a station is saved. */
export const queueStation = (id, tx) => { if (mongoConfigured()) tx.zAdd(STATION_OUTBOX, { score: Date.now(), value: id }); };
/** Called inside a Redis transaction when an operational event is recorded. */
export const queueEvent = (id, tx) => { if (mongoConfigured()) tx.rPush(EVENT_OUTBOX, id); };

export const chainNext = (prev, hash) => crypto.createHash("sha256").update(`${prev}${hash}`).digest("hex");

/** A station as a MongoDB document, with a GeoJSON point (longitude first) when it has a location. */
export const stationDoc = (s) => ({
    ...s,
    geo: s.location ? { type: "Point", coordinates: [s.location.lng, s.location.lat] } : null,
    partNumberInt: Number(s.partNumber) || null,
    projectedAt: new Date()
});

// Removes members of the station outbox only if they were not re-queued while we worked.
const REMOVE_IF_UNCHANGED = `
local n = 0
for i = 1, #ARGV, 2 do
  local score = redis.call("ZSCORE", KEYS[1], ARGV[i])
  if score and tonumber(score) == tonumber(ARGV[i + 1]) then
    redis.call("ZREM", KEYS[1], ARGV[i]); n = n + 1
  end
end
return n`;

const projectStations = async () => {
    let total = 0;
    for (;;) {
        const queued = await redis().zRangeWithScores(STATION_OUTBOX, 0, BATCH - 1);
        if (!queued.length) return total;
        const ops = [];
        for (const { value: id } of queued) {
            const s = await jsonGet(`station:${id}`);
            ops.push(s ? { replaceOne: { filter: { _id: id }, replacement: stationDoc(s), upsert: true } } : { deleteOne: { filter: { _id: id } } });
        }
        await mongo().collection("polling_stations").bulkWrite(ops, { ordered: false });
        await redis().eval(REMOVE_IF_UNCHANGED, { keys: [STATION_OUTBOX], arguments: queued.flatMap(({ value, score }) => [value, String(score)]) });
        total += queued.length;
    }
};

const eventDoc = (e) => ({ ...e, at: new Date(e.at), projectedAt: new Date() });

const projectEvents = async () => {
    let total = 0;
    for (;;) {
        const ids = await redis().lRange(EVENT_OUTBOX, 0, BATCH - 1);
        if (!ids.length) return total;
        const events = (await Promise.all(ids.map((id) => jsonGet(`ops:event:${id}`)))).filter(Boolean);
        if (events.length) {
            await mongo().collection("operational_events").bulkWrite(
                events.map((e) => ({ replaceOne: { filter: { _id: e._id }, replacement: eventDoc(e), upsert: true } })), { ordered: false });
        }
        // Single writer (lock held), and producers only append, so the first ids.length entries are ours.
        await redis().lTrim(EVENT_OUTBOX, ids.length, -1);
        total += ids.length;
    }
};

const projectAudit = async (hashEvent) => {
    let total = 0;
    let cursor = Number(await redis().get(AUDIT_CURSOR) ?? 0);
    let chain = (await redis().get(AUDIT_CHAIN)) ?? GENESIS;
    for (;;) {
        const ids = await redis().lRange("audit:events", cursor, cursor + BATCH - 1);
        if (!ids.length) break;
        const ops = [];
        for (const [i, id] of ids.entries()) {
            const event = await jsonGet(`audit:event:${id}`);
            const seq = cursor + i + 1;
            const hash = event?.hash ?? (event ? hashEvent(event) : null);
            chain = chainNext(chain, hash ?? `missing:${id}`);
            ops.push({ replaceOne: { filter: { _id: id }, upsert: true,
                replacement: { ...(event ?? { _id: id, missing: true }), at: event ? new Date(event.at) : null, seq, hash, chain, archivedAt: new Date() } } });
        }
        await mongo().collection("audit_archive").bulkWrite(ops, { ordered: false });
        cursor += ids.length;
        total += ids.length;
        await mongo().collection("audit_checkpoints").updateOne({ count: cursor }, { $setOnInsert: { count: cursor, chain, at: new Date() } }, { upsert: true });
        await redis().multi().set(AUDIT_CURSOR, String(cursor)).set(AUDIT_CHAIN, chain).exec();
    }
    return total;
};

let running = null;

/** Starts a projection in the background (does not wait). */
export const kickProjector = () => { if (mongoConfigured()) setImmediate(() => { drainProjector(); }); };

/**
 * Copies everything queued into MongoDB. Safe to call often: returns quickly when nothing is
 * queued or another instance is already projecting. Never throws; returns what it did.
 */
export const drainProjector = async () => {
    if (!mongoConfigured()) return { skipped: "not configured" };
    if (running) return running;
    running = (async () => {
        try {
            if (!mongoReady()) await connectMongo();
            const release = await acquireLock(LOCK, 60);
            if (!release) return { skipped: "busy" };
            try {
                const { hashEvent } = await import("./audit.service.js");
                return { stations: await projectStations(), events: await projectEvents(), audit: await projectAudit(hashEvent) };
            } finally { await release(); }
        } catch (err) {
            console.error("MongoDB projector:", err.message);
            return { error: err.message };
        } finally { running = null; }
    })();
    return running;
};

/** How much is waiting to be copied (for health and the admin status screen). */
export const projectorBacklog = async () => {
    const [stations, events, auditLen, cursor] = await redis().multi()
        .zCard(STATION_OUTBOX).lLen(EVENT_OUTBOX).lLen("audit:events").get(AUDIT_CURSOR).exec();
    return { stations, events, audit: Math.max(0, auditLen - Number(cursor ?? 0)) };
};

/**
 * Rebuilds every MongoDB read model from Redis: empties the collections and queues all stations,
 * all logged operational events and the whole audit trail again. Used by `npm run mongo:sync`.
 */
export const rebuildReadModels = async () => {
    if (!mongoConfigured()) throw new Error("MONGODB_URI is not set.");
    await connectMongo();
    const release = await acquireLock(LOCK, 600);
    if (!release) throw new Error("The projector is running; try again in a minute.");
    try {
        for (const name of ["polling_stations", "operational_events", "audit_archive", "audit_checkpoints"]) await mongo().collection(name).deleteMany({});
        const stationIds = await redis().sMembers("stations:all");
        const eventIds = await redis().zRange("ops:events", 0, -1);
        const tx = redis().multi().del(STATION_OUTBOX).del(EVENT_OUTBOX).del(AUDIT_CURSOR).del(AUDIT_CHAIN);
        const now = Date.now();
        if (stationIds.length) tx.zAdd(STATION_OUTBOX, stationIds.map((value) => ({ score: now, value })));
        if (eventIds.length) tx.rPush(EVENT_OUTBOX, eventIds);
        await tx.exec();
    } finally { await release(); }
    return drainProjector();
};

/**
 * Compares the audit trail in Redis with the hash chain archived in MongoDB. Any entry whose
 * hash, position or presence changed since it was archived breaks the chain at that point.
 */
export const verifyAuditChain = async (hashEvent) => {
    if (!mongoConfigured()) return { checked: false, reason: "MongoDB is not configured, so there is no external chain to compare with." };
    await drainProjector();
    const checkpoints = await mongo().collection("audit_checkpoints").find({}, { projection: { _id: 0 } }).sort({ count: 1 }).toArray();
    const ids = await redis().lRange("audit:events", 0, -1);
    let chain = GENESIS;
    let firstBreak = null;
    let cpIndex = 0;
    const archived = new Map();
    for (let i = 0; i < ids.length; i += BATCH) {
        const docs = await mongo().collection("audit_archive").find({ seq: { $gt: i, $lte: i + BATCH } }, { projection: { seq: 1, chain: 1, _id: 1 } }).toArray();
        for (const d of docs) archived.set(d.seq, d);
        for (let j = i; j < Math.min(i + BATCH, ids.length); j++) {
            const event = await jsonGet(`audit:event:${ids[j]}`);
            chain = chainNext(chain, event ? (event.hash ?? hashEvent(event)) : `missing:${ids[j]}`);
            const seq = j + 1;
            const doc = archived.get(seq);
            if (!firstBreak && doc && (doc._id !== ids[j] || doc.chain !== chain)) firstBreak = { seq, eventId: ids[j], archivedEventId: doc._id };
            while (cpIndex < checkpoints.length && checkpoints[cpIndex].count === seq) {
                if (!firstBreak && checkpoints[cpIndex].chain !== chain) firstBreak = { seq, checkpoint: true };
                cpIndex += 1;
            }
            archived.delete(seq);
        }
    }
    const lastCheckpoint = checkpoints.at(-1) ?? null;
    // Fewer entries in Redis than were archived means entries were removed from the end.
    const truncated = lastCheckpoint ? lastCheckpoint.count > ids.length : false;
    return { checked: true, entries: ids.length, checkpoints: checkpoints.length, lastCheckpointAt: lastCheckpoint?.at ?? null,
        ok: !firstBreak && !truncated, firstBreak, truncated };
};
