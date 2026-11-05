// A store for one MongoDB collection that is the system of record for its documents.
//
// With MONGODB_URI set, documents live only in MongoDB; if MongoDB is configured but unreachable,
// reads and writes fail with 503 rather than silently writing somewhere else (which would split
// the data). With MONGODB_URI unset (local development, tests), the same documents are kept in
// Redis under `mdoc:<collection>:<id>` and queried in memory, with the same results.
//
// Locks (`withLock`) always use Redis, which coordinates every instance of the server.
import { acquireLock, jsonGet, redis } from "../config/redis.js";
import { connectMongo, mongo, mongoConfigured } from "../config/mongo.js";
import { DOC_STORE_INDEXES } from "../config/docStores.js";
import { ApiError } from "../utils/ApiErrors.js";

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const cmp = (a, b) => (a === b ? 0 : a === undefined || a === null ? -1 : b === undefined || b === null ? 1 : a < b ? -1 : 1);

/** Does a document match a (small) MongoDB-style filter? Supports equality, $in, $ne, $gte, $lte, $lt, $gt, $exists, $regex, $or. */
export const matches = (doc, filter = {}) => Object.entries(filter).every(([k, cond]) => {
    if (k === "$or") return cond.some((f) => matches(doc, f));
    const v = get(doc, k);
    if (cond instanceof RegExp) return cond.test(String(v ?? ""));
    if (cond && typeof cond === "object" && !Array.isArray(cond) && Object.keys(cond).some((x) => x.startsWith("$"))) {
        return Object.entries(cond).every(([op, x]) => {
            switch (op) {
                case "$in": return Array.isArray(v) ? v.some((y) => x.includes(y)) : x.includes(v);
                case "$nin": return !x.includes(v);
                case "$ne": return v !== x;
                case "$gte": return v !== undefined && v !== null && v >= x;
                case "$lte": return v !== undefined && v !== null && v <= x;
                case "$gt": return v !== undefined && v !== null && v > x;
                case "$lt": return v !== undefined && v !== null && v < x;
                case "$exists": return (v !== undefined) === Boolean(x);
                case "$regex": return new RegExp(x, cond.$options ?? "").test(String(v ?? ""));
                case "$options": return true;
                default: throw new Error(`Unsupported filter operator ${op}`);
            }
        });
    }
    return Array.isArray(v) && !Array.isArray(cond) ? v.includes(cond) : v === cond;
});

const sortDocs = (docs, sort) => {
    const keys = Object.entries(sort ?? {});
    return keys.length ? docs.sort((a, b) => { for (const [k, dir] of keys) { const c = cmp(get(a, k), get(b, k)); if (c) return c * dir; } return 0; }) : docs;
};

const textMatch = (doc, q, fields) => {
    const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    const hay = fields.map((f) => { const v = get(doc, f); return Array.isArray(v) ? v.join(" ") : String(v ?? ""); }).join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
};

/** Which store holds a document collection right now ("mongodb" or "redis"). */
export const docStoreBackend = () => (mongoConfigured() ? "mongodb" : "redis");

const mongoDb = async () => {
    try { await connectMongo(); return mongo(); }
    catch (err) { console.error("MongoDB unavailable:", err.message); throw new ApiError(503, "The document database (MongoDB) is not reachable. Try again shortly."); }
};

export const docStore = (collection, { textFields = [] } = {}) => {
    if (!DOC_STORE_INDEXES[collection]) throw new Error(`Unknown document store ${collection}`);
    const rkey = (id) => `mdoc:${collection}:${id}`;
    const rset = `mdoc:${collection}:all`;
    // Unique indexes are enforced in the Redis fallback too, with one claim key per unique value.
    const uniques = DOC_STORE_INDEXES[collection].filter(([, o]) => o.unique).map(([keys, o]) => ({ name: o.name, fields: Object.keys(keys) }));
    const uKey = (u, doc) => { const vals = u.fields.map((f) => get(doc, f)); return vals.some((v) => v === undefined || v === null) ? null : `mdoc:${collection}:u:${u.name}:${vals.map(String).join("|")}`; };
    const claim = async (doc, previous = null) => {
        const taken = [];
        for (const u of uniques) {
            const k = uKey(u, doc);
            if (!k || (previous && uKey(u, previous) === k)) continue;
            const owner = await redis().get(k);
            if (owner && owner !== String(doc._id)) { for (const t of taken) await redis().del(t); return false; }
            if (!owner) { if (!(await redis().set(k, String(doc._id), { NX: true }))) { for (const t of taken) await redis().del(t); return false; } taken.push(k); }
        }
        if (previous) for (const u of uniques) { const old = uKey(u, previous); if (old && old !== uKey(u, doc)) await redis().del(old); }
        return true;
    };
    const redisAll = async () => (await Promise.all((await redis().sMembers(rset)).map((id) => jsonGet(rkey(id))))).filter(Boolean);

    const api = {
        collection,
        backend: docStoreBackend,
        async get(id) {
            if (!id) return null;
            if (mongoConfigured()) return (await mongoDb()).collection(collection).findOne({ _id: String(id) });
            return jsonGet(rkey(String(id)));
        },
        async findOne(filter) {
            if (mongoConfigured()) return (await mongoDb()).collection(collection).findOne(filter);
            return (await redisAll()).find((d) => matches(d, filter)) ?? null;
        },
        /** Inserts a new document. A duplicate unique key gives 409 with `duplicateMessage`. */
        async insert(doc, duplicateMessage = "This record already exists.") {
            if (mongoConfigured()) {
                try { await (await mongoDb()).collection(collection).insertOne(doc); }
                catch (err) { if (err?.code === 11000) throw new ApiError(409, duplicateMessage); throw err; }
                return doc;
            }
            if (await redis().exists(rkey(doc._id))) throw new ApiError(409, duplicateMessage);
            if (!(await claim(doc))) throw new ApiError(409, duplicateMessage);
            if (!(await redis().set(rkey(doc._id), JSON.stringify(doc), { NX: true }))) throw new ApiError(409, duplicateMessage);
            await redis().sAdd(rset, doc._id);
            return doc;
        },
        async insertMany(docs) {
            if (!docs.length) return 0;
            if (mongoConfigured()) { await (await mongoDb()).collection(collection).insertMany(docs, { ordered: false }).catch((err) => { if (err?.code !== 11000) throw err; }); return docs.length; }
            let n = 0;
            const tx = redis().multi();
            for (const d of docs) { if (!(await claim(d))) continue; tx.set(rkey(d._id), JSON.stringify(d), { NX: true }); tx.sAdd(rset, d._id); n += 1; }
            await tx.exec();
            return n;
        },
        /** Replaces a document (upsert). */
        async put(doc) {
            if (mongoConfigured()) await (await mongoDb()).collection(collection).replaceOne({ _id: doc._id }, doc, { upsert: true });
            else {
                const previous = await jsonGet(rkey(doc._id));
                if (!(await claim(doc, previous))) throw new ApiError(409, "This record conflicts with an existing one.");
                await redis().multi().set(rkey(doc._id), JSON.stringify(doc)).sAdd(rset, doc._id).exec();
            }
            return doc;
        },
        async remove(id) {
            if (mongoConfigured()) await (await mongoDb()).collection(collection).deleteOne({ _id: String(id) });
            else {
                const previous = await jsonGet(rkey(id));
                const tx = redis().multi().del(rkey(id)).sRem(rset, String(id));
                if (previous) for (const u of uniques) { const k = uKey(u, previous); if (k) tx.del(k); }
                await tx.exec();
            }
        },
        /** Documents matching `filter`, optionally words `q` in the text fields, sorted and limited. */
        async find(filter = {}, { sort = null, limit = 0, q = null, skip = 0 } = {}) {
            if (mongoConfigured()) {
                const f = { ...filter };
                if (q && textFields.length) f.$text = { $search: String(q) };
                let cur = (await mongoDb()).collection(collection).find(f);
                if (sort) cur = cur.sort(sort);
                if (skip) cur = cur.skip(skip);
                if (limit) cur = cur.limit(limit);
                return cur.toArray();
            }
            let docs = (await redisAll()).filter((d) => matches(d, filter) && (!q || !textFields.length || textMatch(d, q, textFields)));
            docs = sortDocs(docs, sort);
            return limit ? docs.slice(skip, skip + limit) : docs.slice(skip);
        },
        async count(filter = {}) {
            if (mongoConfigured()) return (await mongoDb()).collection(collection).countDocuments(filter);
            return (await redisAll()).filter((d) => matches(d, filter)).length;
        },
        /** Counts by the value of `field` among documents matching `filter`. */
        async countBy(field, filter = {}) {
            if (mongoConfigured()) {
                const rows = await (await mongoDb()).collection(collection).aggregate([{ $match: filter }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]).toArray();
                return Object.fromEntries(rows.map((r) => [r._id ?? "unknown", r.n]));
            }
            return (await redisAll()).filter((d) => matches(d, filter)).reduce((acc, d) => { const k = get(d, field) ?? "unknown"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
        },
        async withLock(id, fn) {
            const release = await acquireLock(`mdoc:${collection}:lock:${id}`, 15);
            if (!release) throw new ApiError(409, "This record is being updated. Try again in a moment.");
            try { return await fn(); } finally { await release(); }
        }
    };
    return api;
};

/** Document counts per store, for the data-stores status screen. */
export const docStoreCounts = async () => {
    const out = {};
    for (const name of Object.keys(DOC_STORE_INDEXES)) out[name] = await docStore(name).count().catch(() => null);
    return out;
};
