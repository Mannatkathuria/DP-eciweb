# Known limitations

ECIWEB is a prototype with synthetic data. It is not connected to any ECI system and has no legal standing. This list is deliberately complete: what is missing, what is blocked, and where the build departs from the directive.

**Blocks production** marks items that must be resolved before any real use.

## Where the directive said MongoDB

The project stays on **Redis** by the owner's decision (2 November 2026). Each place the directive specified MongoDB, and what was done instead:

| Directive (section, line) | Said | Instead |
| --- | --- | --- |
| §2 Existing context (l. 126–127) | Backend uses MongoDB and Mongoose | The codebase never used MongoDB; Redis is the store. |
| §2 Existing context (l. 171) | Mongoose models | Repositories in `backend/src/repositories/` hold the key layout; validation lives in the controllers. |
| §3 Audit (l. 254) | Audit MongoDB connectivity | Redis connectivity audited instead ([PROJECT_AUDIT.md](PROJECT_AUDIT.md)). |
| §8 Polling stations (l. 724) | MongoDB GeoJSON and 2dsphere indexing | **Not done.** Stations store an optional `{lat, lng}`; there is no geographic search. Redis GEO commands could provide it. |
| §17 Control room (l. 1069) | Persist operational events in MongoDB | Persisted in Redis (`ops:event:*`, sorted set `ops:events`) in the same transaction as the change. |
| §23 Database architecture (l. 1617) | Use MongoDB and Mongoose consistently | Redis used consistently; see [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md). |
| §24 Real-time (l. 1691) | MongoDB as authoritative persistence | Redis is the authoritative store; the pub/sub channel only signals changes. |

Consequences of Redis as the system of record:
- no schema enforcement in the store;
- lists are filtered in memory (fine for a prototype, not for national scale: every elector in one set);
- no secondary, text or geographic indexes;
- memory sizing and persistence (AOF, backups) must be planned.

A migration path is in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

## Blocked on something outside the project

| Item | Why | Blocks production |
| --- | --- | --- |
| OTP delivery by SMS | No DLT-registered sender or gateway contract. Codes are printed to the server log and kept in process memory, so they also fail on multi-instance or serverless hosting (S3). | **Yes** |
| ERONET, ENCORE, results website, turnout feeds | No authorised API or agreement; ECIWEB will not scrape. | Yes, for real data |
| Aadhaar authentication | Needs a UIDAI licence | No (Aadhaar is optional) |
| Registries for prospective electors | Each needs its own legal basis and agreement | No |
| Official procedure text | The Handbook for Presiding Officers is not loaded. The procedure library paraphrases the Rules and is marked unreviewed. | **Yes**, for the assistant |
| Persona production use | Sandbox only | No |

## Platform limits

- **Vercel:** no Socket.IO and no background timers. Screens poll, and the device offline sweep runs on control-room loads. Rate limits and OTPs are per instance.
- **Rate limits** are in memory per instance (S13).
- **Sessions** last 8 hours, are kept in `localStorage` as well as a cookie, and are not revoked on logout (S4). Step-up limits the damage for approvals. **Blocks production.**
- **Device key storage:** the device secret sits in browser storage beside the encrypted package; a hardware keystore or PIN is needed (T7).
- **Audit hashes** are per event and counted, but not chained or anchored outside the database (T14).
- **Ed25519 in WebCrypto** needs a current browser; older browsers cannot use offline packages.

## Functional gaps against the directive

| Area | Gap |
| --- | --- |
| Roll | Form 7 (objection or deletion) is not implemented. No bulk deletion workflow. |
| Polling stations | No map view or geographic search (see MongoDB row above). |
| Notifications | Only a demo feed. There is no SMS, email or push delivery, so "the voter receives a notification" is shown in the app only. |
| Counting | No postal-ballot workflow, no Form 20 compilation. Vote figures are deliberately not entered. Counting is tracked per assembly constituency, not aggregated per parliamentary constituency. |
| Results | Only mock data, because no authorised source exists. |
| Dashboards (§21) | Nine roles use the generic workspace (`/workspace`) instead of a dedicated dashboard: booth level agent, BLO supervisor, sector police officer, district and State nodal officers, district police officer, State police nodal officer, police observer and expenditure observer. |
| Frontend components (§25) | The directive's component list (DashboardLayout, DataTable, MapView and so on) was not built as a separate library. Pages use shared CSS classes and a few shared components (PageHead, ReasonDialog, StepUpDialog, StationDevice, AgentAppointments). |
| Translations | Officer screens (control room, poll day, counting, RO and DEO desks, training) are in English only. Voter screens are fully translated into Hindi and Punjabi, and partly into Kannada, Tamil and Telugu. New Hindi and Punjabi text was written without a native-speaker review. |
| Training | Scenarios are single-path multiple choice with fixed content; there is no branching simulation of live screens. |
| Tests | No automated browser end-to-end suite in the repository; browser checks were run by hand with Playwright. No load tests. |
| Legacy pages | `/report-violation` and the campaign-permissions tab are frontend-only samples (labelled). `/eci/voting-verification` is a legacy demo superseded by `/poll-day`. |

## Repository hygiene

- `backend/dump.rdb` (a Redis snapshot) is committed from before this work. It should be removed from the repository and added to `.gitignore` after checking it holds nothing needed.
- `dp.zip` at the repository root is an archive from before this work.
