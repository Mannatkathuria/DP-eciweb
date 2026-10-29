import { acquireLock, jsonGet, jsonSet, redis } from "../config/redis.js";

const key = (id) => `verification:${id}`;

export const getVerification = async (id) => jsonGet(key(id));

export const saveVerification = async (verification, tx = null) => {
    if (tx) {
        tx.set(key(verification._id), JSON.stringify(verification));
        tx.sAdd("verifications:all", verification._id);
        return verification;
    }
    await jsonSet(key(verification._id), verification);
    await redis().sAdd("verifications:all", verification._id);
    return verification;
};

export const listVerifications = async () => {
    const ids = await redis().sMembers("verifications:all");
    return (await Promise.all(ids.map((id) => jsonGet(key(id)))).then(v => v.filter(Boolean)));
};

// Returns a release function, or null if the case is already being resolved.
export const lockVerification = (id) => acquireLock(`verification:lock:${id}`);
