# What Redis stores and what MongoDB stores

ECIWEB uses two databases with different jobs.

- **Redis is the system of record.** Every decision, every workflow state and every security check reads and writes Redis, in `MULTI` transactions with short locks. If MongoDB is missing, nothing authoritative is lost.
- **MongoDB holds read models and archives.** These are copies of committed Redis data, built for queries Redis is bad at: geographic search, text search, and long histories filtered by time and jurisdiction. MongoDB is optional (`MONGODB_URI`) and can be rebuilt from Redis at any time with `npm run mongo:sync`.

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

No personal data is added in MongoDB that is not already in Redis, and the same jurisdiction rule (`coversAny`) is applied to every MongoDB result before it is returned: MongoDB only narrows the candidates.

## How data reaches MongoDB

1. A change is committed to Redis. In the **same transaction**, the station id or event id is queued (`mongo:outbox:*`). The audit trail needs no queue: it is an append-only list, and a cursor records how far it has been copied.
2. The **projector** (`backend/src/services/projector.service.js`) copies the queued records into MongoDB. One instance runs at a time (Redis lock), every write is an upsert by id, and it can be re-run safely. It runs every 3 seconds on a long-running server, after each response on serverless hosting, and before every MongoDB query (so a query sees what was just committed).
3. Each audit entry archived extends the chain `chain_n = SHA-256(chain_{n-1} + hash_n)`, and a checkpoint is stored. The integrity check replays the chain from Redis and compares: an audit event rewritten in Redis, even with a recomputed hash and counter, breaks the chain at that entry, and removed entries show as truncation.

## When MongoDB is not configured or not reachable

Each MongoDB query has a Redis fallback that gives the same answer more slowly, and every response says which store answered (`source: "mongodb"` or `"redis"`). The limits of the fallbacks: event history and audit search look only at the latest 2 000 Redis entries, and the hash-chain check is reported as "not checked".
