# Offline architecture

Goal: a polling station keeps working when the connection drops, without any device holding more than its own station's data, and without the server ever losing its place as the record.

## Package lifecycle

| # | Step | Where | How |
| --- | --- | --- | --- |
| 1 | Device registration | server | A member of the polling party registers the device for their own station (`POST /devices/register`). The device receives a 256-bit secret once; the server stores only its SHA-256 hash. |
| 2 | Authorised package creation | server | `GET /poll-day/package` with session + `X-Device-Id` + `X-Device-Token`. Only on the day before the poll and on poll day. Contents: the station, the election, the electors **of that part only** (EPIC, name, age, gender, serial, relative, house number; no dates of birth, addresses or contact details), who has already voted, who is blocked by a doubt or challenge, the list of identity documents. |
| 3 | Encryption | server | AES-256-GCM. Key = HKDF-SHA256(ikm = SHA-256(device secret), salt = package id, info = `eciweb-station-package/v1`). Only that device can derive it. |
| 4 | Digital signature | server | A manifest (format, package id, key id, station, election, device, version, issue and expiry times, elector count, SHA-256 of the ciphertext) is signed with Ed25519 (`PACKAGE_SIGNING_KEY`). Public key: `GET /poll-day/package/public-key`. |
| 5 | Download and integrity check | browser | WebCrypto: Ed25519 signature over the canonical manifest, ciphertext hash, station and device match. A package that fails is not saved. |
| 6 | Local storage | browser | Dexie (IndexedDB) stores the package **as received (encrypted)**. It is decrypted in memory when the screen opens. |
| 7 | Offline operation | browser | Search and guided marking from the package. Already-marked and blocked electors are shown as such. |
| 8 | Outbox | browser | Each mark is an outbox record with its own idempotency key, the time the officer acted, the document and the checks. |
| 9 | Reconnection | browser | On the `online` event, every 30 s, on a Background Sync wake-up from the service worker, or "Send now". |
| 10 | Synchronisation | server | `POST /poll-day/sync` (up to 500 records). Every record is checked again exactly as an online mark would be. |
| 11 | Conflict detection | server | Already marked (on another device or online) or blocked by a case → **conflict**. The register is not changed. |
| 12 | Reconciliation | server | The presiding officer reviews conflicts (`GET /poll-day/sync-conflicts`) and records a decision with a reason (`POST /poll-day/sync-conflicts/:id/resolve`): duplicate confirmed, tendered vote, or referred to the RO. |
| 13 | Acknowledgement | both | Each record gets an answer: accepted (with its register serial), conflict, rejected (with the reason) or retry. The device keeps the answer; the server keeps it for 14 days under the idempotency key. |

## Rules

- **Idempotency.** The key is claimed with `SET NX` before processing; a repeat returns the first answer; a record being processed returns "retry".
- **Time.** A record's time must not be in the future (5 minutes' skew allowed) or before the device was registered. A record made while the poll was open counts even if it arrives after closing; one made before opening or after closing does not.
- **No silent overwrite.** Conflicts are stored and shown to the presiding officer; nothing is merged automatically.
- **Events.** A sync emits `SYNC_COMPLETED` (or `SYNC_FAILED` when nothing was accepted) with counts, and `EXCEPTION_CREATED` for conflicts.
- **Heartbeats** carry the outbox size and last sync error, so the control room sees "syncing" or "sync failed" for the station.

## Service worker

`frontend/public/sw.js` caches the application shell (network first for pages, cache first for hashed assets). It never caches API responses. It is registered in production builds (and in development with `VITE_SW=on`). If the poll-day screen is opened with no connection, it uses the last station this device saw and the stored package.

## Known limits

- The device secret is kept in the browser's local storage next to the encrypted package. Encryption protects a copied database or a package intercepted in transit, not a device that is unlocked and in someone's hands. A production version would keep the key in a hardware-backed keystore or require a PIN.
- Background Sync is not available in every browser; the outbox then sends while the page is open.
- Ed25519 in WebCrypto needs a current browser (Chrome/Edge 137+, Firefox 129+, Safari 17+). Older browsers cannot download a package and are told so.
