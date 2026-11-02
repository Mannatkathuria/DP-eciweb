import crypto from "crypto";
import { transaction } from "../config/redis.js";
import { getDevice, listAllDevices, listStationDevices, lockDevice, saveDevice } from "../repositories/device.repository.js";
import { connectivity, hashSecret, newSecret, secretMatches } from "../services/device.service.js";
import { coversAny, hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { opsEvent, publishEvents, recordEvent } from "../services/events.service.js";
import { stationContext } from "./pollDay.controller.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Device registry and verified heartbeats for polling-station devices.
//   register   a member of the polling party registers the device for their own station and
//              receives its secret once (shown to the device, never stored in clear)
//   heartbeat  every 30 s: session + device id + device secret; carries package version, number
//              of events waiting in the offline outbox, last sync time and last sync error
//   revoke     the presiding officer, or an officer whose jurisdiction covers the station

const stationRecord = (s) => ({ ...s, assemblyConstituency: s.constituency, pollingStation: s.name });
const clean = (v, max = 80) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const view = (d) => { const { tokenHash, ...rest } = d; return { ...rest, connectivity: connectivity(d) }; };

export const registerDevice = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const label = clean(req.body?.label) || "Polling station device";
    const secret = newSecret();
    const device = {
        _id: crypto.randomUUID(), label, stationId: station._id, electionId: election._id,
        state: station.state, district: station.district, constituency: station.constituency, pollingStation: station.name, partNumber: station.partNumber,
        registeredBy: req.user.epic, registeredAt: new Date().toISOString(), tokenHash: hashSecret(secret), status: "active",
        lastHeartbeat: null, notified: "unknown"
    };
    const tx = transaction();
    saveDevice(device, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "device.registered", resource: { type: "device", id: device._id }, jurisdiction: stationRecord(station), after: { label } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: "Device registered. Keep its secret on this device only.", data: { device: view(device), deviceSecret: secret } });
});

/** Verifies the device headers against the caller's own station. Returns the device. */
export const verifiedDevice = async (req) => {
    const id = String(req.header("X-Device-Id") ?? "");
    const secret = String(req.header("X-Device-Token") ?? "");
    const device = id ? await getDevice(id) : null;
    if (!device || !secretMatches(secret, device.tokenHash)) throw new ApiError(401, "This device is not registered, or its secret is wrong.");
    if (device.status !== "active") throw new ApiError(403, "This device has been revoked.");
    const { station } = await stationContext({ ...req, query: { ...req.query, stationId: device.stationId } });
    if (station._id !== device.stationId) throw new ApiError(403, "This device belongs to another polling station.");
    return device;
};

export const heartbeat = asyncHandler(async (req, res) => {
    const device = await verifiedDevice(req);
    const body = req.body ?? {};
    const pendingOutbox = Math.max(0, Math.min(100000, Number.parseInt(body.pendingOutbox, 10) || 0));
    const hb = {
        at: new Date().toISOString(), by: req.user.epic, packageVersion: clean(body.packageVersion, 40) || null, pendingOutbox,
        lastSyncAt: body.lastSyncAt ? new Date(body.lastSyncAt).toISOString() : null, lastSyncError: clean(body.lastSyncError, 200) || null,
        appVersion: clean(body.appVersion, 40) || null
    };
    const before = connectivity(device);
    const release = await lockDevice(device._id);
    if (!release) return res.json({ success: true, data: { connectivity: before } });
    try {
        const updated = { ...device, lastHeartbeat: hb };
        const now = connectivity(updated);
        const tx = transaction();
        let event = null;
        // STATION_ONLINE when a device comes back (or for the first time); not on every heartbeat.
        if (["unknown", "offline", "stale"].includes(device.notified ?? before) && ["online", "synchronising", "sync_failed"].includes(now)) {
            updated.notified = "online";
            event = recordEvent(opsEvent({ type: "STATION_ONLINE", jurisdiction: { ...device }, electionId: device.electionId, stationId: device.stationId,
                payload: { deviceId: device._id, label: device.label, packageVersion: hb.packageVersion }, actor: req.user, idempotencyKey: `device:${device._id}:online:${hb.at}` }), tx);
        }
        saveDevice(updated, tx);
        await tx.exec();
        await publishEvents(event);
        res.json({ success: true, data: { connectivity: now, serverTime: hb.at } });
    } finally { await release(); }
});

export const listMyStationDevices = asyncHandler(async (req, res) => {
    const { station } = await stationContext(req);
    res.json({ success: true, data: { items: (await listStationDevices(station._id)).map(view) } });
});

export const revokeDevice = asyncHandler(async (req, res) => {
    const reason = requireReason(req.body?.reason, "revocation");
    const device = await getDevice(req.params.id);
    if (!device) throw new ApiError(404, "Device not found.");
    const record = { ...device, assemblyConstituency: device.constituency };
    const own = hasPermission(req.user, "polling:conduct") && coversAny(req.authority.assignments, record);
    const over = hasPermission(req.user, "incident:manage") && coversAny(req.authority.assignments, record);
    if (!own && !over) throw new ApiError(403, "This device is outside your jurisdiction.");
    if (device.status === "revoked") throw new ApiError(409, "This device is already revoked.");
    const updated = { ...device, status: "revoked", revokedAt: new Date().toISOString(), revokedBy: req.user.epic, revokeReason: reason };
    const tx = transaction();
    saveDevice(updated, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "device.revoked", resource: { type: "device", id: device._id }, jurisdiction: record, note: reason }), tx);
    await tx.exec();
    res.json({ success: true, data: view(updated) });
});

/**
 * Marks devices that stopped sending heartbeats as offline and records STATION_OFFLINE once per
 * outage. Runs every minute on a long-running server and whenever the control room loads (so it
 * also works on serverless hosting, where nothing runs between requests).
 */
export const sweepOfflineDevices = async () => {
    const events = [];
    for (const device of await listAllDevices()) {
        if (device.status !== "active" || !device.lastHeartbeat) continue;
        if (connectivity(device) !== "offline" || device.notified === "offline") continue;
        const release = await lockDevice(device._id);
        if (!release) continue;
        try {
            const fresh = await getDevice(device._id);
            if (!fresh || fresh.notified === "offline" || connectivity(fresh) !== "offline") continue;
            const tx = transaction();
            saveDevice({ ...fresh, notified: "offline" }, tx);
            events.push(recordEvent(opsEvent({ type: "STATION_OFFLINE", jurisdiction: { ...fresh }, electionId: fresh.electionId, stationId: fresh.stationId,
                payload: { deviceId: fresh._id, label: fresh.label, lastHeartbeatAt: fresh.lastHeartbeat.at }, idempotencyKey: `device:${fresh._id}:offline:${fresh.lastHeartbeat.at}` }), tx));
            await tx.exec();
        } finally { await release(); }
    }
    await publishEvents(events);
    return events.length;
};

