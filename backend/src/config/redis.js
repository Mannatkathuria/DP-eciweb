import { createClient } from "redis";

let client;
let connecting;

const isProd = process.env.NODE_ENV === "production";

const getRedisUrl = () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (isProd) throw new Error("REDIS_URL is not set.");
    return "redis://127.0.0.1:6379";
  }
  const isLocal = /^redis:\/\/(127\.0\.0\.1|localhost)/.test(url);
  if (url.startsWith("redis://") && !isLocal) {
    console.warn("REDIS_URL uses redis:// for a remote host. Hosted providers like Upstash need rediss:// (TLS).");
  }
  return url;
};

const buildClient = () => {
  const url = getRedisUrl();
  const isLocal = /^rediss?:\/\/(127\.0\.0\.1|localhost)/.test(url);

  const c = createClient({
    url,
    socket: {
      tls: !isLocal,
      connectTimeout: 10000,
      reconnectStrategy: (retries) =>
        retries > 5 ? new Error("Redis reconnect limit reached") : Math.min(retries * 200, 2000)
    }
  });
  c.on("error", (error) => console.error("Redis error:", error.message));
  c.on("ready", () => console.log("Redis connected."));
  return c;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const connectRedis = async () => {
  if (client?.isReady) return client;

  // Client exists but its socket is closed for good: throw it away and start over
  if (client && !client.isOpen) {
    client = undefined;
    connecting = null;
  }

  if (!client) client = buildClient();

  if (!connecting) {
    const current = client;
    connecting = current.connect().catch((error) => {
      connecting = null;
      if (client === current) client = undefined;
      throw error;
    });
  }

  await connecting;

  // If the socket dropped and node-redis is reconnecting, give it a moment
  for (let i = 0; i < 25 && client && !client.isReady && client.isOpen; i++) {
    await sleep(200);
  }

  if (!client?.isReady) {
    client = undefined;
    connecting = null;
    throw new Error("Redis is not ready.");
  }
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
  for await (const batch of redis().scanIterator({ MATCH: pattern, COUNT: 100 })) {
    // node-redis v4 yields single keys, v5 yields arrays of keys
    if (Array.isArray(batch)) keys.push(...batch);
    else keys.push(batch);
  }
  return keys;
};

export const jsonList = async (pattern) => {
  const keys = await scanKeys(pattern);
  const values = await Promise.all(keys.map(jsonGet));
  return values.filter(Boolean);
};