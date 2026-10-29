import { jsonGet, jsonSet, redis, scanKeys } from "../config/redis.js";

const key = (epic) => `elector:${String(epic).trim().toUpperCase()}`;

export const getElectorByEpic = async (epic) => jsonGet(key(epic));

export const saveElector = async (elector, tx = null) => {
    if (tx) {
        tx.set(key(elector.epic), JSON.stringify(elector));
        tx.sAdd("electors:all", elector.epic);
        return elector;
    }
    await jsonSet(key(elector.epic), elector);
    await redis().sAdd("electors:all", elector.epic);
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
