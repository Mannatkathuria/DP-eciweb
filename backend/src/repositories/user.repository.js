import { jsonGet, jsonSet, redis } from "../config/redis.js";

// Accounts are identified by EPIC number only: there are no usernames or passwords.
const normaliseEpic = (epic) => String(epic ?? "").trim().toUpperCase();
const key = (epic) => `user:${normaliseEpic(epic)}`;

export const getUserByEpic = async (epic) => jsonGet(key(epic));
export const getUserById = async (id) => jsonGet(`user:id:${id}`);

export const saveUser = async (user, tx = null) => {
    if (tx) {
        tx.set(key(user.epic), JSON.stringify(user));
        tx.set(`user:id:${user._id}`, JSON.stringify(user));
        tx.sAdd("users:all", user._id);
        return user;
    }
    await jsonSet(key(user.epic), user);
    await jsonSet(`user:id:${user._id}`, user);
    await redis().sAdd("users:all", user._id);
    return user;
};

export const listUsers = async () => {
    const ids = await redis().sMembers("users:all");
    return (await Promise.all(ids.map((id) => getUserById(id)))).filter(Boolean);
};
