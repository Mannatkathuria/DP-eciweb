import { acquireLock, jsonGet, redis } from "../config/redis.js";

// Poll-day records for one election at one polling station: the station's poll state (mock poll,
// open, closed, queue reports), the register of electors who voted (in the spirit of Form 17A:
// serial, EPIC, identity document type, time, officer) and exception cases.
const k = (electionId, stationId) => `${electionId}:${stationId}`;

export const getPollState = (electionId, stationId) => jsonGet(`poll:state:${k(electionId, stationId)}`);
export const savePollState = (state, tx) => {
    tx.set(`poll:state:${k(state.electionId, state.stationId)}`, JSON.stringify(state));
    tx.sAdd(`poll:states:${state.electionId}`, state.stationId);
};
export const listPollStationIds = (electionId) => redis().sMembers(`poll:states:${electionId}`);

export const registerLength = (electionId, stationId) => redis().lLen(`poll:register:${k(electionId, stationId)}`);
export const listRegister = async (electionId, stationId) =>
    (await redis().lRange(`poll:register:${k(electionId, stationId)}`, 0, -1)).map((s) => JSON.parse(s));
export const appendRegister = (entry, tx) => {
    tx.rPush(`poll:register:${k(entry.electionId, entry.stationId)}`, JSON.stringify(entry));
    tx.hSet(`poll:voted:${entry.electionId}`, entry.epic, entry.stationId);
};
export const votedAt = (electionId, epic) => redis().hGet(`poll:voted:${electionId}`, epic);

export const getPollCase = (id) => jsonGet(`poll:case:${id}`);
export const savePollCase = (c, tx) => {
    tx.set(`poll:case:${c._id}`, JSON.stringify(c));
    tx.sAdd(`poll:cases:${k(c.electionId, c.stationId)}`, c._id);
};
export const listPollCases = async (electionId, stationId) =>
    (await Promise.all((await redis().sMembers(`poll:cases:${k(electionId, stationId)}`)).map(getPollCase))).filter(Boolean);

/** Station-wide lock, retried briefly: marking voters at one station is a single queue. */
export const withStationLock = async (electionId, stationId, fn) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const release = await acquireLock(`poll:lock:${k(electionId, stationId)}`, 10);
        if (release) {
            try { return await fn(); } finally { await release(); }
        }
        await new Promise((r) => setTimeout(r, 25));
    }
    return null;
};

// Incidents reported during the poll, and sector officers' station visits.
export const getIncident = (id) => jsonGet(`incident:${id}`);
export const saveIncident = (i, tx) => {
    tx.set(`incident:${i._id}`, JSON.stringify(i));
    tx.sAdd(`incidents:${i.electionId}`, i._id);
};
export const listIncidents = async (electionId) =>
    (await Promise.all((await redis().sMembers(`incidents:${electionId}`)).map(getIncident))).filter(Boolean);
export const addVisit = (visit, tx) => tx.rPush(`poll:visits:${visit.electionId}:${visit.stationId}`, JSON.stringify(visit));
export const listVisits = async (electionId, stationId) =>
    (await redis().lRange(`poll:visits:${electionId}:${stationId}`, 0, -1)).map((s) => JSON.parse(s));
export const lockIncident = (id) => acquireLock(`incident:lock:${id}`);
