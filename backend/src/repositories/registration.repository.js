import { acquireLock, jsonGet, jsonSet, redis } from "../config/redis.js";

const key = (id) => `registration:${id}`;

export const getRegistration = async (id) => jsonGet(key(id));

// Pass a transaction (see config/redis.js) to queue the writes instead of running them now.
export const saveRegistration = async (registration, tx = null) => {
    if (tx) {
        tx.set(key(registration._id), JSON.stringify(registration));
        tx.sAdd("registrations:all", registration._id);
        return registration;
    }
    await jsonSet(key(registration._id), registration);
    await redis().sAdd("registrations:all", registration._id);
    return registration;
};

export const listRegistrations = async () => {
    const ids = await redis().sMembers("registrations:all");
    return (await Promise.all(ids.map(getRegistration))).filter(Boolean);
};

// Short-lived lock so two BLOs cannot decide the same application at once.
// Returns a release function, or null if the application is already being processed.
export const lockRegistration = (id) => acquireLock(`registration:lock:${id}`);

// Key that marks an identical application as already awaiting review (see submitRegistration).
export const pendingDuplicateKey = (fingerprint) => `registration:pending:${fingerprint}`;

// Form 6 documents (photograph, age proof) are stored in their own keys, next to the application.
// The key is built only from the application id and a fixed category name, never from user input.
export const registrationDocumentKey = (id, category) => `registration:document:${id}:${category}`;

/** Returns { mimeType, size, fileName, uploadedAt, data } (data = base64) or null. */
export const getRegistrationDocument = async (id, category) => jsonGet(registrationDocumentKey(id, category));
