# ECIWEB project audit

**Audit date:** 2 November 2026 · **Branch:** `feature/phase0-authority` · **Scope:** the whole repository (`backend/`, `frontend/`, `docs/`, `ECIWeb_Research/`, deployment files).

This audit was made by reading the code and running it, not from the project description. It covers the state of the code **after** the earlier phases on this branch (Phases 0–6 of the first plan, and the gap fixes that followed). Where the directive assumed something that is not true of this codebase, this document says so.

Status key: ✅ works and is tested · 🟡 partly works · ❌ missing · 🧪 demo or synthetic only · ⛔ blocked on something outside the project.

## 0. Corrections to the directive's assumptions

| Directive says | Actual codebase |
| --- | --- |
| Backend uses MongoDB and Mongoose | **No MongoDB or Mongoose anywhere.** Redis (node-redis v5) is the only data store, used as a document store with JSON values, sets as indexes, `MULTI` transactions and `SET NX` locks. The project owner chose to stay on Redis for now (2 November 2026). Every place the directive says MongoDB is recorded in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). |
| Redis "integration" and helpers | Redis is the system of record, not a cache. |
| Socket connections may be present | There were none. Live screens polled every 10–15 seconds until Phase 5 of this directive. |
| Persona verification | Present: Persona inquiry flow, a signed webhook (HMAC checked), and a demo mode that labels results "simulated". |
| Notification implementation | Only a demo feed that shows OTPs to the browser, which is off unless `ENABLE_DEMO_OTP_NOTIFICATIONS=true` outside production. No SMS or email gateway. |
| Existing tests | Present: Node's built-in test runner with HTTP-level tests against a disposable Redis (`TEST_REDIS_URL`). |

## A. Existing functionality by module

| Module | State | Notes |
| --- | --- | --- |
| Public site (home, voters, states, media, roles) | 🧪 | Static content and navigation. `Media`, `Home` and `Roles` use content arrays in the page, which is appropriate for static information. |
| Sign-in | 🟡 | Officials and voters sign in with EPIC + OTP. BLOs use BLO ID + password (scrypt) + mobile OTP and must change a temporary password. **OTPs are only printed to the backend log** (no SMS gateway) and are kept in process memory (see S3). |
| Roles and authority | ✅ | 33 roles in one registry (plus the legacy `admin` account type) (`backend/src/config/roles.js`), assignments with jurisdiction, election and validity window, immediate revocation, server-side `authorize()` plus jurisdiction checks on every protected route. |
| Form 6 registration | ✅ | Full Form 6 fields with documents, Aadhaar encrypted (AES-256-GCM) when a key is set, duplicate guard, AI document review (rule engine, Gemini optional). BLO field verification, ERO/AERO decision, information requests and re-verification. |
| Form 8 corrections and shifts | ✅ | Same split of authority; shifts are decided in the new constituency. |
| Electoral roll | ✅ | Public search with the address hidden, voter's own record, roll versions with hashes and diffs, roll serial numbers per part. |
| New-voter pipeline | ✅ 🧪 | Data source registry, ingestion runs with provenance, prospects kept apart from the roll, four qualifying dates, BLO tasks; **only synthetic sources** (no government feed is authorised). |
| Elections, nominations, candidates | ✅ | Schedules with history, nominations, RO scrutiny (ARO only when the RO is recorded as prevented), withdrawal, published contesting list, candidate-appointed agents. |
| Polling stations | ✅ | DEO proposes, ECI approves (proposer cannot approve), versions, relocation notices, public search by area or EPIC. No map or geographic search. |
| Poll day | ✅ | Station-scoped fuzzy search, guided marking, exceptions with presiding-officer decisions, queue counts, VAB slips with QR. No offline mode until Phase 4 of this directive. |
| Control room | 🟡 | Station status, alerts, incidents, sector officer visits; polled, no device heartbeats until Phase 5. |
| Results | ✅ 🧪 | Read-only, from a registered source: an authorised feed (none exists) or a mock labelled on every view. |
| Training | 🟡 | Role modules with server-marked quizzes, training environment flag. No scenario simulator until Phase 7. |
| cVIGIL-style violation report (`/report-violation`) | 🧪 | **Frontend only.** The reference number is random and nothing is sent anywhere; the page says so. |
| Campaign permissions (`/candidates`, permissions tab) | 🧪 | **Frontend only** sample data; the page says so. |
| Legacy national "voting verification" (`/eci/voting-verification`) | 🧪 | Older national demo of poll-day identity steps. Only completes in demo mode, where every result is labelled simulated. Superseded by `/poll-day`. |
| Legacy ECI dashboard (`/eci/dashboard`) | 🟡 | Lists BLOs and creates BLO accounts. Fixed in this audit: now ECI administrator only, and no dates of birth (S1, S2). |

### Duplication and architecture notes

- Two poll-day implementations exist: the legacy national `voting-verification` flow and the station-scoped `/poll-day` module. The legacy one stays for its tests and demo; new work goes to `/poll-day`.
- Controllers hold most business logic; services exist for authority, audit, eligibility, elections and registration. That is acceptable at this size. The directive's `modules/` folder layout was **not** adopted, to avoid a large move with no functional gain.
- The legacy `admin` account type signs in through the BLO portal and is treated as a BLO for permissions.

## B. API inventory

The full inventory (130 endpoints, generated from the route files) is in [API_DOCUMENTATION.md](API_DOCUMENTATION.md), with method, path, controller, authentication, permissions, step-up and rate limits. Summary:

| Area | Endpoints | Authentication |
| --- | --- | --- |
| Public (elections, stations, candidates, results, turnout, roll search, geography, roles, Form 6 submit and status) | 14 | none, rate-limited |
| Sign-in and sessions (EPIC OTP, BLO password + OTP, step-up) | 14 | mixed |
| Roll administration (Form 6/8 review and decisions, roll versions, BLO tasks, data sources, rescreening) | 27 | session + permission + jurisdiction |
| Election administration (elections, stations, nominations, agents, assignments) | 30 | session + permission + jurisdiction |
| Poll day, control room, results, training, audit | 33 | session + permission + jurisdiction |
| Legacy (ECI dashboard, voting verification, Persona, identity demo) | 12 | session + role, or public demo |

## C. Database inventory (Redis)

All records are JSON strings under one key each; sets act as indexes; lists are append-only logs. See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for fields.

| Record | Key pattern | Index | Notes |
| --- | --- | --- | --- |
| User | `user:{epic or BLO ID}`, `user:id:{id}` | `users:all` | Role, profile jurisdiction (legacy), BLO password hash. |
| Assignment | `assignment:{id}` | `assignments:all`, `assignments:user:{userId}` | Never deleted; revoked keeps history. |
| Elector | `elector:{EPIC}` | `electors:all` | Roll entry. `part-serial:{state}:{ac}:{part}` counters. `epic:allocated:{epic}` claims. |
| Registration (Form 6) | `registration:{id}` | `registrations:all` | Documents at `registration:document:{id}:{category}`, deleted after decision. `registration:pending:{fingerprint}` duplicate guard. |
| Change request (Form 8) | `change_request:{id}` | `change_requests:all`, `user:change_requests:{epic}` | |
| Identity verification | `verification:{id}` | `verifications:all` | Persona cases. |
| Roll version | `rollversion:{id}` | per area | Hash chain per area. |
| Data source, ingestion run, prospect, BLO task | `datasource:`, `ingestion:run:`, `prospect:`, `regtask:` | `*:all` | |
| Election, station, nomination | `election:`, `station:`, `nomination:` | `*:all` | `contesting:{election}:{area}`, `scrutiny-delegation:{election}:{area}`. |
| Poll state, cases, register | `poll:*`, `voted:*` | per station | `vab-slip:{id}` expires after the poll. |
| Incidents | `incident:{id}` | per election | |
| Result sources and entries | `resultsource:{id}` | `resultsources:all` | Entries append-only. |
| Audit events | `audit:event:{id}` | `audit:events` (list), `audit:resource:{type}:{id}` | SHA-256 per event, integrity check endpoint. |
| Locks | `*:lock:{id}` | — | `SET NX PX`, released by token. |

**Missing constraints compared with a relational or document database:** no schema enforcement at the store (validation is in controllers), no secondary indexes beyond sets (lists are filtered in memory, acceptable at prototype scale, not at national scale), no geospatial or text index, no TTL except on slips, OTP challenges and locks. All are recorded in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## D. Frontend inventory

| Route | Page | Backend | Mock or hard-coded data |
| --- | --- | --- | --- |
| `/home`, `/voters`, `/states`, `/states/:slug`, `/media`, `/roles` | Public pages | `/public/*`, `/auth/geography` for states | Static content arrays (information, not records) |
| `/report-violation` | Violation report | **none** | Categories and a sample queue; random reference |
| `/candidates` | Know your candidate | `/public/elections`, `/public/candidates` | Campaign permissions tab is sample data |
| `/results` | Results and counting | `/public/results`, `/public/turnout` | None (mock source is labelled) |
| `/register`, `/check-request` | Form 6 and status | `/auth/register`, `/auth/register/:id`, `/auth/register/:id/information` | None |
| `/electoral-roll`, `/booths` | Roll and station search | `/electors/search`, `/public/stations` | None |
| `/signin`, `/signin/:role`, `/login/otp`, `/blo/*` | Sign-in | `/auth/*`, `/verification/otp/*` | None |
| `/dashboard`, `/verify` | Voter | `/electors/me`, `/changes`, `/persona/*` | None |
| `/admin` | BLO | `/admin/*`, `/registration-tasks` | None |
| `/ero` | ERO/AERO | `/admin/*`, `/roll-versions`, `/registration-tasks` | None |
| `/deo`, `/ro`, `/candidate`, `/agent` | District, RO, candidate, agents | `/polling-stations`, `/assignments`, `/nominations`, `/agents` | None |
| `/eci/dashboard`, `/eci/elections`, `/eci/integrations` | ECI administrator | `/eci/*`, `/elections`, `/integrations`, `/results`, `/audit/integrity` | None |
| `/eci/voting-verification` | Legacy poll-day demo | `/voting-verification/*` | Demo mode only |
| `/poll-day` | Polling party, VAB | `/poll-day/*` | None |
| `/control-room` | Control room | `/control-room/*` | None |
| `/training` | Training | `/training/*` | Module content in `config/training.js` |
| `/workspace` | Other roles | `/assignments/me` | Placeholder workspace for roles without a dedicated screen |

**Buttons without actions:** none found in the officer screens. The violation report and campaign permission forms complete locally only and are labelled as sample data.

## E. Security audit

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| S1 | `/eci/*` and `/voting-verification/*` used `requireRole("eci", "admin")`. The legacy `admin` account otherwise has only BLO permissions, so it could create BLO accounts and list electors nationwide (**role escalation**). | High | **Fixed** in this audit: `/eci/*` requires `role:assign`; `/voting-verification` is ECI administrator only. Test added. |
| S2 | `/eci/voters` returned every elector's date of birth to the national technical administrator. | Medium | **Fixed**: age only. |
| S3 | OTPs are kept in process memory and printed to the log. On serverless or multi-instance hosting a code issued by one instance is unknown to another, and there is no SMS gateway, so production sign-in cannot work. | High | ⛔ Needs an SMS gateway (DLT-registered sender) and moving OTP state to Redis. Recorded in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). |
| S4 | Session JWT lasts 8 hours, is kept in `localStorage` (readable by any XSS) as well as an httpOnly cookie, and logout does not revoke it (only a BLO password change does). | Medium | Open. Mitigated by step-up tokens (10 minutes, memory only) for sensitive approvals. Planned: short access token with refresh rotation and a revocation list. |
| S5 | **CSRF:** the session cookie is `SameSite=None` in production and the server also parses URL-encoded bodies, so a cross-site form could have posted with the cookie. | High | **Fixed**: a cookie-only session must send `X-Requested-With: XMLHttpRequest` on any state-changing request; the frontend sends it; CORS refuses other origins. Test added. |
| S6 | Password hashing | — | ✅ scrypt with a per-password salt; constant-time comparison. |
| S7 | IDOR | — | ✅ Every record lookup is followed by a jurisdiction check (`assertCovers`) or an owner check; station context comes from the caller's assignment, never from an id alone. |
| S8 | File uploads | — | ✅ Images and PDFs checked by magic bytes and size on the server; Form 6 documents deleted after decision. Legacy identity upload uses multer with a MIME allow-list and size limit. |
| S9 | Personal data exposure | — | ✅ Public search hides addresses; public candidate list has no date of birth or EPIC; VAB QR codes hold only an opaque reference. |
| S10 | Administrative access | — | ✅ The ECI administrator has no roll-decision, scrutiny or result-declaration permission; approvals of stations it proposes are not possible (separation of duties). |
| S11 | Audit logging | — | ✅ Every state change writes an append-only audit event with a SHA-256 hash; `/audit/integrity` recomputes them. Operational and security events share one store (open). |
| S12 | Security headers | — | ✅ Set since Phase 6 (`nosniff`, frame denial, referrer policy, HSTS in production). |
| S13 | Rate limits | — | ✅ Sign-in, registration, OTP and public lookups are limited per IP. Limits are per instance (in memory). |

## F. Deployment audit

| Item | Finding |
| --- | --- |
| Vercel | Frontend: static build with a rewrite of `/api/*` to the backend deployment and SPA fallback. Backend: `@vercel/node` serverless function wrapping the Express app. |
| API base URL | `VITE_API_URL`, default `http://localhost:8000/api/v1`. |
| Environment variables | Documented in `backend/.env.example`; full list in [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md). Production start-up refuses unsafe settings (`checkConfig`). |
| Database connectivity | Redis via `REDIS_URL` (Upstash or Redis Cloud in production). MongoDB: not used. |
| Production cookies | `httpOnly`, `secure`, `SameSite=None` in production. |
| Background jobs | None scheduled. Serverless functions cannot run timers or workers; rescreening and imports are API calls. |
| Socket.IO | **Not compatible with Vercel serverless functions** (no long-lived connections). Phase 5 adds Socket.IO for a long-running Node host and keeps polling as the fallback, so the Vercel deployment still works. |
| In-memory state | OTP codes and rate-limit counters are per instance (S3, S13). |

## G. What this audit changed

- S1, S2 and S5 fixed, with tests.
- The rest of the findings are carried into [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) and [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## H. After the audit (3 November 2026)

The phases that followed this audit added these screens and fixed one more defect. Module details are in the workflow documents listed in [README.md](README.md).

| Route | Page | Backend |
| --- | --- | --- |
| `/poll-day` (device panel, offline desk) | Device registration, heartbeats, station package, offline marking, conflicts | `/devices/*`, `/poll-day/package`, `/poll-day/sync`, `/poll-day/sync-conflicts` |
| `/poll-day/presiding-officer` | Presiding officer assistant | `/poll-day/assistant`, `/poll-day/checklists/:kind`, `/poll-day/procedures` |
| `/control-room` (live, connectivity, filters, escalation) | Control room | `/control-room`, `/events`, Socket.IO |
| `/counting` | Counting operations | `/counting/*` |
| `/training/poll-day` | Training simulator | `/training/scenarios`, `/training/runs/:id/submit`, `/training/report` |
| `/booths` (queue button) | Public queue estimate | `/public/stations/:id/queue` |

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| S14 | The audit integrity check read the event list and the event counter in two separate commands, so an event written between them made the check report the trail as tampered while the system was busy. | Medium (false alarm, would erode trust in the check) | **Fixed**: both are read in one transaction. |
