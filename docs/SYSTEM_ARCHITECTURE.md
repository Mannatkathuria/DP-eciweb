# System architecture

## Overview

```text
 Browsers (React + Vite PWA)                        Polling-station devices (same app)
   public site, voter, BLO, ERO/AERO, DEO,            station package in IndexedDB (Dexie),
   RO/ARO, candidate/agents, ECI, observers,          outbox, service worker
   control room, poll day, counting, training             │
            │  HTTPS (JSON, cookie or bearer)             │ HTTPS + device headers
            ▼                                             ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │ Express 5 API  (backend/src/app.js)                                  │
 │  security headers · CORS allow-list · rate limits · CSRF guard   │
 │  verifyJWT → authorize(permissions) → handler (jurisdiction check)   │
 │  step-up on sensitive routes · audit + operational event per change  │
 └──────────────┬──────────────────────────────┬────────────────────────┘
                │ node-redis v5                │ publish
                ▼                              ▼
          Redis (system of record)       Redis channel eciweb:events
                                               │ subscribe
                                               ▼
                                Socket.IO server (index.js, long-running host only)
                                → each event only to sockets whose assignments cover it
```

External services, all optional: Persona (identity verification sandbox), Google Gemini (document sanity check; a rule engine runs without it), a local Python face service (legacy demo). No ECI system is connected; see [INTEGRATION_ARCHITECTURE.md](INTEGRATION_ARCHITECTURE.md).

## Backend

| Layer | Folder | What it holds |
| --- | --- | --- |
| Routes | `src/routes/*.routes.js` | URL → middleware chain → controller. Permissions are declared here with `authorize(...)`. |
| Middleware | `src/middlewares/` | `verifyJWT` (session, suspension, CSRF), `authorize` (permissions, loads assignments), `stepUp` (fresh one-time code). |
| Controllers | `src/controllers/` | Request validation, jurisdiction checks, business rules, transactions. |
| Services | `src/services/` | Authority (`covers`, assignments in effect, PC mapping), audit, events, elections, search, queue, devices, station packages, registration, Gemini. |
| Repositories | `src/repositories/` | Redis keys and JSON records; no business rules. |
| Config | `src/config/` | Roles and permissions, procedures library, training modules and scenarios, app mode checks, Redis client. |
| Realtime | `src/realtime/socket.js` | Socket.IO attached to the HTTP server when not on Vercel. |

### Request path

1. `verifyJWT` reads the bearer token (or the `accessToken` cookie; a cookie-only state change must carry `X-Requested-With`), loads the user and refuses suspended accounts.
2. `authorize(...permissions)` admits the caller if their role holds any of the permissions and loads their **effective assignments** (active, inside the validity window) into `req.authority.assignments`.
3. The controller resolves the record and checks that an assignment **covers** it (State → district → constituency → polling station, or parliamentary constituency for RO and observer roles; and the election, if the assignment names one).
4. Changes are written in one Redis `MULTI` transaction together with their audit event (SHA-256 hashed) and, where relevant, an operational event (outbox pattern). Concurrent edits take a short `SET NX` lock.
5. After `EXEC`, operational events are published to `eciweb:events` for live screens.

### Why Redis and not MongoDB

The directive assumed MongoDB. The code base was built on Redis and the project owner chose to keep Redis for now (2 November 2026). Redis is used as a document store with JSON values, sets as indexes, lists as append-only logs, `MULTI` for atomic multi-record changes and `SET NX` locks. The consequences (no secondary-index queries, whole-set scans for some lists, memory sizing) are listed in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md), with a migration path in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

## Frontend

- React 19, React Router, Vite, i18next (English, Hindi, Punjabi in full for voter screens; Kannada, Tamil, Telugu partly).
- `src/api/axios.js`: one API client; adds the session token, the anti-forgery header, and the step-up dialog that retries a refused request once with a fresh code.
- `src/api/live.js`: `useLiveEvents()`: Socket.IO subscription with catch-up from `/events` after reconnecting; falls back to polling so every screen works without it.
- `src/offline/`: Dexie database, WebCrypto package checks, outbox sync. `public/sw.js` caches the application shell.
- Pages are grouped by role: voter (`Dashboard`, `CheckRequest`), BLO (`Admin`), ERO (`EroDecisions`), DEO (`DeoDesk`), RO (`RoDesk`), candidate and agents, ECI (`EciDashboard`, `EciElections`, `StaffAssignments`), poll day (`PollDay`, `PresidingOfficer`), `ControlRoom`, `Counting`, `Results`, `Training`, `TrainingSimulator`.

## Deployment shapes

| Shape | Live updates | Device offline sweep | Notes |
| --- | --- | --- | --- |
| Long-running Node (`npm start`) | Socket.IO | every minute, plus on each control-room load | Recommended for poll day. |
| Vercel (`vercel.json`) | none (screens poll) | on each control-room load | Serverless functions cannot hold WebSockets. |

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).
