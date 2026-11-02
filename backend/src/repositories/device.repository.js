import { acquireLock, jsonGet, redis } from "../config/redis.js";

// Polling-station devices (tablets or laptops used by the polling party). The device secret is
// stored only as a SHA-256 hash.
const key = (id) => `device:${id}`;
const stationKey = (stationId) => `devices:station:${stationId}`;

export const getDevice = (id) => jsonGet(key(id));
export const saveDevice = (device, tx) => {
    tx.set(key(device._id), JSON.stringify(device));
    tx.sAdd(stationKey(device.stationId), device._id);
    tx.sAdd("devices:all", device._id);
};
export const listStationDevices = async (stationId) =>
    (await Promise.all((await redis().sMembers(stationKey(stationId))).map(getDevice))).filter(Boolean);
export const listAllDevices = async () =>
    (await Promise.all((await redis().sMembers("devices:all")).map(getDevice))).filter(Boolean);
export const lockDevice = (id) => acquireLock(`device:lock:${id}`);
