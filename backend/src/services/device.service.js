import crypto from "crypto";

// Connectivity of a polling-station device, from its last verified heartbeat. A station is never
// "online" because a browser opened the site: only a heartbeat signed with the device's secret
// by a signed-in member of that station's polling party counts.
export const ONLINE_MS = 2 * 60 * 1000;   // heartbeats are sent every 30 seconds
export const OFFLINE_MS = 10 * 60 * 1000;
export const CONNECTIVITY = ["online", "synchronising", "sync_failed", "stale", "offline", "unknown", "revoked"];

export const connectivity = (device, now = Date.now()) => {
    if (device.status === "revoked") return "revoked";
    const hb = device.lastHeartbeat;
    if (!hb?.at) return "unknown";
    const age = now - Date.parse(hb.at);
    if (age > OFFLINE_MS) return "offline";
    if (age > ONLINE_MS) return "stale";
    if (hb.lastSyncError) return "sync_failed";
    if (hb.pendingOutbox > 0) return "synchronising";
    return "online";
};

export const hashSecret = (secret) => crypto.createHash("sha256").update(String(secret)).digest("hex");
export const newSecret = () => crypto.randomBytes(32).toString("base64url");
export const secretMatches = (secret, hash) => {
    const a = Buffer.from(hashSecret(secret)); const b = Buffer.from(String(hash ?? ""));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Summary of a station's devices for the control room. */
export const stationDeviceSummary = (devices, now = Date.now()) => {
    const live = devices.filter((d) => d.status !== "revoked");
    const counts = Object.fromEntries(CONNECTIVITY.map((c) => [c, 0]));
    for (const d of live) counts[connectivity(d, now)] += 1;
    const last = live.map((d) => d.lastHeartbeat?.at).filter(Boolean).sort().at(-1) ?? null;
    const worst = ["sync_failed", "offline", "stale", "synchronising", "online", "unknown"].find((c) => counts[c] > 0) ?? "unknown";
    // The station's status is its best-connected device, but a sync failure is always shown.
    const best = counts.sync_failed ? "sync_failed" : ["online", "synchronising", "stale", "offline", "unknown"].find((c) => counts[c] > 0) ?? "unknown";
    return {
        devices: live.length, status: live.length ? best : "unknown", worst, counts, lastHeartbeatAt: last,
        pendingOutbox: live.reduce((n, d) => n + (d.lastHeartbeat?.pendingOutbox ?? 0), 0),
        packageVersions: [...new Set(live.map((d) => d.lastHeartbeat?.packageVersion ?? d.lastPackage?.version).filter(Boolean))],
        packageIssuedAt: live.map((d) => d.lastPackage?.at).filter(Boolean).sort().at(-1) ?? null,
        lastSyncAt: live.map((d) => d.lastSync?.at).filter(Boolean).sort().at(-1) ?? null
    };
};
