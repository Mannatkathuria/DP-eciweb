# Security architecture

## Identity and sessions

| Who | Sign-in | Session |
| --- | --- | --- |
| Voters and officials | EPIC number and a one-time code (OTP) | JWT (8 hours by default, `ACCESS_TOKEN_EXPIRY`) as a bearer token and an `httpOnly` cookie (`secure`, `SameSite=None` in production) |
| BLOs | BLO ID, password (scrypt with salt, constant-time comparison) and a mobile OTP; a temporary password must be changed first | same |

OTPs are printed to the server log because no SMS gateway is authorised (BLOCKED; see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)). A suspended account cannot sign in, cannot use an existing session, and cannot open a live connection.

## Step-up re-authentication

Sensitive actions need a fresh one-time code on top of the session. These are:
- approving or rejecting a Form 6 or Form 8;
- delegating scrutiny and publishing the contesting list;
- approving a polling station;
- publishing a roll version;
- granting or revoking an assignment;
- creating or suspending a data source;
- registering a result source;
- suspending or reinstating an account.

`POST /auth/step-up/request` issues a code (3 minutes). `POST /auth/step-up/verify` returns a step-up token: a JWT with `purpose: "step-up"`, bound to the account and valid for `STEP_UP_MINUTES` (default 10). The browser keeps the token in memory only. Without it the server answers 401 with `STEP_UP_REQUIRED`, and the browser asks for a code and retries once. Production refuses to start with `STEP_UP_REQUIRED=false` unless in training mode.

## Authorisation

1. **Permission** by role (`authorize(...)` on the route; [ROLE_PERMISSION_MATRIX.md](ROLE_PERMISSION_MATRIX.md)).
2. **Jurisdiction**: an active assignment, inside its validity window and for the right election, must cover the record. This is checked in the handler (`covers`, `assertCovers`).
3. **Specific rules** in the handler: for example, only the presiding officer decides a challenge; only the supervisor of a table records it; the proposer of a polling station cannot approve it; an ARO scrutinises only under delegation.
4. **Station context** comes from the caller's assignment, never from a client-supplied id alone (prevents IDOR).

## Request protection

- **CSRF:** a cookie-only session must send `X-Requested-With: XMLHttpRequest` on state-changing requests. CORS allows only `CLIENT_URL` origins and the headers the app uses.
- **Security headers** on every response: `X-Content-Type-Options: nosniff`, frame denial, referrer policy, a restrictive Content-Security-Policy on API responses, HSTS in production.
- **Rate limits** on sign-in, OTP, registration and public lookups (per instance).
- **Input validation** in every controller. Uploads are checked by magic bytes and size. Bodies are limited to 1 MB except the Form 6 upload.

## Devices

Polling-station devices are registered by the polling party. Each device has a 256-bit secret, and the server stores only its SHA-256 hash, compared in constant time. Heartbeats, package downloads and sync need the session **and** the device secret, and the device must belong to the caller's own station. Station packages are encrypted to the device (AES-256-GCM, HKDF) and signed by the server (Ed25519). See [OFFLINE_ARCHITECTURE.md](OFFLINE_ARCHITECTURE.md).

## Audit and integrity

- Every state change writes an audit event in the same transaction: actor, role, resource, jurisdiction, before and after summaries, reason.
- Each event carries a SHA-256 hash of its canonical JSON, and a counter is incremented with every event.
- `GET /audit/integrity` (ECI administrator) recomputes every hash and compares the counter with the list. The list and the counter are read in one transaction so concurrent writes do not raise false alarms.
- Random draws (counting staff, VVPAT stations) record their seed so they can be re-derived.

## Live connections

The Socket.IO handshake uses the same session token. Each event goes only to sockets whose assignments cover it, and assignments are reloaded every minute. Events carry counts and statuses, never voter identities.

## Separation of duties

- The ECI administrator manages roles and integrations but holds no roll-decision, scrutiny or result-declaration permission.
- Results never originate in ECIWEB.
- Training data never touches live records.

Threats and their mitigations: [THREAT_MODEL.md](THREAT_MODEL.md). Personal data: [DATA_PROTECTION.md](DATA_PROTECTION.md).
