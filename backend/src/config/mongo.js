import { MongoClient } from "mongodb";
import { DOC_STORE_INDEXES } from "./docStores.js";

// MongoDB has two jobs (see docs/DATA_STORES.md):
//  1. Read models and archives copied from Redis by the projector (services/projector.service.js):
//     station geography, the electoral roll, nominations, case records, the full operational-event
//     history and the audit archive with its integrity checkpoints. Rebuilt with `npm run mongo:sync`.
//  2. The system of record for document and registry data that needs no multi-key Redis
//     transaction: the reference library, election planning, EVM inventory, grievances, seizures,
//     party filings, service-voter postal ballots, index cards, roll-quality flags, field surveys
//     and observer profiles (config/docStores.js).
// Redis stays the system of record for every transactional workflow, sessions, OTPs, locks,
// poll-day counters and live operations.
//
// MongoDB is optional: with MONGODB_URI unset, read models fall back to slower queries over Redis
// (`source: "redis"`) and the document stores keep their records in Redis keys.

let client;
let db;
let connecting;

export const mongoConfigured = () => Boolean(process.env.MONGODB_URI);
export const mongoReady = () => Boolean(db);

/** The collections and their indexes. Created on connect; creating an existing index is a no-op. */
export const COLLECTIONS = {
    polling_stations: [
        [{ geo: "2dsphere" }, { name: "geo_2dsphere" }],
        [{ state: 1, district: 1, constituency: 1, partNumber: 1 }, { name: "area" }],
        [{ status: 1 }, { name: "status" }],
        [{ name: "text", address: "text" }, { name: "name_address_text", default_language: "none" }]
    ],
    operational_events: [
        [{ at: -1 }, { name: "at" }],
        [{ type: 1, at: -1 }, { name: "type_at" }],
        [{ "jurisdiction.state": 1, "jurisdiction.district": 1, "jurisdiction.constituency": 1, at: -1 }, { name: "jurisdiction_at" }],
        [{ stationId: 1, at: -1 }, { name: "station_at" }],
        [{ electionId: 1, at: -1 }, { name: "election_at" }]
    ],
    audit_archive: [
        [{ seq: 1 }, { name: "seq", unique: true, partialFilterExpression: { seq: { $type: "number" } } }],
        [{ at: -1 }, { name: "at" }],
        [{ action: 1, at: -1 }, { name: "action_at" }],
        [{ "actor.epic": 1, at: -1 }, { name: "actor_at" }],
        [{ "resource.type": 1, "resource.id": 1 }, { name: "resource" }]
    ],
    audit_checkpoints: [
        [{ count: 1 }, { name: "count", unique: true }]
    ],

    // Read models copied from Redis by the projector (Redis stays authoritative for these).
    electors: [
        [{ state: 1, district: 1, assemblyConstituency: 1, partNumber: 1, serialNumber: 1 }, { name: "part" }],
        [{ nameKey: 1, relativeNameKey: 1, dateOfBirth: 1 }, { name: "demographic", sparse: true }],
        [{ photoHash: 1 }, { name: "photo", sparse: true }],
        [{ isActive: 1 }, { name: "active" }],
        [{ name: "text", relativeName: "text" }, { name: "name_text", default_language: "none" }]
    ],
    nominations: [
        [{ electionId: 1, state: 1, constituency: 1, status: 1 }, { name: "election_area_status" }]
    ],
    case_records: [
        [{ _kind: 1, createdAt: -1 }, { name: "kind_created" }],
        [{ _kind: 1, "jurisdiction.state": 1, "jurisdiction.district": 1, "jurisdiction.constituency": 1 }, { name: "kind_area" }],
        [{ _kind: 1, status: 1 }, { name: "kind_status" }]
    ],

    // Collections where MongoDB is the system of record (services/docStore.service.js). Redis holds
    // only their locks and hot counters. Without MONGODB_URI they fall back to Redis keys.
    ...Object.fromEntries(Object.entries(DOC_STORE_INDEXES).map(([name, idx]) => [name, idx]))
};

const ensureIndexes = async (database) => {
    for (const [name, indexes] of Object.entries(COLLECTIONS)) {
        const col = database.collection(name);
        for (const [keys, options] of indexes) {
            try { await col.createIndex(keys, options); }
            catch (err) {
                // An index whose definition changed between versions: replace it.
                if (![85, 86].includes(err?.code)) throw err;
                const existing = (await col.indexes()).find((i) => i.name === options.name || (keys && JSON.stringify(i.key) === JSON.stringify(keys)) || (i.key?._fts && Object.values(keys).includes("text")));
                if (existing) await col.dropIndex(existing.name);
                await col.createIndex(keys, options);
            }
        }
    }
};

/** Connects once (if configured). Returns the database, or null when MongoDB is not configured. */
export const connectMongo = async () => {
    if (!mongoConfigured()) return null;
    if (db) return db;
    if (!connecting) {
        connecting = (async () => {
            const c = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, appName: "eciweb" });
            await c.connect();
            const database = c.db(process.env.MONGODB_DB || undefined);
            await ensureIndexes(database);
            client = c; db = database;
            console.log(`MongoDB connected (${database.databaseName}).`);
            return database;
        })().catch((err) => { connecting = null; throw err; });
    }
    return connecting;
};

/** The database handle; throws if MongoDB is not connected. */
export const mongo = () => {
    if (!db) throw new Error("MongoDB is not connected.");
    return db;
};

export const closeMongo = async () => {
    const c = client;
    client = undefined; db = undefined; connecting = null;
    if (c) await c.close();
};

/** For the health endpoint. */
export const mongoStatus = async () => {
    if (!mongoConfigured()) return "not configured";
    if (!db) return "disconnected";
    try { await db.command({ ping: 1 }); return "ok"; } catch { return "error"; }
};
