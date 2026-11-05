# ECI-Web platform report

ECI-Web gives each of 37 election roles its own desk. The desks are backed by 321 API endpoints, and every write checks both permission and jurisdiction on the server.

This report covers the `eciweb2` repository on `main` as of 5 November 2026:

- how the platform is built, and which database holds what;
- who can do what, and every screen and endpoint;
- how each workflow moves from one step to the next, and what each action changes;
- the demo data and a demonstration script.

All data is synthetic. The platform never counts votes or declares results: results come only from a registered source.

## At a glance

| | |
| --- | --- |
| Roles | 37, each with a desk (the voter has a dashboard instead) |
| Demo accounts | 44: one per role, plus DEO Amritsar, DEO Shimla, CEO Himachal, ERO Amritsar East, a second flying squad, and two administrator accounts |
| Frontend routes | 70: 33 public pages, 3 sign-in pages, 18 signed-in work screens and 16 redirects |
| Backend | 52 mounts under `/api/v1`, 321 endpoints (listed in the appendix) |
| Data | Redis is the system of record for transactional work. MongoDB holds search read models and 15 document collections, and Redis stands in when MongoDB is not configured. |
| Tests | 147 tests in 21 suites: 146 pass, 1 is skipped without MongoDB |

## What changed since the last report

The last report covered the map, cVIGIL, roll appeals and the PO's records. Three rounds of work have been added since then.

### 1. The ECI systems, and data across Redis and MongoDB

Every system in the ECI systems inventory now has a working equivalent. `docs/ECI_SYSTEMS_COVERAGE.md` maps each feature to its screen, API and database.

| System | What was added |
| --- | --- |
| ERONET roll quality | Scan for photo- and demographically similar entries (PSE/DSE) and deaths reported by BLOs. Each flag goes through a field check, a notice, proof of delivery and a hearing before the ERO's reasoned order. A flag is never proof by itself. |
| BLO App | House-to-house register, EPIC delivery, and polling-station facility surveys (AMF/EMF) with GPS and photo. The survey summary is shown on the map. |
| eBooks, handbooks, compendium, FAQ, training | A library of 51 items at `/library`, with a chapter reader, full-text search and printing. The Commission publishes new versions from its desk. |
| ePlan | Vacancies and bye-election deadlines (s. 151A), holidays, and a 19-step calendar built back from the poll date. It raises overdue alerts and sends messages (simulated). Announcing a plan creates the election. |
| EMS 2.0 (EVMs) | Inventory by serial, FLC, first randomisation (DEO) and second randomisation (RO), each with party representatives, then commissioning. |
| ENCORE | Security deposit, criminal antecedents, up to four nomination papers, the RO digitising paper nominations, and symbol allotment with Form 7A. |
| Online Index Card | Prefilled from the roll, stations, Form 7A and the result feed, and validated. Prepared by the RO, examined by the CEO, locked by the Commission, then public. |
| ETPBMS | The Record Officer verifies service voters. The RO generates and transmits ballots, with the PIN sent separately. The voter downloads, prints and posts the ballot (`/postal-ballot`), with Speed Post tracking (simulated). Each ballot is received, then scanned once at counting. |
| NGSP grievances | Anyone can file at `/grievance`. A grievance is routed to the right level and office, answered, and can be reopened once. MCC matters are referred to cVIGIL. |
| ESMS seizures | One register for every agency, which rejects a duplicate agency document number. cVIGIL seizures flow in. The district committee can release a seizure. |
| IEMS party filings | Party treasurer role. Form 24A, audited accounts and expenditure statements, CSV import, and a Commission compliance dashboard. |
| Observer portal | Profile, deployment, contacts, the Form 7A list, an ID card, flying squads on a map, and public observer contacts at `/observers`. |
| Data stores | MongoDB read models are copied from Redis through an outbox. 15 document collections live in MongoDB, or in Redis when MongoDB is not configured. The ECI desk's *Data stores* tab checks that every copy matches. |

The round also added three roles: political party treasurer (`PTR1000001`), record officer for service voters (`REC1000001`) and enforcement agency officer (`ENF1000001`).

### 2. BLO sign-in

BLOs no longer have passwords. They sign in like every other official: an EPIC-shaped ID (`BLO1000001`) and a one-time code. Old `BLO-PB-…` IDs are converted by `npm run migrate:blo-ids`, which the seed also runs. The old `/blo/*` pages redirect to `/signin/blo`.

### 3. Citizen assistance and officer workload

| Area | What was added |
| --- | --- |
| Voter Mitra (`/voters`, `/help`) | Ask in English, Hindi or Hinglish, or pick one of 22 services. The answer gives the form, the steps, the documents to keep ready, where to start and the source, with simpler wording and read-aloud. Answers come only from a fixed catalogue, and an unmatched question is pointed to the 1950 helpline. |
| Forms 2 to 8 and Form 6 | Drafts save on the device with Resume / Start again; files and the Aadhaar number are never saved. The review step lists what is still missing. Retrying a submission does not file it twice (`Idempotency-Key`). There is a printable receipt. |
| Document check | Before a file is attached, it is rejected for the wrong format, a type that does not match its name, a damaged image or PDF, too large, or too small to read. It is attached with a warning if it looks blurred, too dark or washed out, low resolution, or cut off at the edges. Nothing the applicant typed is ever changed. |
| Roll search (`/electoral-roll`) | Search by EPIC number; by name, with district, relative's name, gender and age filters; or by constituency, part and serial number. Results show the polling station, its facilities and directions, and the roll's source and last-updated date. Whether someone voted is no longer shown. A personal checklist points each problem to Form 6, 7 or 8 and never changes the roll. |
| Officer inbox | At the top of every desk. It lists every case waiting for the officer across all modules, with a time limit, priority, waiting time and a button to the right panel. Supervisors also see work that has waited more than twice its limit. |
| Workload | Desk tab for ERO, AERO, BLO supervisor, DEO, CEO and ECI. It shows received, pending, awaiting field verification or decision, overdue, average disposal time, repeated verification and reassignments, by officer and by district, plus cVIGIL and grievance disposal. |
| Presiding officer | Organised by phase: before the poll (arrival, equipment, readiness), mock poll, poll, closing and after the poll. Each phase has its checklist, the step that moves the poll on, and its procedures. |

## Structure

| Path | What it is |
| --- | --- |
| `backend/src/app.js` | Express app: security headers, CORS, body limits, every route mount |
| `backend/src/config/roles.js` | The role catalogue: every role, its level, scope, demo ID and permissions |
| `backend/src/config/docStores.js` | The MongoDB document collections and their indexes |
| `backend/src/config/procedures.js` | Presiding officer checklists and the procedure library |
| `backend/src/data/services.js` | Voter Mitra's service catalogue |
| `backend/src/middlewares/` | `verifyJWT` / `optionalJWT`, `authorize(permission…)`, `loadAuthority`, `requireStepUp`, `idempotent(scope)`, rate limits |
| `backend/src/services/authority.service.js` | Jurisdiction rules: does an assignment cover a record? |
| `backend/src/services/workflow.service.js` | Shared helpers for case workflows |
| `backend/src/services/docStore.service.js`, `projector.service.js`, `readModel.service.js` | Document collections, and the Redis-to-MongoDB copy with read-your-writes |
| `backend/src/services/audit.service.js` | Append-only, hash-chained audit trail |
| `backend/src/controllers/`, `routes/` | One controller and one router per workflow |
| `backend/src/seed.js`, `seedData.js`, `seedModules.js` | Demo accounts, assignments and the synthetic dataset |
| `backend/tests/` | node:test suites (a disposable Redis via `TEST_REDIS_URL`) |
| `frontend/src/App.jsx` | Every route |
| `frontend/src/config/desks.js` | Each role's desk: authority, mission, tabs, screens, limits |
| `frontend/src/pages/RoleDesk.jsx` | The `/desk` page, with grouped navigation for larger desks |
| `frontend/src/components/desk/` | Desk panels, including `InboxPanels.jsx` |
| `frontend/src/preflight.js` | The in-browser document check |

**Rule of authority.** Every write checks two things on the server. First, the caller's role carries the permission (`authorize("…")` on the route). Second, one of the caller's active assignments covers the record (State, district, constituency, polling station and election). Seeing a record on a dashboard never implies the right to change it.

## Which database holds what

**Redis is the system of record for transactional work.** That means anything decided under a lock or inside one `MULTI` transaction with its audit event:

- accounts, sessions, OTPs and assignments;
- the electoral roll and all applications;
- elections, nominations, polling stations, poll day, counting and results;
- the case workflows (permissions, expenditure, complaints, observer reports, directions, security, logistics, nodal work, appeals);
- the audit trail and live events.

**MongoDB has two roles.**

1. **Read models copied from Redis** through an outbox written in the same transaction: `polling_stations`, `electors`, `nominations`, `case_records`, `operational_events`, `audit_archive` and `audit_checkpoints`. Reads wait for the copy to catch up and fall back to Redis rather than serve a stale copy.
2. **The system of record for document and registry data:** `library_items`, `eplan_*`, `evm_units`, `evm_randomisations`, `grievances`, `seizures`, `party_filings`, `etpb_ballots`, `index_cards`, `roll_flags`, `station_surveys`, `blo_register`, `epic_deliveries` and `observer_profiles`. Unique indexes stop duplicates.

Without `MONGODB_URI`, the document collections are kept in Redis under `mdoc:*` with the same unique keys, so the platform runs on Redis alone. If `MONGODB_URI` is set but MongoDB is unreachable, those collections answer 503 rather than split the data.

## Roles and their desks

Every official signs in at `/signin/<role>` with an EPIC-shaped ID and a one-time code; in the demo the code is printed in the backend terminal. Every role except the voter lands on `/desk`. The desk shows:

- the legal basis and the officer's assignment;
- their inbox;
- a report for their jurisdiction, where they have one;
- their work tabs and dedicated screens;
- what the login may and may not do.

| Role | Demo ID | Desk tabs (besides Overview) | Dedicated screens |
| --- | --- | --- | --- |
| Voter | ABC1234567 | — (lands on `/dashboard`) | `/dashboard`, `/verify` |
| Candidate | CAN1000001 | Campaign permissions, Expenditure register | `/candidate` |
| Election agent | EAG1000001 | Candidate's nomination, Campaign permissions, Expenditure register | `/agent` |
| Polling agent | PAG1000001 | — | `/poll-day` |
| Counting agent | CAG1000001 | — | `/counting`, `/results` |
| Booth level agent (party) | BLA1000001 | Roll of your part, Polling-station problems | `/objection` |
| Political party treasurer | PTR1000001 | Filings | `/library` |
| ERO | ERO1000001; ERO1000002 (Amritsar East) | Forms 2-8, Duplicates (PSE/DSE) and deaths, Appeal orders, BLOs, Station facilities, Grievances, Polling-station problems, Audit trail, Workload | `/ero` |
| AERO | AER1000001 | Forms 2-8, Duplicates (PSE/DSE) and deaths, Appeal orders, Grievances, Audit trail, Workload | `/ero` |
| BLO supervisor | BLS1000001 | Team and tasks, Field verification, Duplicates and deaths, House-to-house register, Roll, Audit trail, Workload | `/training` |
| BLO | BLO1000001 | Forms 2-8 field verification, Duplicates, deaths and notices, House-to-house register and EPICs, Polling-station facilities, Roll of your part, Polling-station problems | `/admin`, `/poll-day` |
| Record officer (service voters) | REC1000001 | Service voters and PINs | `/voters/forms/form-2`, `/postal-ballot` |
| Returning officer | ROF1000001 | Deposits, paper nominations and symbols, MCC complaints, Campaign permissions, EVMs: 2nd randomisation, Postal ballots, Index Card, Station reports, Seizures, Grievances, Commission directions, Polling-station problems | `/ro`, `/counting`, `/control-room` |
| ARO | ARO1000001 | MCC complaints, Campaign permissions, EVMs, Station reports, Grievances, Polling-station problems | `/ro`, `/control-room` |
| Sector officer | SCO1000001 | Polling logistics, Station facilities (AMF/EMF), EVMs, Polling-station problems, Directions | `/control-room` |
| Sector police officer | SPO1000001 | Security, Police remarks on permissions, Polling logistics | — |
| Flying squad | FST1000001, FST1000002 | Assigned reports, My position, Seizure register | `/report-violation` |
| Enforcement agency officer (ESMS) | ENF1000001 | Seizure register | `/library` |
| Presiding officer | PRO1000001 | Machine log and PO report, Directions | `/poll-day/presiding-officer`, `/poll-day` |
| Polling officer | POL1000001 | Machine log | `/poll-day` |
| Counting supervisor | CSU1000001 | — | `/counting` |
| Counting assistant | CAS1000001 | — | `/counting` |
| DEO | DEO1000001; DEO1000002 (Amritsar), DEO1000003 (Shimla) | Polling-station changes, Station facilities, Station problems, EVMs (warehouse, FLC, 1st randomisation), MCC control room, Flying squads, Seizures, Grievances, Roll appeals, Nodal officers, Station reports, Observer reports, Directions, Permissions, Audit trail, Workload | `/deo`, `/control-room` |
| Deputy DEO | DDO1000001 | MCC control room, Seizures, Grievances, Nodal officers, Permissions | `/control-room` |
| District nodal officer | DNO1000001 (subject: EVM) | Your subject, EVMs, Seizures (expenditure), Polling logistics | `/training` |
| District police officer | DPO1000001 | Security plan, Police seizures, Police remarks on permissions, Directions | — |
| CEO | CEO1000001 (Punjab); CEO1000002 (Himachal) | Election planning, Station proposals to forward, Index Cards to examine, Second appeals, EVMs, Seizures, Grievances, Station reports, State nodal officers, Directions, Audit trail, Workload | `/control-room`, `/states` |
| State nodal officer | SNO1000001 (subject: training) | Your subject | `/training` |
| State police nodal officer | SPN1000001 | Security across the State, Directions | — |
| ECI administrator | ECI1234567 | Election planning, Polling-station approvals, Index Cards to finalise, Party filings, Observer reports, Seizures, Grievances, EVMs, Library, Data stores, Audit trail, Workload | `/eci/dashboard`, `/eci/elections`, `/eci/integrations`, `/eci/voting-verification` |
| Chief election commissioner | CEC1000001 | Observer reports, Directions, Election planning, Seizures, Party filings, EVMs, Audit trail | `/control-room`, `/results` |
| Election commissioner | ELC1000001 | Same as the CEC | `/control-room`, `/results` |
| General observer | GOB1000001 | My portal, Reports to the Commission, MCC complaints, Flying squads, EVMs, Station reports, Roll applications, Permissions, Directions, Audit trail | `/control-room`, `/counting` |
| Police observer | POB1000001 | My portal, Reports to the Commission, Security arrangements, MCC complaints, Flying squads, Seizures, Permissions | — |
| Expenditure observer | EOB1000001 | My portal, Candidates' registers, Seizure register, Complaints, Flying squads, Reports to the Commission | — |
| Counting observer | COB1000001 | My portal, Reports to the Commission, Station reports | `/counting`, `/results` |
| Micro observer | MOB1000001 | My portal, Reports | `/poll-day` |

Most desks also link to `/training` and `/library`.

## Permissions by role

Taken from `backend/src/config/roles.js`. Routes check these permission IDs, never role names.

| Role | Permissions |
| --- | --- |
| voter | roll:view-own, application:submit, application:track, verification:own |
| candidate | nomination:submit, agent:appoint, permission:apply, expenditure:report |
| election\_agent | nomination:assist, agent:appoint, permission:apply, expenditure:report |
| polling\_agent | polling:observe, polling:object |
| counting\_agent | counting:observe, counting:object |
| bla | roll:view-part, roll:claims-objections |
| party\_treasurer | party:file |
| ero | roll:manage, roll:publish, application:decide, blo:assign, audit:read, grievance:handle |
| aero | roll:manage, application:decide, audit:read, grievance:handle |
| blo\_supervisor | blo:supervise, roll:view-part, verification:field-report, audit:read |
| blo | application:review, verification:field-report, roll:view-part, station:survey |
| record\_officer | service:record, application:submit |
| ro | nomination:scrutinise, scrutiny:delegate, candidates:publish, polling:arrange, counting:supervise, result:declare, station:view, control:view, incident:manage, permission:decide, complaint:dispatch, complaint:dispose, index:prepare, etpb:manage, evm:allocate, grievance:handle |
| aro | nomination:scrutinise, polling:arrange, counting:assist, station:view, control:view, incident:manage, permission:decide, complaint:dispatch, complaint:dispose, evm:view, grievance:handle |
| sector\_officer | polling:inspect, logistics:track, station:view, control:view, incident:report, incident:manage, station:survey, evm:view |
| sector\_police\_officer | security:coordinate, logistics:track |
| flying\_squad | complaint:investigate, seizure:record |
| enforcement\_officer | seizure:record |
| presiding\_officer | polling:conduct, polling:report, station:view, incident:report |
| polling\_officer | polling:identify-voter, polling:mark-register, polling:operate-evm |
| counting\_supervisor | counting:supervise-table |
| counting\_assistant | counting:record |
| deo | district:manage, staff:assign, nodal:coordinate, observer:view, audit:read, station:propose, control:view, incident:manage, complaint:dispatch, appeal:decide-first, evm:manage, evm:randomise-first, grievance:handle, seizure:release, seizure:read |
| deputy\_deo | district:manage, nodal:coordinate, station:view, control:view, complaint:dispatch, grievance:handle, seizure:read |
| district\_nodal\_officer | nodal:function-manage, evm:manage, seizure:read |
| district\_police\_officer | security:coordinate, security:plan, seizure:record |
| ceo | state:manage, staff:assign, nodal:coordinate, report:state, audit:read, station:view, control:view, incident:manage, appeal:decide-second, plan:state, index:examine, evm:view, grievance:handle, seizure:read |
| state\_nodal\_officer | nodal:function-manage |
| state\_police\_nodal | security:coordinate, security:plan |
| eci | national:manage, role:assign, blo:assign, verification:review, audit:read, integration:manage, election:manage, station:approve, control:view, library:manage, plan:manage, index:finalise, party:review, evm:view, grievance:handle, seizure:read |
| cec | national:view, report:national, audit:read, control:view, direction:issue, evm:view, seizure:read |
| election\_commissioner | national:view, report:national, audit:read, control:view, direction:issue, evm:view, seizure:read |
| general\_observer | observer:report, record:read, audit:read, control:view, evm:view |
| police\_observer | observer:report, record:read, seizure:read |
| expenditure\_observer | observer:report, expenditure:read, seizure:read |
| counting\_observer | observer:report, counting:read |
| micro\_observer | observer:report, incident:report |

## Frontend routes (70)

### Public (33)

| Route | Page | What it does |
| --- | --- | --- |
| `/` | EntryGate | First visit: sign in or browse; afterwards goes to `/home` |
| `/home` | Home | Landing page, news, quick links |
| `/voters` | Voters | Voter Mitra: ask in your own words or pick a service |
| `/voters/forms` | ElectoralFormsIndex | Index of Forms 2, 2A, 3, 6A, 6B, 7, 8 |
| `/voters/forms/form-2`, `-2a`, `-3` | Form | Service voters |
| `/voters/forms/form-6a`, `-6b`, `-7`, `-8` | Form | Overseas elector; Aadhaar authentication; objection or deletion; shift, correction, replacement EPIC, PwD marking |
| `/register` | Register | Form 6 (new elector) with documents |
| `/check-request` | CheckRequest | Status and timeline of any application (`?ref=` prefills) |
| `/electoral-roll` | ElectoralRoll | Roll search by EPIC, by name, or by part and serial, with the polling station and a checklist |
| `/booths` | Booths | Polling station by EPIC or area |
| `/map` | PollingStationMapPage | Map of approved stations, EPIC lookup, directions |
| `/objection` | Objection | Form 7 objections by signed-in voters and BLAs |
| `/appeal` | Appeal | First and second appeals against an ERO order |
| `/grievance` | Grievance | File and track a grievance (NGSP) |
| `/postal-ballot` | PostalBallot | Service voters: open, print and track a postal ballot |
| `/report-violation` | ReportViolation | cVIGIL report with photo and location, and tracking |
| `/candidates` | Candidates | Contesting candidates, affidavit headlines, Form 7A |
| `/results` | Results | Read-only results from the registered source |
| `/states`, `/states/:slug` | StatesIndex, StatePortal | State and UT election offices |
| `/library`, `/library/:slug` | Library, LibraryReader | Handbooks, compendium, eBooks, FAQ, training material |
| `/observers` | Observers | Observers' public contacts |
| `/media` | Media | Awareness and publications |
| `/roles` | Roles | Roles and what each may do |
| `/training`, `/training/poll-day` | Training, TrainingSimulator | Practice modules and the poll-day simulator |
| `/phone` | PhoneScreen | Phone simulator for demo OTPs |

### Sign-in (3)

| Route | Page |
| --- | --- |
| `/signin` | SignInHub: choose your role |
| `/signin/:roleId` | PortalLogin: EPIC-format ID, then a one-time code (BLOs included) |
| `/login/otp` | LoginOtp |

### Signed-in work screens (18)

| Route | For | What it does |
| --- | --- | --- |
| `/desk` | Every role except the voter | Inbox, report, work tabs; `?tab=<id>` opens a tab |
| `/dashboard` | Voter | Roll entry, applications and their status, identity verification |
| `/verify` | Voter | Identity verification |
| `/admin` | BLO | Form 6 and Form 8 field verification, new-voter tasks |
| `/ero` | ERO, AERO | Form 6, 7 and 8 decisions, new-voter tasks, roll versions |
| `/deo` | DEO | Propose stations and relocations, appoint election staff |
| `/ro` | RO, ARO | Scrutiny, contesting list, delegation, polling parties |
| `/candidate` | Candidate | File, track or withdraw a nomination; appoint agents |
| `/agent` | Election agent, counting agent | Agents and appointments |
| `/poll-day` | Polling party, BLO, polling agent, micro observer | Mock poll, open, mark, queue, cases, close |
| `/poll-day/presiding-officer` | Presiding officer | The day by phase: checklists, poll status, procedures |
| `/counting` | RO, ARO, counting staff, agents, observers | Plan, randomisation, rounds, discrepancies, recount, VVPAT draw |
| `/control-room` | Officials with `control:view` | Stations, alerts, incidents and escalation |
| `/eci/dashboard`, `/eci/elections`, `/eci/integrations`, `/eci/voting-verification` | ECI administrator | Accounts and assignments; elections; data sources and audit integrity; verification review |
| `/workspace` | Fallback | Redirects to `/desk` |

### Redirects (16)

| Old address | Goes to |
| --- | --- |
| `/help` | `/voters` |
| `/faq` | `/library` |
| `/ngsp` | `/grievance` |
| `/etpbs` | `/postal-ballot` |
| `/blo/*` | `/signin/blo` |
| `/login`, `/eci/login`, `/portals`, `/services`, `/cvigil`, `/suvidha`, `/encore`, `/ceo-himachal`, `/workflows`, `/media-publications` | Their current pages |
| anything else | `/home` |

## Backend modules

There are 52 mounts under `/api/v1`. Every endpoint is listed in the appendix.

| Mount | Purpose |
| --- | --- |
| `/auth`, `/verification`, `/persona`, `/notifications` | OTP sign-in for every role, Form 6 intake, step-up, sign-out; identity verification; demo OTPs |
| `/electors` | Roll search (EPIC, name with filters, part and serial) |
| `/assist` | Voter Mitra: service catalogue and questions |
| `/admin`, `/changes`, `/objections`, `/elector-forms` | Form 6 and Form 8 field verification and decisions; Form 8 from the dashboard; Form 7 objections; Forms 2 to 8 |
| `/registration-tasks`, `/integrations`, `/roll-versions` | New-voter pipeline from approved data sources; hashed roll versions |
| `/roll-quality`, `/field` | PSE/DSE and deaths, notices and hearings; BLO register, EPIC delivery, station surveys |
| `/appeals` | s. 24 roll appeals |
| `/assignments`, `/users`, `/eci` | Role assignments, accounts, Commission administration |
| `/elections`, `/eplan` | Election schedule and stage; election planning |
| `/polling-stations`, `/public` | s. 25 workflow, station problems; public reads (map, queue, candidates) |
| `/nominations`, `/agents` | Nominations, deposits, scrutiny, symbols, Form 7A, agents |
| `/campaign-permissions`, `/expenditure`, `/party-filings` | Permissions; candidates' registers and the shadow register; party filings |
| `/complaints`, `/seizures` | cVIGIL complaints; the seizure register (ESMS) |
| `/grievances` | NGSP grievances |
| `/evm` | EVM inventory, FLC, randomisations, commissioning |
| `/etpb` | Service voters' postal ballots |
| `/poll-day`, `/control-room`, `/devices` | Station operations, PO assistant, machine log, PO report, offline package; control room; station devices |
| `/security`, `/logistics`, `/nodal` | Police planning; party and material movement; nodal officers |
| `/oversight`, `/observers` | Observer reports and Commission directions; the observer portal |
| `/counting`, `/results`, `/index-cards` | Counting; read-only results; the Index Card |
| `/inbox` | Officer inbox and workload |
| `/reports`, `/audit`, `/events`, `/data-stores`, `/training`, `/library`, `/voting-verification` | Jurisdiction reports; audit and integrity; live events; store health; training; library; verification review |

## How things move from one step to the next

Every flow follows the same rules:

- Intake is never approval.
- The officer who decides is never the one who reported.
- Only the decision changes the official record.
- Every step writes an audit event.

### Becoming an elector (Form 6)

1. **Applicant** (`/register`, or via Voter Mitra): fills the form. Answers are kept as a draft on the device, every document is checked before it is attached, and the review step lists anything missing. `POST /auth/register` creates a `pending` registration with a reference. A retried submission returns the same reference, and an identical open application is refused.
2. **BLO** (`/admin`): field-verifies it and records the part and polling station. Status becomes `field_verified`; the roll is not changed.
3. **ERO/AERO** (`/ero`): approves with step-up. One transaction creates the elector, the EPIC and the voter account, and deletes the documents. A rejection carries a reason.
4. **Applicant**: follows it on `/check-request` and, once approved, signs in as a voter. They may appeal within 15 days.

### Forms 2, 2A, 3, 6A, 6B, 7 and 8

1. **Anyone** (`/voters/forms/...`): the first step, "Addressed to", picks the State, district and constituency.
   - Drafts, document checks, the missing-information list and the receipt work as for Form 6.
   - The form becomes `submitted` with an `EF…` reference.
   - Aadhaar is never stored, only its last 4 digits and a salted hash.
   - For 6B, 7 and 8 the entry must be in the chosen constituency's roll. A Form 8 shift is addressed to the new constituency.
2. **Record officer** (Forms 2, 2A and 3): verifies the service particulars.
3. **BLO** (desk, Forms 2-8): records a recommendation and the method; for inclusions and shifts, also the part and station. Status becomes `field_verified`.
4. **ERO/AERO** (desk, Forms 2-8): approves with step-up, or rejects with a reason. Only an approval changes the roll:
   - **2, 2A, 3, 6A:** a new service or overseas elector with an EPIC, plus a voter account.
   - **6B:** an authentication record on the entry.
   - **7:** the entry is marked deleted, keeping the order. Nothing is erased, and no decision is allowed within the notice period.
   - **8:** a shift, up to four corrections (audited before and after), a replacement EPIC, or PwD marking.
5. **Applicant**: `/check-request?ref=EF…` and the voter dashboard show the status and the reasons.

### Duplicates and deaths (PSE/DSE)

1. **ERO**: scans the roll. Entries are grouped by photo fingerprint, or by folded name, relative, date of birth and gender, and each group becomes one flag.
2. **BLO**: can also report a death, with the certificate.
3. **ERO**: sends the flag for a field check, and the BLO records what they found.
4. **ERO**: issues a notice, and the BLO records its delivery.
5. **ERO**: after the hearing date, decides with a reasoned order. Only then is the entry marked inactive, carrying the flag's ID.

### Form 7 objections by voters and BLAs

1. A voter, or a BLA for their own part (at most 10 a day), files on `/objection`.
2. The person objected to is notified and may reply during the notice period.
3. The BLO reports from the field.
4. The ERO decides with step-up. An accepted objection marks the entry deleted.

### Roll appeals

1. **Appellant** (`/appeal`): files with the application reference and date of birth, within 15 days of the order. Only one pending appeal is allowed per order.
2. **DEO** (Roll appeals): after hearing, dismisses the appeal, or allows or remands it, with reasons and step-up.
3. **Appellant**: within 30 days of a dismissal, files a second appeal to the **CEO**, which is decided the same way.
4. **ERO** (Appeal orders): carries out an allowed order in the roll and marks it `implemented`.

### Polling stations (RP Act 1951, s. 25)

1. **Anyone working in the area** can report a station problem. The DEO closes it with what was done. BLOs and sector officers also file facility surveys, which appear on the map.
2. **DEO**: drafts a new station or a relocation. It stays `PROPOSED` and is not public.
3. **DEO**: records the consultation with parties, then forwards it to the CEO. Forwarding is refused without a consultation record.
4. **CEO**: forwards it to the Commission with remarks, or returns it.
5. **ECI**: gives prior approval with the Commission's order reference (step-up), asks for clarification, or rejects. The proposer can never approve their own change.
6. **DEO**: issues the final order and publishes. The station becomes `ACTIVE`, and a relocation moves every elector of the part and shows a notice.
7. **Everyone**: `/booths`, `/map`, the roll search and staff assignments use only `ACTIVE` stations.

### Planning, elections, nominations and the candidate list

1. **ECI or CEO** (Election planning): records vacancies and holidays and builds the calendar back from the poll date. Overdue steps raise alerts. Announcing the plan creates the election with its statutory dates.
2. **Candidate** (`/candidate`): files while nominations are open, with the deposit (₹10,000 or ₹25,000, half for SC/ST), criminal antecedents and up to four papers. The RO can digitise paper nominations.
3. **RO**, or an ARO the RO has delegated to: scrutinises and records the order. The candidate may withdraw until the last date.
4. **RO**: allots symbols without clashes and publishes the frozen contesting list (Form 7A) with step-up. It is public on `/candidates`.
5. **Candidate**: appoints an election agent, polling agents and counting agents.

### EVMs

1. **DEO or the EVM nodal officer**: receives units by serial and records FLC (passed or rejected).
2. **DEO**: runs the first randomisation with party representatives, allotting units to constituencies.
3. **RO**: runs the second randomisation, allotting units to stations plus a reserve, then commissions the units. Commissioning needs Form 7A.

Each randomisation runs under a lock and produces one list.

### Campaign permissions and expenditure

1. **Candidate or election agent**: applies for a meeting, rally, procession, vehicle, loudspeaker, office, helipad or door-to-door team. Meetings and processions in the 48 hours before the poll closes are refused (s. 126).
2. **Police**: give no objection, or an objection with reasons.
3. **RO/ARO**: grants with conditions (a permit number is issued) or refuses with a reason. Granting over a police objection needs a recorded reason.
4. **Candidate or agent**: keeps an append-only expenditure register. Cash over ₹10,000 or a missing voucher is flagged, and totals are shown against the ceiling.
5. **Expenditure observer**: keeps a shadow register. Observed spend above reported spend is highlighted.
6. **Party treasurer**: files Form 24A, audited accounts and expenditure statements. The Commission scrutinises them on its compliance dashboard.

### MCC complaints (cVIGIL) and seizures (ESMS)

1. **Anyone** (`/report-violation`): reports with a category, place, optional GPS location and photo, anonymously or not. The reference is `CV…` and the 100-minute clock starts.
2. **DEO, Deputy DEO, RO or ARO** (MCC control room): sends a flying squad for that constituency, or drops the report with a reason.
3. **Flying squad**: reports what it found and any seizures. Each seizure goes into the seizure register.
4. **RO/ARO**: disposes of the complaint with a reason.
5. **Complainant**: follows it by reference and sees the steps, never the officers' identities.
6. **Any enforcement agency**: records seizures directly. A duplicate agency document number is refused, and the district committee can release a seizure. Totals by kind, agency, area and day feed the district, State and national reports.

### Grievances (NGSP)

1. **Anyone** (`/grievance`): files with a category, the area it is about, a description, a mobile number and up to two documents. A retried submission gives the same reference.
2. **Routing**: the grievance goes to the ERO or RO of a constituency, the DEO, the CEO or the Commission, depending on where it is about and what it concerns. Officers can re-route it.
3. **Officer** (Grievances): responds. MCC matters are referred to cVIGIL.
4. **Complainant**: tracks it and can reopen it once if unsatisfied.

### Service voters' postal ballots (ETPB)

1. **Record officer**: verifies service particulars, then collects each ballot's PIN.
2. **RO**: generates one ballot per service voter after Form 7A and transmits it.
3. **Service voter** (`/postal-ballot`): opens the ballot with the ballot ID and PIN, prints it with Forms 13A, 13B and 13C, marks it on paper and posts it by free Speed Post.
4. **RO**: records receipt (in time or late). At counting each ballot is scanned once and counted or rejected with the reason.

### Poll day

| When | Who | Action and record |
| --- | --- | --- |
| Before | Sector officer | Logistics: party dispatched, reached, station set up |
| Before | Presiding officer | "Before the poll" phase: arrival, equipment and readiness checklists |
| Morning | Presiding officer | "Mock poll" phase: mock poll recorded, then "Poll": poll opened (on the poll date only). The machine log records mock poll, clearing and sealing. |
| During | Polling officer | Checks the ID document, photo and ink, then marks the register, once per election |
| During | Polling officer or agent | Identity doubt or challenge; marking waits until the presiding officer decides |
| During | Presiding officer | Tendered votes, assisted voters, queue reports (public) |
| Any time | PO, micro observer, sector officer | Incident to the control room, escalating sector officer → RO → DEO → CEO → Commission. A Commission matter closes only after its direction is complied with. |
| Close | Presiding officer | "Closing" phase: checklist, then poll closed, recording the electors in the register |
| After | Presiding officer | "After the poll" phase: PO report (diary and Form 17C Part I), compared with the register; differences flagged |
| After | RO, DEO, CEO, observers | Station reports: PO reports, flags, replacements, malfunctions |

The register stores who voted (serial, document type, time, officer), never how anyone voted.

### Observers and Commission directions

1. **Observer** (My portal, Reports): files arrival, daily, poll-day, post-poll, final and departure reports. Reports are confidential: the DEO sees the district's, and the RO, candidates and agents never do.
2. **CEC, EC or ECI**: acknowledges a report, seeks more information, or closes it.
3. **CEC or EC**: issues a direction with step-up, under a legal basis, to a role in an area.
4. **Addressee** (Directions): reports compliance with evidence. The CEC or EC closes the direction or returns it.

### Counting, results and the Index Card

1. **RO**: sets the counting plan, randomises staff to tables, records rounds, runs the VVPAT draw and decides discrepancies, including Rule 63 recount requests.
2. **Public** (`/results`): sees only what a registered result source sends. Checks compare it with the register and flag inconsistencies. Nothing can edit or delete a result.
3. **RO**: prepares the Index Card, which is prefilled and validated and due within 72 hours. The **CEO** examines it and the **Commission** finalises and locks it, after which it is public.

### The officer inbox

`GET /inbox` gathers every open item in the caller's jurisdiction that the caller is the one to act on. Each item has a time limit:

| Item | Time limit |
| --- | --- |
| Field verification of Forms 2-8 and Form 6 | 7 days |
| Decision on Forms 2-8 and Form 6 | 7 days |
| Grievance | 72 hours |
| cVIGIL: dispatch | 15 minutes |
| cVIGIL: investigation | 45 minutes |
| cVIGIL: disposal | 100 minutes |
| Roll appeal | 15 days |
| Campaign permission | 24 hours |
| Index Card | 72 hours |
| Station problem | 48 hours |

Overdue items are high priority, and items due within a day are medium. Work that has waited more than twice its limit appears in the supervisor's "Escalated" list. `GET /inbox/workload` gives the workload figures for supervisors.

## What changes what

Each decision writes its record, its audit event and (usually) a live event in one transaction, so everything downstream reads the new state at once.

| Action | Records written | Visible to / effect |
| --- | --- | --- |
| ERO approves a Form 6 | `elector`, `user`, `registration`, audit, `REGISTRATION_DECIDED` | Roll search, voter sign-in, `/booths`, the poll-day list, reports |
| ERO approves a Form 2, 2A, 3 or 6A | `elector` (category), `user`, `eform` | Same, counted as service or overseas electors; service voters get postal ballots |
| ERO approves a Form 7 deletion or a PSE/DSE flag | `elector.isActive=false` with the order or flag ID | Gone from search, the poll-day list and roll versions; kept in the record |
| ERO approves a Form 8 shift | `elector` (constituency, part, station, serial) | On the new part's poll-day list; off the old one |
| BLO files a facility survey | `station_surveys`; summary on the station | Map popups show facilities and gaps |
| DEO publishes a relocation | `station` (new version), every elector of the part | `/booths`, `/map` and the roll search show the new place with a notice |
| Plan announced | `election` | Elections, nominations and the calendar |
| RO publishes the candidate list | Contesting list (frozen) | `/candidates`, EVM commissioning, postal ballots, counting, Index Card |
| Polling officer marks an elector | Register entry, `TURNOUT_UPDATED` | Station screen, control room, turnout |
| Presiding officer closes the poll | Poll state `closed` | PO report possible; control-room alerts stop |
| Flying squad records a seizure | Complaint `seizures[]` and a seizure-register entry | District, State and national "Seized"; expenditure observer |
| Grievance filed or answered | `grievances` | Officer's inbox; complainant's tracking; workload figures |
| Commission issues a direction | `direction`; the linked report becomes `direction_issued` | Addressee's desk; observers in the area |
| Appeal allowed | Appeal `with_ero` | ERO's Appeal orders and inbox until implemented |
| Any change | Audit event → `audit_archive` | Hash chain checked against MongoDB checkpoints |

## Demonstration script (about 30 minutes)

Nine short scenes, each handing a record from one role to the next. Set `STEP_UP_REQUIRED=false` for speed; otherwise approvals ask for a fresh code. Every sign-in code prints in the backend terminal.

**Setup.** Start Redis, then run `cd backend && npm run seed && npm run dev`. Separately, run `cd frontend && npm run dev`.

1. **Citizen help (3 min).**
   - On `/voters`, ask "My father passed away" and see Form 7, the steps and the documents. Turn on *Simpler words* and *Read aloud*.
   - On `/electoral-roll`, search EPIC `DMB5000001` and see the polling station, facilities, source and the checklist.
   - Search by part and serial, or by name with an age filter.
2. **Roll (5 min).**
   - On `/voters/forms/form-8`, address it to Ludhiana South and start a correction. Reload: the draft is offered back.
   - Attach a blurred photo to see the warning. Submit and print the receipt.
   - **BLO1000001** (one-time code), Forms 2-8: field-verify.
   - **ERO1000001**: the item is in the inbox; approve. `/electoral-roll` shows the change.
3. **Duplicates (3 min).**
   - **ERO1000001**, Duplicates: scan, send a flag for a field check.
   - **BLO1000001**: record the finding.
   - **ERO1000001**: issue the notice.
4. **Grievance and cVIGIL (5 min).**
   - File a grievance on `/grievance` and track it. **ERO1000001** responds from the inbox.
   - File a cash complaint on `/report-violation`.
   - **DEO1000001** sends it to FST1000001. **FST1000001** reports a ₹50,000 seizure, and it appears in the seizure register.
   - **ROF1000001** disposes of it.
5. **Polling station change (3 min).**
   - **DEO1000001** forwards "Community Hall, Haibowal Kalan" to the CEO; **CEO1000001** forwards it.
   - **ECI1234567** approves with `ECI/464/PS/2026`.
   - **DEO1000001** publishes; it appears on `/map`.
6. **Election machinery (3 min).**
   - **DEO1000001**, EVMs: first randomisation.
   - **ROF1000001**: second randomisation and Postal ballots.
   - **REC1000001**: hand over a PIN. Open that ballot on `/postal-ballot`.
7. **Poll day (4 min).**
   - **PRO1000001**, presiding officer assistant: tick the "Before the poll" checklists, record the mock poll, start the poll.
   - **POL1000001**: mark an elector on `/poll-day`.
   - **PRO1000001**: finish the closing checklist, close the poll, and file the PO report with a deliberately different count.
   - **ROF1000001**, Station reports: the difference is flagged.
8. **Oversight (2 min).** **CEC1000001** reviews the expenditure observer's report and its direction; **ROF1000001** reports compliance.
9. **Workload and reports (2 min).**
   - **DEO1000001**: the Workload tab and the district report.
   - **ECI1234567**: the national picture, Data stores and the Index Card to finalise.

## Demo data

`npm run seed` is safe to run again, because each block is written once. To start fresh, run `redis-cli flushall`, then `npm run seed`. All of it is invented.

| Data | Amount |
| --- | --- |
| Accounts | 44 with 38 active assignments (one per role, plus DEO Amritsar, DEO Shimla, CEO Himachal, ERO Amritsar East, a second flying squad and two administrators) |
| Elections | 4: general election (nominations open), bye-election (scrutiny), poll-day election (poll on the day of seeding), past bye-election (completed, mock results) |
| Polling stations | 93 approved and on the map, in Ludhiana, Amritsar, Jalandhar, Patiala, Shimla and New Delhi; 5 proposals in progress |
| Electors | 2,021, with parts, serials, relatives and houses, including service, overseas and PwD electors |
| Applications | 7 Forms 2-8 (submitted, field verified, approved, rejected); 1 Form 6; 2 Form 8 change requests; 2 new-voter tasks; 1 roll appeal |
| Roll quality | 7 PSE/DSE and death flags at every stage |
| BLO field work | 60 house-to-house register entries, 15 EPIC deliveries, 22 facility surveys |
| MCC complaints | 8 at every stage, with seizures; 2 flying squads with positions |
| Seizures | 25 across agencies and kinds (3 released) |
| Campaign permissions | 7 at every stage |
| Expenditure | 30 entries for 4 candidates, flagged items, 1 shadow-register entry; 6 party filings |
| EVMs | 185 units from receipt to commissioning, 2 randomisations |
| Postal ballots | 7 at every stage, from transmitted to counted |
| Grievances | 12 (open, in progress, resolved, referred to cVIGIL) |
| Planning | 4 vacancies, 5 holidays, a 20-activity calendar, 2 messages |
| Index Card | 1, submitted to the CEO |
| Library | 51 items: handbooks, compendium, eBooks, FAQ and training material |
| Observers | 3 reports, 3 profiles; 2 Commission directions (one issued, one complied with) |
| Poll day and field | 4 incidents, 13 logistics records, 15 security assessments, 4 deployments, 4 situation reports, 5 nodal reports, 4 nodal tasks, 2 open station problems |

## Known limitations

These are the biggest gaps for a real deployment. Each is a known, deliberate simplification.

1. **OTPs** are printed in the terminal (and shown on `/phone`). Production needs SMS delivery. `GET /api/v1/notifications?epic=` exposes demo codes. It is refused in production and when `ENABLE_DEMO_OTP_NOTIFICATIONS` is not `true`, and must be off on any shared deployment.
2. **Simulated services:** SMS and email acknowledgements, Aadhaar eSign, India Post tracking, Persona without real credentials, and fingerprint checks.
3. **Documents** (forms, complaint photos, certificates) are kept as data URLs in Redis or MongoDB. Production needs encrypted object storage with retention rules.
4. **Appellate authority** is configured as the DEO. Under s. 24 it is whichever officer the State notifies, so it should be mapped per State.
5. **Voter Mitra** matches keywords against a fixed catalogue. It understands Hindi and Hinglish questions but answers in English. The catalogue summarises the official forms and guidelines, which remain authoritative.
6. **Document check** runs in the browser and gives advice; the server's checks are the ones that count. There is no OCR.
7. **Drafts** are kept on the applicant's device only. On a shared computer, "Start again" clears them.
8. **PO report** covers Form 17C Part I; Part II stays with counting. Election petitions and court orders are not modelled, and a declared result cannot be reversed in the platform, by design.
9. **Map tiles** come from OpenFreeMap or OpenStreetMap; a government deployment would host its own. Locations are invented.
10. **Real-time** (Socket.IO) runs only on a long-running server, not on Vercel serverless.
11. **Language:** desk text is English only. Voter pages have six interface languages.
12. **Scale:** some lists scan Redis sets. That is fine for demo volumes, but past tens of thousands of records it needs the MongoDB read models or Redis indexes.

## Running and testing

```bash
# backend
cd backend && cp .env.example .env    # set ACCESS_TOKEN_SECRET and REDIS_URL (MONGODB_URI optional)
npm install && npm run seed && npm run dev

# frontend
cd frontend && npm install && npm run dev    # http://localhost:5173

# tests, on a disposable Redis
docker run -d --name eci-redis-test -p 6390:6379 redis
cd backend && TEST_REDIS_URL=redis://127.0.0.1:6390 npm test
```

The suite runs 147 tests; 146 pass, and 1 is skipped unless a MongoDB is available. More detail is in `docs/`, in particular `ECI_SYSTEMS_COVERAGE.md` (every ECI system feature and where it lives), `DATA_STORES.md`, `SECURITY_ARCHITECTURE.md` and `KNOWN_LIMITATIONS.md`.

## Appendix: every backend endpoint

All 321 endpoints under `/api/v1`, grouped by mount in the order `app.js` mounts them. The last column is what the route itself checks; jurisdiction is then checked inside the controller against the caller's assignments.

"Signed in (checked inside)" means any signed-in account, with the controller checking ownership or role. "Public (signed-in caller recorded)" means anyone, with a signed-in caller recorded. "Step-up" means a fresh OTP is needed when `STEP_UP_REQUIRED` is on. A list of permissions means any one of them is enough.

### `/electors` (1)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/electors/search` | Public (signed-in caller recorded) |

### `/verification` (2)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/verification/otp/send` | Public |
| POST | `/verification/otp/verify` | Public |

### `/auth` (11)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/auth/login` | Public |
| POST | `/auth/register` | Public |
| GET | `/auth/register/:id` | Public |
| POST | `/auth/register/:id/information` | Public |
| GET | `/auth/geography` | Public |
| GET | `/auth/roles` | Public |
| POST | `/auth/logout` | Public |
| POST | `/auth/logout-all` | Signed in (checked inside) |
| GET | `/auth/me` | Signed in (checked inside) |
| POST | `/auth/step-up/request` | Signed in (checked inside) |
| POST | `/auth/step-up/verify` | Signed in (checked inside) |

### `/admin` (16)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/admin/verifications` | Signed in (checked inside) |
| PATCH | `/admin/verifications/:id/resolve` | Signed in (checked inside) |
| GET | `/admin/stats` | Signed in (checked inside) |
| GET | `/admin/registrations` | application:review, verification:field-report, application:decide |
| GET | `/admin/registrations/:id/documents/:category` | application:review, verification:field-report, application:decide |
| POST | `/admin/registrations/:id/field-verification` | verification:field-report |
| POST | `/admin/registrations/:id/approve` | application:decide; step-up |
| POST | `/admin/registrations/:id/reject` | application:decide; step-up |
| POST | `/admin/registrations/:id/request-information` | application:decide |
| POST | `/admin/registrations/:id/request-reverification` | application:decide |
| GET | `/admin/changes` | application:review, verification:field-report, application:decide |
| POST | `/admin/changes/:id/field-verification` | verification:field-report |
| POST | `/admin/changes/:id/approve` | application:decide; step-up |
| POST | `/admin/changes/:id/reject` | application:decide; step-up |
| POST | `/admin/changes/:id/request-information` | application:decide |
| POST | `/admin/changes/:id/request-reverification` | application:decide |

### `/voting-verification` (8)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/voting-verification/start` | verification:review |
| POST | `/voting-verification/:id/persona/start` | verification:review |
| POST | `/voting-verification/:id/persona/sync` | verification:review |
| GET | `/voting-verification/:id/reference-photo` | verification:review |
| POST | `/voting-verification/:id/document` | verification:review |
| POST | `/voting-verification/:id/face/challenge` | verification:review |
| POST | `/voting-verification/:id/face` | verification:review |
| POST | `/voting-verification/:id/fingerprint` | verification:review |

### `/persona` (5)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/persona/start` | Signed in (checked inside) |
| GET | `/persona/status` | Signed in (checked inside) |
| POST | `/persona/sync` | Signed in (checked inside) |
| POST | `/persona/complete-verification` | Signed in (checked inside) |
| POST | `/persona/webhook` | Public (Persona signature checked) |

### `/notifications` (1)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/notifications` | Public |

### `/changes` (3)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/changes` | application:submit |
| GET | `/changes/my` | application:track |
| POST | `/changes/:id/information` | Signed in (checked inside) |

### `/eci` (4)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/eci/blo-list` | role:assign |
| POST | `/eci/blo/assign` | role:assign |
| POST | `/eci/blo/remove` | role:assign |
| GET | `/eci/voters` | role:assign |

### `/assignments` (4)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/assignments/me` | Signed in (checked inside) |
| GET | `/assignments` | role:assign, blo:assign, staff:assign, polling:arrange, audit:read |
| POST | `/assignments` | role:assign, blo:assign, staff:assign, polling:arrange; step-up |
| POST | `/assignments/:id/revoke` | role:assign, blo:assign, staff:assign, polling:arrange; step-up |

### `/audit` (4)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/audit` | audit:read |
| GET | `/audit/search` | audit:read |
| GET | `/audit/integrity` | audit:read, national:manage |
| GET | `/audit/:type/:id` | audit:read |

### `/integrations` (6)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/integrations/sources` | integration:manage |
| POST | `/integrations/sources` | integration:manage; step-up |
| POST | `/integrations/sources/:id/suspend` | integration:manage; step-up |
| POST | `/integrations/sources/:id/runs` | integration:manage |
| GET | `/integrations/runs` | integration:manage |
| POST | `/integrations/rescreen` | integration:manage |

### `/registration-tasks` (3)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/registration-tasks` | verification:field-report, application:decide, blo:supervise, blo:assign |
| POST | `/registration-tasks/:id/outcome` | verification:field-report |
| POST | `/registration-tasks/:id/assign` | blo:assign, blo:supervise |

### `/roll-versions` (3)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/roll-versions` | roll:publish; step-up |
| GET | `/roll-versions` | roll:publish, roll:manage, audit:read |
| GET | `/roll-versions/:id` | roll:publish, roll:manage, audit:read |

### `/elections` (3)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/elections` | Public |
| POST | `/elections` | election:manage |
| POST | `/elections/:id/schedule` | election:manage |

### `/polling-stations` (14)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/polling-stations` | station:view, station:propose, station:approve, state:manage, station:survey |
| GET | `/polling-stations/issues` | station:view, station:propose, polling:inspect, roll:view-part, application:decide, roll:claims-objections, nomination:submit, state:manage, station:approve |
| POST | `/polling-stations/issues` | station:view, station:propose, polling:inspect, roll:view-part, application:decide, roll:claims-objections, nomination:submit |
| POST | `/polling-stations/issues/:issueId/close` | station:propose |
| POST | `/polling-stations` | station:propose |
| POST | `/polling-stations/import` | station:propose |
| POST | `/polling-stations/:id/relocation` | station:propose |
| POST | `/polling-stations/:id/consultation` | station:propose |
| POST | `/polling-stations/:id/forward` | station:propose |
| POST | `/polling-stations/:id/ceo-forward` | state:manage |
| POST | `/polling-stations/:id/clarification` | station:approve |
| POST | `/polling-stations/:id/approve` | station:approve; step-up |
| POST | `/polling-stations/:id/publish` | station:propose; step-up |
| POST | `/polling-stations/:id/reject` | station:approve; step-up |

### `/nominations` (15)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/nominations` | nomination:submit |
| GET | `/nominations/mine` | nomination:submit |
| GET | `/nominations/assisted` | nomination:assist |
| POST | `/nominations/:id/withdraw` | nomination:submit |
| POST | `/nominations/:id/sets` | nomination:submit |
| GET | `/nominations` | nomination:scrutinise |
| POST | `/nominations/:id/scrutiny` | nomination:scrutinise |
| GET | `/nominations/scrutiny-delegation` | nomination:scrutinise |
| POST | `/nominations/scrutiny-delegation` | scrutiny:delegate; step-up |
| POST | `/nominations/scrutiny-delegation/revoke` | scrutiny:delegate; step-up |
| POST | `/nominations/contesting` | candidates:publish; step-up |
| GET | `/nominations/symbols` | nomination:scrutinise, nomination:submit |
| POST | `/nominations/digitise` | nomination:scrutinise |
| POST | `/nominations/:id/deposit` | nomination:scrutinise |
| POST | `/nominations/:id/symbol` | candidates:publish |

### `/public` (9)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/public/elections` | Public |
| GET | `/public/stations/map` | Public |
| GET | `/public/stations` | Public |
| GET | `/public/stations/near` | Public |
| GET | `/public/stations/epic/:epic` | Public |
| GET | `/public/stations/:id/queue` | Public |
| GET | `/public/candidates` | Public |
| GET | `/public/results` | Public |
| GET | `/public/turnout` | Public |

### `/poll-day` (23)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/poll-day/station` | polling:conduct, polling:identify-voter, polling:mark-register, polling:operate-evm, polling:observe, observer:report, roll:view-part |
| GET | `/poll-day/electors` | polling:conduct, polling:identify-voter, polling:mark-register, roll:view-part |
| POST | `/poll-day/electors/:epic/mark` | polling:mark-register, polling:conduct |
| POST | `/poll-day/poll/status` | polling:conduct |
| POST | `/poll-day/queue` | polling:conduct, polling:identify-voter |
| GET | `/poll-day/cases` | polling:conduct, polling:identify-voter, polling:mark-register, polling:operate-evm, polling:observe, observer:report |
| POST | `/poll-day/cases` | polling:conduct, polling:identify-voter, polling:mark-register, polling:object |
| POST | `/poll-day/cases/:id/resolve` | polling:conduct |
| POST | `/poll-day/vab-slips/:epic` | roll:view-part |
| GET | `/poll-day/vab-slips/:slipId` | polling:identify-voter, polling:mark-register, polling:conduct |
| GET | `/poll-day/register` | polling:conduct |
| GET | `/poll-day/records` | polling:conduct, polling:operate-evm, polling:report |
| POST | `/poll-day/machine-events` | polling:operate-evm, polling:conduct |
| POST | `/poll-day/po-report` | polling:report |
| GET | `/poll-day/station-reports` | control:view, record:read, counting:read, district:manage, state:manage |
| GET | `/poll-day/procedures` | polling:conduct, polling:identify-voter, polling:mark-register, polling:operate-evm, polling:observe, observer:report |
| GET | `/poll-day/assistant` | polling:conduct |
| POST | `/poll-day/checklists/:kind` | polling:conduct |
| GET | `/poll-day/package/public-key` | polling:conduct, polling:identify-voter, polling:mark-register, polling:operate-evm, polling:observe, observer:report |
| GET | `/poll-day/package` | polling:conduct, polling:identify-voter, polling:mark-register |
| POST | `/poll-day/sync` | polling:conduct, polling:mark-register |
| GET | `/poll-day/sync-conflicts` | polling:conduct |
| POST | `/poll-day/sync-conflicts/:id/resolve` | polling:conduct |

### `/control-room` (4)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/control-room` | control:view |
| POST | `/control-room/incidents` | incident:report |
| POST | `/control-room/incidents/:id` | incident:manage |
| POST | `/control-room/stations/:stationId/visits` | polling:inspect |

### `/results` (5)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/results/sources` | integration:manage |
| POST | `/results/sources` | integration:manage; step-up |
| POST | `/results/sources/:sourceId/entries` | integration:manage |
| POST | `/results/sources/:sourceId/publication` | integration:manage |
| POST | `/results/sources/:sourceId/mock` | integration:manage |

### `/training` (7)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/training/modules` | Signed in (checked inside) |
| POST | `/training/modules/:id/attempts` | Signed in (checked inside) |
| GET | `/training/scenarios` | Signed in (checked inside) |
| POST | `/training/scenarios/:id/start` | Signed in (checked inside) |
| POST | `/training/runs/:runId/submit` | Signed in (checked inside) |
| GET | `/training/report` | Signed in (checked inside) |
| GET | `/training/team` | blo:assign, blo:supervise, staff:assign, polling:arrange |

### `/agents` (4)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/agents/mine` | agent:appoint |
| POST | `/agents` | agent:appoint |
| POST | `/agents/:id/revoke` | agent:appoint |
| GET | `/agents` | nomination:scrutinise |

### `/users` (3)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/users/:epic` | role:assign |
| POST | `/users/:epic/suspend` | role:assign; step-up |
| POST | `/users/:epic/reinstate` | role:assign; step-up |

### `/events` (2)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/events` | Signed in (checked inside) |
| GET | `/events/history` | Signed in (checked inside) |

### `/devices` (4)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/devices/mine` | Signed in (checked inside) |
| POST | `/devices/register` | Signed in (checked inside) |
| POST | `/devices/heartbeat` | Signed in (checked inside) |
| POST | `/devices/:id/revoke` | polling:conduct, incident:manage |

### `/counting` (10)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/counting/:electionId` | counting:supervise, counting:assist, result:declare, counting:supervise-table, counting:record, counting:observe, counting:object, counting:read, observer:report |
| GET | `/counting/:electionId/staff` | counting:supervise, counting:assist, result:declare |
| POST | `/counting/:electionId/plan` | counting:supervise, result:declare |
| POST | `/counting/:electionId/randomise` | counting:supervise, result:declare |
| POST | `/counting/:electionId/vvpat-draw` | counting:supervise, result:declare |
| POST | `/counting/:electionId/rounds/:round/tables/:table` | counting:supervise, counting:assist, result:declare, counting:supervise-table |
| POST | `/counting/:electionId/rounds/:round/complete` | counting:supervise, result:declare |
| POST | `/counting/:electionId/discrepancies` | counting:object, counting:supervise-table, observer:report |
| POST | `/counting/:electionId/discrepancies/:id/decide` | counting:supervise, result:declare |
| POST | `/counting/:electionId/observer-reports` | observer:report |

### `/objections` (7)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/objections` | Signed in (checked inside) |
| GET | `/objections/my` | Signed in (checked inside) |
| POST | `/objections/:id/withdraw` | Signed in (checked inside) |
| POST | `/objections/:id/reply` | roll:view-own |
| GET | `/objections/staff` | application:decide, verification:field-report |
| POST | `/objections/staff/:id/field-report` | verification:field-report |
| POST | `/objections/staff/:id/decide` | application:decide; step-up |

### `/elector-forms` (10)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/elector-forms` | Public |
| GET | `/elector-forms/status/:ref` | Public |
| GET | `/elector-forms/mine` | application:track |
| POST | `/elector-forms/mine/:id/withdraw` | Signed in (checked inside) |
| GET | `/elector-forms/staff` | application:decide, verification:field-report, application:review, record:read, roll:manage |
| GET | `/elector-forms/staff/:id` | application:decide, verification:field-report, application:review, record:read, roll:manage |
| GET | `/elector-forms/staff/:id/documents/:name` | application:decide, verification:field-report |
| POST | `/elector-forms/staff/:id/field-report` | verification:field-report |
| POST | `/elector-forms/staff/:id/decide` | application:decide; step-up |
| POST | `/elector-forms/:form` | Public (signed-in caller recorded) |

### `/campaign-permissions` (6)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/campaign-permissions` | permission:apply |
| GET | `/campaign-permissions/mine` | permission:apply |
| POST | `/campaign-permissions/mine/:id/withdraw` | permission:apply |
| GET | `/campaign-permissions` | permission:decide, security:coordinate, record:read, district:manage, state:manage, national:view, national:manage |
| POST | `/campaign-permissions/:id/police` | security:coordinate |
| POST | `/campaign-permissions/:id/decide` | permission:decide |

### `/expenditure` (6)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/expenditure/mine` | expenditure:report |
| POST | `/expenditure` | expenditure:report |
| POST | `/expenditure/:id/correct` | expenditure:report |
| GET | `/expenditure` | expenditure:read, record:read, permission:decide, district:manage, state:manage, national:view, national:manage |
| POST | `/expenditure/:id/notes` | expenditure:read |
| POST | `/expenditure/shadow` | expenditure:read |

### `/oversight` (8)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/oversight/observer-reports` | observer:report, observer:view, national:view, national:manage, direction:issue |
| POST | `/oversight/observer-reports` | observer:report |
| POST | `/oversight/observer-reports/:id/review` | national:manage, direction:issue |
| POST | `/oversight/observer-reports/:id/supplement` | observer:report |
| GET | `/oversight/directions` | direction:issue, national:view, national:manage, state:manage, district:manage, nomination:scrutinise, application:decide, polling:inspect, polling:conduct, security:plan, observer:report |
| POST | `/oversight/directions` | direction:issue; step-up |
| POST | `/oversight/directions/:id/comply` | direction:issue, national:view, national:manage, state:manage, district:manage, nomination:scrutinise, application:decide, polling:inspect, polling:conduct, security:plan, observer:report |
| POST | `/oversight/directions/:id/close` | direction:issue |

### `/security` (5)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/security` | security:plan, security:coordinate, control:view, district:manage, state:manage, record:read, logistics:track |
| POST | `/security/stations/:stationId/assessment` | security:plan |
| POST | `/security/deployments` | security:plan |
| POST | `/security/deployments/:id` | security:plan, security:coordinate |
| POST | `/security/sitreps` | security:coordinate |

### `/logistics` (2)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/logistics` | logistics:track, control:view, district:manage, state:manage, record:read, nodal:function-manage |
| POST | `/logistics/stations/:stationId` | logistics:track |

### `/nodal` (4)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/nodal` | nodal:function-manage, nodal:coordinate |
| POST | `/nodal/reports` | nodal:function-manage |
| POST | `/nodal/tasks` | nodal:coordinate |
| POST | `/nodal/tasks/:id` | nodal:function-manage, nodal:coordinate |

### `/reports` (2)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/reports/summary` | district:manage, state:manage, report:state, report:national, national:view, national:manage, record:read, application:decide, nomination:scrutinise, control:view, blo:supervise, observer:view |
| GET | `/reports/roll-part` | roll:view-part |

### `/complaints` (7)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/complaints` | Public (signed-in caller recorded) |
| GET | `/complaints/track/:ref` | Public |
| GET | `/complaints` | complaint:dispatch, complaint:investigate, complaint:dispose, record:read, expenditure:read, national:view, national:manage, state:manage |
| GET | `/complaints/:id/photo` | complaint:dispatch, complaint:investigate, complaint:dispose, record:read, expenditure:read, national:view, national:manage, state:manage |
| POST | `/complaints/:id/dispatch` | complaint:dispatch |
| POST | `/complaints/:id/field-report` | complaint:investigate |
| POST | `/complaints/:id/dispose` | complaint:dispose |

### `/appeals` (7)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/appeals` | Public (signed-in caller recorded) |
| GET | `/appeals/track/:ref` | Public |
| POST | `/appeals/track/:ref/second` | Public (signed-in caller recorded) |
| GET | `/appeals` | appeal:decide-first, appeal:decide-second, application:decide, record:read |
| POST | `/appeals/:id/first` | appeal:decide-first; step-up |
| POST | `/appeals/:id/second` | appeal:decide-second; step-up |
| POST | `/appeals/:id/implement` | application:decide |

### `/library` (5)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/library` | Public |
| GET | `/library/meta` | Public |
| GET | `/library/:slug` | Public |
| POST | `/library` | library:manage |
| POST | `/library/:slug/archive` | library:manage |

### `/eplan` (7)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/eplan` | plan:manage, plan:state, national:view |
| POST | `/eplan/vacancies` | plan:manage |
| POST | `/eplan/holidays` | plan:manage, plan:state |
| POST | `/eplan/plans` | plan:manage |
| POST | `/eplan/plans/:id/announce` | plan:manage |
| POST | `/eplan/activities/:id` | plan:manage, plan:state |
| POST | `/eplan/messages` | plan:manage, plan:state |

### `/roll-quality` (9)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/roll-quality` | roll:manage, application:decide, verification:field-report, blo:supervise, record:read |
| POST | `/roll-quality/scan` | roll:manage |
| POST | `/roll-quality/death-report` | verification:field-report |
| GET | `/roll-quality/:id/certificate` | application:decide, verification:field-report |
| POST | `/roll-quality/:id/field-check` | application:decide |
| POST | `/roll-quality/:id/field-finding` | verification:field-report |
| POST | `/roll-quality/:id/notice` | application:decide |
| POST | `/roll-quality/:id/notice-delivered` | verification:field-report |
| POST | `/roll-quality/:id/decide` | application:decide |

### `/field` (8)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/field/lists` | Signed in (checked inside) |
| GET | `/field/surveys` | station:survey, station:propose, station:view, district:manage, state:manage, application:decide, blo:supervise, accessibility:review |
| GET | `/field/surveys/:id/photo` | station:survey, station:propose, station:view, district:manage, state:manage, application:decide, blo:supervise, accessibility:review |
| POST | `/field/stations/:stationId/survey` | station:survey |
| GET | `/field/register` | verification:field-report, application:decide, blo:supervise |
| POST | `/field/register` | verification:field-report |
| GET | `/field/epic-deliveries` | verification:field-report, application:decide, blo:supervise |
| POST | `/field/epic-deliveries` | verification:field-report |

### `/observers` (5)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/observers/public` | Public |
| GET | `/observers/me` | observer:report |
| POST | `/observers/me/profile` | observer:report |
| GET | `/observers/squads` | observer:report, complaint:dispatch, complaint:dispose, complaint:investigate, control:view, expenditure:read |
| POST | `/observers/squads/location` | complaint:investigate |

### `/index-cards` (7)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/index-cards/public` | Public |
| GET | `/index-cards` | index:prepare, index:examine, index:finalise, record:read, national:view |
| POST | `/index-cards` | index:prepare |
| POST | `/index-cards/:id` | index:prepare |
| POST | `/index-cards/:id/submit` | index:prepare |
| POST | `/index-cards/:id/examine` | index:examine |
| POST | `/index-cards/:id/finalise` | index:finalise |

### `/etpb` (12)

| Method | Path | Check |
| --- | --- | --- |
| POST | `/etpb/download` | Public |
| POST | `/etpb/return` | Public |
| GET | `/etpb/track/:ballotId` | Public |
| GET | `/etpb/record-officer/enrolments` | service:record |
| POST | `/etpb/record-officer/verify/:formId` | service:record |
| GET | `/etpb/record-officer/pins` | service:record |
| POST | `/etpb/record-officer/pins/:ballotId/collected` | service:record |
| GET | `/etpb` | etpb:manage, service:record, record:read, state:manage, national:view |
| POST | `/etpb/:electionId/generate` | etpb:manage |
| POST | `/etpb/:electionId/transmit` | etpb:manage |
| POST | `/etpb/ballots/:ballotId/receive` | etpb:manage |
| POST | `/etpb/ballots/:ballotId/validate` | etpb:manage |

### `/grievances` (8)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/grievances/lists` | Public |
| POST | `/grievances` | Public (signed-in caller recorded) |
| GET | `/grievances/track/:ref` | Public |
| POST | `/grievances/track/:ref/reopen` | Public |
| GET | `/grievances` | grievance:handle, national:view |
| GET | `/grievances/:id/documents/:n` | grievance:handle |
| POST | `/grievances/:id/route` | grievance:handle |
| POST | `/grievances/:id/respond` | grievance:handle |

### `/seizures` (3)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/seizures` | seizure:record, seizure:read, expenditure:read, complaint:dispatch, state:manage, national:view, national:manage |
| POST | `/seizures` | seizure:record |
| POST | `/seizures/:id/release` | seizure:release |

### `/party-filings` (5)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/party-filings/mine` | party:file |
| POST | `/party-filings` | party:file |
| GET | `/party-filings/compliance` | party:review, national:view |
| GET | `/party-filings/:id` | party:file, party:review, national:view |
| POST | `/party-filings/:id/scrutiny` | party:review |

### `/evm` (8)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/evm` | evm:manage, evm:allocate, evm:view, observer:report, state:manage, national:view, national:manage |
| GET | `/evm/randomisations/:id` | evm:manage, evm:allocate, evm:view, observer:report, state:manage, national:view, national:manage |
| GET | `/evm/stations/:stationId` | evm:manage, evm:allocate, evm:view, observer:report, state:manage, national:view, national:manage, polling:conduct, station:view |
| POST | `/evm/units` | evm:manage |
| POST | `/evm/flc` | evm:manage |
| POST | `/evm/randomise/first` | evm:randomise-first |
| POST | `/evm/randomise/second` | evm:allocate |
| POST | `/evm/commission` | evm:allocate |

### `/data-stores` (2)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/data-stores` | national:manage, integration:manage |
| POST | `/data-stores/sync` | national:manage |

### `/assist` (2)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/assist/services` | Public |
| POST | `/assist/ask` | Public |

### `/inbox` (2)

| Method | Path | Check |
| --- | --- | --- |
| GET | `/inbox` | Signed in (checked inside) |
| GET | `/inbox/workload` | application:decide, blo:supervise, district:manage, state:manage, national:view, national:manage |
