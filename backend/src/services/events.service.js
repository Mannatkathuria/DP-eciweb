import crypto from "crypto";
import { jsonGet, redis } from "../config/redis.js";
import { coversAny } from "./authority.service.js";

// Operational events: the durable record of what happened on the ground (poll opened, queue
// reported, incident raised, device went offline, a sync completed...). They are written in the
// same Redis transaction as the change they describe (outbox pattern), then published on a Redis
// channel for live screens. A live message is only a hint to refresh: the event log and the
// records themselves are the truth, and a client that missed messages catches up with
// GET /api/v1/events?since=...
//
// Events carry no personal data: counts and statuses, never who voted.

export const EVENT_TYPES = [
    "APPLICATION_SUBMITTED", "BLO_ASSIGNED", "VERIFICATION_COMPLETED", "REGISTRATION_DECIDED", "ELECTORAL_ROLL_UPDATED",
    "POLLING_STATION_UPDATED", "STATION_ONLINE", "STATION_OFFLINE", "SYNC_COMPLETED", "SYNC_FAILED",
    "INCIDENT_CREATED", "INCIDENT_ESCALATED", "INCIDENT_UPDATED", "EXCEPTION_CREATED", "EXCEPTION_RESOLVED",
    "QUEUE_UPDATED", "POLL_STATUS_CHANGED", "TURNOUT_UPDATED", "COUNTING_UPDATE_IMPORTED", "OFFICIAL_RESULT_UPDATED"
];
export const CHANNEL = "eciweb:events";
const LOG = "ops:events";            // sorted set: score = time in ms, member = event id
const eventKey = (id) => `ops:event:${id}`;
const idemKey = (k) => `ops:idem:${k}`;
const MAX_LOG = 50000;

/**
 * Builds an event. `jurisdiction` decides who may see it (state, district, constituency,
 * pollingStation); `idempotencyKey` makes a retried write harmless.
 */
export const opsEvent = ({ type, jurisdiction = {}, electionId = null, stationId = null, payload = {}, actor = null, idempotencyKey = null }) => {
    if (!EVENT_TYPES.includes(type)) throw new Error(`Unknown event type ${type}`);
    return {
        _id: crypto.randomUUID(), type, at: new Date().toISOString(), electionId, stationId,
        jurisdiction: { state: jurisdiction.state ?? null, district: jurisdiction.district ?? null, constituency: jurisdiction.constituency ?? jurisdiction.assemblyConstituency ?? null, pollingStation: jurisdiction.pollingStation ?? null },
        actor: actor ? { epic: actor.epic, role: actor.role } : null,
        idempotencyKey, payload
    };
};

/** Queues the event in a transaction (or writes it now). Returns the event so it can be published after exec. */
export const recordEvent = (event, tx = null) => {
    const target = tx ?? redis().multi();
    target.set(eventKey(event._id), JSON.stringify(event));
    target.zAdd(LOG, { score: Date.parse(event.at), value: event._id });
    if (event.idempotencyKey) target.set(idemKey(event.idempotencyKey), event._id, { EX: 7 * 86400 });
    return tx ? event : target.exec().then(() => event);
};

/** True if an event with this idempotency key was already recorded. */
export const seenIdempotencyKey = async (key) => Boolean(key && await redis().exists(idemKey(key)));

/** Publishes committed events for live screens. Failure only delays screens; the log is intact. */
export const publishEvents = async (...events) => {
    for (const e of events.flat().filter(Boolean)) {
        try { await redis().publish(CHANNEL, JSON.stringify(e)); } catch (err) { console.error("event publish failed:", err.message); }
    }
};

/** Who may see an event: someone whose assignments cover its jurisdiction. */
export const visibleTo = (assignments, event) => coversAny(assignments, {
    state: event.jurisdiction.state, district: event.jurisdiction.district,
    assemblyConstituency: event.jurisdiction.constituency, pollingStation: event.jurisdiction.pollingStation
});

/** Events since a time (ISO or ms), visible to these assignments, oldest first, at most `limit`. */
export const eventsSince = async (assignments, since, { limit = 200, types = null } = {}) => {
    const from = Number.isFinite(Number(since)) ? Number(since) : Date.parse(since || 0) || Date.now() - 3600000;
    const ids = await redis().zRangeByScore(LOG, `(${from}`, "+inf", { LIMIT: { offset: 0, count: 2000 } });
    const out = [];
    for (const id of ids) {
        const e = await jsonGet(eventKey(id));
        if (e && (!types || types.includes(e.type)) && visibleTo(assignments, e)) out.push(e);
        if (out.length >= limit) break;
    }
    return out;
};

/** Keeps the log bounded (oldest removed first). Called opportunistically. */
export const trimEventLog = async () => {
    const n = await redis().zCard(LOG);
    if (n <= MAX_LOG) return 0;
    const old = await redis().zRange(LOG, 0, n - MAX_LOG - 1);
    const tx = redis().multi();
    for (const id of old) tx.del(eventKey(id));
    tx.zRemRangeByRank(LOG, 0, n - MAX_LOG - 1);
    await tx.exec();
    return old.length;
};
