import { jsonGet, jsonSet, redis } from "../config/redis.js";

const key = (username) => `user:${String(username).trim().toLowerCase()}`;

export const getUserByUsername = async (username) => jsonGet(key(username));
export const getUserById = async (id) => jsonGet(`user:id:${id}`);

export const saveUser = async (user) => {
    await jsonSet(key(user.username), user);
    await jsonSet(`user:id:${user._id}`, user);
    await redis().sAdd("users:all", user._id);
    return user;
};

export const listUsers = async () => {
    const ids = await redis().sMembers("users:all");
    return (await Promise.all(ids.map((id) => getUserById(id)))).filter(Boolean);
};
