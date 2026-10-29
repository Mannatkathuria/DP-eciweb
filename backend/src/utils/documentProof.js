import { ApiError } from "./ApiErrors.js";

// Proof documents arrive from the browser as base64 data URLs (Register.jsx and Dashboard.jsx).
// The frontend applies the same limits, but these checks are the ones that count.
export const DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;

// The first bytes of each allowed file type, so a renamed file cannot pass as an image.
const startsWith = (buffer, bytes, offset = 0) => bytes.every((b, i) => buffer[offset + i] === b);
const ALLOWED_TYPES = {
    "image/jpeg": (buf) => startsWith(buf, [0xff, 0xd8, 0xff]),
    "image/png": (buf) => startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "image/webp": (buf) => startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)
};

const DATA_URL_PATTERN = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i;

/**
 * Checks a required proof document and returns it in a normalised form.
 * Throws a 400 ApiError explaining what to fix when the document is missing or not acceptable.
 */
export const validateDocumentProof = (value, label = "A proof document") => {
    if (value === undefined || value === null || value === "") {
        throw new ApiError(400, `${label} is required. Upload a JPEG, PNG or WebP image.`);
    }
    const match = typeof value === "string" ? value.match(DATA_URL_PATTERN) : null;
    if (!match) {
        throw new ApiError(400, `${label} must be an uploaded JPEG, PNG or WebP image.`);
    }

    const mimeType = match[1].toLowerCase();
    const base64 = match[2];
    if (!ALLOWED_TYPES[mimeType]) {
        throw new ApiError(400, "Only JPEG, PNG and WebP images are accepted as proof documents.");
    }
    // Check the encoded length first so an oversized upload is never fully decoded.
    if (base64.length > Math.ceil(DOCUMENT_MAX_BYTES / 3) * 4) {
        throw new ApiError(400, "The proof document must be 4 MB or smaller.");
    }
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length === 0 || bytes.length > DOCUMENT_MAX_BYTES) {
        throw new ApiError(400, "The proof document must be 4 MB or smaller.");
    }
    if (!ALLOWED_TYPES[mimeType](bytes)) {
        throw new ApiError(400, "The uploaded file is not a valid image of the type it claims to be.");
    }
    return `data:${mimeType};base64,${base64}`;
};

export const REASON_MAX_LENGTH = 500;

/** A BLO's rejection reason is shown to the applicant, so it must contain real text. */
export const requireReason = (value, what = "rejection") => {
    const reason = String(value ?? "").trim().replace(/\s+/g, " ");
    if (!reason) throw new ApiError(400, `Enter a reason for the ${what}. It is shown to the applicant.`);
    if (reason.length > REASON_MAX_LENGTH) {
        throw new ApiError(400, `The reason must be ${REASON_MAX_LENGTH} characters or fewer.`);
    }
    return reason;
};
