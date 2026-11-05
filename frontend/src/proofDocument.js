import { preflightDocument } from "./preflight";
// Rules for proof documents (Form 6 registration and Form 8 corrections).
// They must match the backend checks in backend/src/utils/documentProof.js, which are the ones that count.
export const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PROOF_MAX_BYTES = 4 * 1024 * 1024;
export const PROOF_HELP = "Required. JPEG, PNG or WebP image, up to 4 MB.";

/**
 * Checks a chosen file (format, real file type, size, damage) and reads it as a data URL.
 * Rejects with an Error whose message can be shown to the user.
 */
export const readProofDocument = async (file) => (await preflightDocument(file, { types: PROOF_TYPES, maxBytes: PROOF_MAX_BYTES, label: "The proof document" })).dataUrl;
