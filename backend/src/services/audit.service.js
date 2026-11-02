// Append-only audit trail. Every authority-bearing change (a field verification, a registration
// decision, an assignment granted or revoked) records who did it, under which role and
// assignment, what changed and when. There is deliberately no update or delete function.
//
// Storage (Redis):
//   audit:event:<id>                     the event (JSON)
//   audit:events                         every event id, oldest first (list)
//   audit:resource:<type>:<resourceId>   the ids of one record's events, oldest first (list)
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
export const recordAudit = async (event, tx = null) => {
    const target = tx ?? redis().multi();
    target.set(eventKey(event._id), JSON.stringify(event));
    target.rPush("audit:events", event._id);
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
