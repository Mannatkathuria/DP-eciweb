# Poll-day operations

Everything at a polling station is scoped to the caller's own station assignment: the station is resolved from the assignment, never from an id the client sends, so nobody can act on another station by changing a parameter.

## The polling party and what each may do

| Role | On the poll-day screen (`/poll-day`) |
| --- | --- |
| Presiding officer | Everything below, plus: record the mock poll, open and close the poll, decide doubts, challenges and offline conflicts, record tendered votes, checklists, the assistant (`/poll-day/presiding-officer`) |
| Polling officer | Search the part, guided marking, raise an identity doubt, report the queue, register a device, work offline |
| Micro observer | Read the station, report incidents |
| Polling agent | Read the station, challenge an elector's identity |
| BLO at the voter assistance booth | Search the part and issue a locator slip (no marking) |

## Order of the poll

`not_started` → `mock_poll_done` (with a note) → `open` → `closed`. Only the presiding officer moves it, only on poll day, and only forward. Closing records the number of entries in the register. Each change emits `POLL_STATUS_CHANGED`.

## Finding and marking an elector

- **Search** (`GET /poll-day/electors?q=&field=`): fuzzy across name, relative's name, house number, serial number and EPIC, with spelling aliases (for example Mohd/Md → Mohammad, Kr → Kumar), phonetic matching and edit distance. The match shows which field matched. Only electors of the station's part are searchable.
- **Guided marking** (`POST /poll-day/electors/:epic/mark`): identity document chosen from the notified list, "matches the photograph" and "ink applied" both confirmed. The server refuses if the poll is not open, the elector is not in the part, is already marked anywhere in this election, or has an open or adverse doubt or challenge. The register entry gets the next serial; the live event carries only the count (`TURNOUT_UPDATED`).

## Exceptions

`POST /poll-day/cases`: identity doubt, challenged vote (agents may only challenge), tendered vote (presiding officer only), assisted voter with a companion, name not in this part, other. Blocking cases stop marking until the presiding officer decides (`POST /poll-day/cases/:id/resolve`, reason required). Each emits `EXCEPTION_CREATED` / `EXCEPTION_RESOLVED`.

## Queue

The polling party reports how many people are waiting (`POST /poll-day/queue`). The estimate (`services/queue.service.js`) divides that count by the station's **measured** service rate: register entries in the last 30 minutes, over the span actually observed (at least 5 minutes), with offline marks counted at the time the officer acted. Fewer than 3 marks gives "not enough data"; a report older than 30 minutes is "stale". Shown on the poll-day screen, in the control room and to voters (`GET /public/stations/:id/queue`, anonymous counts only). It is not turnout data.

## Voter assistance booth

The BLO looks up the elector and prints a slip with the part, serial number and station (`POST /poll-day/vab-slips/:epic`). The QR code holds only an opaque reference (`ECIWEB-SLIP:<random>`), never the EPIC or address; a polling officer of the same station can look it up (`GET /poll-day/vab-slips/:slipId`). The slip expires after poll day and clears from the kiosk screen after a minute.

## Presiding officer assistant

`/poll-day/presiding-officer`:
- Readiness, equipment and closing checklists, saved per station and audited (`POST /poll-day/checklists/:kind`).
- The polling party and agents assigned to the station.
- A procedure library (`GET /poll-day/procedures?q=`). Every entry names its source (Conduct of Elections Rules, 1961; Representation of the People Act, 1951; the ECI Handbook for Presiding Officers) and the library version.

**Every entry is marked "unreviewed".** The entries are plain-language paraphrases. They must be checked against the current official handbook by an authorised official before any live use. The assistant retrieves and explains; it never decides eligibility, challenges or any statutory matter.

## Incidents

Reported from the station (`POST /control-room/incidents`) and handled in the control room; see [CONTROL_ROOM.md](CONTROL_ROOM.md).

## Offline

When the connection fails, registered devices keep working from a signed, encrypted station package; see [OFFLINE_ARCHITECTURE.md](OFFLINE_ARCHITECTURE.md). The paper marked copy of the roll and the register of voters (Form 17A) remain the legal record in every case.
