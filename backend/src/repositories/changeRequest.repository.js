import { acquireLock, jsonGet, jsonSet, redis } from "../config/redis.js";

const key = (id) => `change_request:${id}`;
const userKey = (epic) => `user:change_requests:${String(epic).trim().toUpperCase()}`;

export const getChangeRequest = async (id) => jsonGet(key(id));

export const saveChangeRequest = async (request, tx = null) => {
    if (tx) {
        tx.set(key(request._id), JSON.stringify(request));
        tx.sAdd("change_requests:all", request._id);
        if (request.epic) tx.sAdd(userKey(request.epic), request._id);
        return request;
    }
    await jsonSet(key(request._id), request);
    await redis().sAdd("change_requests:all", request._id);
    if (request.epic) {
        await redis().sAdd(userKey(request.epic), request._id);
    }
    return request;
};

export const listChangeRequests = async () => {
    const ids = await redis().sMembers("change_requests:all");
    return (await Promise.all(ids.map(getChangeRequest))).filter(Boolean);
};

export const listChangeRequestsForEpic = async (epic) => {
    const ids = await redis().sMembers(userKey(epic));
    return (await Promise.all(ids.map(getChangeRequest))).filter(Boolean);
};

// Returns a release function, or null if the request is already being processed.
export const lockChangeRequest = (id) => acquireLock(`change_request:lock:${id}`);
