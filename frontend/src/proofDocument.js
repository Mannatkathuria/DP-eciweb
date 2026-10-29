// Rules for proof documents (Form 6 registration and Form 8 corrections).
// They must match the backend checks in backend/src/utils/documentProof.js, which are the ones that count.
export const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PROOF_MAX_BYTES = 4 * 1024 * 1024;
export const PROOF_HELP = "Required. JPEG, PNG or WebP image, up to 4 MB.";

/**
 * Checks a chosen file and reads it as a data URL.
 * Rejects with an Error whose message can be shown to the user.
 */
export const readProofDocument = (file) => new Promise((resolve, reject) => {
    if (!PROOF_TYPES.includes(file.type)) {
        reject(new Error("Upload a JPEG, PNG or WebP image of your proof document."));
        return;
    }
    if (file.size > PROOF_MAX_BYTES) {
        reject(new Error("The proof document must be 4 MB or smaller."));
        return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The file could not be read. Choose it again."));
    reader.readAsDataURL(file);
});
