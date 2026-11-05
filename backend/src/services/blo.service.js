import crypto from "crypto";
import { redis } from "../config/redis.js";
import { getUserByEpic, saveUser } from "../repositories/user.repository.js";

// BLO IDs have the same shape as an EPIC number: "BLO" and seven digits, e.g. BLO1000001.
// A BLO signs in like every other officer: the BLO ID, then a one-time code (no password).
export const BLO_ID_PATTERN = /^BLO\d{7}$/;
// The ID used before (BLO-PB-000001); scripts/migrate-blo-ids.js renames these.
export const LEGACY_BLO_ID_PATTERN = /^BLO-[A-Z]{2}-\d{6}$/;
export const STATE_CODE_PATTERN = /^[A-Z]{2}$/;
// Indian mobile numbers: ten digits starting with 6-9.
export const MOBILE_PATTERN = /^[6-9]\d{9}$/;
const FIRST_SERIAL = 1000000;

export const maskMobile = (mobile) => `******${String(mobile).slice(-4)}`;

/** The next free BLO ID (BLO1000001, BLO1000002, ...), one national series. */
export const allocateBloId = async () => {
    await redis().set("blo:serial", String(FIRST_SERIAL), { NX: true });
    for (let i = 0; i < 20; i += 1) {
        const candidate = `BLO${await redis().incr("blo:serial")}`;
        if (BLO_ID_PATTERN.test(candidate) && !(await getUserByEpic(candidate))) return candidate;
    }
    throw new Error("Could not allocate a unique BLO ID.");
};

/** Creates a BLO account. The BLO signs in with the returned BLO ID and a one-time code. */
export const createBlo = async ({ name, mobile, state }) => {
    const cleanName = String(name ?? "").trim().replace(/\s+/g, " ");
    const cleanMobile = String(mobile ?? "").replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, "");
    const stateCode = String(state ?? "").trim().toUpperCase();
    if (cleanName.length < 2 || cleanName.length > 100) throw new Error("Name must be 2 to 100 characters.");
    if (!MOBILE_PATTERN.test(cleanMobile)) throw new Error("Mobile must be a 10-digit Indian mobile number.");
    if (!STATE_CODE_PATTERN.test(stateCode)) throw new Error("State must be a two-letter code, e.g. UP.");
    const bloId = await allocateBloId();
    await saveUser({
        _id: crypto.randomUUID(),
        // The account key used across the app (sessions, approvals) is the BLO ID.
        epic: bloId, bloId, name: cleanName, role: "blo", mobile: cleanMobile, state: stateCode, createdAt: new Date().toISOString()
    });
    return { bloId, maskedMobile: maskMobile(cleanMobile) };
};
