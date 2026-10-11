import { createClient } from "redis";

let client;
let connecting;

export const connectRedis = async () => {
    if (client?.isReady) return client;

    if (!client) {
        client = createClient({
            url: process.env.REDIS_URL || "redis://127.0.0.1:6379"
        });
        client.on("error", (error) => console.error("Redis error:", error.message));
    }

    if (!connecting) {
        connecting = client.connect().catch((error) => {
            connecting = null;
            throw error;
        });
    }

    await connecting;
    console.log("Redis connected.");
    return client;
};

export const redis = () => {
    if (!client?.isReady) throw new Error("Redis is not connected.");
    return client;
};

export const jsonSet = async (key, value, ttlSeconds = null) => {
    if (ttlSeconds) {
        await redis().set(key, JSON.stringify(value), { EX: ttlSeconds });
    } else {
        await redis().set(key, JSON.stringify(value));
    }
    return value;
};

export const jsonGet = async (key) => {
    const value = await redis().get(key);
    return value ? JSON.parse(value) : null;
};

export const scanKeys = async (pattern) => {
    const keys = [];
    for await (const key of redis().scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(key);
    }
    return keys;
};

export const jsonList = async (pattern) => {
    const keys = await scanKeys(pattern);
    const values = await Promise.all(keys.map(jsonGet));
    return values.filter(Boolean);
};
