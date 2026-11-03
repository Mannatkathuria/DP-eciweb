import { mongo, mongoConfigured } from "../config/mongo.js";
import { jsonGet, redis } from "../config/redis.js";
import { listStations } from "../repositories/election.repository.js";
import { coversAny } from "./authority.service.js";
import { drainProjector } from "./projector.service.js";

// Queries over the MongoDB read models, each with a Redis fallback that gives the same answer
// (more slowly) when MongoDB is not configured or unreachable. Every result says which store
// answered (`source`). Jurisdiction checks always reuse `coversAny`, the same rule the rest of the
// backend enforces: MongoDB only narrows the candidates.

const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (v) => new RegExp(`^${escape(String(v).trim())}$`, "i");
const norm = (v) => String(v ?? "").trim().toLowerCase();
const EARTH_KM = 6371.0088;

export const distanceKm = (a, b) => {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
};

/** Runs the MongoDB query, or the fallback if MongoDB is not configured or fails. */
const withFallback = async (label, viaMongo, viaRedis) => {
    if (mongoConfigured()) {
        try {
            const drained = await drainProjector(); // read-your-writes: copy anything just committed
            if (!drained?.error) return { ...(await viaMongo()), source: "mongodb" };
        } catch (err) {
            console.error(`${label}: MongoDB query failed, using Redis:`, err.message);
        }
    }
    return { ...(await viaRedis()), source: "redis" };
};

/** Approved stations nearest to a point, within `radiusKm`, nearest first. */
export const nearbyStations = ({ lat, lng, radiusKm = 5, limit = 10 }) => withFallback("Nearby stations",
    async () => {
        const items = await mongo().collection("polling_stations").aggregate([
            { $geoNear: { near: { type: "Point", coordinates: [lng, lat] }, key: "geo", distanceField: "distanceMeters",
                maxDistance: radiusKm * 1000, spherical: true, query: { status: "ACTIVE" } } },
            { $limit: limit }
        ]).toArray();
        return { items: items.map(({ distanceMeters, geo, projectedAt, partNumberInt, ...s }) => ({ ...s, distanceKm: +(distanceMeters / 1000).toFixed(3) })) }; // eslint-disable-line no-unused-vars
    },
    async () => {
        const items = (await listStations())
            .filter((s) => s.status === "ACTIVE" && s.location)
            .map((s) => ({ ...s, distanceKm: +distanceKm({ lat, lng }, s.location).toFixed(3) }))
            .filter((s) => s.distanceKm <= radiusKm)
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, limit);
        return { items };
    });

/** Approved stations in a State (optionally district/constituency), optionally matching words in name or address. */
export const searchStations = ({ state, district, constituency, q, limit = 200 }) => withFallback("Station search",
    async () => {
        const filter = { status: "ACTIVE", state: exact(state) };
        if (district) filter.district = exact(district);
        if (constituency) filter.constituency = exact(constituency);
        const words = String(q ?? "").trim();
        if (words) filter.$text = { $search: words };
        const items = await mongo().collection("polling_stations")
            .find(filter, { projection: { geo: 0, projectedAt: 0, partNumberInt: 0, ...(words ? { score: { $meta: "textScore" } } : {}) } })
            .sort(words ? { score: { $meta: "textScore" } } : { constituency: 1, partNumberInt: 1 })
            .limit(limit).toArray();
        return { items: items.map(({ score, ...s }) => s) }; // eslint-disable-line no-unused-vars
    },
    async () => {
        const words = norm(q).split(/\s+/).filter(Boolean);
        const items = (await listStations())
            .filter((s) => s.status === "ACTIVE" && norm(s.state) === norm(state) && (!district || norm(s.district) === norm(district)) && (!constituency || norm(s.constituency) === norm(constituency)))
            .filter((s) => !words.length || words.some((w) => norm(`${s.name} ${s.address}`).includes(w)))
            .sort((a, b) => a.constituency.localeCompare(b.constituency) || Number(a.partNumber) - Number(b.partNumber))
            .slice(0, limit);
        return { items };
    });

/** A coarse MongoDB pre-filter from assignments: the States they cover (none for national roles). */
const stateFilter = (assignments, field) => {
    if (assignments.some((a) => a.nationwide)) return {};
    const states = [...new Set(assignments.map((a) => a.jurisdiction?.state).filter(Boolean))];
    return states.length ? { [field]: { $in: states.map(exact) } } : { _id: { $exists: false } };
};

const PAGE_SCAN = 2000;

/**
 * Operational-event history, newest first, filtered by type, station, election and time, limited to
 * the caller's jurisdiction. `before` (ISO time) pages backwards.
 */
export const eventHistory = (assignments, { types, stationId, electionId, from, to, before, limit = 50 }) => {
    const visible = (e) => coversAny(assignments, { state: e.jurisdiction?.state, district: e.jurisdiction?.district,
        assemblyConstituency: e.jurisdiction?.constituency, pollingStation: e.jurisdiction?.pollingStation });
    const upper = Math.min(...[to, before].filter(Boolean).map((t) => Date.parse(t)).filter(Number.isFinite), Infinity);
    const lower = from ? Date.parse(from) : -Infinity;
    const matches = (e) => (!types || types.includes(e.type)) && (!stationId || e.stationId === stationId) && (!electionId || e.electionId === electionId);
    return withFallback("Event history",
        async () => {
            const filter = { ...stateFilter(assignments, "jurisdiction.state") };
            if (types) filter.type = { $in: types };
            if (stationId) filter.stationId = stationId;
            if (electionId) filter.electionId = electionId;
            const at = {};
            if (Number.isFinite(lower)) at.$gte = new Date(lower);
            if (Number.isFinite(upper)) at[before ? "$lt" : "$lte"] = new Date(upper);
            if (Object.keys(at).length) filter.at = at;
            const items = [];
            const cursor = mongo().collection("operational_events").find(filter, { projection: { projectedAt: 0 } }).sort({ at: -1, _id: -1 }).limit(PAGE_SCAN);
            for await (const doc of cursor) {
                const e = { ...doc, at: doc.at.toISOString() };
                if (visible(e)) items.push(e);
                if (items.length >= limit) break;
            }
            const total = await mongo().collection("operational_events").countDocuments(filter);
            return { items, matchedBeforeJurisdiction: total, next: items.length === limit ? items.at(-1).at : null };
        },
        async () => {
            const max = Number.isFinite(upper) ? (before ? `(${upper}` : upper) : "+inf";
            const min = Number.isFinite(lower) ? lower : "-inf";
            const ids = await redis().zRange("ops:events", max, min, { BY: "SCORE", REV: true, LIMIT: { offset: 0, count: PAGE_SCAN } });
            const items = [];
            for (const id of ids) {
                const e = await jsonGet(`ops:event:${id}`);
                if (e && matches(e) && visible(e)) items.push(e);
                if (items.length >= limit) break;
            }
            return { items, matchedBeforeJurisdiction: null, next: items.length === limit ? items.at(-1).at : null };
        });
};

/** Audit search, newest first, by action (prefix), actor EPIC, resource and time, within jurisdiction. */
export const auditSearch = (assignments, { action, actor, resourceType, resourceId, from, to, before, limit = 50 }) => {
    const visible = (e) => coversAny(assignments, { ...e.jurisdiction, assemblyConstituency: e.jurisdiction?.constituency });
    const upper = Math.min(...[to, before].filter(Boolean).map((t) => Date.parse(t)).filter(Number.isFinite), Infinity);
    const lower = from ? Date.parse(from) : -Infinity;
    const matches = (e) => (!action || String(e.action).startsWith(action)) && (!actor || e.actor?.epic === actor)
        && (!resourceType || e.resource?.type === resourceType) && (!resourceId || e.resource?.id === resourceId)
        && Date.parse(e.at) >= lower && (before ? Date.parse(e.at) < upper : Date.parse(e.at) <= upper);
    const strip = ({ archivedAt, chain, seq, ...e }) => ({ ...e, at: e.at instanceof Date ? e.at.toISOString() : e.at }); // eslint-disable-line no-unused-vars
    return withFallback("Audit search",
        async () => {
            const filter = { missing: { $ne: true } };
            if (!assignments.some((a) => a.nationwide)) Object.assign(filter, stateFilter(assignments, "jurisdiction.state"));
            if (action) filter.action = new RegExp(`^${escape(action)}`);
            if (actor) filter["actor.epic"] = actor;
            if (resourceType) filter["resource.type"] = resourceType;
            if (resourceId) filter["resource.id"] = resourceId;
            const at = {};
            if (Number.isFinite(lower)) at.$gte = new Date(lower);
            if (Number.isFinite(upper)) at[before ? "$lt" : "$lte"] = new Date(upper);
            if (Object.keys(at).length) filter.at = at;
            const items = [];
            for await (const doc of mongo().collection("audit_archive").find(filter).sort({ at: -1, seq: -1 }).limit(PAGE_SCAN)) {
                const e = strip(doc);
                if (visible(e)) items.push(e);
                if (items.length >= limit) break;
            }
            return { items, next: items.length === limit ? items.at(-1).at : null };
        },
        async () => {
            const ids = await redis().lRange("audit:events", -PAGE_SCAN, -1);
            const items = [];
            for (const id of ids.reverse()) {
                const e = await jsonGet(`audit:event:${id}`);
                if (e && matches(e) && visible(e)) items.push(e);
                if (items.length >= limit) break;
            }
            return { items, next: items.length === limit ? items.at(-1).at : null };
        });
};
