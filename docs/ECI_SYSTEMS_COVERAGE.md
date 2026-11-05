# ECI systems coverage, data placement and data flow

This maps every system and feature in the ECI systems inventory (ERONET, BLO App, eBooks, FAQ, ePlan,
Training Materials, Observer portal and app, ENCORE, cVIGIL, ETPBMS and the Service Voter Portal, NGSP,
the PRO module, ESMS, IEMS and EMS 2.0) to where it is in this platform, which database holds it, and
how data moves from one module to the next. "Simulated" marks what a demonstration cannot do for real
(SMS and email delivery, Aadhaar eSign, India Post tracking, AI photo matching).

## 1. Coverage

| System | Feature in the inventory | Where it is (screen → API) | Store |
| --- | --- | --- | --- |
| **ERONET** | Forms 6, 6A, 7, 8 (and 2, 2A, 3, 6B) received, kept, sent to the BLO and ERO | `/register`, `/voters/forms/*` → `/elector-forms/*`, `/auth/register`, `/changes`, `/objections` | Redis |
| | BLO field verification, ERO/AERO decision, roll updated | Desk *Forms 2-8* (BLO field report, ERO decision) | Redis (roll), MongoDB `electors` copy |
| | Common roll structure, part-wise printing, roll versions | `/electoral-roll`, desk *Roll of your part*, `/roll-versions` | Redis |
| | Tracking an application | `/check-request` → `/elector-forms/status/:ref` | Redis |
| | **PSE / DSE** (photo- and demographically similar entries) | Desk *Duplicates (PSE/DSE) and deaths* → `POST /roll-quality/scan` (MongoDB aggregation over the `electors` read model; Redis fallback) | MongoDB `roll_flags` |
| | Flags are not proof: notice, delivery, hearing, reasoned order | `/roll-quality/:id/notice`, `/notice-delivered`, `/decide` (deletion only after a delivered notice and the hearing date) | MongoDB flag, Redis roll entry |
| | Monitoring: pendency, disposal, officer-wise, roll statistics | Desk overview (`/reports/summary`), ePlan *electoral data at a glance* | computed |
| | Multilingual | Six interface languages (en, hi, pa, kn, ta, te) | — |
| **BLO App** | Assigned forms, checklist, field verification, documents, comments | Desk *Forms 2-8 field verification*, `/admin` BLO workbench | Redis |
| | House-to-house BLO register, National House Number | Desk *House-to-house register and EPICs* → `/field/register` | MongoDB `blo_register` |
| | AMF / EMF survey, GPS, photograph, distances to bus stand, police, fire, hospital, fuel, parking | Desk *Polling-station facilities* → `POST /field/stations/:id/survey` (station summary written back to the station) | MongoDB `station_surveys`; summary on the Redis station (→ map) |
| | PSE/DSE activity, notice delivery and hearings | Desk *Duplicates, deaths and notices* (field finding, notice delivered) | MongoDB `roll_flags` |
| | Death certificate upload | *Report a death* → `POST /roll-quality/death-report` | MongoDB `roll_flags` |
| | EPIC delivery | `POST /field/epic-deliveries` | MongoDB `epic_deliveries` |
| | Training videos after login | `/training`, library training material (Hindi and English video entries) | Redis / MongoDB |
| **eBooks** | Reading, chapters, page-by-page, mobile reader, printing | `/library?type=ebook`, `/library/:slug` (contents, previous/next, arrow keys, print all chapters) | MongoDB `library_items` |
| **Handbooks / Compendium** | Procedures by officer, instructions and circulars | `/library` tabs *Handbooks*, *Compendium*; Commission publishes new versions (desk *Library*) | MongoDB `library_items` |
| **FAQ** | The 16 ECI FAQ categories (Elections, EVM, parties, MCC, … How to Register) | `/library` tab *FAQ* with topic filters; full-text search across the library | MongoDB `library_items` (text index) |
| **ePlan** | Vacancy management, bye-election planning (six months, s. 151A, with the one-year proviso) | Desk *Election planning* → `/eplan/vacancies` | MongoDB `eplan_vacancies` |
| | Upcoming elections, election scheduler, holiday management, security planning | `/eplan/plans` builds the 19-step calendar back from the poll date (roll, EVM FLC and randomisations, CAPF requisition, vulnerability mapping, training, schedule, ETPB, dispatch, poll, counting, index card), checks holidays | MongoDB `eplan_activities`, `eplan_holidays` |
| | Planning and electoral-data dashboards, automatic overdue alerts | `GET /eplan` (alerts: overdue / due in 7 days; electors by State) | MongoDB + Redis roll |
| | SMS / email to State officials | `POST /eplan/messages` (manual or "overdue reminders"), delivery simulated | MongoDB `eplan_messages` |
| | Plan → election | `POST /eplan/plans/:id/announce` writes the election with its statutory schedule | Redis `election:*` |
| **Training Materials** | IT applications, poll process, counting, nomination, paid news, MCMC, vulnerability mapping, EVM/VVPAT, MCC, symbol allotment | `/library?type=training`; practice in `/training` and the poll-day simulator | MongoDB / Redis |
| **Observer portal** | Profile, bank and local contact (bank masked), deployment and dates, nodal-officer contacts | Desk *My portal* → `/observers/me`, `/observers/me/profile` | MongoDB `observer_profiles`; Redis assignments |
| | Arrival, daily, poll-day, post-poll, final and departure reports; review | Desk *Reports to the Commission* (report type) → `/oversight/observer-reports` | Redis → MongoDB `case_records` |
| | Commission instructions and notices | Directions addressed to observers (`/oversight/directions`), shown in *My portal* | Redis |
| | Constituency details, candidate information, Form 7A list, ID card | *My portal* (stations, parts, electors, Form 7A, printable ID card) | Redis |
| **Observer app** | Polling-station numbers, RO office details, cVIGIL information, flying squads on a map | *My portal*, *MCC complaints*, *Flying squads* → `/observers/squads` | Redis (squad positions expire after 30 min) |
| | Public observer contacts | `/observers` → `/observers/public` | MongoDB + Redis |
| **ENCORE** | Candidate profile, nomination form, Form 26 affidavit, criminal antecedents with publicity count, security deposit (₹10,000 / ₹25,000, half for SC/ST), up to four papers | `/candidate` → `POST /nominations` (deposit, antecedents), `/nominations/:id/sets` | Redis → MongoDB `nominations` |
| | Paper nominations digitised by the RO | Desk *Deposits, paper nominations and symbols* → `/nominations/digitise`, `/:id/deposit` | Redis |
| | Scrutiny, withdrawal, ARO delegation | `/ro` → `/nominations/:id/scrutiny`, `/withdraw`, `/scrutiny-delegation` | Redis |
| | Symbol allotment (reserved / free symbols, no clashes) and Form 7A in statutory order | `/nominations/:id/symbol`, `/nominations/contesting` (form 7A, symbol issues listed) | Redis |
| | Suvidha permissions: applicant, nodal officers / police remarks, decision, order | Desk *Campaign permissions* → `/campaign-permissions` | Redis → MongoDB `case_records` |
| | Counting: planning, round-wise entry, postal ballots, tabulation, declaration | `/counting`, `/results` | Redis |
| | **Online Index Card**: pre-filled, validated, 72-hour due date, CEO examination, Commission locks | Desk *Index Card* → `/index-cards` (prepare / edit / submit / examine / finalise), public `/index-cards/public` | MongoDB `index_cards` |
| | Candidate expenditure, DEO scrutiny, shadow register | Desk *Expenditure register*, *Candidates' registers* → `/expenditure` | Redis → MongoDB `case_records` |
| **cVIGIL** | Photo, GPS, time, category, anonymous, reference, tracking; DCC screening and dispatch; flying squad report and seizures; RO disposal; 100-minute clock | `/report-violation`, desk *MCC complaints* → `/complaints` | Redis → MongoDB `case_records` |
| **ETPBMS / Service Voter Portal** | Record Officer: service particulars verified, forwarded to the ERO | Record Officer desk → `/etpb/record-officer/*`; Forms 2, 2A, 3 | Redis eforms |
| | Ballot package (ballot + Forms 13A, 13B, 13C), separate PIN to the Record Officer, download, print, mark on paper | RO desk *Postal ballots* → `/etpb/:electionId/generate`, `/transmit`; voter `/postal-ballot` → `/etpb/download` | MongoDB `etpb_ballots`; PIN in Redis (60 days) |
| | Return by free Speed Post with tracking | `/etpb/return`, `/etpb/track/:ballotId` (India Post tracking simulated) | MongoDB |
| | Received in time / late; authenticity and duplicate prevention at counting | `/etpb/ballots/:id/receive`, `/validate` (scan once, enforced by Redis `SET NX`) | MongoDB + Redis |
| **NGSP** | Citizens, electors, parties, candidates, media, officials file with category, documents, mobile; reference; SMS/email acknowledgement (simulated) | `/grievance` → `POST /grievances` | MongoDB `grievances` |
| | Routing to the right level and office, response, status, time taken, pending monitoring | Desk *Grievances* → `/grievances/:id/route`, `/respond`; 72-hour pending count, average response time | MongoDB |
| | Reopen once if unsatisfied; MCC grievances referred to cVIGIL | `/grievances/track/:ref/reopen`; `cvigilHint`, status *referred to cVIGIL* | MongoDB |
| **PRO module** | Party arrival, mock poll, poll start, turnout, close, station reports | `/poll-day`, `/poll-day/presiding-officer`, desk *Machine log and PO report*, *Polling logistics* | Redis |
| **ESMS** | Cash, liquor, drugs, precious metals, freebies; all agencies; no duplicate entry; reports and analytics | Desk *Seizures* → `/seizures` (unique agency + document number; totals by kind, agency, area, day); district committee release | MongoDB `seizures` |
| **IEMS** | Form 24A (PAN, ₹20,000 threshold, no cash over ₹2,000), audited accounts, election expenditure statements, bulk CSV import, validation, acknowledgement, Aadhaar eSign (simulated), compliance dashboard | Party treasurer desk → `/party-filings`; Commission *Party filings* → `/party-filings/compliance` | MongoDB `party_filings` |
| **EMS 2.0** | Inventory by serial, FLC, first and second randomisation with party representatives, unique machine lists, commissioning, mock poll | Desk *EVMs* → `/evm/units`, `/flc`, `/randomise/first` (DEO), `/randomise/second` and `/commission` (RO), `/evm/stations/:id` (machines of a station) | MongoDB `evm_units`, `evm_randomisations`; Redis lock per randomisation |

New public pages: `/library`, `/library/:slug`, `/grievance`, `/postal-ballot`, `/observers` (aliases `/faq`, `/ngsp`, `/etpbs`).
New roles: `party_treasurer` (PTR1000001), `record_officer` (REC1000001), `enforcement_officer` (ENF1000001).

## 2. Which database holds what

**Redis is the system of record for transactional work**: anything decided under a lock, inside one
`MULTI` transaction with its audit event, or needed in milliseconds. That is accounts and sessions,
OTPs, step-up codes, rate limits, assignments, the electoral roll and all applications, elections,
nominations, polling stations, poll day (register, queue, cases), counting and results, the case
workflows (permissions, expenditure, complaints, observer reports, directions, security, logistics,
nodal work, appeals), the audit trail, live operational events, squad positions, ETPB PINs and the
counting scan-once guard.

**MongoDB has two roles:**

1. **Read models copied from Redis** by the projector (an outbox written in the same Redis
   transaction as the change, so nothing committed is missed): `polling_stations` (geo search, map),
   `electors` (the roll, with folded-name and photo keys for PSE/DSE), `nominations`, `case_records`
   (every case workflow, by kind), `operational_events` (full history), `audit_archive` and
   `audit_checkpoints` (hash chain). Reads wait until the copy has caught up; if it cannot, they are
   answered from Redis, never from a stale copy.
2. **The system of record for document and registry data**: `library_items`, `eplan_*`, `evm_units`,
   `evm_randomisations`, `grievances`, `seizures`, `party_filings`, `etpb_ballots`, `index_cards`,
   `roll_flags`, `station_surveys`, `blo_register`, `epic_deliveries`, `observer_profiles`. Unique
   indexes stop duplicates (one seizure per agency document, one ballot per service voter per
   election, one index card per constituency, one flag per group of entries).

Without `MONGODB_URI` the same document collections are kept in Redis (`mdoc:*`, unique keys
enforced the same way), so the platform runs on Redis alone. With `MONGODB_URI` set but MongoDB
unreachable, document collections answer 503 instead of writing elsewhere and splitting the data.
The ECI desk's *Data stores* tab (`GET /data-stores`) shows the counts in each store and whether
every read model matches Redis.

## 3. How data moves between modules

| From | To | What happens |
| --- | --- | --- |
| Citizen form (Redis) | BLO field report → ERO order → roll (Redis) | Roll entry created or changed in the same transaction as the decision; copied to MongoDB `electors` |
| Roll (MongoDB `electors`) | PSE/DSE scan → `roll_flags` (MongoDB) | Grouped by photo fingerprint or folded name + relative + date of birth + gender |
| `roll_flags` → notice → BLO delivery → hearing | Roll (Redis) | ERO's order marks the entry inactive with the flag id; audit event and live `ELECTORAL_ROLL_UPDATED` event |
| BLO death report (MongoDB) | Same notice and hearing path | Certificate details and copy kept with the flag |
| BLO facility survey (MongoDB) | Station (Redis) → map read model (MongoDB) | Station gets `facilitySurvey` (AMF %, missing items, GPS flag); the station is never moved |
| Eforms 2/2A/3 (Redis) | Record Officer check → ERO → service-voter entry | `electorCategory: service_voter` on the roll |
| Form 7A (Redis) + service voters (roll) | ETPB ballots (MongoDB) | One ballot each; PIN hash with the ballot, PIN in Redis for the Record Officer |
| ETPB ballot | Counting | Scanned once (Redis `SET NX`); counted or rejected with the reason |
| ePlan plan (MongoDB) | Election (Redis) | Announcing writes the election with the calendar's statutory dates; vacancies are marked |
| Stations (Redis) + FLC'd units (MongoDB) | 1st randomisation → 2nd randomisation → commissioning | Units allotted to constituencies, then stations (plus reserve); commissioning needs Form 7A |
| cVIGIL field report (Redis) | ESMS `seizures` (MongoDB) | Each seizure in the squad's report becomes a register entry `source: cvigil`, linked to the complaint |
| Seizures (MongoDB) | District / State / national report | The summary's "seized" tile is the ESMS total |
| Roll + stations + Form 7A + result feed | Index Card (MongoDB) | Pre-filled; validated; RO → CEO → Commission; locked and public |
| Grievance (MongoDB) | Officer by level and jurisdiction | Routed to the ERO/RO, DEO, CEO or Commission; re-routable; MCC matters referred to cVIGIL |
| Any change | Audit trail (Redis) → `audit_archive` (MongoDB) | Hash chain verified against MongoDB checkpoints |

## 4. New endpoints

| Method | Path | Who → handler |
| --- | --- | --- |
| GET | `/api/v1/library` | listLibrary |
| GET | `/api/v1/library/meta` | libraryMeta |
| GET | `/api/v1/library/:slug` | getLibraryItem |
| POST | `/api/v1/library` | "library:manage" → publishLibraryItem |
| POST | `/api/v1/library/:slug/archive` | "library:manage" → archiveLibraryItem |
| GET | `/api/v1/eplan` | ...PLANNERS, "national:view" → eplanOverview |
| POST | `/api/v1/eplan/vacancies` | "plan:manage" → addVacancy |
| POST | `/api/v1/eplan/holidays` | ...PLANNERS → addHoliday |
| POST | `/api/v1/eplan/plans` | "plan:manage" → createPlan |
| POST | `/api/v1/eplan/plans/:id/announce` | "plan:manage" → announcePlan |
| POST | `/api/v1/eplan/activities/:id` | ...PLANNERS → updateActivity |
| POST | `/api/v1/eplan/messages` | ...PLANNERS → sendMessage |
| GET | `/api/v1/roll-quality` | ...READ → listFlags |
| POST | `/api/v1/roll-quality/scan` | "roll:manage" → scanRoll |
| POST | `/api/v1/roll-quality/death-report` | "verification:field-report" → reportDeath |
| GET | `/api/v1/roll-quality/:id/certificate` | "application:decide", "verification:field-report" → flagCertificate |
| POST | `/api/v1/roll-quality/:id/field-check` | "application:decide" → sendForFieldCheck |
| POST | `/api/v1/roll-quality/:id/field-finding` | "verification:field-report" → recordFieldFinding |
| POST | `/api/v1/roll-quality/:id/notice` | "application:decide" → issueNotice |
| POST | `/api/v1/roll-quality/:id/notice-delivered` | "verification:field-report" → recordNoticeDelivery |
| POST | `/api/v1/roll-quality/:id/decide` | "application:decide" → decideFlag |
| GET | `/api/v1/field/lists` | surveyLists |
| GET | `/api/v1/field/surveys` | ...READ → listSurveys |
| GET | `/api/v1/field/surveys/:id/photo` | ...READ → surveyPhoto |
| POST | `/api/v1/field/stations/:stationId/survey` | "station:survey" → surveyStation |
| GET | `/api/v1/field/register` | "verification:field-report", "application:decide", "blo:supervise" → listRegister |
| POST | `/api/v1/field/register` | "verification:field-report" → addRegisterEntry |
| GET | `/api/v1/field/epic-deliveries` | "verification:field-report", "application:decide", "blo:supervise" → listDeliveries |
| POST | `/api/v1/field/epic-deliveries` | "verification:field-report" → recordEpicDelivery |
| GET | `/api/v1/observers/public` | publicObservers |
| GET | `/api/v1/observers/me` | "observer:report" → myObserverPortal |
| POST | `/api/v1/observers/me/profile` | "observer:report" → updateMyProfile |
| GET | `/api/v1/observers/squads` | "observer:report", "complaint:dispatch", "complaint:dispose", "complaint:investigate", "control:view", "expenditure:read" → squadLocations |
| POST | `/api/v1/observers/squads/location` | "complaint:investigate" → reportSquadLocation |
| GET | `/api/v1/index-cards/public` | publicCards |
| GET | `/api/v1/index-cards` | "index:prepare", "index:examine", "index:finalise", "record:read", "national:view" → listCards |
| POST | `/api/v1/index-cards` | "index:prepare" → prepareCard |
| POST | `/api/v1/index-cards/:id` | "index:prepare" → editCard |
| POST | `/api/v1/index-cards/:id/submit` | "index:prepare" → submitCard |
| POST | `/api/v1/index-cards/:id/examine` | "index:examine" → examineCard |
| POST | `/api/v1/index-cards/:id/finalise` | "index:finalise" → finaliseCard |
| POST | `/api/v1/etpb/download` | service voter (ballot id + PIN) → downloadBallot |
| POST | `/api/v1/etpb/return` | service voter (ballot id + PIN) → postBallot |
| GET | `/api/v1/etpb/track/:ballotId` | service voter (ballot id + PIN) → trackBallot |
| GET | `/api/v1/etpb/record-officer/enrolments` | "service:record" → recordOfficerEnrolments |
| POST | `/api/v1/etpb/record-officer/verify/:formId` | "service:record" → verifyServiceParticulars |
| GET | `/api/v1/etpb/record-officer/pins` | "service:record" → recordOfficerPins |
| POST | `/api/v1/etpb/record-officer/pins/:ballotId/collected` | "service:record" → collectPin |
| GET | `/api/v1/etpb` | "etpb:manage", "service:record", "record:read", "state:manage", "national:view" → listBallots |
| POST | `/api/v1/etpb/:electionId/generate` | "etpb:manage" → generateBallots |
| POST | `/api/v1/etpb/:electionId/transmit` | "etpb:manage" → transmitBallots |
| POST | `/api/v1/etpb/ballots/:ballotId/receive` | "etpb:manage" → receiveBallot |
| POST | `/api/v1/etpb/ballots/:ballotId/validate` | "etpb:manage" → validateBallot |
| GET | `/api/v1/grievances/lists` | grievanceLists |
| POST | `/api/v1/grievances` | public (rate-limited) → fileGrievance |
| GET | `/api/v1/grievances/track/:ref` | public (rate-limited) → trackGrievance |
| POST | `/api/v1/grievances/track/:ref/reopen` | public (rate-limited) → reopenGrievance |
| GET | `/api/v1/grievances` | "grievance:handle", "national:view" → listGrievances |
| GET | `/api/v1/grievances/:id/documents/:n` | "grievance:handle" → grievanceDocument |
| POST | `/api/v1/grievances/:id/route` | "grievance:handle" → routeGrievance |
| POST | `/api/v1/grievances/:id/respond` | "grievance:handle" → respondGrievance |
| GET | `/api/v1/seizures` | "seizure:record", "seizure:read", "expenditure:read", "complaint:dispatch", "state:manage", "national:view", "national:manage" → listSeizures |
| POST | `/api/v1/seizures` | "seizure:record" → recordSeizure |
| POST | `/api/v1/seizures/:id/release` | "seizure:release" → releaseSeizure |
| GET | `/api/v1/party-filings/mine` | "party:file" → myFilings |
| POST | `/api/v1/party-filings` | "party:file" → fileReturn |
| GET | `/api/v1/party-filings/compliance` | "party:review", "national:view" → complianceDashboard |
| GET | `/api/v1/party-filings/:id` | "party:file", "party:review", "national:view" → getFiling |
| POST | `/api/v1/party-filings/:id/scrutiny` | "party:review" → scrutiniseFiling |
| GET | `/api/v1/evm` | ...READ → evmOverview |
| GET | `/api/v1/evm/randomisations/:id` | ...READ → randomisationDetail |
| GET | `/api/v1/evm/stations/:stationId` | ...READ, "polling:conduct", "station:view" → stationMachines |
| POST | `/api/v1/evm/units` | "evm:manage" → receiveUnits |
| POST | `/api/v1/evm/flc` | "evm:manage" → recordFlc |
| POST | `/api/v1/evm/randomise/first` | "evm:randomise-first" → firstRandomisation |
| POST | `/api/v1/evm/randomise/second` | "evm:allocate" → secondRandomisation |
| POST | `/api/v1/evm/commission` | "evm:allocate" → commissionUnits |
| GET | `/api/v1/data-stores` | "national:manage", "integration:manage" → dataStoreStatus |
| POST | `/api/v1/data-stores/sync` | "national:manage" → syncNow |

## 5. What to demonstrate

1. **ECI administrator (ECI1234567)** → *Data stores*: every read model "in sync"; document counts in MongoDB. *Election planning*: the Ludhiana West bye-election calendar, a holiday clash warning, overdue alerts, *Announce the election*.
2. **ERO (ERO1000001)** → *Duplicates (PSE/DSE) and deaths*: *Scan the roll*, then take a DSE pair through notice → (BLO) delivery → delete with reasons; the entry disappears from the active roll.
3. **BLO (BLO1000001)** → *Polling-station facilities*: survey a station with GPS and a photo; open `/map` and the station's facilities line; *House-to-house register*; *Report a death*.
4. **DEO (DEO1000001)** → *EVMs*: inventory, FLC, first randomisation with witnesses; **RO (ROF1000001)** → second randomisation, commissioning; the station's machine list.
5. **Citizen** → `/report-violation`; DEO dispatches; **flying squad (FST1000001)** reports a cash seizure → it appears in *Seizures* (DEO, CEO, expenditure observer) tagged cVIGIL.
6. **RO** → *Postal ballots*: generate and transmit; **Record Officer (REC1000001)** reads the PIN; `/postal-ballot` opens, prints and posts it; RO receives and scans it (a second scan is refused).
7. **RO** → *Index Card* for the completed demo bye-election; **CEO (CEO1000001)** verifies; **ECI** finalises.
8. **Citizen** → `/grievance` files and tracks; the RO/ERO answers from *Grievances*; reopen once.
9. **Party treasurer (PTR1000001)** → Form 24A with a bad PAN (rejected row by row), then a good CSV; **ECI** → *Party filings* compliance.
10. **General observer (GOB1000001)** → *My portal*: deployment, officers, Form 7A, ID card, flying squads; *Reports to the Commission* → arrival report.
11. `/library`: search "VVPAT"; open a handbook and page through it; FAQ by topic.
