# ECI-Web platform report

The platform now gives each of 34 election roles its own desk, backed by 242 API endpoints that check permission and jurisdiction on every write; this report lists every route, every workflow step by step, what each action changes, the demo data and a demonstration script. It covers the eciweb2 repository on main after the "Adding map facility" commit, plus the changes in this round. All data is synthetic, and the platform never counts votes or declares results.

## What changed in this round

The map now works, cVIGIL is a real workflow, three legal processes were added, and every permission in the role catalogue is enforced by at least one route.

| Area | Change |
| --- | --- |
| Map (your commit) | `/map` rendered the bare map component with no data loader, so it never showed a station. It now renders `PollingStationMapPage`, which loads the stations in view from `GET /api/v1/public/stations/map`. It uses the site's styles (the map had Tailwind classes this project doesn't use), opens fitted to India, and finds a station by EPIC and flies to it. Popups show facilities, missing facilities, relocation and a Directions link. If the vector style can't load, it falls back to OpenStreetMap raster tiles so stations still show. Linked from the Voters menu. |
| Report a violation (cVIGIL) | Was frontend-only with hard-coded sample data. Now a backend workflow: citizen report, control-room dispatch, flying-squad field report and seizures, RO disposal. 100-minute clock and tracking by reference. |
| New role | `flying_squad`, the flying squad / surveillance team (demo FST1000001 and FST1000002), with its own desk. The DEO can appoint them. |
| Roll appeals (RP Act 1950, s. 24) | New `/appeal` page and backend. First appeal to the DEO as district appellate authority, second to the CEO. An allowed appeal becomes an order the ERO implements and marks done. |
| Presiding Officer's records | Machine log (mock poll, sealing, replacement, close) and the PO's report (diary plus Form 17C Part I), checked against the station register. Differences are flagged for the RO, DEO, CEO and observers. |
| Unused powers wired up | `polling:report`, `polling:operate-evm`, `counting:assist`, `nomination:assist`, `verification:review`, `application:track`, `application:submit` and `roll:view-own` are now checked on their routes. |
| New powers | `complaint:dispatch` (DEO, Deputy DEO, RO, ARO), `complaint:dispose` (RO, ARO), `complaint:investigate` (flying squad), `appeal:decide-first` (DEO), `appeal:decide-second` (CEO). |
| Desks | New tabs: MCC control room, Roll appeals, Station reports, Machine log and PO report, Candidate's nomination. The district/State/national report now counts complaints, seizures and appeals. |
| Voter dashboard | New card listing the voter's Forms 2-8 with status, and links to filing, appeals and violation reports. |
| Demo data | 93 approved polling stations with map locations across 6 districts in 3 States/UTs, about 2,000 electors, and records at every stage of every workflow. |
| Tests | `backend/tests/workflows.test.js` also covers MCC complaints and roll appeals. 130 pass, 1 skipped (needs MongoDB). |

## Structure

Redis holds every record; the backend checks permission and jurisdiction on every write, and the frontend only decides what each role sees.

| Path | What it is |
| --- | --- |
| `backend/src/app.js` | Express app: security headers, CORS, body limits, every route mount |
| `backend/src/config/roles.js` | The role catalogue: every role, its level, scope and permissions |
| `backend/src/middlewares/` | `verifyJWT` (and `optionalJWT`), `authorize(permission…)`, `requireStepUp`, rate limits |
| `backend/src/services/authority.service.js` | Jurisdiction rules: does an assignment cover a record? |
| `backend/src/services/workflow.service.js` | Shared helpers for case workflows (store, area checks, validation) |
| `backend/src/services/candidate.service.js` | Which candidate an agent or candidate is acting for |
| `backend/src/services/audit.service.js` | Append-only, hash-chained audit trail |
| `backend/src/services/events.service.js` | Operational events for live screens (outbox pattern) |
| `backend/src/controllers/`, `routes/` | One controller and one router per workflow, mounted under `/api/v1/...` |
| `backend/src/seed.js`, `seedData.js` | Demo accounts, assignments and the synthetic dataset |
| `backend/tests/` | node:test suites (need a disposable Redis via `TEST_REDIS_URL`) |
| `frontend/src/App.jsx` | Every route |
| `frontend/src/config/roles.js` | Role labels and where each role lands (`homeFor`) |
| `frontend/src/config/desks.js` | Each role's desk: authority, mission, tabs, screens, limits |
| `frontend/src/config/permissions.js` | Plain-language text for every permission |
| `frontend/src/pages/RoleDesk.jsx` | The `/desk` page |
| `frontend/src/components/desk/` | Desk panels: kit, forms, campaign, oversight, field, ops, cases |
| `frontend/src/components/maps/` | The MapLibre polling-station map |

**Data stores.** Redis is the system of record. MongoDB, when `MONGODB_URI` is set, holds read models for search: station geography (map and nearest station), event history and the audit archive. Without MongoDB the same queries run on Redis.

**Rule of authority.** Every write checks two things on the server:

1. **Permission:** the caller's role carries the permission (`authorize("...")` on the route).
2. **Jurisdiction:** one of the caller's active assignments covers the record (State, district, constituency, polling station and election).

Seeing a record on a dashboard never implies the right to change it.

## Roles and their desks

Every role except the voter lands on `/desk`, which shows its legal authority and assignment, what it may and may not do, a report for its jurisdiction where it has one, its work tabs, and links to its dedicated screens. Demo IDs sign in with an OTP printed in the backend terminal; BLOs sign in with a BLO ID and password.

| Role | Demo ID | Desk tabs (besides Overview) | Dedicated screens |
| --- | --- | --- | --- |
| Voter | ABC1234567 | — (lands on `/dashboard`) | `/dashboard`, `/verify` |
| Candidate | CAN1000001 | Campaign permissions, Expenditure register | `/candidate` |
| Election agent | EAG1000001 | Candidate's nomination, Campaign permissions, Expenditure register | `/agent` |
| Polling agent | PAG1000001 | — | `/poll-day` |
| Counting agent | CAG1000001 | — | `/counting` |
| Booth level agent (party) | BLA1000001 | Roll of your part, Polling-station problems | `/objection` |
| ERO | ERO1000001; ERO1000002 (Amritsar East) | Forms 2-8, Appeal orders, BLOs, Station problems, Audit | `/ero` |
| AERO | AER1000001 | Forms 2-8, Appeal orders, Audit | `/ero` |
| BLO supervisor | BLS1000001 | Team and tasks, Field verification, Roll, Audit | — |
| BLO | BLO-PB-000001 | Forms 2-8 field verification, Roll of your part, Station problems | `/admin`, `/poll-day` |
| Returning officer | ROF1000001 | MCC complaints, Campaign permissions, Station reports, Directions, Station problems | `/ro`, `/counting`, `/control-room` |
| ARO | ARO1000001 | MCC complaints, Campaign permissions, Station reports, Station problems | `/ro`, `/control-room` |
| Sector officer | SCO1000001 | Polling logistics, Station problems, Directions | `/control-room` |
| Sector police officer | SPO1000001 | Security, Police remarks on permissions, Polling logistics | — |
| Flying squad (new) | FST1000001, FST1000002 | Assigned reports | — |
| Presiding officer | PRO1000001 | Machine log and PO report, Directions | `/poll-day/presiding-officer`, `/poll-day` |
| Polling officer | POL1000001 | Machine log | `/poll-day` |
| Counting supervisor | CSU1000001 | — | `/counting` |
| Counting assistant | CAS1000001 | — | `/counting` |
| DEO | DEO1000001; DEO1000002 (Amritsar), DEO1000003 (Shimla) | Polling-station changes, Station problems, MCC control room, Roll appeals, Nodal officers, Station reports, Observer reports, Directions, Permissions, Audit | `/deo`, `/control-room` |
| Deputy DEO | DDO1000001 | MCC control room, Nodal officers, Permissions | `/control-room` |
| District nodal officer | DNO1000001 (subject: EVM) | Your subject, Polling logistics | — |
| District police officer | DPO1000001 | Security plan, Police remarks on permissions, Directions | — |
| CEO | CEO1000001 (Punjab); CEO1000002 (Himachal) | Station proposals to forward, Second appeals, Station reports, State nodal officers, Directions, Audit | `/control-room`, `/states` |
| State nodal officer | SNO1000001 (subject: training) | Your subject | — |
| State police nodal officer | SPN1000001 | Security across the State, Directions | — |
| ECI administrator | ECI1234567 | Polling-station approvals, Observer reports, Audit | `/eci/dashboard`, `/eci/elections`, `/eci/integrations`, `/eci/voting-verification` |
| Chief election commissioner | CEC1000001 | Observer reports, Directions (issue) | `/control-room`, `/results` |
| Election commissioner | ELC1000001 | Observer reports, Directions (issue) | `/control-room`, `/results` |
| General observer | GOB1000001 | Reports to the Commission, MCC complaints, Station reports, Roll applications, Permissions, Directions, Audit | `/control-room`, `/counting` |
| Police observer | POB1000001 | Reports, Security arrangements, MCC complaints, Permissions | — |
| Expenditure observer | EOB1000001 | Candidates' registers, Complaints and seizures, Reports | — |
| Counting observer | COB1000001 | Reports, Station reports | `/counting` |
| Micro observer | MOB1000001 | Reports | `/poll-day` |

## Permissions by role

From `backend/src/config/roles.js`; routes check these ids, never role names.

| Role | Permissions |
| --- | --- |
| voter | roll:view-own, application:submit, application:track, verification:own |
| candidate | nomination:submit, agent:appoint, permission:apply, expenditure:report |
| election\_agent | nomination:assist, agent:appoint, permission:apply, expenditure:report |
| polling\_agent | polling:observe, polling:object |
| counting\_agent | counting:observe, counting:object |
| bla | roll:view-part, roll:claims-objections |
| ero | roll:manage, roll:publish, application:decide, blo:assign, audit:read |
| aero | roll:manage, application:decide, audit:read |
| blo\_supervisor | blo:supervise, roll:view-part, verification:field-report, audit:read |
| blo | application:review, verification:field-report, roll:view-part |
| ro | nomination:scrutinise, scrutiny:delegate, candidates:publish, polling:arrange, counting:supervise, result:declare, station:view, control:view, incident:manage, permission:decide, complaint:dispatch, complaint:dispose |
| aro | nomination:scrutinise, polling:arrange, counting:assist, station:view, control:view, incident:manage, permission:decide, complaint:dispatch, complaint:dispose |
| sector\_officer | polling:inspect, logistics:track, station:view, control:view, incident:report, incident:manage |
| sector\_police\_officer | security:coordinate, logistics:track |
| flying\_squad | complaint:investigate |
| presiding\_officer | polling:conduct, polling:report, station:view, incident:report |
| polling\_officer | polling:identify-voter, polling:mark-register, polling:operate-evm |
| counting\_supervisor | counting:supervise-table |
| counting\_assistant | counting:record |
| deo | district:manage, staff:assign, nodal:coordinate, observer:view, audit:read, station:propose, control:view, incident:manage, complaint:dispatch, appeal:decide-first |
| deputy\_deo | district:manage, nodal:coordinate, station:view, control:view, complaint:dispatch |
| district\_nodal\_officer | nodal:function-manage |
| district\_police\_officer | security:coordinate, security:plan |
| ceo | state:manage, staff:assign, nodal:coordinate, report:state, audit:read, station:view, control:view, incident:manage, appeal:decide-second |
| state\_nodal\_officer | nodal:function-manage |
| state\_police\_nodal | security:coordinate, security:plan |
| eci | national:manage, role:assign, blo:assign, verification:review, audit:read, integration:manage, election:manage, station:approve, control:view |
| cec | national:view, report:national, audit:read, control:view, direction:issue |
| election\_commissioner | national:view, report:national, audit:read, control:view, direction:issue |
| general\_observer | observer:report, record:read, audit:read, control:view |
| police\_observer | observer:report, record:read |
| expenditure\_observer | observer:report, expenditure:read |
| counting\_observer | observer:report, counting:read |
| micro\_observer | observer:report, incident:report |

## Frontend routes (all 63)

28 public pages, 6 sign-in pages, 18 signed-in work screens, and 11 redirects (10 old addresses plus the catch-all to /home).

### Public

| Route | Page | What it does |
| --- | --- | --- |
| `/` | EntryGate | First visit: sign in or browse; afterwards goes to `/home` |
| `/home` | Home | Landing page, news, quick links |
| `/voters` | Voters | Voter services and which form to use |
| `/voters/forms` | ElectoralFormsIndex | Index of Forms 2, 2A, 3, 6A, 6B, 7, 8 |
| `/voters/forms/form-2`, `-2a`, `-3` | ServiceVoterForms | Service voters (Armed Forces, State Armed Police outside the State, Government of India post abroad) |
| `/voters/forms/form-6a` | Form6A | Overseas elector |
| `/voters/forms/form-6b` | Form6B | Aadhaar or an alternative document for authentication |
| `/voters/forms/form-7` | Form7 | Objection, deletion or self-deletion |
| `/voters/forms/form-8` | Form8 | Shift, correction, replacement EPIC, PwD marking |
| `/register` | Register | Form 6 (new elector) with documents |
| `/check-request` | CheckRequest | Status of a Form 6 or `EF…` reference (`?ref=` prefills) |
| `/appeal` | Appeal | New: first appeal against an ERO order, tracking, second appeal |
| `/objection` | Objection | Form 7 objections by signed-in voters and BLAs |
| `/electoral-roll` | ElectoralRoll | Roll search by EPIC or details |
| `/booths` | Booths | Polling station by EPIC or area |
| `/map` | PollingStationMapPage | Fixed: map of approved stations, EPIC lookup, directions |
| `/report-violation` | ReportViolation | Now live: cVIGIL report with photo and location, tracking |
| `/candidates` | Candidates | Published list of contesting candidates, affidavit headlines |
| `/results` | Results | Read-only counting from the registered source (mock data labelled) |
| `/states`, `/states/:slug` | StatePortal | State and UT election offices |
| `/media` | Media | Awareness and publications |
| `/roles` | Roles | Roles and what each may do |
| `/training`, `/training/poll-day` | Training, TrainingSimulator | Practice modules for signed-in roles |
| `/phone` | PhoneScreen | Phone simulator for demos |

### Sign-in

| Route | Page |
| --- | --- |
| `/signin` | SignInHub: choose your role |
| `/signin/:roleId` | PortalLogin: EPIC-format ID, then OTP |
| `/login/otp` | LoginOtp |
| `/blo/login`, `/blo/password`, `/blo/forgot` | BLO ID and password; first-time password change; reset by mobile OTP |

### Signed-in work screens

| Route | For | What it does |
| --- | --- | --- |
| `/desk` | Every role except the voter | The role's own dashboard; `?tab=<id>` opens a tab |
| `/dashboard` | Voter | Roll entry, Form 6 and Form 8 status, other forms, identity verification |
| `/verify` | Voter | Persona identity verification |
| `/admin` | BLO | Form 6 and Form 8 field verification, new-voter tasks, review cases |
| `/ero` | ERO, AERO | Form 6, 7 and 8 decisions, new-voter tasks, roll versions |
| `/deo` | DEO | Propose stations and relocations, appoint election staff |
| `/ro` | RO, ARO | Scrutiny, contesting list, scrutiny delegation, polling parties |
| `/candidate` | Candidate | File, track or withdraw a nomination; appoint agents |
| `/agent` | Election agent, counting agent | Agents and appointments |
| `/poll-day` | Polling party, BLO, polling agent, micro observer | Mock poll, open, mark, queue, cases, close |
| `/poll-day/presiding-officer` | Presiding officer | Checklists, register, cases |
| `/counting` | RO, ARO, counting staff, agents, observers | Plan, randomisation, rounds, discrepancies, recount, VVPAT draw |
| `/control-room` | Officials with `control:view` | Stations, alerts, incidents; escalation up to the Commission |
| `/eci/dashboard`, `/eci/elections`, `/eci/integrations`, `/eci/voting-verification` | ECI administrator | Accounts and assignments; elections; data sources and audit integrity; verification review |
| `/workspace` | Fallback | Redirects to `/desk` |

Redirects kept for old links: `/login`, `/eci/login`, `/portals`, `/services`, `/cvigil`, `/suvidha`, `/encore`, `/ceo-himachal`, `/workflows`, `/media-publications`.

## Backend modules

Thirty-eight mounts under `/api/v1`; the full list of 242 endpoints is in the appendix.

| Mount | Controller | Purpose |
| --- | --- | --- |
| `/auth` | auth.controller | OTP sign-in, BLO sign-in, Form 6 intake, step-up, sign-out |
| `/electors`, `/verification`, `/persona` | elector, verification | Roll search, identity verification, Persona webhook |
| `/admin` | admin.controllers | BLO field verification and ERO decisions for Form 6 and Form 8 |
| `/changes` | changeRequest | Form 8 from the voter dashboard |
| `/objections` | objection | Form 7 from voters and BLAs |
| `/elector-forms` | formcontroller | Forms 2, 2A, 3, 6A, 6B, 7, 8 |
| `/appeals` | appeal | New: s. 24 roll appeals |
| `/registration-tasks`, `/integrations` | registrationTask, integration | New-voter pipeline from approved data sources |
| `/roll-versions` | rollVersion | Immutable, hashed roll versions |
| `/assignments`, `/users` | assignment, user | Role assignments, including nodal subject and agent appointment |
| `/elections` | election | Election schedule and stage |
| `/polling-stations` | pollingStation | s. 25 workflow and station issues |
| `/nominations`, `/agents` | nomination, agent | Nominations, scrutiny, candidate list, agents |
| `/campaign-permissions`, `/expenditure` | campaignPermission, expenditure | Campaign permissions; registers and shadow register |
| `/complaints` | complaint | New: cVIGIL complaints and seizures |
| `/poll-day` | pollDay, stationReport (new), offline | Station operations, machine log, PO report, offline package and sync |
| `/control-room` | controlRoom | Station overview, incidents, visits |
| `/security`, `/logistics`, `/nodal` | security, logistics, nodal | Police planning; party and material movement; nodal officers |
| `/oversight` | oversight | Observer reports and Commission directions |
| `/counting`, `/results` | counting, result | Counting operations; read-only results from a registered source |
| `/reports` | report | District, State and national summary; roll of a part |
| `/audit`, `/events`, `/devices`, `/training`, `/public` | various | Audit search and integrity, live events, station devices, training, public reads |

## How things move from one step to the next

In every flow, intake is never approval, the officer who decides is never the one who reports, and only the decision changes the official record; every step writes an audit event.

### Becoming an elector (Form 6)

1. **Applicant** (`/register`): `POST /auth/register` creates a `pending` registration with a reference; documents are stored separately, and an identical open application is refused.
2. **BLO** (`/admin`): field-verifies it and records the part and polling station. Status becomes `field_verified`. The roll is not changed.
3. **ERO/AERO** (`/ero`): approves with step-up. One transaction creates the elector and EPIC and the voter account, and deletes the documents. A rejection carries a reason.
4. **Applicant**: follows it on `/check-request`; once approved, signs in at `/signin/voter`. They may appeal within 15 days.

### Forms 2, 2A, 3, 6A, 6B, 7 and 8

1. **Anyone** (`/voters/forms/...`): the first step, "Addressed to", picks State, district and constituency. The form becomes `submitted` with an `EF…` reference.
   - Aadhaar is never stored, only its last 4 digits and a salted hash.
   - Files are checked by their bytes: JPEG, PNG or PDF, up to 6 MB.
   - For 6B, 7 and 8 the entry must be in the chosen constituency's roll; a Form 8 shift is addressed to the new constituency.
2. **BLO** (desk, Forms 2-8): records a recommendation and the method; for inclusions and shifts, also the part and station. Status becomes `field_verified`.
3. **ERO/AERO** (desk, Forms 2-8): approves (step-up) or rejects with a reason. Only an approval changes the roll:
   - 2, 2A, 3, 6A: a new service or overseas elector with an EPIC, plus a voter account
   - 6B: an authentication record on the entry
   - 7: the entry is marked deleted, keeping the order; nothing is erased, and no decision is allowed within the notice period
   - 8: a shift (new constituency, part, station, serial), up to 4 corrections (audited before and after), a replacement EPIC, or PwD marking
4. **Applicant**: `/check-request?ref=EF…` and the voter dashboard show the status and reasons.

### Form 7 objections by voters and BLAs

1. A voter, or a BLA for their own part (at most 10 a day), files on `/objection`.
2. The person objected to is notified and may reply during the notice period.
3. The BLO reports from the field.
4. The ERO decides with step-up. An accepted objection marks the entry deleted.

### Roll appeals (new)

1. **Appellant** (`/appeal`): files using the application reference and date of birth, within 15 days of an approved or rejected order. One pending appeal per order. Status `first_appeal`, reference `AP…`.
2. **DEO** (desk, Roll appeals): after hearing, dismisses (`first_decided`), or allows or remands (`with_ero`), with reasons and step-up.
3. **Appellant**: within 30 days of a dismissal, files a second appeal from the same page (`second_appeal`).
4. **CEO** (desk, Second appeals): decides with the same outcomes.
5. **ERO** (desk, Appeal orders): carries the order out in the roll and marks it `implemented`.

### Polling stations (RP Act 1951, s. 25)

1. **Anyone working in the area** (sector officer, RO, ERO, BLO, BLA, candidate) can report a station problem. The DEO closes it with what was done.
2. **DEO** (`/deo`): drafts a new station or relocation. Stage `DISTRICT_REVIEW`. The station is `PROPOSED` and not public.
3. **DEO** (desk): records the consultation with parties (who, date, outcome, objections). Stage `STAKEHOLDER_CONSULTATION`.
4. **DEO**: forwards to the CEO (`SENT_TO_CEO`). This is refused without a consultation record.
5. **CEO** (desk): forwards to the Commission with remarks (`SENT_TO_ECI`), or returns it.
6. **ECI**: gives prior approval with the Commission's order reference (step-up; `ECI_APPROVED`), asks for clarification (`CLARIFICATION_REQUIRED`), or rejects. The proposer can never approve their own change.
7. **DEO**: issues the final order and publishes (step-up). The station becomes `ACTIVE` with a new version, and a relocation moves every elector of the part and shows a notice.
8. **Everyone**: `/booths`, `/map`, EPIC lookup and staff assignments use only `ACTIVE` stations.

### Elections, nominations and the candidate list

1. **ECI** (`/eci/elections`): announces an election with an ordered schedule. The stage follows the IST calendar. A revision needs a reason, and the old schedule is kept.
2. **Candidate** (`/candidate`): files while nominations are open. Must be 25 or older on scrutiny day; one live nomination per election. May withdraw until the last date of withdrawal.
3. **RO**, or an ARO the RO has delegated to (`/ro`): scrutinises and records the order.
4. **RO**: publishes the frozen list of contesting candidates (step-up) once every nomination is scrutinised. It is public on `/candidates`.
5. **Candidate**: appoints an election agent, polling agents and counting agents. The agent's desk shows the nomination, read only.

### Campaign permissions

1. **Candidate or election agent**: applies for a meeting, rally, procession, vehicle, loudspeaker, office, helipad or door-to-door team. Meetings and processions in the 48 hours before the poll closes are refused (s. 126).
2. **Police** (sector or district police officer): for events in public places, give "no objection", or an objection with reasons.
3. **RO/ARO**: grants with conditions (a permit number is issued) or refuses with a reason. Granting over a police objection needs a recorded reason.
4. **Applicant**: sees the outcome and can withdraw while the application is open.

### Expenditure

1. **Candidate or agent**: enters payments in an append-only register; a correction supersedes an entry with a reason.
   - Cash above ₹10,000, or a missing voucher, is flagged.
   - Totals are shown against the ceiling: ₹40 lakh for an Assembly constituency, ₹95 lakh for a Parliamentary constituency (both configurable).
2. **Expenditure observer**: reads the registers, notes entries, and keeps a shadow register of events seen with estimated costs. Observed spend above reported spend is highlighted.
3. **Observer**: files a report to the Commission, which may direct the RO to issue a notice.

### MCC complaints (cVIGIL, new)

1. **Anyone** (`/report-violation`): reports with category, constituency, place, optional GPS location and photo, anonymously or not. Status `received`, reference `CV…`; the 100-minute clock starts.
2. **DEO, Deputy DEO, RO or ARO** (desk, MCC control room): sends a flying squad of that constituency (`assigned`), or drops the report with a reason.
3. **Flying squad** (desk): reports what it found and did, plus any seizures (cash, liquor, drugs, freebies, precious metals) with their value. Status `field_reported`.
4. **RO/ARO**: disposes with a reason: action taken, notice issued, referred to police, referred elsewhere, or not substantiated.
5. **Complainant**: follows it by reference and sees the steps, never the officers' identities. Seizures roll up into the district report.

### Poll day

| When | Who | Action and record |
| --- | --- | --- |
| Before | Sector officer | Logistics: party dispatched, reached, station set up |
| Before | Police | Vulnerability category per station, deployments, situation reports |
| Morning | Presiding officer | Mock poll, then poll open (poll date only); the machine log records mock poll, clearing, sealing |
| During | Polling officer | Checks the ID document, photo and ink, then marks the register; once per election, even with two officers at once |
| During | Polling officer or agent | Identity doubt or challenge; marking blocks until the presiding officer decides |
| During | Presiding officer | Tendered votes, assisted voters, queue reports (public at `/public/stations/:id/queue`) |
| Any time | PO, micro observer, sector officer | Incident to the control room. It escalates sector officer, RO, DEO, CEO, then the Commission (only the CEO can refer it). Once with the Commission, it closes only after a Commission direction on it is complied with (s. 57 / 58 / 58A). |
| Close | Presiding officer | Poll closed; electors in the register recorded; close pressed and sealing logged |
| After | Presiding officer | PO report (diary and Form 17C Part I), compared with the register; differences flagged |
| After | Sector officer | Party departed, material received, strong room sealed |
| After | RO, DEO, CEO, observers | Desk, Station reports: PO reports, flags, replacements, malfunctions |

The register stores who voted (serial, document type, time, officer), never how anyone voted.

### Observers and Commission directions

1. **Observer**: files a report with topic, severity, facts and recommendation. A micro observer's report also reaches the general observer. Reports are confidential: the DEO sees the district's; the RO, candidates and agents never do.
2. **CEC, EC or ECI**: acknowledges, seeks information (the observer then adds to the report), or closes it.
3. **CEC or EC**: issues a direction with step-up, to an addressee role in an area, under a legal basis: Article 324, s. 20B, 57, 58, 58A, MCC, expenditure, or administrative.
4. **Addressee** (desk, Directions): reports compliance with evidence.
5. **CEC or EC**: closes the direction or returns it.

### Nodal officers

1. **DEO or CEO**: designates a nodal officer for one subject (EVM, training, transport, material, expenditure, MCC, media, SVEEP, postal ballot, accessibility, IT, law and order, manpower, complaints).
2. **DEO, Deputy DEO or CEO**: gives tasks to a subject.
3. **Nodal officer**: files progress reports and works tasks for their subject only.
4. **Coordinators**: see every subject at a glance.

### Counting and results

1. **RO**: sets the counting plan, randomises staff to tables, records rounds (counting supervisors their own tables, the ARO assisting), runs the VVPAT draw, and decides discrepancies.
2. **Counting agent, supervisor or observer**: raises a discrepancy, including a Rule 63 written recount request, which the RO decides with reasons.
3. **Public** (`/results`): shows only what a registered result source sends (an official feed or a labelled mock). Checks compare the machine count with the register, flag more votes than electors, corrections received, and a declared winner who is not ahead. Nothing can edit or delete a result.

### Reports

`GET /reports/summary` counts everything in the caller's jurisdiction: electors, pending applications, stations and stages, staff, nominations, incidents, permissions, expenditure, observer reports (where allowed), directions, nodal tasks, complaints, seizures and appeals. It breaks down one level below the caller (national to State, State to district, district to constituency) and downloads as CSV.

## What changes what

Each decision writes its record, its audit event and (usually) a live event in one transaction, so everything downstream reads the new state at once.

| Action | Records written | Visible to / effect |
| --- | --- | --- |
| ERO approves a Form 6 | `elector`, `user`, `registration`, audit, event `REGISTRATION_DECIDED` | Roll search, voter sign-in, `/booths`, poll-day part list, reports |
| ERO approves a Form 2, 2A, 3 or 6A | `elector` (category), `user`, `eform` | Same, counted as service or overseas electors |
| ERO approves a Form 7 deletion | `elector.isActive=false` plus the deletion order | Gone from search, the poll-day list and roll versions; kept in the record |
| ERO approves a Form 8 shift | `elector` (constituency, part, station, serial) | Appears on the new part's poll-day list; leaves the old one |
| DEO publishes a relocation | `station` (new version), every elector of the part | `/booths` and `/map` show the new place with a notice; staff and the poll-day station follow |
| ECI approves a station | `pendingChange.stage = ECI_APPROVED`, audit | DEO's desk shows "Issue order and publish"; nothing public yet |
| RO publishes the candidate list | Contesting list (frozen) | `/candidates`; counting and results must match it |
| Polling officer marks an elector | Register entry, `poll:voted`, event `TURNOUT_UPDATED` | Turnout on the station screen, control room and `/results` turnout |
| Presiding officer closes the poll | Poll state `closed` | PO report becomes possible; control-room alerts stop |
| CEO refers an incident to the Commission | Incident at level 4 | CEC/EC can direct; nobody can resolve it until the direction is complied with |
| Flying squad records a seizure | Complaint `seizures[]` | District and State "Seized" figure; expenditure observer's view |
| Police mark a station critical | `security-assessment` (new version) | Police, civil chain and observers; never public |
| Nodal officer files a report | `nodal-report` | DEO/CEO "functions at a glance" |
| Commission issues a direction | `direction`; the linked report becomes `direction_issued` | Addressee's desk (needs compliance); observers in the area |
| Appeal allowed | Appeal `with_ero` | ERO's "Appeal orders" until implemented |

## Demonstration script (about 25 minutes)

Eight short scenes, each handing a record from one role to the next; set `STEP_UP_REQUIRED=false` for speed, or approvals ask for a fresh OTP.

**Setup.** Start Redis, then `cd backend && npm run seed && npm run dev`, and separately `cd frontend && npm run dev`. OTPs print in the backend terminal.

1. **Public side (3 min).** Voters menu, Polling station map: zoom into Ludhiana, click a station (facilities, Directions), then find EPIC `DMB5000001`. On `/report-violation`, file a cash complaint in Punjab, Ludhiana, Ludhiana South; note the `CV…` reference and the clock.
2. **cVIGIL loop (4 min).**
   - **DEO1000001**, desk, MCC control room: send the new report to FST1000001.
   - **FST1000001**, Assigned reports: field report with a ₹50,000 cash seizure.
   - **ROF1000001**, MCC complaints: dispose as referred to police.
   - Back on `/report-violation`, Follow a report: disposed, with the time against 100 minutes.
3. **Roll (5 min).**
   - Public `/voters/forms/form-8`: address it to Ludhiana South, EPIC `DMB5000003`, correct the name, submit.
   - **BLO-PB-000001**, desk, Forms 2-8: field-verify.
   - **ERO1000001**, Forms 2-8: approve; `/electoral-roll` shows the new name.
   - Then the demo appeal against the rejected Form 6A: **DEO1000001**, Roll appeals: allow; **ERO1000001**, Appeal orders: mark implemented.
4. **Polling station change (4 min).**
   - **DEO1000001**, Polling-station changes: forward "Community Hall, Haibowal Kalan" (already consulted) to the CEO.
   - **CEO1000001**: forward with remarks.
   - **ECI1234567**, Polling-station approvals: approve with reference `ECI/464/PS/2026`.
   - **DEO1000001**: issue the order and publish; the station appears on `/map` and `/booths`.
5. **Campaign (3 min).**
   - **EAG1000001**, Campaign permissions: apply for a rally in 3 days.
   - **SPO1000001**, Police remarks: no objection.
   - **ROF1000001**: grant with conditions.
   - **EOB1000001**, Candidates' registers: Gurpreet Sandhu's shadow register exceeds the reported spend.
6. **Poll day (4 min).**
   - **PRO1000001**, `/poll-day`: mock poll, then open (on the demo poll-day date).
   - **POL1000001**: mark an elector.
   - **PRO1000001**: report an EVM malfunction; desk, Machine log: unit replaced.
   - **PRO1000001**: close the poll and submit the PO report with a deliberately different vote count.
   - **ROF1000001**, Station reports: the difference is flagged.
7. **Oversight (2 min).**
   - **CEC1000001**, Observer reports: the expenditure observer's report has a direction to the RO.
   - **ROF1000001**, Directions: report compliance.
   - **CEC1000001**: close it.
8. **Reports (1 min).** **CEO1000001**: the State report by district, then download the CSV. **ECI1234567**: the national picture by State (Punjab, Himachal Pradesh, Delhi).

## Demo data

`npm run seed` adds 93 map-located polling stations, about 2,000 electors and records at every stage of every workflow; it is safe to run again (each block is written once), and `redis-cli flushall` then `npm run seed` starts fresh. All of it is invented.

| Data | Amount |
| --- | --- |
| Demo accounts | One per role (34), plus DEO Amritsar, DEO Shimla, CEO Himachal, ERO Amritsar East and a second flying squad, each with an assignment |
| Elections | Demo general election (nominations open), demo bye-election (scrutiny), demo poll-day election (poll on the day of seeding), demo past bye-election (completed, mock results) |
| Approved polling stations | 93, located on the map: Ludhiana (8 constituencies), Amritsar (4), Jalandhar (3), Patiala (2), Shimla (3), New Delhi (2) |
| Station proposals | 5: Draft, Consulted, With CEO (two), With ECI |
| Electors | About 2,000, with serials, relatives and houses; some service, overseas and PwD electors |
| Forms 2-8 | 7, across submitted, field verified, approved and rejected |
| MCC complaints | 8 across every status, with seizures; 2 flying squads |
| Campaign permissions | 7 across every status |
| Expenditure | 30 entries for 4 candidates, with flags and an observer note; 1 shadow-register entry |
| Observer reports, directions | 3 reports (general, micro, expenditure); 2 directions (one issued, one complied) |
| Roll appeals | 1 first appeal |
| Poll-day incidents | 4,4. ERONET — Electoral Roll Management

Official link: ERONET / Electoral Roll Management
Core election administration system

ERONET is one of the most important systems in your list. Its purpose is the management of electoral rolls and the registration-related workflow handled by election officials.

It has historically provided a centralised, standardised platform across States and Union Territories. ECI now describes its successor/integrated functionality as the Electoral Roll module, previously ERONET, within ECINET. 
Election Commission of India+1
A. Elector registration and application processing

The system supports the principal electoral registration forms:

Form
	

Purpose

Form 6
	

Inclusion of name in the electoral roll

Form 6A
	

Registration of overseas electors

Form 7
	

Objection to inclusion / deletion of a name

Form 8
	

Shifting of residence, correction, replacement EPIC and other permitted changes

Associated functions:

    Receive applications originating through the citizen-facing registration channels.

    Maintain application records.

    Forward applications into the election-official processing workflow.

    Support BLO field verification.

    Provide ERO/AERO decision-support functionality.

    Record the outcome of applications.

    Maintain the electoral database after decisions.

    Support correction, migration, inclusion and deletion workflows.

B. Electoral-roll database management

    Maintain a common, standardised electoral-roll data structure.

    Use common forms and data fields.

    Maintain consistent electoral-roll templates.

    Standardise the generation and printing of electoral rolls.

    Support roll management across different States and Union Territories.

    Maintain a unified database for electoral-roll operations.

    Facilitate tracking of individual application progress.

C. BLO and field-verification integration

    Receive applications requiring field verification.

    Enable BLO verification of submitted information.

    Support verification of the elector's residence and registration particulars.

    Feed field-verification findings into the ERO/AERO decision process.

    Support the updating of elector records based on approved decisions.

D. Duplicate and suspicious record detection

ECI documentation describes two specific capabilities:

    PSE — Photo Similar Entries: identification of potentially similar elector photographs.

    DSE — Demographically Similar Entries: identification of potentially similar elector records using demographic information.

The system uses AI-assisted identification to flag possible duplicate or problematic entries for administrative examination. These flags are not, by themselves, proof that an elector is ineligible or a substitute for the legally required verification and decision.
E. Monitoring and analytics

    Application progress tracking.

    Officer-wise performance reporting.

    Disposal and pendency monitoring.

    Electoral-roll statistics.

    Decision-support reports.

    Analytics concerning registration and roll-management activities.

The official ECI description also identifies multilingual support, including 14 languages and 11 scripts in its ERONET documentation. 
Election Commission of India+1

The important workflow: Citizen application → BLO verification, where required → ERO/AERO decision → electoral-roll update.

What ERONET is not: It is not the polling-day voter-identification interface. It primarily manages electoral registration and roll data before the election.
5. BLO App — GARUDA

Official link: GARUDA / BLO Portal
Current app listing: BLO App – ECI on iOS
Field-level election administration

GARUDA is associated with the dedicated mobile application for Booth Level Officers. The current ECI app is called BLO App.

Its purpose is to move part of the BLO's work from paper-based registers and manual field reporting to mobile-based data collection and verification.
A. Electoral registration and field verification

    View and work on assigned elector-related forms.

    Use a checklist for field verification.

    Verify elector information in the field.

    Fill and submit electoral forms on behalf of electors.

    Conduct house-to-house verification using the online BLO Register.

    Record verification-related information against elector records.

    Digitise Enumeration Forms in applicable Special Intensive Revision workflows.

    Upload supporting documents for elector verification.

    Record comments or observations associated with verification.

    Support field-level correction and discrepancy-handling workflows.

B. Polling-station data collection

This is an important feature set that is easy to overlook.

    Collect AMF — Assured Minimum Facilities data.

    Collect EMF — Essential Minimum Facilities data.

    Capture polling-station GPS/GIS coordinates.

    Update photographs of polling stations.

    Record available facilities at the station.

    Record distances to nearby facilities such as bus stands, police stations, fire stations, fuel pumps, hospitals and parking areas.

These functions help election administrators assess polling-station accessibility and readiness. 
Press Information Bureau+1
C. Additional functions appearing in the current app's public update history

The iOS app's release notes disclose additional workflows, including:

    PSE and DSE activity.

    Mobile-number viewing in PSE-related work.

    National House Number capture.

    VIP elector-related updates.

    EPIC delivery-related functionality.

    Notice delivery and hearing-related workflows.

    Uploading death certificates in applicable cases.

    Supporting-document uploads for logical discrepancies.

    Additional BLO comments in SIR workflows.

    Identification of incorrect self-mapping across States.

    Training videos in Hindi and English after login.

Some release notes concern specific States or revision exercises. They should not be assumed to be enabled for every BLO in every election. The app-store changelog also does not expose the complete logged-in feature set. 
App Store+2
D. What it does not establish

The publicly documented BLO App functionality should not be confused with a complete polling-day voter authentication system. BLO field verification, electoral-roll maintenance and polling-station readiness are different tasks from checking an elector at the polling station when they arrive to vote.
6. ECI eBooks

Official link: ECI eBooks
Digital publication library

This is an electronic publication and reading facility.

Features

    Digital access to ECI books and publications.

    Online book reading.

    Chapter or table-of-contents navigation where supported.

    Page-by-page navigation.

    Mobile-friendly reading interfaces for supported publications.

    Page selection and printing options in supported readers.

    Printable or downloadable publication access where provided.

    Access to election-related historical publications, statistical material and educational content.

Examples include ECI's Leap of Faith publications and interactive election-statistics material such as the ECI Atlas. The exact reader functions vary by publication; not every eBook necessarily supports the same print or download options. 
eci.gov.in+2

Difference from Handbooks: eBooks primarily provide reading and educational/publication material. Handbooks and manuals are more directly structured around operational procedures and officer responsibilities.
7. ECI FAQ

Official link: ECI Frequently Asked Questions
Public information and knowledge base

The FAQ portal is designed to answer questions about the electoral process and ECI procedures.
Categories covered

Category
	

Subject

Elections
	

General election procedures

EVM
	

Electronic Voting Machines and related safeguards

Political parties
	

Registration of political parties

Model Code of Conduct
	

MCC rules and restrictions

Conduct of Elections
	

Election procedures and administration

Voters/Electors
	

Registration and elector rights

Council of States
	

Rajya Sabha elections

Presidential Election
	

Presidential election procedures

RO/DEO FAQs
	

Operational questions for election officers

Election Machinery
	

Election administration structure

Parliament
	

Parliamentary election-related information

Delimitation
	

Constituency delimitation

Contesting Elections
	

Candidate eligibility and process

Counting and Declaration
	

Vote counting and result declaration

How to Register
	

Elector registration instructions

eci.gov.in
EVM FAQ: more detailed coverage

The EVM FAQ alone is a substantial reference, with 129 questions in its indexed edition. Topics include:

    General introduction to EVMs.

    Administrative procedures and safeguards.

    Technical features and safeguards.

    Legal provisions and judicial scrutiny.

    Common misconceptions about EVMs.

The cited edition was updated on 15 July 2025. 
Election Commission of India
Voter registration FAQs

The registration guidance explains the purpose of Forms 6, 6A, 7 and 8 and how electors use them for inclusion, overseas-elector registration, objection/deletion and corrections or shifting. 
Election Commission of India

What it does not do: The FAQ is not an application-processing engine. It explains how to use services; the actual application is filed through the relevant service.
8. Election Planning Portal — ePlan

Official link: Election Planning Portal
Internal election planning and scheduling system

ePlan is primarily intended for higher-level election planning by the ECI and Chief Electoral Officers (CEOs) of States and Union Territories.

It is not a voter-facing platform. It helps administrators prepare for upcoming elections, maintain schedules and monitor planning activities.
Features

Module
	

Functionality

Vacancy management
	

Track vacancies that may require bye-elections

Upcoming elections
	

Maintain information about upcoming election requirements

Bye-election planning
	

Plan elections arising from vacancies

Election scheduler
	

Assist with the scheduling of elections

Holiday management
	

Record and manage holidays relevant to election planning

Security management
	

Support security-related election planning

Electoral data dashboard
	

Provide a quick overview of electoral data

Planning dashboard
	

Give officials a consolidated view of state and parliamentary election planning

Automatic alerts
	

Alert officials about planned activities and overdue tasks

SMS communication
	

Communicate planning updates to State officials

Email communication
	

Send notifications and updates to relevant officials

The ECI's documentation describes access for CEOs of States/UTs and relevant ECI planning and zonal divisions. 
Election Commission of India+2

The central idea: It helps officials answer what elections are coming, what preparation is required, when activities are due and where planning is falling behind.
9. Training Materials

Official link: ECI Training Materials
Training and capacity-building repository

This is a resource collection for election officials. Its purpose is to prepare different categories of election staff to perform their duties correctly.
Subjects covered

Training area
	

Topics

IT Applications
	

Use of ECI's digital election applications

Poll Process
	

Procedures before, during and after polling

Counting of Votes
	

Counting procedures and result-related processes

Nomination
	

Candidate nomination and scrutiny

Paid News
	

Detection and handling of paid-news cases

MCMC
	

Media Certification and Monitoring Committee processes

Vulnerability Mapping
	

Identification of vulnerable polling areas and voters

EVM/VVPAT
	

Handling, preparation, use and safeguards

MCC
	

Model Code of Conduct implementation

Symbol Allotment
	

Procedures for allotment of election symbols

These subjects are explicitly identified in the ECI training-material description. 
Election Commission of India+1
Practical training covered in the material

Examples include:

    EVM and VVPAT handling.

    Mock-poll procedures.

    Polling-station preparation.

    Clearing data and preparing equipment.

    Responsibilities of Presiding Officers and Polling Officers.

    Election-day operational procedures.

    Counting-related training.

    Training for officials working in different election-management roles. 
    2सत्यमेव जयतेCHECKLIST FOR

Important limitation: The existence of training material does not establish that the old page is a complete Learning Management System. I could verify the training-resource collection, but not a comprehensive public facility for course enrolment, assessments, certificates or individual progress tracking.
10. Observer's Portal and Observer App

Official reference: ECI Observer Portal
Election monitoring and independent oversight

The Observer system supports officials appointed to monitor the conduct of elections.

The principal observer categories include:

    General Observers.

    Police Observers.

    Expenditure Observers.

It has a web-facing portal and a mobile application. These are related but should not be treated as identical interfaces.
A. Observer web portal

1. Observer profile and deployment

    View personal information.

    Update or correct personal information where permitted.

    Maintain bank details and local contact information.

    View assigned State and constituency.

    View deployment information.

    View deployment dates.

    Access nodal-officer contact details.

    Check observer deployment status.

2. Reports and documentation

    Submit arrival reports.

    Submit daily reports.

    Submit post-poll reports.

    View and review submitted reports.

    Upload required reports and documents.

    Access prescribed reporting formats.

    Download relevant election documents.

3. Communication

    View Commission instructions.

    Access notices and messages.

    Receive communication from the Commission.

    Access observer-related information and updates.

4. Election information

    View constituency-related details.

    Access candidate information.

    View the final contesting-candidate list, including information from Form 7A.

    Access relevant observer deployment and election reports.

    Download or print the observer identity card where the portal supports it.

These functions are documented in the official observer-portal and observer-handbook material. 
Election Commission of India+1
B. Observer mobile app

The mobile interface supports field-level use.

Its publicly documented functions include:

    Observer login using observer ID, code and password.

    View observer deployment schedule.

    View constituency details.

    View polling-station numbers and elector information.

    Access RO office details.

    Submit arrival and departure reports.

    View notices and Commission communications.

    Access cVIGIL complaint-related information.

    Record observer remarks.

    View flying-squad locations on a map.

    Access contact information for relevant election officials.

    Submit reports and access observer-related information while deployed.

The mobile app and portal are intended to keep observers connected to the Commission and provide a structured way to monitor and report election-related activities. 
Election Commission of India+2

The distinction: An observer is not simply another administrative user. The Observer system is designed around monitoring, reporting and oversight of the election machinery.
11. ENCORE — Election Management and Candidate/Election Official Workflows

Official link: ENCORE
Major election-official workflow platform

This is one of the most functionally significant platforms in your list.

Your provided description focuses on the nodal-officer permission workflow. That is only one part of the broader election-management functionality.

ECI documentation describes ENCORE as the election-officials module previously known as ENCORE within ECINET. The documented functionality covers nomination, scrutiny, election permissions, counting, expenditure monitoring and post-election reporting. 
eci.gov.in+1
A. Candidate nomination management

The candidate nomination workflow supports:

    Candidate profile creation.

    Candidate information entry.

    Nomination form completion.

    Affidavit entry and upload.

    Criminal antecedent disclosures.

    Security deposit information.

    Multiple nominations by the same candidate.

    Candidate nomination status tracking.

    Digitisation of nominations submitted physically.

    RO-side nomination record management.

    Publication of candidate information and affidavits through related public interfaces.

Candidates can initiate information submission electronically, but this does not mean the entire legal nomination process is completed online. The prescribed physical submission requirements still apply under the documented Suvidha workflow. 
Election Commission of India+1
B. Scrutiny and finalisation

After nominations are filed, the RO uses the relevant system functionality to handle the scrutiny process.

Features:

    View filed nominations.

    Examine nomination records.

    Mark nominations as accepted or rejected.

    Record nomination decisions.

    Manage multiple nominations submitted by the same candidate.

    Record withdrawals.

    Allot election symbols.

    Finalise the list of contesting candidates.

    Serialise the final candidate list.

    Generate Form 7A.

This module connects candidate nomination to the final contesting-candidate list. 
Election Commission of India
C. Election Permissions — Suvidha integration

This is the module described in the link you supplied.

It acts as a single-window permission-management system for candidates and political parties.

Applicant-side functionality

    Create a candidate/party profile.

    Submit requests for election-related permissions.

    Submit permission requests online.

    View application reference numbers.

    Track the status of requests.

    View approval or rejection.

    Download permission orders.

    Access permission-related documents.

    View the permission application history.

Permission categories

Examples of permissions include:

    Public meetings.

    Rallies.

    Loudspeakers.

    Campaign vehicles.

    Temporary campaign offices.

    Other campaign-related activities requiring permission.

Nodal-officer functionality

    Receive permission applications assigned to the relevant department.

    Review applications.

    Record objections.

    Record no-objection decisions.

    Approve or reject requests through the designated workflow.

    Handle requests originating online or entered into the system after physical submission.

    Manage assignments across multiple nodal officers.

    Track pending applications.

    Send status updates.

    Provide approved permission documents.

The Nodal Officer's mobile interface is especially relevant: it allows the assigned department to act on requests without relying exclusively on the central web interface. 
Election Commission of India+1
D. Counting management

This module becomes particularly important on counting day.

Features:

    Preparation of the counting module before counting day.

    Activation of counting functionality in phases.

    Digitisation of EVM vote counts.

    Digitisation of postal-ballot counts.

    Entry of round-wise counting data.

    Tabulation of results.

    Consolidation of constituency-level results.

    Recording of counting information.

    Support for result declaration.

The ECI describes the counting module as part of the overall ENCORE election-management system. 
Election Commission of India+1
E. Online Index Card

The Index Card is a post-election statistical reporting function.

It captures information throughout the election cycle.

Features:

    Enter election schedule information.

    Record electoral-roll information.

    Record voter participation data.

    Enter candidate details.

    Enter party information.

    Record votes obtained.

    Record results.

    Record information about returned candidates.

    Submit the Index Card online.

    Allow CEO-level and ECI-level examination.

    Identify data inconsistencies through validation.

    Finalise and lock the approved statistical information.

ECI documentation also specifies publication of the Index Card within 72 hours of result declaration under the relevant process. 
Election Commission of India+1
F. Candidate expenditure monitoring

    Record candidate expenditure information.

    Maintain candidate-wise expenditure reports.

    Support online submission of expense statements.

    Provide DEO-level scrutiny and monitoring.

    Generate summary reports.

    Support compliance monitoring under election-expenditure rules.

    Maintain information submitted physically as well as online.

Election Commission of India

Important: ENCORE should not be understood as one screen or one application. It is a collection of election-management workflows connected to different roles and stages of the election.
12. cVIGIL — Citizen Complaint and Enforcement System

Official citizen portal: cVIGIL information
Dedicated case-management portal: cVIGIL
Real-time violation reporting and field enforcement

cVIGIL is designed to enable citizens to report potential violations of the Model Code of Conduct and election-expenditure rules.

It is different from an ordinary grievance portal because its focus is on time-sensitive evidence and action by field enforcement teams.
A. Citizen-facing application

    Capture a photograph of a suspected violation.

    Record a video of the incident.

    Automatically capture geographical location through GPS/GIS.

    Capture date and time information.

    Select or describe the type of violation.

    Submit the complaint.

    Receive a unique complaint/reference ID.

    Track complaint status.

    Submit complaints anonymously where the feature is available.

The use of live location-linked evidence is a defining feature of the system. 
Election Commission of India+1
B. District Control Room functionality

The District Control Room is an important component of the workflow.

    Receive submitted complaints.

    View complaint evidence.

    Check geolocation information.

    Screen irrelevant or frivolous complaints.

    Register valid cases.

    Assign cases to the appropriate Flying Squad Team.

    Monitor response progress.

    Track the status of the assigned case.

C. Flying Squad Team functionality

    Receive an assigned complaint.

    Access incident information.

    Navigate towards the reported location.

    Investigate the reported incident.

    Capture field-level evidence.

    Record action taken.

    Submit an investigation report.

    Update the complaint status.

D. Returning Officer and election-administration functionality

    View complaint information.

    Review field investigation findings.

    Examine the uploaded evidence.

    Decide the further action.

    Drop a complaint where appropriate.

    Dispose of a complaint after action.

    Escalate a complaint when required.

    Monitor case disposal and response time.

E. Time-bound workflow

ECI's documented process uses a 100-minute response timeline as the intended service standard for cVIGIL complaint handling. This is a process target, not a guarantee that every investigation or legal proceeding is completed within 100 minutes. 
Election Commission of India
F. What makes cVIGIL distinctive?

It connects:

Citizen report → Evidence and location → District Control Room → Flying Squad → Field investigation → RO decision → Closure/escalation.

This is one of the strongest examples in the ECI ecosystem of a digitally coordinated field-response workflow.
13. ETPBMS and Service Voter Portal

Official link: ETPBMS
Service-voter enrolment and postal-ballot administration

This link represents two related but distinct functions:

    Service Voter Portal: registration and management of service voters.

    ETPBMS: electronic transmission and management of postal ballots for eligible service voters.

Do not confuse ETPBMS with online voting. The elector still marks a physical postal ballot and returns it according to the prescribed procedure.
A. Service Voter Portal

    Record Officer access.

    Service-voter enrolment.

    Entry of service-voter application information.

    Form processing.

    Upload of structured/XML data.

    Forwarding of enrolment information to the ERO.

    ERO-side completion of enrolment.

    Maintenance of service-voter records.

B. Electronic Postal Ballot Transmission

For eligible service voters:

    Generate the relevant postal-ballot package.

    Generate the electronically transmitted postal ballot as a password-protected PDF.

    Transmit the ballot electronically to the designated Unit Officer.

    Send the corresponding PIN through a separate process to the Record Officer.

    Allow the service voter to access the ballot using the prescribed information.

    Enable printing of the ballot and required forms.

    Allow the service voter to mark the physical ballot.

    Return the marked ballot using the prescribed postal procedure.

The package includes Forms 13A, 13B and 13C, along with the postal ballot, as applicable. 
Election Commission of India
C. Security and authenticity

    Password-protected ballot access.

    Separate transmission of password/PIN information.

    Secure electronic transmission.

    End-to-end encryption in the documented process.

    Duplicate-prevention mechanisms.

    Verification of postal-ballot authenticity.

    Validation at the counting stage.

    Monitoring of service-voter ballot status.

D. India Post integration

ECI's more recent documentation describes integration with India Post, including free Speed Post return of service-voter postal ballots and enhanced dashboards and reporting for relevant stakeholders. 
Election Commission of India

Important distinction: The ballot is electronically transmitted, but the vote itself is cast on paper and returned through the postal process. It is not electronic ballot casting over the internet.
14. National Grievance Services Portal — NGSP

Official portal: NGSP
Multi-stakeholder grievance redressal

NGSP is a grievance-management system for complaints connected with election administration.

The officer login you shared is the administrative side of a broader complaint-handling system.
A. Citizen and stakeholder complaint submission

    Register a user profile.

    Use a mobile number for identification/contact.

    File a complaint.

    Select the appropriate complaint category.

    Describe the issue.

    Upload supporting documents where required.

    Receive a complaint/reference ID.

    Receive acknowledgement through SMS/email.

    Track complaint progress.

    View the response.

    View the response time.

    Submit suggestions through the relevant integrated citizen-facing functionality.

B. Complaint categories

The documented scope includes:

    Electoral registration.

    Polling booths.

    EVM-related issues.

    Election expenditure.

    Electoral malpractice.

    Other election-administration complaints.

C. Officer-side functionality

    Receive complaints.

    Assign complaints to the relevant authority.

    Route complaints to the appropriate official.

    View complaint details.

    Review uploaded supporting documents.

    Record responses.

    Update complaint status.

    Monitor pending complaints.

    Provide a response to the complainant.

    Track time taken for resolution.

D. Stakeholder coverage

The scope is broader than individual citizens. ECI documentation identifies complaints from:

    Citizens.

    Electors.

    Political parties.

    Candidates.

    Media.

    Election officials.

Complaints can be routed through national, State and district-level election-administration structures. 
Election Commission of India+1
E. Current citizen-facing integration

The current ECI service ecosystem also exposes complaint registration and tracking through ECINET-related services, alongside the Voter Mitra chatbot. 
Voters

Difference between NGSP and cVIGIL:

NGSP
	

cVIGIL

General election-related grievance handling
	

MCC and expenditure-violation reporting

Broad stakeholder coverage
	

Primarily citizen reporting and election enforcement

Officer assignment and response workflow
	

District Control Room and Flying Squad workflow

Supporting documents and complaint details
	

Live photo/video and location-linked evidence

General grievance tracking
	

Time-sensitive investigation and action

This distinction is important when designing a unified complaint system. A general grievance should not automatically be treated as an MCC violation requiring immediate Flying Squad deployment.
15. Additional ECI modules you should know about

These were not all individually listed in your links, but they are relevant because ECI's more recent documentation identifies them as part of its broader election-management ecosystem.

Leaving them out would give you an incomplete picture of the technology used during elections.
A. PRO Module — Presiding Officer Application
Directly relevant to polling day

The PRO module is designed for Presiding Officers to report polling-station activities.

Documented functionality:

    Report arrival of the polling party.

    Report completion of mock poll.

    Record poll commencement.

    Capture voter-turnout information.

    Record poll closure.

    Submit polling-station reports.

    Provide near-real-time polling updates.

    Enable ECI, CEO, DEO and RO officials to monitor polling activity across constituencies.

This is an important component because it connects polling-station activity to the election-control hierarchy. 
Election Commission of India
B. ESMS — Election Seizure Management System

Purpose: Coordinate enforcement agencies and monitor suspected election-related inducements and seizures.

Documented functions:

    Record cash interceptions and seizures.

    Record liquor-related interceptions and seizures.

    Record drug-related seizures.

    Record precious-metal seizures.

    Record freebies and other seized items.

    Digitise field-level interception reports.

    Coordinate information across State and Central enforcement agencies.

    Generate automated reports.

    Reduce duplicate data entry.

    Provide analytical information to CEO-level authorities.

Election Commission of India
C. IEMS — Integrated Election Expenditure Monitoring System

Purpose: Monitor political-party expenditure and financial compliance.

Documented functions:

    Receive political-party contribution reports, including Form 24A.

    Receive annual audit accounts.

    Receive election-expenditure statements.

    Digitise contribution details.

    Maintain expenditure-related records.

    Provide real-time compliance dashboards.

    Validate mandatory fields.

    Support bulk Excel imports.

    Send SMS/email alerts.

    Generate acknowledgements.

    Support Aadhaar e-sign.

Election Commission of India
D. EMS 2.0 — EVM Management System

Purpose: Manage the inventory and allocation of Electronic Voting Machines.

Documented functionality:

    Maintain EVM inventory.

    Conduct first-stage randomisation.

    Conduct second-stage randomisation.

    Involve political-party/candidate representatives in prescribed randomisation processes.

    Maintain machine identification information.

    Generate lists of uniquely identified machines.

    Support commissioning.

    Record mock-poll-related information.

This is relevant because EVM allocation and traceability are important parts of election preparedness. 
Election Commission of India
16. Consolidated feature matrix — all 13 platforms

This table is useful for comparing the responsibilities of the systems without confusing their roles.

Platform
	

Primary user
	

Main functionality
	

Election stage

Handbooks / Manuals
	

All election officials
	

Procedures, responsibilities, checklists
	

All stages

Compendium
	

Officials, legal and administrative staff
	

Instructions, circulars and rules
	

All stages

ERONET
	

BLO, AERO, ERO
	

Electoral registration and roll management
	

Pre-election

BLO App
	

BLO
	

Field verification, elector data, station facilities
	

Pre-election / field work

eBooks
	

Public, officials, researchers
	

Digital publications
	

General

FAQ
	

Citizens, candidates, officials
	

Procedural information
	

All stages

ePlan
	

ECI, CEO and planning officials
	

Election scheduling and planning
	

Pre-election

Training Materials
	

Polling and election staff
	

Training and operational guidance
	

All stages

Observer Portal
	

General, Police, Expenditure Observers
	

Monitoring, deployment and reporting
	

All stages

ENCORE
	

RO, DEO, CEO and other officials
	

Nomination, scrutiny, permissions, counting and reporting
	

Pre-election to post-election

cVIGIL
	

Citizens, DCC, FST, RO
	

MCC/expenditure complaint and enforcement
	

Election period

ETPBMS
	

Service voters, Record Officers and EROs
	

Service-voter postal-ballot management
	

Pre-election to counting

NGSP
	

Citizens and election officials
	

Grievance registration, assignment and resolution
	

All stages
17. Which systems handle which election activities?

This is the more important architectural view.

ECI election workflow — technology mapping

    Election preparation

    ePlan · Handbooks · Compendiums · Training Materials

    Planning, instructions, staff readiness and election schedules.

    Electoral-roll preparation

    ERONET · BLO App · Service Voter Portal

    Registration, verification, corrections, roll management and service-voter enrolment.

    Candidate nomination and campaign preparation

    ENCORE · Suvidha · Candidate Affidavit Portal · KYC

    Nominations, scrutiny, candidate details, permissions and expenditure-related procedures.

    Election monitoring

    Observer Portal · cVIGIL · NGSP · ESMS · IEMS

    Observer reporting, violation reporting, grievances, enforcement and expenditure monitoring.

    Polling-day operations

    PRO Module · EMS 2.0 · Observer App

    Polling-party reporting, mock poll, poll commencement, turnout, equipment allocation and field oversight.

    Counting and declaration

    ENCORE Counting · ETPBMS

    EVM/postal-ballot count entry, round-wise tabulation, service-voter ballot validation and results.

    Post-election reporting

    ENCORE Index Card · Observer Portal · IEMS

    Election statistics, observer reports and expenditure statements.

This mapping is based on ECI's published module descriptions, rather than an assumption that every module shares one common database or API. 
Election Commission of India+3
18. The most important findings for a polling-day management system

I want to highlight something that could materially affect your project architecture.

The ECI ecosystem already has considerable functionality for electoral rolls, polling-party reporting, EVM management, observer monitoring and complaints.

So simply reproducing these functions under a new UI would not be meaningful differentiation.

There is, however, an important distinction between monitoring a polling station and managing the actual elector-verification interaction at its entrance.

Requirement
	

Existing ECI functionality identified
	

What still needs careful examination

Find an elector
	

Electoral-roll search and roll-management facilities
	

Fast, polling-station-scoped lookup under heavy load

Establish voter eligibility
	

Electoral-roll records and prescribed identification procedures
	

A guided, auditable polling-day verification interface

Prevent repeat voting
	

Existing prescribed polling procedures and records
	

A reliable station-level duplicate-attempt and exception workflow

Polling-station readiness
	

BLO App and EMS-related facilities
	

Live polling-station readiness and operational issue tracking

Monitor polling
	

PRO module and Observer systems
	

Consolidated control-room view with actionable alerts

Handle complaints
	

cVIGIL and NGSP
	

Routing a complaint to the correct polling-day authority

Handle connectivity failure
	

Offline processes are part of election operations
	

A carefully reconciled, signed, station-specific offline application package

Manage queues
	

No complete queue-management workflow established by the cited material
	

Queue estimation, accessibility priority and station-level coordination

Handle exceptions
	

Existing election rules and reporting processes
	

Structured exception states, escalation and reasoned action records

Reconcile polling activity
	

PRO reporting and other election records
	

A unified, auditable polling-station reconciliation workflow

One particularly important finding: The PRO module documents arrival, mock-poll, commencement, turnout and closure reporting. It does not, in the cited description, establish a complete individual voter-authentication interface. Likewise, ERONET is principally an electoral-roll management system, not a polling-booth entrance workflow. 
Election Commission of India+1

That is a distinction worth preserving in your technical design.
19. What I could and could not verify

You asked for each and every feature. There is a limit to what can be honestly established from public information.

I have catalogued the functions disclosed in ECI's official pages, published descriptions, available manuals and public app release notes. I cannot certify every internal screen, button, permission, API endpoint or role-specific feature in the logged-in applications without access to those accounts and their respective environments.

In particular:

    ERONET, BLO App, ENCORE, Observer and NGSP: Their full role-specific internal interfaces are not publicly documented.

    ePlan: Its live planning workflows are restricted to authorised users.

    ETPBMS: Its complete operational workflow depends on service-voter and election-official access.

    cVIGIL: The citizen interface and official investigation interface expose different capabilities.

    ECINET: Its integration means that older standalone descriptions are not necessarily a complete picture of the current interface.

So treat this as a comprehensive publicly documented feature inventory, not a security-audited inventory of every hidden system capability. of different severities and states |
| Logistics | Steps for every Ludhiana South station |
| Security | 15 assessments (normal, sensitive, critical), 4 deployments, 4 situation reports |
| Nodal | 5 reports, 4 tasks |
| Station problems | 2 open |

## Known limitations and what is still needed

The biggest gaps for a real deployment are SMS OTPs, document storage, per-State appellate authorities and scale; everything below is a known, deliberate simplification.

1. **OTPs** are printed in the terminal and held in memory. Production needs SMS and Redis-backed OTPs.
2. **Biometrics:** the fingerprint is simulated. Persona needs real sandbox credentials.
3. **Appellate authority** is configured as the DEO. Under s. 24 it is whichever officer the State notifies (DM, ADM or another), so it should be mapped per State.
4. **Documents:** Forms 2-8 files and complaint photos are kept in Redis as data URLs. Production needs encrypted object storage with retention rules.
5. **Forms 2 and 2A:** there is no Record Office or Commandant certification step; the BLO step stands in for it.
6. **Seizures** are not reconciled with the treasury or income-tax handover, and there is no grievance-committee release.
7. **PO report** covers Form 17C Part I only; Part II stays with counting and the registered result source.
8. **Election petitions** (Part VI) and court orders are not modelled. A declared result cannot be reversed in the platform, by design.
9. **Map tiles** come from OpenFreeMap or OpenStreetMap; a government deployment would host its own. Demo locations are invented.
10. **Real-time:** Socket.IO runs only on a long-running server, not on Vercel serverless.
11. **Language:** new desk text is English only; voter pages have translations in 5 languages.
12. **Demo phone:** `GET /api/v1/notifications?epic=` shows the demo OTPs for any EPIC (the phone simulator). It is refused in production and when `ENABLE_DEMO_OTP_NOTIFICATIONS` is not `true`; turn it off on any shared deployment, because it lets anyone read sign-in codes.
13. **Scale:** many lists scan Redis sets. That is fine for demo volumes, but past tens of thousands of records it needs the MongoDB read models or Redis indexes.

## Running and testing

The backend and the frontend each start with two commands; the test suite needs its own disposable Redis and passes 130 tests (1 skipped without MongoDB).

```bash
# backend
cd backend && cp .env.example .env    # set ACCESS_TOKEN_SECRET and REDIS_URL
npm install && npm run seed && npm run dev

# frontend
cd frontend && npm install && npm run dev    # http://localhost:5173

# tests, on a disposable Redis
docker run -d --name eci-redis-test -p 6390:6379 redis
cd backend && TEST_REDIS_URL=redis://127.0.0.1:6390 npm test
```

The same report, with the full endpoint list, is in the repository at `docs/PLATFORM_REPORT.md`.

## Appendix: every backend endpoint

All 242 endpoints under `/api/v1`, in mount order, with the permission (or role) the route checks; jurisdiction is then checked inside each controller.

| Name in the table | Stands for |
| --- | --- |
| `CAN_SEE_APPLICATIONS` | application:review, verification:field-report, application:decide |
| `STATION_TEAM` | polling:conduct, polling:identify-voter, polling:mark-register, polling:operate-evm, polling:observe, observer:report |
| `COUNTING` | counting:supervise, counting:assist, result:declare, counting:supervise-table, counting:record, counting:observe, counting:object, counting:read, observer:report |
| `CAN_REPORT_ISSUE` | station:view, station:propose, polling:inspect, roll:view-part, application:decide, roll:claims-objections, nomination:submit |
| `STAFF` (elector forms) | application:decide, verification:field-report, application:review, record:read, roll:manage |
| `STAFF` (complaints) | complaint:dispatch, complaint:investigate, complaint:dispose, record:read, expenditure:read, national:view, national:manage, state:manage |
| `READ` (security) | security:plan, security:coordinate, control:view, district:manage, state:manage, record:read, logistics:track |
| `READ_REPORTS` (oversight) | observer:report, observer:view, national:view, national:manage, direction:issue |
| `OFFICIALS` (directions) | direction:issue, national:view, national:manage, state:manage, district:manage, nomination:scrutinise, application:decide, polling:inspect, polling:conduct, security:plan, observer:report |

"Step-up" means a fresh OTP is needed. "Signed in (checked inside)" means any signed-in account, with the controller checking ownership. "Public (signed-in caller recorded)" means anyone, with a signed-in caller recorded as the submitter.

### Endpoints 1 to 121

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/electors/search` | public |
| POST | `/verification/otp/send` | public |
| POST | `/verification/otp/verify` | public |
| POST | `/verification/identity` | public |
| POST | `/verification/:id/challenge` | public |
| POST | `/verification/:id/face` | public |
| POST | `/auth/login` | public |
| POST | `/auth/register` | public |
| GET | `/auth/register/:id` | public |
| POST | `/auth/register/:id/information` | public |
| GET | `/auth/geography` | public |
| GET | `/auth/roles` | public |
| POST | `/auth/logout` | public |
| POST | `/auth/logout-all` | signed in (checked inside) |
| GET | `/auth/me` | signed in (checked inside) |
| POST | `/auth/step-up/request` | signed in (checked inside) |
| POST | `/auth/step-up/verify` | signed in (checked inside) |
| POST | `/auth/blo/login` | public |
| POST | `/auth/blo/verify` | public |
| POST | `/auth/blo/resend` | public |
| POST | `/auth/blo/password` | signed in (checked inside) |
| POST | `/auth/blo/forgot` | public |
| POST | `/auth/blo/forgot/resend` | public |
| POST | `/auth/blo/reset` | public |
| GET | `/admin/verifications` | role: admin/blo |
| PATCH | `/admin/verifications/:id/resolve` | role: admin/blo |
| GET | `/admin/stats` | role: admin/blo |
| GET | `/admin/registrations` | CAN\_SEE\_APPLICATIONS |
| GET | `/admin/registrations/:id/documents/:category` | CAN\_SEE\_APPLICATIONS |
| POST | `/admin/registrations/:id/field-verification` | verification:field-report |
| POST | `/admin/registrations/:id/approve` | application:decide; step-up |
| POST | `/admin/registrations/:id/reject` | application:decide; step-up |
| POST | `/admin/registrations/:id/request-information` | application:decide |
| POST | `/admin/registrations/:id/request-reverification` | application:decide |
| GET | `/admin/changes` | CAN\_SEE\_APPLICATIONS |
| POST | `/admin/changes/:id/field-verification` | verification:field-report |
| POST | `/admin/changes/:id/approve` | application:decide; step-up |
| POST | `/admin/changes/:id/reject` | application:decide; step-up |
| POST | `/admin/changes/:id/request-information` | application:decide |
| POST | `/admin/changes/:id/request-reverification` | application:decide |
| POST | `/voting-verification/start` | verification:review; role: eci |
| POST | `/voting-verification/:id/persona/start` | verification:review; role: eci |
| POST | `/voting-verification/:id/persona/sync` | verification:review; role: eci |
| GET | `/voting-verification/:id/reference-photo` | verification:review; role: eci |
| POST | `/voting-verification/:id/document` | verification:review; role: eci |
| POST | `/voting-verification/:id/face/challenge` | verification:review; role: eci |
| POST | `/voting-verification/:id/face` | verification:review; role: eci |
| POST | `/voting-verification/:id/fingerprint` | verification:review; role: eci |
| POST | `/persona/start` | signed in (checked inside) |
| GET | `/persona/status` | signed in (checked inside) |
| POST | `/persona/sync` | signed in (checked inside) |
| POST | `/persona/complete-verification` | signed in (checked inside) |
| GET | `/notifications` | public (demo OTP phone; off in production) |
| POST | `/changes` | application:submit; role: voter |
| GET | `/changes/my` | application:track; role: voter |
| POST | `/changes/:id/information` | role: voter |
| GET | `/eci/blo-list` | role:assign |
| POST | `/eci/blo/assign` | role:assign |
| POST | `/eci/blo/remove` | role:assign |
| GET | `/eci/voters` | role:assign |
| GET | `/assignments/me` | signed in (checked inside) |
| GET | `/assignments` | role:assign, blo:assign, staff:assign, polling:arrange, audit:read |
| POST | `/assignments` | role:assign, blo:assign, staff:assign, polling:arrange; step-up |
| POST | `/assignments/:id/revoke` | role:assign, blo:assign, staff:assign, polling:arrange; step-up |
| GET | `/audit` | audit:read |
| GET | `/audit/search` | audit:read |
| GET | `/audit/integrity` | audit:read, national:manage |
| GET | `/audit/:type/:id` | audit:read |
| GET | `/integrations/sources` | integration:manage |
| POST | `/integrations/sources` | integration:manage; step-up |
| POST | `/integrations/sources/:id/suspend` | integration:manage; step-up |
| POST | `/integrations/sources/:id/runs` | integration:manage |
| GET | `/integrations/runs` | integration:manage |
| POST | `/integrations/rescreen` | integration:manage |
| GET | `/registration-tasks` | verification:field-report, application:decide, blo:supervise, blo:assign |
| POST | `/registration-tasks/:id/outcome` | verification:field-report; role: blo/admin |
| POST | `/registration-tasks/:id/assign` | blo:assign, blo:supervise |
| POST | `/roll-versions` | roll:publish; step-up |
| GET | `/roll-versions` | roll:publish, roll:manage, audit:read |
| GET | `/roll-versions/:id` | roll:publish, roll:manage, audit:read |
| GET | `/elections` | public |
| POST | `/elections` | election:manage |
| POST | `/elections/:id/schedule` | election:manage |
| GET | `/polling-stations` | station:view, station:propose, station:approve, state:manage |
| GET | `/polling-stations/issues` | CAN\_REPORT\_ISSUE, state:manage, station:approve |
| POST | `/polling-stations/issues` | CAN\_REPORT\_ISSUE |
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
| POST | `/nominations` | nomination:submit |
| GET | `/nominations/mine` | nomination:submit |
| GET | `/nominations/assisted` | nomination:assist |
| POST | `/nominations/:id/withdraw` | nomination:submit |
| GET | `/nominations` | nomination:scrutinise |
| POST | `/nominations/:id/scrutiny` | nomination:scrutinise |
| GET | `/nominations/scrutiny-delegation` | nomination:scrutinise |
| POST | `/nominations/scrutiny-delegation` | scrutiny:delegate; step-up |
| POST | `/nominations/scrutiny-delegation/revoke` | scrutiny:delegate; step-up |
| POST | `/nominations/contesting` | candidates:publish; step-up |
| GET | `/public/elections` | public |
| GET | `/public/stations/map` | public |
| GET | `/public/stations` | public |
| GET | `/public/stations/near` | public |
| GET | `/public/stations/epic/:epic` | public |
| GET | `/public/stations/:id/queue` | public |
| GET | `/public/candidates` | public |
| GET | `/public/results` | public |
| GET | `/public/turnout` | public |
| GET | `/poll-day/station` | STATION\_TEAM, roll:view-part |
| GET | `/poll-day/electors` | polling:conduct, polling:identify-voter, polling:mark-register, roll:view-part |
| POST | `/poll-day/electors/:epic/mark` | polling:mark-register, polling:conduct |
| POST | `/poll-day/poll/status` | polling:conduct |
| POST | `/poll-day/queue` | polling:conduct, polling:identify-voter |

### Endpoints 122 to 242

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/poll-day/cases` | STATION\_TEAM |
| POST | `/poll-day/cases` | polling:conduct, polling:identify-voter, polling:mark-register, polling:object |
| POST | `/poll-day/cases/:id/resolve` | polling:conduct |
| POST | `/poll-day/vab-slips/:epic` | roll:view-part; role: blo/admin |
| GET | `/poll-day/vab-slips/:slipId` | polling:identify-voter, polling:mark-register, polling:conduct |
| GET | `/poll-day/register` | polling:conduct |
| GET | `/poll-day/records` | polling:conduct, polling:operate-evm, polling:report |
| POST | `/poll-day/machine-events` | polling:operate-evm, polling:conduct |
| POST | `/poll-day/po-report` | polling:report |
| GET | `/poll-day/station-reports` | control:view, record:read, counting:read, district:manage, state:manage |
| GET | `/poll-day/procedures` | STATION\_TEAM |
| GET | `/poll-day/assistant` | polling:conduct |
| POST | `/poll-day/checklists/:kind` | polling:conduct |
| GET | `/poll-day/package/public-key` | STATION\_TEAM |
| GET | `/poll-day/package` | polling:conduct, polling:identify-voter, polling:mark-register |
| POST | `/poll-day/sync` | polling:conduct, polling:mark-register |
| GET | `/poll-day/sync-conflicts` | polling:conduct |
| POST | `/poll-day/sync-conflicts/:id/resolve` | polling:conduct |
| GET | `/control-room` | control:view |
| POST | `/control-room/incidents` | incident:report |
| POST | `/control-room/incidents/:id` | incident:manage |
| POST | `/control-room/stations/:stationId/visits` | polling:inspect |
| GET | `/results/sources` | integration:manage |
| POST | `/results/sources` | integration:manage; step-up |
| POST | `/results/sources/:sourceId/entries` | integration:manage |
| POST | `/results/sources/:sourceId/publication` | integration:manage |
| POST | `/results/sources/:sourceId/mock` | integration:manage |
| GET | `/training/modules` | signed in (checked inside) |
| POST | `/training/modules/:id/attempts` | signed in (checked inside) |
| GET | `/training/scenarios` | signed in (checked inside) |
| POST | `/training/scenarios/:id/start` | signed in (checked inside) |
| POST | `/training/runs/:runId/submit` | signed in (checked inside) |
| GET | `/training/report` | signed in (checked inside) |
| GET | `/training/team` | blo:assign, blo:supervise, staff:assign, polling:arrange |
| GET | `/agents/mine` | agent:appoint |
| POST | `/agents` | agent:appoint |
| POST | `/agents/:id/revoke` | agent:appoint |
| GET | `/agents` | nomination:scrutinise |
| GET | `/users/:epic` | role:assign |
| POST | `/users/:epic/suspend` | role:assign; step-up |
| POST | `/users/:epic/reinstate` | role:assign; step-up |
| GET | `/events` | control:view, polling:conduct, polling:identify-voter, polling:mark-register, incident:manage, application:decide, roll:view-part |
| GET | `/events/history` | same as `/events` |
| GET | `/devices/mine` | polling:conduct, polling:identify-voter, polling:mark-register |
| POST | `/devices/register` | polling:conduct, polling:identify-voter, polling:mark-register |
| POST | `/devices/heartbeat` | polling:conduct, polling:identify-voter, polling:mark-register |
| POST | `/devices/:id/revoke` | polling:conduct, incident:manage |
| GET | `/counting/:electionId` | COUNTING |
| GET | `/counting/:electionId/staff` | counting:supervise, counting:assist, result:declare |
| POST | `/counting/:electionId/plan` | counting:supervise, result:declare |
| POST | `/counting/:electionId/randomise` | counting:supervise, result:declare |
| POST | `/counting/:electionId/vvpat-draw` | counting:supervise, result:declare |
| POST | `/counting/:electionId/rounds/:round/tables/:table` | counting:supervise, counting:assist, result:declare, counting:supervise-table |
| POST | `/counting/:electionId/rounds/:round/complete` | counting:supervise, result:declare |
| POST | `/counting/:electionId/discrepancies` | counting:object, counting:supervise-table, observer:report |
| POST | `/counting/:electionId/discrepancies/:id/decide` | counting:supervise, result:declare |
| POST | `/counting/:electionId/observer-reports` | observer:report |
| POST | `/objections` | application:submit, roll:claims-objections |
| GET | `/objections/my` | application:submit, roll:claims-objections |
| POST | `/objections/:id/withdraw` | application:submit, roll:claims-objections |
| POST | `/objections/:id/reply` | roll:view-own; role: voter |
| GET | `/objections/staff` | application:decide, verification:field-report |
| POST | `/objections/staff/:id/field-report` | verification:field-report |
| POST | `/objections/staff/:id/decide` | application:decide; step-up |
| GET | `/elector-forms` | public |
| GET | `/elector-forms/status/:ref` | public |
| GET | `/elector-forms/mine` | application:track |
| POST | `/elector-forms/mine/:id/withdraw` | signed in (checked inside) |
| GET | `/elector-forms/staff` | STAFF (elector forms) |
| GET | `/elector-forms/staff/:id` | STAFF (elector forms) |
| GET | `/elector-forms/staff/:id/documents/:name` | application:decide, verification:field-report |
| POST | `/elector-forms/staff/:id/field-report` | verification:field-report |
| POST | `/elector-forms/staff/:id/decide` | application:decide; step-up |
| POST | `/elector-forms/:form` | public (signed-in caller recorded) |
| POST | `/campaign-permissions` | permission:apply |
| GET | `/campaign-permissions/mine` | permission:apply |
| POST | `/campaign-permissions/mine/:id/withdraw` | permission:apply |
| GET | `/campaign-permissions` | permission:decide, security:coordinate, record:read, district:manage, state:manage, national:view, national:manage |
| POST | `/campaign-permissions/:id/police` | security:coordinate |
| POST | `/campaign-permissions/:id/decide` | permission:decide |
| GET | `/expenditure/mine` | expenditure:report |
| POST | `/expenditure` | expenditure:report |
| POST | `/expenditure/:id/correct` | expenditure:report |
| GET | `/expenditure` | expenditure:read, record:read, permission:decide, district:manage, state:manage, national:view, national:manage |
| POST | `/expenditure/:id/notes` | expenditure:read |
| POST | `/expenditure/shadow` | expenditure:read |
| GET | `/oversight/observer-reports` | READ\_REPORTS |
| POST | `/oversight/observer-reports` | observer:report |
| POST | `/oversight/observer-reports/:id/review` | national:manage, direction:issue |
| POST | `/oversight/observer-reports/:id/supplement` | observer:report |
| GET | `/oversight/directions` | OFFICIALS |
| POST | `/oversight/directions` | direction:issue; step-up |
| POST | `/oversight/directions/:id/comply` | OFFICIALS |
| POST | `/oversight/directions/:id/close` | direction:issue |
| GET | `/security` | READ (security) |
| POST | `/security/stations/:stationId/assessment` | security:plan |
| POST | `/security/deployments` | security:plan |
| POST | `/security/deployments/:id` | security:plan, security:coordinate |
| POST | `/security/sitreps` | security:coordinate |
| GET | `/logistics` | logistics:track, control:view, district:manage, state:manage, record:read, nodal:function-manage |
| POST | `/logistics/stations/:stationId` | logistics:track |
| GET | `/nodal` | nodal:function-manage, nodal:coordinate |
| POST | `/nodal/reports` | nodal:function-manage |
| POST | `/nodal/tasks` | nodal:coordinate |
| POST | `/nodal/tasks/:id` | nodal:function-manage, nodal:coordinate |
| GET | `/reports/summary` | district:manage, state:manage, report:state, report:national, national:view, national:manage, record:read, application:decide, nomination:scrutinise, control:view, blo:supervise, observer:view |
| GET | `/reports/roll-part` | roll:view-part |
| POST | `/complaints` | public (signed-in caller recorded) |
| GET | `/complaints/track/:ref` | public |
| GET | `/complaints` | STAFF (complaints) |
| GET | `/complaints/:id/photo` | STAFF (complaints) |
| POST | `/complaints/:id/dispatch` | complaint:dispatch |
| POST | `/complaints/:id/field-report` | complaint:investigate |
| POST | `/complaints/:id/dispose` | complaint:dispose |
| POST | `/appeals` | public (signed-in caller recorded) |
| GET | `/appeals/track/:ref` | public |
| POST | `/appeals/track/:ref/second` | public (signed-in caller recorded) |
| GET | `/appeals` | appeal:decide-first, appeal:decide-second, application:decide, record:read |
| POST | `/appeals/:id/first` | appeal:decide-first; step-up |
| POST | `/appeals/:id/second` | appeal:decide-second; step-up |
| POST | `/appeals/:id/implement` | application:decide |
