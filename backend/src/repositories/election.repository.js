import { acquireLock, jsonGet, redis } from "../config/redis.js";

// Elections, polling stations, nominations and published lists of contesting candidates.
const get = (k) => jsonGet(k);
const all = async (set, prefix) => (await Promise.all((await redis().sMembers(set)).map((id) => get(`${prefix}${id}`)))).filter(Boolean);
const put = (tx, prefix, set, v) => { tx.set(`${prefix}${v._id}`, JSON.stringify(v)); tx.sAdd(set, v._id); };

export const getElection = (id) => get(`election:${id}`);
export const saveElection = (e, tx) => put(tx, "election:", "elections:all", e);
export const listElections = () => all("elections:all", "election:");

export const getStation = (id) => get(`station:${id}`);
export const saveStation = (s, tx) => put(tx, "station:", "stations:all", s);
export const listStations = () => all("stations:all", "station:");
export const lockStation = (id) => acquireLock(`station:lock:${id}`);

export const getNomination = (id) => get(`nomination:${id}`);
export const saveNomination = (n, tx) => put(tx, "nomination:", "nominations:all", n);
export const listNominations = () => all("nominations:all", "nomination:");
export const lockNomination = (id) => acquireLock(`nomination:lock:${id}`);

const contestingKey = (electionId, areaKey) => `contesting:${electionId}:${areaKey}`;
export const getContestingList = (electionId, areaKey) => get(contestingKey(electionId, areaKey));
export const saveContestingList = (list, tx) => tx.set(contestingKey(list.electionId, list.areaKey), JSON.stringify(list));

// RP Act 1951, s.22(2) proviso: an Assistant Returning Officer may scrutinise nominations only when
// the Returning Officer is unavoidably prevented. The RO records that, naming the ARO, per area.
const delegationKey = (electionId, areaKey) => `scrutiny-delegation:${electionId}:${areaKey}`;
export const getScrutinyDelegation = (electionId, areaKey) => get(delegationKey(electionId, areaKey));
export const saveScrutinyDelegation = (d, tx) => tx.set(delegationKey(d.electionId, d.areaKey), JSON.stringify(d));
