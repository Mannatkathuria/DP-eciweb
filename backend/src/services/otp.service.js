import crypto from "crypto";
import { ApiError } from "../utils/ApiErrors.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Demo-only OTP storage. Lost when the backend restarts.
// Replace issueOtp's console.log with an SMS gateway call for a real deployment.
const store = new Map();

export const issueOtp = (epic) => {
    const otp = String(crypto.randomInt(100000, 1000000));
    store.set(epic, { otp, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
    // Demo delivery only: inspect the backend terminal to obtain the code.
    console.log(`[DEMO OTP] EPIC ${epic}: ${otp}`);
};

export const checkOtp = (epic, otp) => {
    const saved = store.get(epic);

    if (!saved || Date.now() > saved.expiresAt) {
        store.delete(epic);
        throw new ApiError(400, "OTP expired. Request a new one.");
    }

    saved.attempts += 1;
    if (saved.attempts > MAX_ATTEMPTS) {
        store.delete(epic);
        throw new ApiError(429, "Too many attempts. Request a new OTP.");
    }

    const a = Buffer.from(saved.otp);
    const b = Buffer.from(String(otp));
    const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!matches) {
        if (saved.attempts >= MAX_ATTEMPTS) store.delete(epic);
        throw new ApiError(400, "Incorrect OTP. Please try again.");
    }

    store.delete(epic);
};
