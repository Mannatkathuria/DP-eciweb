import { jsonGet, redis } from "../config/redis.js";

// Approved data sources, the history of imports from them, and the prospective electors they
// produced. A prospective elector is NOT an elector: it is a lead for a BLO, kept apart from the
// electoral roll and holding only the minimum data needed to help the person apply.

const sourceKey = (id) => `datasource:${id}`;
const runKey = (id) => `ingestion:run:${id}`;
const prospectKey = (id) => `prospect:${id}`;
const prospectRefKey = (sourceId, ref) => `prospect:ref:${sourceId}:${ref}`;

const save = (tx, key, set, value) => {
    tx.set(key, JSON.stringify(value));
    tx.sAdd(set, value._id);
};
const listFrom = async (set, get) => (await Promise.all((await redis().sMembers(set)).map(get))).filter(Boolean);

export const getDataSource = (id) => jsonGet(sourceKey(id));
export const saveDataSource = (source, tx) => save(tx, sourceKey(source._id), "datasources:all", source);
export const listDataSources = () => listFrom("datasources:all", getDataSource);

export const getIngestionRun = (id) => jsonGet(runKey(id));
export const saveIngestionRun = (run, tx) => save(tx, runKey(run._id), "ingestion:runs", run);
export const listIngestionRuns = () => listFrom("ingestion:runs", getIngestionRun);

export const getProspect = (id) => jsonGet(prospectKey(id));
export const saveProspect = (prospect, tx) => {
    save(tx, prospectKey(prospect._id), "prospects:all", prospect);
    tx.set(prospectRefKey(prospect.source.providerId, prospect.source.sourceReference), prospect._id);
};
export const prospectIdForReference = (sourceId, ref) => redis().get(prospectRefKey(sourceId, ref));
export const listProspects = () => listFrom("prospects:all", getProspect);
