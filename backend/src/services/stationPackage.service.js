import crypto from "crypto";
import { redis } from "../config/redis.js";

// Station packages for offline poll-day work.
//
//   1. built on the server for one registered device of one station (never the whole roll)
//   2. encrypted with AES-256-GCM under a key only that device can derive:
//        key = HKDF-SHA256(ikm = SHA-256(device secret), salt = package id, info = "eciweb-station-package/v1")
//      (the server holds SHA-256(secret), so it can build the package; the clear secret never leaves the device)
//   3. described by a manifest (station, election, device, version, expiry, SHA-256 of the
//      ciphertext) that is signed with the server's Ed25519 key
//   4. the device checks the signature with the public key, checks the ciphertext hash, then
//      decrypts in memory. The ciphertext is what is stored in IndexedDB.

const INFO = "eciweb-station-package/v1";
const DEV_KEY = "package:signing-key:dev";

let keys = null;
/** The signing key: PACKAGE_SIGNING_KEY (PKCS#8 PEM, or its base64), or a development key kept in Redis. */
export const signingKeys = async () => {
    if (keys) return keys;
    let pem = process.env.PACKAGE_SIGNING_KEY;
    if (pem && !pem.includes("BEGIN")) pem = Buffer.from(pem, "base64").toString("utf8");
    if (!pem) {
        if (process.env.NODE_ENV === "production") throw new Error("PACKAGE_SIGNING_KEY is not set.");
        pem = await redis().get(DEV_KEY);
        if (!pem) {
            const fresh = crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
            await redis().set(DEV_KEY, fresh, { NX: true });
            pem = await redis().get(DEV_KEY);
        }
    }
    const privateKey = crypto.createPrivateKey(pem);
    const publicKey = crypto.createPublicKey(privateKey);
    const raw = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
    keys = { privateKey, publicKey, publicKeyRaw: raw.toString("base64"), keyId: crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16) };
    return keys;
};
export const _resetKeysForTests = () => { keys = null; };

/** Canonical JSON of the manifest: fixed key order, so signer and verifier hash the same bytes. */
export const MANIFEST_FIELDS = ["format", "packageId", "keyId", "stationId", "electionId", "deviceId", "version", "issuedAt", "expiresAt", "electorCount", "ciphertextSha256"];
export const canonicalManifest = (m) => JSON.stringify(Object.fromEntries(MANIFEST_FIELDS.map((f) => [f, m[f] ?? null])));

export const packageKey = (tokenHashHex, packageId) =>
    Buffer.from(crypto.hkdfSync("sha256", Buffer.from(tokenHashHex, "hex"), Buffer.from(packageId), Buffer.from(INFO), 32));

/** Encrypts and signs a package body for one device. */
export const sealPackage = async ({ body, device, electionId, expiresAt }) => {
    const { privateKey, keyId } = await signingKeys();
    const packageId = crypto.randomUUID();
    const plaintext = Buffer.from(JSON.stringify(body));
    const version = crypto.createHash("sha256").update(plaintext).digest("hex").slice(0, 16);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", packageKey(device.tokenHash, packageId), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]); // WebCrypto expects the tag appended
    const manifest = {
        format: "eciweb-station-package/v1", packageId, keyId, stationId: device.stationId, electionId, deviceId: device._id, version,
        issuedAt: new Date().toISOString(), expiresAt, electorCount: body.electors.length,
        ciphertextSha256: crypto.createHash("sha256").update(ciphertext).digest("hex")
    };
    const signature = crypto.sign(null, Buffer.from(canonicalManifest(manifest)), privateKey).toString("base64");
    return { manifest, signature, iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64") };
};

/** Verification and decryption as a device does it (used by tests and by tooling). */
export const openPackage = async (sealed, deviceSecret) => {
    const { publicKey } = await signingKeys();
    if (!crypto.verify(null, Buffer.from(canonicalManifest(sealed.manifest)), publicKey, Buffer.from(sealed.signature, "base64"))) throw new Error("bad signature");
    const ct = Buffer.from(sealed.ciphertext, "base64");
    if (crypto.createHash("sha256").update(ct).digest("hex") !== sealed.manifest.ciphertextSha256) throw new Error("ciphertext altered");
    const key = packageKey(crypto.createHash("sha256").update(deviceSecret).digest("hex"), sealed.manifest.packageId);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
    decipher.setAuthTag(ct.subarray(-16));
    return JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, -16)), decipher.final()]).toString("utf8"));
};
