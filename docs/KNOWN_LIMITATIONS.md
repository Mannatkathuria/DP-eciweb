# Known limitations

ECIWEB is a prototype with synthetic data. It is not connected to any ECI system and has no legal standing. This list is deliberately complete: what is missing, what is blocked, and where the build departs from the directive.

**Blocks production** marks items that must be resolved before any real use.

## Redis and MongoDB

By the owner's decision (3 November 2026) Redis stays the system of record and MongoDB is added where it is actually needed. What each one stores is in [DATA_STORES.md](DATA_STORES.md).

| Directive (section, line) | Said | Now |
| --- | --- | --- |
| §2 Existing context (l. 126–127, 171) | Backend uses MongoDB and Mongoose | Redis remains authoritative, with repositories in `backend/src/repositories/`. MongoDB is used through the official driver, without Mongoose, for read models only. |
| §3 Audit (l. 254) | Audit MongoDB connectivity | The health endpoint reports both stores and the projector backlog. |
| §8 Polling stations (l. 724) | GeoJSON and 2dsphere indexing | **Done** in MongoDB: `polling_stations.geo` with a 2dsphere index, used by "near a place" search and the station maps. |
| §17 Control room (l. 1069) | Persist operational events in MongoDB | Written in Redis in the same transaction as the change (outbox), then archived in full in MongoDB (`operational_events`) for the event history. |
| §23 Database architecture (l. 1617) | MongoDB and Mongoose consistently | Not done: the transactional workflows stay on Redis. Moving them would mean rewriting every repository and its tests for no functional gain in this prototype. |
| §24 Real-time (l. 1691) | MongoDB as authoritative persistence | Redis is authoritative; MongoDB is a rebuildable copy. |

Consequences:
- MongoDB data can lag Redis by a few seconds (the projector runs every 3 seconds, after each serverless response, and before every MongoDB query).
- With MongoDB absent or down, its features fall back to Redis and say so. Event history and audit search then see only the latest 2 000 entries, and the hash-chain check is "not checked".
- **The MongoDB code paths were tested only in Redis-fallback mode in this build**, because no MongoDB server could be run in the build environment. `tests/readmodel.test.js` runs the same checks, plus tamper detection, against MongoDB when `TEST_MONGODB_URI` is set; run it before relying on MongoDB.
- Redis still filters most lists in memory (fine for a prototype, not for national scale: every elector in one set), has no schema enforcement, and needs memory sizing and persistence (AOF, backups) planned.

## Blocked on something outside the project

| Item | Why | Blocks production |
| --- | --- | --- |
| OTP delivery by SMS | No DLT-registered sender or gateway contract. Codes are printed to the server log (and the demo notification feed when enabled). They are now stored hashed in Redis, so they work across instances. | **Yes** |
| ERONET, ENCORE, results website, turnout feeds | No authorised API or agreement; ECIWEB will not scrape. | Yes, for real data |
| Aadhaar authentication | Needs a UIDAI licence | No (Aadhaar is optional) |
| Registries for prospective electors | Each needs its own legal basis and agreement | No |
| Official procedure text | The Handbook for Presiding Officers is not loaded. The procedure library paraphrases the Rules and is marked unreviewed. | **Yes**, for the assistant |
| Persona production use | Sandbox only | No |
| Map tiles | Station maps use public OpenStreetMap tiles, which have a fair-use policy; production needs its own tile service. | Yes, at scale |

## Platform limits

- **Vercel:** no Socket.IO and no background timers. Screens poll, the device offline sweep runs on control-room loads, and the MongoDB projector runs after each response.
- **Sessions** last 8 hours and are revoked on the server at sign-out (one session, or all of an account's sessions). The token is still kept in `localStorage` as well as the httpOnly cookie, so a script injected into the page could read it until it is revoked or expires. **Blocks production** until the frontend relies on the cookie alone.
- **Device key storage:** the device secret sits in browser storage beside the encrypted package; a hardware keystore or PIN is needed (T7).
- **Audit trail:** each event is hashed and counted in Redis; with MongoDB, a hash chain and checkpoints are kept in a second database. Both databases could still be rewritten by someone controlling both; anchoring checkpoints with a third party (for example a timestamping service) is not done.
- **Ed25519 in WebCrypto** needs a current browser; older browsers cannot use offline packages.

## Functional gaps against the directive

| Area | Gap |
| --- | --- |
| Roll | Form 7 is implemented (objection, notice and reply, BLO report, ERO decision). Not done: the printed Form 9–11A lists, bulk deletion (for example after a death register import), and appeals against the ERO's order. |
| Notifications | Only in the app. There is no SMS, email or push delivery, so "the elector is given notice" of a Form 7 objection means it appears on their Form 7 page. |
| Counting | No postal-ballot workflow, no Form 20 compilation. Vote figures are deliberately not entered. Counting is tracked per assembly constituency, not aggregated per parliamentary constituency. |
| Results | Only mock data, because no authorised source exists. A mock count can be generated only where a list of contesting candidates is published. |
| Dashboards (§21) | Nine roles use the generic workspace (`/workspace`) instead of a dedicated dashboard: booth level agent (who also has the Form 7 page), BLO supervisor, sector police officer, district and State nodal officers, district police officer, State police nodal officer, police observer and expenditure observer. |
| Frontend components (§25) | The directive's component list (DashboardLayout, DataTable and so on) was not built as a separate library. Pages use shared CSS classes and shared components (PageHead, ReasonDialog, StepUpDialog, StationDevice, StationMap, ObjectionsDesk, ApplicationDocuments, AgentAppointments). |
| Translations | Officer screens (control room, poll day, counting, RO, DEO and ERO desks, training, Form 7) are in English only. Voter screens are fully translated into Hindi and Punjabi, and partly into Kannada, Tamil and Telugu. New Hindi and Punjabi text was written without a native-speaker review. |
| Training | Scenarios are single-path multiple choice with fixed content; there is no branching simulation of live screens. |
| Tests | 124 backend tests (123 pass; the MongoDB-only one is skipped without `TEST_MONGODB_URI`). Browser checks (58 page loads across 34 roles, and 8 complete workflows) were run with Playwright from scripts kept outside the repository; there is no browser suite in the repository and no load test. |
| Legacy pages | `/report-violation` and the campaign-permissions tab are frontend-only samples (labelled). `/eci/voting-verification` is a legacy demo superseded by `/poll-day`. The legacy face-match endpoints are off unless `LEGACY_FACE_VERIFICATION=on`. |

## Endpoints without a screen

All 180 endpoints are called from the web app except, by design: `POST /persona/webhook` (called by Persona), `POST /results/sources/:id/entries` (called by a result feed), the legacy face-match routes (off by default), and the retired voting-verification steps, which answer 410 Gone.

## Repository hygiene

- `backend/dump.rdb` (a Redis snapshot) is no longer tracked, and `*.rdb` is ignored. The file itself was left on disk; it is not needed (the seed recreates the demo data).
- `dp.zip` at the repository root is a 22-byte archive from before this work; it was left as is.
