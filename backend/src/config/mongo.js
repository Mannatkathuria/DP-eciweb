import { MongoClient } from "mongodb";

// MongoDB holds the large, indexed read models and long-term archives (station geography, the
// full operational-event history, the audit archive and its integrity checkpoints). Redis stays
// the system of record for every transactional workflow. MongoDB is fed from Redis by the
// projector (services/projector.service.js) and can be rebuilt at any time with
// `npm run mongo:sync`, so losing it loses no authoritative data.
//
// MongoDB is optional: with MONGODB_URI unset, features that use it fall back to slower in-memory
// queries over Redis and say so in their responses (`source: "redis"`).

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
    ]
};

const ensureIndexes = async (database) => {
    for (const [name, indexes] of Object.entries(COLLECTIONS)) {
        const col = database.collection(name);
        for (const [keys, options] of indexes) await col.createIndex(keys, options);
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
