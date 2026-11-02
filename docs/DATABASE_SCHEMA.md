# Database schema (Redis)

Redis is the system of record. Every record is a JSON string under one key; sets are indexes; lists are append-only logs; sorted sets order the event log. Changes that touch several keys are written in one `MULTI` transaction. Short `SET NX` locks (`*:lock:*`, released by token) serialise edits to the same record.

> The directive specified MongoDB collections. This project stays on Redis by the owner's decision. Each MongoDB "collection" in the directive maps to a key family below. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## People and authority

| Key | Type | Fields / meaning |
| --- | --- | --- |
| `user:{EPIC or BLO ID}` and `user:id:{id}` | string (JSON) | `_id, epic, name, role, mobile?, passwordHash? (BLO, scrypt), mustChangePassword, suspended?, suspendedAt/By/Reason, jurisdiction (legacy profile)` |
| `users:all` | set | user ids |
| `assignment:{id}` | JSON | `_id, userId, epic, role, jurisdiction {state, district?, constituency?, pollingStation?, partNumber?, parliamentaryConstituency?}, election?, status (active/revoked), validFrom?, validUntil?, grantedBy, grantedAt, revokedBy?, revokedAt?, reason`; agents add `appointedFor, agentType, candidateName, party, grantedByRole` |
| `assignments:all`, `assignments:user:{userId}` | set | indexes |
| `stepup:{userId}` | string, 3 min TTL | one-time code for re-authentication |
| `scrutiny-delegation:{electionId}:{state|ac}` | JSON | RO's written delegation of scrutiny to a named ARO |

## Electoral roll

| Key | Type | Fields / meaning |
| --- | --- | --- |
| `elector:{EPIC}` | JSON | `_id, epic, name, dateOfBirth, gender, relativeName, relationType, houseNumber, state, district, assemblyConstituency, partNumber, serialNumber, pollingStation, isActive, hasVoted?, votedAt?` |
| `electors:all` | set | EPICs |
| `part-serial:{state}:{ac}:{part}` | counter | next serial number in a part |
| `epic:allocated:{EPIC}` | string | claim on an EPIC number so two approvals can never share one |
| `registration:{id}` | JSON | Form 6 application: applicant fields, `form6` (full form), `documents` metadata, `aiReview`, `status` (pending, field_verified, information_required, approved, rejected), `verification`, `informationRequest`, `previousVerifications`, `decision*` |
| `registration:document:{id}:{category}` | JSON | uploaded document (base64), deleted after the decision |
| `registration:pending:{fingerprint}` | string | duplicate-application guard |
| `change_request:{id}`, `change_requests:all`, `user:change_requests:{EPIC}` | JSON / sets | Form 8 requests (correction, shift, replacement, disability marking) with the same verification and decision fields |
| `rollversion:{id}`, `rollversions:{state|ac}` | JSON / list | published roll versions: `version, hash, previousHash, counts, diff summary, publishedBy` |
| `datasource:{id}`, `ingestion:run:{id}`, `prospect:{id}`, `prospect:ref:{source}:{ref}`, `regtask:{id}` | JSON | new-elector pipeline (see [NEW_ELECTOR_PIPELINE.md](NEW_ELECTOR_PIPELINE.md)) |
| `verification:{id}` | JSON | Persona identity verification cases |

## Elections and stations

| Key | Type | Fields / meaning |
| --- | --- | --- |
| `election:{id}`, `elections:all` | JSON / set | `name, type, states[], schedule {notificationDate, lastDateOfNominations, scrutinyDate, lastDateOfWithdrawal, pollDate, countingDate}, history` |
| `nomination:{id}`, `nominations:all` | JSON / set | candidate nomination, scrutiny decision and capacity (RO or delegated ARO), withdrawal |
| `contesting:{electionId}:{state|ac}` | JSON | published list of contesting candidates |
| `station:{id}`, `stations:all` | JSON / set | `stationCode, state, district, constituency, partNumber, name, address, location, accessibility, status (PROPOSED/ACTIVE/REJECTED), pendingChange, history[], source {version, approvedBy}, relocationNotice` |

## Poll day

`k(e, s)` = `{electionId}:{stationId}`.

| Key | Type | Fields / meaning |
| --- | --- | --- |
| `poll:state:{k}`, `poll:states:{electionId}` | JSON / set | `status (not_started, mock_poll_done, open, closed), history[], queue {waiting, at, by}, queueHistory[], closing {at, votesInRegister}` |
| `poll:register:{k}` | list | register entries `{serial, epic, name, idDocument, at, by, actedAt?, deviceId?, syncedAt?}` |
| `poll:voted:{electionId}` | hash | EPIC → station id (one vote per election) |
| `poll:case:{id}`, `poll:cases:{k}` | JSON / set | exceptions: identity doubt, challenged vote, tendered vote, assisted voter, not in roll; presiding officer's decision |
| `poll:visits:{e}:{s}` | list | sector officer visits |
| `poll:checklists:{e}:{s}` | JSON | presiding officer's readiness, equipment and closing checklists |
| `vab-slip:{id}` | JSON, expires after poll day | voter assistance booth slip (opaque QR reference) |
| `incident:{id}`, `incidents:{electionId}` | JSON / set | incident with severity, escalation level and timeline |
| `device:{id}`, `devices:station:{stationId}`, `devices:all` | JSON / sets | registered device: `label, stationId, tokenHash (SHA-256 of the secret), status, lastHeartbeat {at, packageVersion, pendingOutbox, lastSyncAt, lastSyncError}, lastPackage, lastSync, notified` |
| `package:signing-key:dev` | string | development-only Ed25519 key when `PACKAGE_SIGNING_KEY` is unset |
| `sync:result:{deviceId}:{idempotencyKey}` | JSON, 14 days | first answer to an offline record, returned again for repeats |
| `sync:conflict:{id}`, `sync:conflicts:{e}:{s}` | JSON / set | offline record that clashed with the register; presiding officer's decision |

## Counting and results

| Key | Type | Fields / meaning |
| --- | --- | --- |
| `counting:plan:{electionId}:{state|ac}` | JSON | `centre, halls[{id, name, tables[{no, supervisor, assistant}]}], randomisation {seed, at, by}, reserve, rounds[{no, status, tables[{table, stationId, partNumber, status, countedAt, by}]}], vvpatDraw {seed, witnesses, drawn[]}` (no vote figures) |
| `counting:discrepancy:{id}`, `counting:discrepancys:{e}:{a}` | JSON / set | discrepancy report and the RO's decision |
| `counting:observer-report:{id}`, `counting:observer-reports:{e}:{a}` | JSON / set | counting observer reports |
| `resultsource:{id}`, `resultsources:all` | JSON / set | registered result source: `kind (official_feed, mock), name, status` |
| `results:{electionId}:{state|ac}` | JSON | entries received from a source, append-only, with publication status |

## Audit, events, training

| Key | Type | Fields / meaning |
| --- | --- | --- |
| `audit:event:{id}` | JSON | `at, action, actor {userId, epic, role}, resource {type, id}, jurisdiction, before, after, note, hash (SHA-256 of canonical JSON)` |
| `audit:events` | list | every event id, oldest first |
| `audit:resource:{type}:{id}` | list | one record's history |
| `audit:count` | counter | incremented with every event; the integrity check compares it with the list |
| `ops:event:{id}`, `ops:events` | JSON / sorted set (score = ms) | operational events for live screens (no personal data) |
| `ops:idem:{key}` | string, 7 days | idempotency key of an operational event |
| `training:progress:{userId}`, `training:scenario-history:{userId}`, `training:run:{id}` | JSON | training results; never touch live records |

## Retention

Documents uploaded with a Form 6 are deleted after the decision. Slips, step-up codes, sync results, idempotency keys and training runs expire. Everything else is kept: decisions are append-only and nothing is deleted by the application. See [DATA_PROTECTION.md](DATA_PROTECTION.md).
