// Checks and opens a station package in the browser with WebCrypto, mirroring
// backend/src/services/stationPackage.service.js:
//   signature  Ed25519 over the canonical manifest, with the server's public key
//   integrity  SHA-256 of the ciphertext must equal manifest.ciphertextSha256
//   key        HKDF-SHA256(ikm = SHA-256(device secret), salt = package id, info = INFO) -> AES-256-GCM

const INFO = "eciweb-station-package/v1";
const FIELDS = ["format", "packageId", "keyId", "stationId", "electionId", "deviceId", "version", "issuedAt", "expiresAt", "electorCount", "ciphertextSha256"];
const enc = new TextEncoder();
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const canonicalManifest = (m) => JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, m[f] ?? null])));

export class PackageError extends Error {}

export const verifyPackage = async (sealed, { publicKey, keyId }, { stationId, deviceId }) => {
    const m = sealed.manifest;
    if (m.format !== "eciweb-station-package/v1") throw new PackageError("Unknown package format.");
    if (m.keyId !== keyId) throw new PackageError("The package was signed with a key this device does not know.");
    if (m.stationId !== stationId || m.deviceId !== deviceId) throw new PackageError("This package is for another station or device.");
    let key;
    try { key = await crypto.subtle.importKey("raw", b64(publicKey), { name: "Ed25519" }, false, ["verify"]); }
    catch { throw new PackageError("This browser cannot check package signatures (Ed25519). Use an up-to-date Chrome, Edge, Firefox or Safari."); }
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64(sealed.signature), enc.encode(canonicalManifest(m)));
    if (!ok) throw new PackageError("The package signature is not valid. It was not saved.");
    if (hex(await crypto.subtle.digest("SHA-256", b64(sealed.ciphertext))) !== m.ciphertextSha256) throw new PackageError("The package was altered. It was not saved.");
    return true;
};

export const openPackage = async (sealed, deviceSecret) => {
    const ikm = await crypto.subtle.digest("SHA-256", enc.encode(deviceSecret));
    const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
    const aes = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode(sealed.manifest.packageId), info: enc.encode(INFO) }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(sealed.iv) }, aes, b64(sealed.ciphertext));
    return JSON.parse(new TextDecoder().decode(plain));
};
