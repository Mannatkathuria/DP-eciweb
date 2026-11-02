import { acquireLock, jsonGet, redis } from "../config/redis.js";

// Results received from a registered result source. The platform stores what the source sent,
// append-only, and never computes or declares an official result of its own.
const feedKey = (electionId, areaKey) => `results:${electionId}:${areaKey}`;

export const getResultSource = (id) => jsonGet(`resultsource:${id}`);
export const saveResultSource = (s, tx) => { tx.set(`resultsource:${s._id}`, JSON.stringify(s)); tx.sAdd("resultsources:all", s._id); };
export const listResultSources = async () => (await Promise.all((await redis().sMembers("resultsources:all")).map(getResultSource))).filter(Boolean);

export const getResultFeed = (electionId, areaKey) => jsonGet(feedKey(electionId, areaKey));
export const saveResultFeed = (feed, tx) => { tx.set(feedKey(feed.electionId, feed.areaKey), JSON.stringify(feed)); tx.sAdd(`results:${feed.electionId}`, feed.areaKey); };
export const lockResultFeed = (electionId, areaKey) => acquireLock(`results:lock:${electionId}:${areaKey}`);
