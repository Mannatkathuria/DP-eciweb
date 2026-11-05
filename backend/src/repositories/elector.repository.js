import { jsonGet, redis, scanKeys } from "../config/redis.js";
import { queueDoc } from "../services/projector.service.js";

const key = (epic) => `elector:${String(epic).trim().toUpperCase()}`;

export const getElectorByEpic = async (epic) => jsonGet(key(epic));

// Every save is queued, in the same transaction, for the MongoDB `electors` read model (roll
// search, photo/demographic similarity scans and roll statistics).
export const saveElector = async (elector, tx = null) => {
    const own = !tx;
    const t = tx ?? redis().multi();
    t.set(key(elector.epic), JSON.stringify(elector));
    t.sAdd("electors:all", elector.epic);
    queueDoc("electors", key(elector.epic), t);
    if (own) await t.exec();
    return elector;
};

export const updateElector = async (epic, patch) => {
    const existing = await getElectorByEpic(epic);
    if (!existing) return null;
    return saveElector({ ...existing, ...patch, updatedAt: new Date().toISOString() });
};

export const findElector = async ({ method, epic, name, state, district, assemblyConstituency }) => {
    if (method === "epic") return getElectorByEpic(epic);
    if (method !== "details") return null;

    const keys = await scanKeys("elector:*");
    for (const k of keys) {
        const e = await jsonGet(k);
        if (!e?.isActive) continue;
        if (e.name?.trim().toLowerCase() !== name?.trim().toLowerCase()) continue;
        if (e.state?.trim().toLowerCase() !== state?.trim().toLowerCase()) continue;
        if (district && e.district?.trim().toLowerCase() !== district.trim().toLowerCase()) continue;
        if (assemblyConstituency &&
            e.assemblyConstituency?.trim().toLowerCase() !== assemblyConstituency.trim().toLowerCase()) continue;
        return e;
    }
    return null;
};

export const listElectors = async () => {
    const epics = await redis().sMembers("electors:all");
    const values = await Promise.all(epics.map(getElectorByEpic));
    return values.filter(Boolean);
};

// Serial numbers within a part of the roll. A new elector, or one who shifts into the part, gets
// the next number; numbers are never reused in the part, as on a printed roll's supplements.
const serialKey = ({ state, assemblyConstituency, partNumber }) =>
    `part-serial:${String(state).toLowerCase()}:${String(assemblyConstituency).toLowerCase()}:${partNumber}`;
export const nextSerialNumber = async (record) => {
    const k = serialKey(record);
    if (!(await redis().exists(k))) {
        const highest = (await listElectors())
            .filter((e) => e.state === record.state && e.assemblyConstituency === record.assemblyConstituency && String(e.partNumber) === String(record.partNumber))
            .reduce((m, e) => Math.max(m, Number(e.serialNumber) || 0), 0);
        await redis().set(k, String(highest), { NX: true });
    }
    return Number(await redis().incr(k));
};
