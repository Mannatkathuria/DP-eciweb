import { jsonGet, redis } from "../config/redis.js";

// Published electoral-roll versions. A version is an immutable snapshot of one constituency's
// roll at the moment the ERO published it, with a content hash, so later corrections never
// rewrite what was published.
const key = (id) => `rollversion:${id}`;
const listKey = (areaKey) => `rollversions:${areaKey}`;

export const rollAreaKey = ({ state, constituency }) =>
    `${String(state).trim().toLowerCase()}|${String(constituency).trim().toLowerCase()}`;

export const getRollVersion = (id) => jsonGet(key(id));
export const saveRollVersion = (version, tx) => {
    tx.set(key(version._id), JSON.stringify(version));
    tx.rPush(listKey(version.areaKey), version._id);
};
export const listRollVersions = async (areaKey) =>
    (await Promise.all((await redis().lRange(listKey(areaKey), 0, -1)).map(getRollVersion))).filter(Boolean);
