
import crypto from "crypto";
import { ApiError } from "../utils/ApiErrors.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const store = new Map();
const notificationStore = new Map();

export const issueOtp = (epic) => {
    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = Date.now() + OTP_TTL_MS;

    store.set(epic, { otp, expiresAt, attempts: 0 });

    // Demo only: never expose OTPs through notifications in production.
    console.log(`[DEMO OTP] EPIC ${epic}: ${otp}`);

    notificationStore.set(epic, [{
        id: crypto.randomUUID(),
        app: "ECI Verification",
        icon: "🗳️",
        title: "Your verification OTP",
        body: `Your OTP is ${otp}. It expires in 5 minutes.`,
        createdAt: new Date().toISOString(),
        expiresAt
    }]);
};

export const getNotifications = (epic) => {
    const notifications = notificationStore.get(epic) || [];
    const now = Date.now();

    const active = notifications.filter(
        (notification) => notification.expiresAt > now
    );

    if (active.length) {
        notificationStore.set(epic, active);
    } else {
        notificationStore.delete(epic);
    }

    return active.map(({ expiresAt, ...notification }) => ({
        ...notification,
        time: "now"
    }));
};

export const checkOtp = (epic, otp) => {
    const saved = store.get(epic);

    if (!saved || Date.now() > saved.expiresAt) {
        store.delete(epic);
        notificationStore.delete(epic);
        throw new ApiError(400, "OTP expired. Request a new one.");
    }

    saved.attempts += 1;

    if (saved.attempts > MAX_ATTEMPTS) {
        store.delete(epic);
        notificationStore.delete(epic);
        throw new ApiError(429, "Too many attempts. Request a new OTP.");
    }

    const a = Buffer.from(saved.otp);
    const b = Buffer.from(String(otp));
    const matches =
        a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!matches) {
        if (saved.attempts >= MAX_ATTEMPTS) {
            store.delete(epic);
            notificationStore.delete(epic);
        }

        throw new ApiError(400, "Incorrect OTP. Please try again.");
    }

    store.delete(epic);
    notificationStore.delete(epic);
};
