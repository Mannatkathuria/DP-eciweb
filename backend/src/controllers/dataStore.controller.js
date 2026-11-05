// Where every kind of data lives, and whether the MongoDB copies match Redis.
//
// Redis (system of record for transactional work): accounts, sessions, OTPs, assignments, the
// electoral roll, applications, stations, elections, nominations, poll day, counting, results,
// case workflows, the audit trail and live operations.
// MongoDB, as read models copied from Redis by the projector: stations (geo), electors, nominations,
// case records, the operational-event history, the audit archive and its hash-chain checkpoints.
// MongoDB, as the system of record: the reference library, ePlan, EVMs, grievances, seizures, party
// filings, ETPB ballots, index cards, roll-quality flags, field surveys, the BLO register, EPIC
// deliveries and observer profiles.
import { mongo, mongoConfigured, mongoStatus } from "../config/mongo.js";
import { redis } from "../config/redis.js";
import { DOC_STORES } from "../config/docStores.js";
import { docStore, docStoreBackend } from "../services/docStore.service.js";
import { caseKinds, drainProjector, projectorBacklog, rebuildReadModels } from "../services/projector.service.js";
import { auditChange } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const REDIS_ONLY = [
    ["Accounts", "users:all", "user:*"], ["Role assignments", "assignments:all", "assignment:*"], ["Elections", "elections:all", "election:*"],
    ["Form 6 registrations", "registrations:all", "registration:*"], ["Form 8 change requests", "change_requests:all", "change_request:*"], ["Form 7 objections", "objections:all", "objection:*"]
];
const PROJECTED = [
    { label: "Polling stations", set: "stations:all", collection: "polling_stations" },
    { label: "Electoral roll (electors)", set: "electors:all", collection: "electors" },
    { label: "Nominations", set: "nominations:all", collection: "nominations" }
];

const count = async (col, filter = {}) => (mongoConfigured() ? mongo().collection(col).countDocuments(filter) : null);

export const dataStoreStatus = asyncHandler(async (req, res) => {
    const mongoState = await mongoStatus();
    const r = redis();
    if (mongoConfigured() && mongoState === "ok") await drainProjector();
    const redisOnly = [];
    for (const [label, set] of REDIS_ONLY) redisOnly.push({ label, redis: await r.sCard(set) });
    const hot = { "Audit events": await r.lLen("audit:events"), "Live operational events (latest 50 000)": await r.zCard("ops:events"), "Flying squads reporting position": await r.sCard("squad:locations") };
    const ok = mongoState === "ok";
    const projected = [];
    for (const p of PROJECTED) projected.push({ ...p, redis: await r.sCard(p.set), mongodb: ok ? await count(p.collection) : null });
    for (const kind of [...caseKinds].sort()) projected.push({ label: `Case records: ${kind}`, set: `${kind}:all`, collection: "case_records", kind, redis: await r.sCard(`${kind}:all`), mongodb: ok ? await count("case_records", { _kind: kind }) : null });
    for (const p of projected) p.inSync = p.mongodb === null ? null : p.mongodb === p.redis;
    const archives = ok ? { operational_events: await count("operational_events"), audit_archive: await count("audit_archive"), audit_checkpoints: await count("audit_checkpoints") } : null;
    const documents = [];
    for (const name of DOC_STORES) documents.push({ collection: name, store: docStoreBackend(), count: await docStore(name).count().catch(() => null) });
    res.json({ success: true, data: { mongodb: mongoState, documentStore: docStoreBackend(), backlog: await projectorBacklog(), redisOnly, hot, projected, archives, documents,
        note: mongoConfigured() ? "Read models are copied from Redis within seconds of each change; document collections are written to MongoDB directly."
            : "MONGODB_URI is not set: read models are answered from Redis and document collections are kept in Redis keys (mdoc:*)." } });
});

export const syncNow = asyncHandler(async (req, res) => {
    if (!mongoConfigured()) throw new ApiError(409, "MongoDB is not configured.");
    const result = req.body?.rebuild === true ? await rebuildReadModels() : await drainProjector();
    await auditChange(req, req.body?.rebuild ? "datastore.rebuilt" : "datastore.synced", { type: "datastore", id: "mongodb" }, {}, { after: result });
    res.json({ success: true, message: req.body?.rebuild ? "Read models rebuilt from Redis." : "Pending changes copied to MongoDB.", data: result });
});
