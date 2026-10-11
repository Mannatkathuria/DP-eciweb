import { jsonGet, jsonSet, redis } from "../config/redis.js";

const key = (id) => `verification:${id}`;

export const getVerification = async (id) => jsonGet(key(id));

export const saveVerification = async (verification) => {
    await jsonSet(key(verification._id), verification);
    await redis().sAdd("verifications:all", verification._id);
    return verification;
};

export const listVerifications = async () => {
    const ids = await redis().sMembers("verifications:all");
    return (await Promise.all(ids.map((id) => jsonGet(key(id)))).then(v => v.filter(Boolean)));
};
