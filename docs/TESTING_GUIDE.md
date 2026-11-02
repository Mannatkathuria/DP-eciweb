# Testing guide

## Running the tests

The backend suite uses Node's built-in test runner and talks HTTP to the real Express app against a **disposable** Redis. Never point it at real data.

```bash
redis-server --port 6390 --save "" --daemonize yes
redis-cli -p 6390 flushall
cd backend
REDIS_URL=redis://127.0.0.1:6390 ACCESS_TOKEN_SECRET=x node src/seed.js   # some tests use seeded stations
TEST_REDIS_URL=redis://127.0.0.1:6390 npm test
```

Without `TEST_REDIS_URL` the Redis-backed tests are skipped and only the pure unit tests run. Files run in parallel; each test file uses its own constituency, so they do not collide.

Frontend: `cd frontend && npx vite build` checks that every page compiles.

## What is covered (115 tests)

| File | Tests | Covers |
| --- | --- | --- |
| `backend.test.js` | 8 | identity credential comparison (discrepancy grading, sandbox outcomes), health and validation, EPIC-only sign-in |
| `registration.test.js` | 5 | constituency dataset, booth assignment validation, register → BLO verification → ERO approval end to end |
| `form6.test.js` | 11 | complete Form 6 storage, masked status, Aadhaar handling, invalid and repeated submissions, documents visible to assigned officials only and deleted after the decision |
| `blo-auth.test.js` | 3 | BLO password, OTP, temporary password, anti-forgery header |
| `blo-decisions.test.js` | 28 | rejection reasons, locks and concurrency (one EPIC per approval), field verification, ERO/AERO-only decisions, jurisdiction, Form 8, information requests and re-verification |
| `workflow-integration.test.js` | 4 | document sanity check, Form 8 reflected in the roll, Persona cases, legacy poll-day verification preventing double voting |
| `phase1.test.js` | 8 | qualifying dates and eligibility, minimal source records, BLO routing, roll diffs, the full new-elector pipeline, rescreening, roll versions |
| `phase2.test.js` | 7 | elections, stations (proposer cannot approve), assignments, ARO delegation, validity windows |
| `phase3.test.js` | 6 | poll day: station scoping, fuzzy search, marking, exceptions, queue, VAB slips |
| `phase4.test.js` | 4 | alerts, control room scoping by jurisdiction, incidents, sector officer visits |
| `phase5.test.js` | 4 | result sources, nothing before counting day, reconciliation, mock labelling |
| `phase6.test.js` | 8 | production config checks, training modules, training simulator, scenarios content, security headers, audit integrity |
| `phase7.test.js` | 7 | step-up (and the production check), agents, search ranking, anti-forgery header and the legacy admin, suspension and parliamentary constituencies, what a voter cannot read |
| `realtime.test.js` | 4 | device registration and heartbeats, offline sweep, revocation, event visibility, Socket.IO jurisdiction filtering |
| `offline.test.js` | 3 | signed and encrypted station packages, sync idempotency and conflicts, presiding officer assistant, public queue |
| `queue.test.js` | 2 | service rate and wait estimate |
| `counting.test.js` | 3 | counting plan, randomisation, rounds, discrepancies, observer reports, VVPAT draw, who cannot edit counting or results |

### Directive security checks and where they are tested

| Check | Test |
| --- | --- |
| A BLO cannot approve a registration | `blo-decisions.test.js` |
| A voter cannot see another voter's record | `phase7.test.js` (12 protected reads refused, another person's request not found), `form6.test.js` (documents) |
| A candidate cannot change results | `counting.test.js` (results sources and entries) |
| A counting agent cannot edit counting data | `counting.test.js` |
| A presiding officer cannot reach an unrelated station | `phase3.test.js`, `offline.test.js` |
| An observer cannot modify records by viewing them | `counting.test.js`, `phase4.test.js` |
| A technical administrator cannot reach restricted records | `phase7.test.js` (legacy admin), `phase0` fixes S1–S2 |
| Expired assignments cannot act | `phase2.test.js` (validity window), `phase7.test.js` (suspension) |
| Direct API calls cannot bypass frontend permissions | every test calls the API directly |

## Browser checks

Each screen added in this work was exercised in headless Chromium with Playwright against a seeded local stack:
- the control room with live updates and device connectivity;
- offline marking with the network cut, then sync and a conflict;
- the presiding officer assistant;
- counting;
- the Hindi queue view.

These scripts are not part of the repository. An automated browser end-to-end suite is listed in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).
