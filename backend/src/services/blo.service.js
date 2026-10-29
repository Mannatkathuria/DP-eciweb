import crypto from "crypto";
import { promisify } from "util";
import { redis } from "../config/redis.js";
import { getUserByEpic, saveUser } from "../repositories/user.repository.js";

const scrypt = promisify(crypto.scrypt);

// BLO IDs look like BLO-UP-000001: a two-letter State/UT code and a six-digit serial.
export const BLO_ID_PATTERN = /^BLO-[A-Z]{2}-\d{6}$/;
export const STATE_CODE_PATTERN = /^[A-Z]{2}$/;
// Indian mobile numbers: ten digits starting with 6-9.
export const MOBILE_PATTERN = /^[6-9]\d{9}$/;
export const BLO_OTP_TTL_MS = 2 * 60 * 1000;
export const MAX_FAILED_PASSWORDS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export const normaliseBloId = (value) => String(value ?? "").trim().toUpperCase();
export const maskMobile = (mobile) => `******${String(mobile).slice(-4)}`;

/** At least 8 characters with at least one letter and one digit. Returns an error message or null. */
export const passwordProblem = (password) => {
    const value = String(password ?? "");
    if (value.length < 8 || value.length > 128) return "Password must be 8 to 128 characters long.";
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Password must contain at least one letter and one number.";
    return null;
};

export const hashPassword = async (password) => {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(String(password), salt, 64);
    return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
};

export const verifyPassword = async (password, stored) => {
    const [scheme, saltHex, keyHex] = String(stored ?? "").split("$");
    if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
    const expected = Buffer.from(keyHex, "hex");
    const actual = await scrypt(String(password ?? ""), Buffer.from(saltHex, "hex"), expected.length);
    return crypto.timingSafeEqual(actual, expected);
};

// Readable temporary password without look-alike characters (0/O, 1/l/I).
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export const generateTemporaryPassword = () => {
    let out = "";
    while (passwordProblem(out)) {
        out = Array.from({ length: 12 }, () => TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)]).join("");
    }
    return out;
};

/**
 * Creates a BLO account with a one-time temporary password. The BLO must replace it on first
 * sign-in. Returns the new BLO ID and the temporary password (shown once, never stored in clear).
 */
export const createBlo = async ({ name, mobile, state }) => {
    const cleanName = String(name ?? "").trim().replace(/\s+/g, " ");
    const cleanMobile = String(mobile ?? "").replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, "");
    const stateCode = String(state ?? "").trim().toUpperCase();
    if (cleanName.length < 2 || cleanName.length > 100) throw new Error("Name must be 2 to 100 characters.");
    if (!MOBILE_PATTERN.test(cleanMobile)) throw new Error("Mobile must be a 10-digit Indian mobile number.");
    if (!STATE_CODE_PATTERN.test(stateCode)) throw new Error("State must be a two-letter code, e.g. UP.");

    let bloId;
    for (let i = 0; i < 5 && !bloId; i += 1) {
        const serial = await redis().incr(`blo:serial:${stateCode}`);
        const candidate = `BLO-${stateCode}-${String(serial).padStart(6, "0")}`;
        if (!(await getUserByEpic(candidate))) bloId = candidate;
    }
    if (!bloId) throw new Error("Could not allocate a unique BLO ID.");

    const temporaryPassword = generateTemporaryPassword();
    await saveUser({
        _id: crypto.randomUUID(),
        // The account key used across the app (sessions, approvals) is the BLO ID.
        epic: bloId, bloId, name: cleanName, role: "blo", mobile: cleanMobile, state: stateCode,
        passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true,
        failedPasswordAttempts: 0, lockedUntil: null, createdAt: new Date().toISOString()
    });
    return { bloId, temporaryPassword, maskedMobile: maskMobile(cleanMobile) };
};
