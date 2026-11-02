import api from "../api/axios";
import { db } from "./db";
import { reportOutbox } from "../components/StationDevice";

// Offline outbox. Each mark made without a connection is stored with its own idempotency key and
// sent when the device reconnects. The server answers each record (accepted, conflict, rejected,
// or retry later); a record is only removed from "pending" once the server has answered it, and
// sending it twice is harmless.

const BATCH = 200;
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

export const queueMark = async (stationId, { epic, idDocument, checks }) => {
    const record = { type: "mark", epic, idDocument, checks, actedAt: new Date().toISOString(), idempotencyKey: newKey() };
    await db.outbox.add({ idempotencyKey: record.idempotencyKey, stationId, record, status: "pending", createdAt: record.actedAt, attempts: 0, result: null });
    await refreshCounts(stationId);
    return record;
};

export const outboxItems = (stationId) => db.outbox.where("stationId").equals(stationId).reverse().sortBy("id");

export const refreshCounts = async (stationId, extra = {}) => {
    const items = await db.outbox.where("stationId").equals(stationId).toArray();
    const counts = { pending: 0, accepted: 0, conflict: 0, rejected: 0 };
    for (const i of items) counts[i.status] = (counts[i.status] ?? 0) + 1;
    reportOutbox({ pendingOutbox: counts.pending, ...extra });
    return counts;
};

let running = null;
/** Sends pending records. Returns { sent, voted } or throws on a network failure (records stay pending). */
export const syncOutbox = (stationId, headers, packageVersion) => {
    if (running) return running;
    running = (async () => {
        let sent = 0; let voted = null;
        try {
            for (;;) {
                const pending = (await db.outbox.where({ stationId, status: "pending" }).sortBy("id")).slice(0, BATCH);
                if (!pending.length) break;
                await db.outbox.bulkUpdate(pending.map((p) => ({ key: p.id, changes: { attempts: p.attempts + 1 } })));
                const { data } = await api.post("/poll-day/sync", { events: pending.map((p) => p.record), packageVersion }, { headers });
                const byKey = new Map(data.data.results.map((r) => [r.idempotencyKey, r]));
                let progressed = 0;
                await db.transaction("rw", db.outbox, async () => {
                    for (const p of pending) {
                        const r = byKey.get(p.idempotencyKey);
                        if (!r || r.status === "retry") continue;
                        progressed += 1;
                        await db.outbox.update(p.id, { status: r.status === "duplicate" ? "accepted" : r.status, result: r });
                    }
                });
                sent += progressed; voted = data.data.voted;
                if (!progressed) break; // the server asked to retry everything: try again on the next round
            }
            await refreshCounts(stationId, { lastSyncAt: new Date().toISOString(), lastSyncError: null });
            return { sent, voted };
        } catch (err) {
            await refreshCounts(stationId, { lastSyncError: err.response ? (err.response.data?.message ?? `HTTP ${err.response.status}`) : "No connection" });
            throw err;
        } finally { running = null; }
    })();
    return running;
};

/** Clears answered records older than the poll (kept until then so the officer can review them). */
export const clearAnswered = (stationId) => db.outbox.where("stationId").equals(stationId).and((i) => i.status === "accepted").delete();
