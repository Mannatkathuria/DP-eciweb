import { jsonGet, jsonSet, redis } from "../config/redis.js";

const key = (id) => `registration:${id}`;

export const getRegistration = async (id) => jsonGet(key(id));

export const saveRegistration = async (registration) => {
    await jsonSet(key(registration._id), registration);
    await redis().sAdd("registrations:all", registration._id);
    return registration;
};

export const listRegistrations = async () => {
    const ids = await redis().sMembers("registrations:all");
    return (await Promise.all(ids.map(getRegistration))).filter(Boolean);
};

// Short-lived lock so two BLOs cannot approve the same application at once.
export const lockRegistration = async (id) =>
    (await redis().set(`registration:lock:${id}`, "1", { NX: true, EX: 30 })) === "OK";
