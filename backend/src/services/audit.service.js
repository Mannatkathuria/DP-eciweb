// Append-only audit trail. Every authority-bearing change (a field verification, a registration
// decision, an assignment granted or revoked) records who did it, under which role and
// assignment, what changed and when. There is deliberately no update or delete function.
//
// Storage (Redis):
//   audit:event:<id>                     the event (JSON)
//   audit:events                         every event id, oldest first (list)
//   audit:resource:<type>:<resourceId>   the ids of one record's events, oldest first (list)
//   audit:count                          number of events ever written (counter)
//
// Tamper evidence: each event carries a SHA-256 hash of its own content, and the counter is
// incremented in the same transaction. `verifyAudit` recomputes every hash and compares the
// counter with the list, so an edited, removed or injected-without-counting event shows up.
import crypto from "crypto";
import { jsonGet, redis } from "../config/redis.js";

const eventKey = (id) => `audit:event:${id}`;
const resourceKey = (type, id) => `audit:resource:${type}:${id}`;

/**
 * Builds an audit event. `jurisdiction` is the jurisdiction of the record acted on, so that
 * supervisory users only see history from their own area.
 */
export const auditEvent = ({ actor, action, resource, jurisdiction = {}, assignmentId = null, before = null, after = null, note = null }) => ({
    _id: crypto.randomUUID(),
    at: new Date().toISOString(),
    action,
    actor: actor ? { userId: actor._id, epic: actor.epic, role: actor.role, name: actor.name ?? null } : null,
    assignmentId,
    resource,                      // { type, id }
    jurisdiction,
    before, after,                 // small summaries of the changed fields, never documents or secrets
    note
});

/**
 * Appends an event. Pass the transaction that carries the change itself, so that the change and
 * its audit record are written together or not at all.
 */
/** Canonical JSON (sorted keys) so the same event always hashes the same way. */
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v ?? null);
export const hashEvent = (event) => {
    const { hash, ...content } = event; // eslint-disable-line no-unused-vars
    // Round-trip through JSON first so the hash covers exactly what is stored (undefined fields dropped).
    return crypto.createHash("sha256").update(canonical(JSON.parse(JSON.stringify(content)))).digest("hex");
};

export const recordAudit = async (event, tx = null) => {
    const target = tx ?? redis().multi();
    event.hash = hashEvent(event);
    target.set(eventKey(event._id), JSON.stringify(event));
    target.rPush("audit:events", event._id);
    target.incr("audit:count");
    if (event.resource?.type && event.resource?.id) target.rPush(resourceKey(event.resource.type, event.resource.id), event._id);
    if (!tx) await target.exec();
    return event;
};

export const historyFor = async (type, id) => {
    const ids = await redis().lRange(resourceKey(type, id), 0, -1);
    return (await Promise.all(ids.map((eventId) => jsonGet(eventKey(eventId))))).filter(Boolean);
};

/** The most recent events, newest first. */
export const recentEvents = async (limit = 100) => {
    const ids = await redis().lRange("audit:events", -limit, -1);
    return (await Promise.all(ids.reverse().map((eventId) => jsonGet(eventKey(eventId))))).filter(Boolean);
};

/**
 * Integrity check over the whole trail: every listed event exists and matches its hash, and the
 * number of listed events equals the counter. Events written before hashing existed are counted
 * as "unhashed", not as failures.
 */
export const verifyAudit = async () => {
    const ids = await redis().lRange("audit:events", 0, -1);
    const counter = Number(await redis().get("audit:count") ?? 0);
    const result = { listed: ids.length, counter, checked: 0, unhashed: 0, missing: [], altered: [] };
    for (let i = 0; i < ids.length; i += 500) {
        const batch = await Promise.all(ids.slice(i, i + 500).map(async (id) => [id, await jsonGet(eventKey(id))]));
        for (const [id, event] of batch) {
            if (!event) { result.missing.push(id); continue; }
            if (!event.hash) { result.unhashed += 1; continue; }
            result.checked += 1;
            if (hashEvent(event) !== event.hash) result.altered.push(id);
        }
    }
    const hashedListed = result.listed - result.unhashed;
    result.countMatches = counter === hashedListed;
    result.ok = result.missing.length === 0 && result.altered.length === 0 && result.countMatches;
    return result;
};
