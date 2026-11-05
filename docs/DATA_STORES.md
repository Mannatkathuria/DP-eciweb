# What Redis stores and what MongoDB stores

ECIWEB uses two databases with different jobs.

- **Redis is the system of record for transactional work.** Every decision taken under a lock, every workflow state and every security check reads and writes Redis, in `MULTI` transactions with short locks.
- **MongoDB holds read models and archives** copied from committed Redis data (stations, the electoral roll, nominations, every case-workflow record, the event history, the audit archive), built for queries Redis is bad at. These can be rebuilt from Redis at any time with `npm run mongo:sync`.
- **MongoDB is also the system of record for document and registry data** that needs no multi-key Redis transaction: the reference library, ePlan, EVMs, grievances, seizures, party filings, ETPB ballots, index cards, roll-quality flags, BLO surveys and register, EPIC deliveries and observer profiles (`backend/src/config/docStores.js`, `services/docStore.service.js`). Without `MONGODB_URI` these collections are kept in Redis (`mdoc:*`) with the same unique-key checks; with it set but MongoDB down they answer 503 rather than split the data.

See [ECI_SYSTEMS_COVERAGE.md](ECI_SYSTEMS_COVERAGE.md) for which module stores what, how data moves between modules, and the *Data stores* tab (`GET /api/v1/data-stores`) that compares the two stores live.

## Redis (authoritative)

| Area | What is stored | Keys (see [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)) |
| --- | --- | --- |
| People and authority | Accounts, role assignments with jurisdiction and validity, account suspension, scrutiny delegations | `user:*`, `assignment:*`, `scrutiny-delegation:*` |
| Sign-in and security | One-time codes (stored as a SHA-256 digest with an attempt counter, expiring), revoked sessions, "sign out everywhere" markers, rate-limit counters, step-up codes | `otp:*`, `session:revoked:*`, `session:revoked-before:*`, `rl:*` |
| Electoral roll | Elector entries (a deleted entry is kept, marked inactive, with the order), Form 6 applications and their documents (deleted after the decision), Form 8 corrections, **Form 7 objections**, BLO tasks, published roll versions | `elector:*`, `registration:*`, `change_request:*`, `objection:*`, `regtask:*`, `rollversion:*` |
| Elections and stations | Elections and schedules, nominations, contesting lists, **polling stations** (the authoritative copy) | `election:*`, `nomination:*`, `contesting:*`, `station:*` |
| Poll day | Station poll state, the marked register, exceptions, incidents, visits, devices, offline sync results and conflicts, queue reports | `poll:*`, `device:*`, `devices:station:*`, `sync:*` |
| Counting and results | Counting plans, rounds, discrepancies, observer reports, the VVPAT draw, result sources and feeds | `counting:*`, `resultsource:*`, `results:*` |
| Audit trail | Every authority-bearing action, append-only, each with its own hash; a counter | `audit:event:*`, `audit:events`, `audit:count` |
| Live operations | Recent operational events (outbox, at most 50 000) and the pub/sub channel for live screens | `ops:event:*`, `ops:events`, channel `eciweb:events` |
| Projector bookkeeping | What is waiting to be copied to MongoDB | `mongo:outbox:stations`, `mongo:outbox:events`, `mongo:cursor:audit`, `mongo:chain:audit` |

## MongoDB (read models and archives)

| Collection | Contents | Indexes | Used by |
| --- | --- | --- | --- |
| `polling_stations` | Every station, as in Redis, plus a GeoJSON point `geo` (longitude, latitude) | `2dsphere` on `geo`; area (state, district, constituency, part); status; text on name and address | Public "near a place" search (`GET /public/stations/near`), public search by words (`GET /public/stations?q=`) |
| `operational_events` | The **full** history of operational events (Redis keeps only the latest 50 000) | time; type + time; jurisdiction + time; station + time; election + time | Control room "Event history" (`GET /events/history`) |
| `audit_archive` | Every audit event with its position `seq`, its hash and a running **hash chain** | `seq` (unique); time; action + time; actor + time; resource | "Search the audit trail" (`GET /audit/search`) |
| `audit_checkpoints` | The chain value after each batch archived | `count` (unique) | Audit integrity check (`GET /audit/integrity`) |
| `electors` | The electoral roll, plus folded-name keys and a photo fingerprint | part; name + relative + date of birth; photo; text | PSE/DSE scan (`POST /roll-quality/scan`) |
| `nominations` | Every nomination | election + area + status | Reports, Form 7A, index card |
| `case_records` | Every case-workflow record (`_kind` = permissions, expenditure, complaints, observer reports, directions, security, logistics, nodal, appeals, station issues, eforms) | kind + time; kind + area; kind + status | `store(kind).list()` |

### MongoDB as the system of record

| Collection | Contents | Unique key |
| --- | --- | --- |
| `library_items` | Handbooks, compendium, eBooks, FAQ, training material (text index) | type + slug |
| `eplan_vacancies`, `eplan_holidays`, `eplan_activities`, `eplan_messages` | Vacancies, holidays, plans and their calendars, messages | — |
| `evm_units`, `evm_randomisations` | EVM/VVPAT inventory by serial, randomisation records | serial |
| `grievances` | NGSP grievances | reference |
| `seizures` | ESMS register | agency + document number |
| `party_filings` | Form 24A, audited accounts, election expenditure | acknowledgement |
| `etpb_ballots` | Service voters' postal ballots | ballot id; election + elector |
| `index_cards` | Online Index Cards | election + State + constituency |
| `roll_flags` | PSE, DSE and death flags with notices and orders | fingerprint |
| `station_surveys`, `blo_register`, `epic_deliveries` | BLO App records | — |
| `observer_profiles` | Observer contact and (masked) bank details | epic |

No personal data is added in MongoDB that is not already in Redis, and the same jurisdiction rule (`coversAny`) is applied to every MongoDB result before it is returned: MongoDB only narrows the candidates.

## How data reaches MongoDB

1. A change is committed to Redis. In the **same transaction**, the station id or event id is queued (`mongo:outbox:*`). The audit trail needs no queue: it is an append-only list, and a cursor records how far it has been copied.
2. The **projector** (`backend/src/services/projector.service.js`) copies the queued records into MongoDB. One instance runs at a time (Redis lock), every write is an upsert by id, and it can be re-run safely. It runs every 3 seconds on a long-running server, after each response on serverless hosting, and before every MongoDB query (so a query sees what was just committed).
3. Each audit entry archived extends the chain `chain_n = SHA-256(chain_{n-1} + hash_n)`, and a checkpoint is stored. The integrity check replays the chain from Redis and compares: an audit event rewritten in Redis, even with a recomputed hash and counter, breaks the chain at that entry, and removed entries show as truncation.

## When MongoDB is not configured or not reachable

Reads from a read model first make sure every committed change has been copied (waiting briefly if another instance is copying); if that cannot be confirmed, they are answered from Redis, never from a stale copy. Each MongoDB query has a Redis fallback that gives the same answer more slowly, and every response says which store answered (`source: "mongodb"` or `"redis"`). The limits of the fallbacks: event history and audit search look only at the latest 2 000 Redis entries, and the hash-chain check is reported as "not checked".
