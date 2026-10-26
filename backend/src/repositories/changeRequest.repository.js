import { jsonGet, jsonSet, redis } from "../config/redis.js";

const key = (id) => `change_request:${id}`;
const userKey = (epic) => `user:change_requests:${String(epic).trim().toUpperCase()}`;

export const getChangeRequest = async (id) => jsonGet(key(id));

export const saveChangeRequest = async (request) => {
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

export const lockChangeRequest = async (id) =>
    (await redis().set(`change_request:lock:${id}`, "1", { NX: true, EX: 30 })) === "OK";
