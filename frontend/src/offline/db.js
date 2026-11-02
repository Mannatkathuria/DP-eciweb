import Dexie from "dexie";

// IndexedDB on the polling-station device. The station package is stored as received: encrypted,
// with its signed manifest. It is decrypted in memory when the poll-day screen opens.
export const db = new Dexie("eciweb-offline");
db.version(1).stores({
    packages: "stationId",                                   // { stationId, manifest, signature, iv, ciphertext, savedAt }
    outbox: "++id, &idempotencyKey, stationId, status"       // { idempotencyKey, stationId, record, status, createdAt, attempts, result }
});
