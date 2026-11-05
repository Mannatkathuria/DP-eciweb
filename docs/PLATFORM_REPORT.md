# ECI-Web platform report

*How the platform is built, who can do what, every screen and API, how each workflow moves from one step to the next, what each action changes, the demo data, and a demonstration script.* Prepared on 5 November 2026 for the `eciweb2` repository (branch `main`, after the "Adding map facility" commit).

This is a prototype. All demo data is synthetic, and the platform never counts votes or declares a result.

---

> **Update, 5 November 2026:** the modules from the ECI systems inventory (reference library, ePlan, PSE/DSE roll quality, BLO App surveys and register, observer portal, ENCORE deposits/symbols/Index Card, ETPBMS, NGSP, ESMS, IEMS, EMS 2.0), the Redis/MongoDB data split and the cross-module data flows are documented in [ECI_SYSTEMS_COVERAGE.md](ECI_SYSTEMS_COVERAGE.md), with 79 new endpoints and three new roles (party treasurer, record officer, enforcement officer).

## 1. What changed in this round

| Area | Change |
| --- | --- |
| **Map** (your commit) | The `/map` route rendered the bare map component with no data loader, so it never showed a station. It now renders `PollingStationMapPage`, which loads the stations in view from `GET /api/v1/public/stations/map`. The page uses the site's own styles (the map had Tailwind classes, which this project doesn't use). It opens fitted to India, finds a station by EPIC and flies to it, and its popups show facilities, missing facilities, relocation and a Directions link. If the vector style can't load (offline or blocked), it falls back to OpenStreetMap raster tiles so stations still show. It is linked from the Voters menu. An unused import in `pollingStation.routes.js` was removed. |
| **Report a violation (cVIGIL)** | The page was frontend-only, with hard-coded sample data. It is now a real backend workflow: citizen report, then control-room dispatch, then flying-squad field report and seizures, then RO disposal. It has a 100-minute clock and tracking by reference. |
| **New role** | `flying_squad`, the flying squad / surveillance team (demo `FST1000001`, plus `FST1000002`), with its own desk. The DEO can appoint them. |
| **Roll appeals (RP Act 1950, s. 24)** | New `/appeal` page and backend. The first appeal goes to the DEO as the district appellate authority, the second to the CEO. An allowed appeal becomes an order the ERO implements and marks done. |
| **Presiding Officer's records** | A machine log (mock poll, sealing, replacement, close) and the Presiding Officer's report (diary plus the Form 17C Part I account of votes recorded), checked against the station register. Differences are flagged for the RO, DEO, CEO and observers. |
| **Unused powers wired up** | `polling:report`, `polling:operate-evm`, `counting:assist` (ARO at counting), `nomination:assist` (election agent sees the candidate's nomination), `verification:review`, `application:track`, `application:submit` and `roll:view-own` are now checked on their routes. Every permission in `config/roles.js` is now used by at least one route. |
| **New powers** | `complaint:dispatch` (DEO, Deputy DEO, RO, ARO), `complaint:dispose` (RO, ARO), `complaint:investigate` (flying squad), `appeal:decide-first` (DEO), `appeal:decide-second` (CEO). |
| **Desks** | New tabs: MCC control room (DEO, Deputy DEO, RO, ARO, observers), Roll appeals (DEO, CEO, ERO, AERO), Station reports (RO, ARO, DEO, CEO, observers), Machine log and PO report (presiding and polling officers), Candidate's nomination (election agent). The district/State/national report now counts complaints, seizures and appeals. |
| **Voter dashboard** | A new "Other forms, complaints and appeals" card lists the voter's Forms 2-8 with their status, and links to filing, appeals and violation reports. |
| **Demo data** | A large synthetic dataset (section 9): 93 approved polling stations with map locations across 6 districts in 3 States/UTs, about 2,000 electors, and records at every stage of every workflow. |
| **Tests** | `backend/tests/workflows.test.js` now also covers MCC complaints and roll appeals. All 130 tests pass, with 1 skipped (it needs MongoDB). |

---

## 2. Structure

```text
backend/
  server.js                 starts the API (and Socket.IO when REALTIME=on)
  src/app.js                Express app: security headers, CORS, body limits, all route mounts
  src/config/roles.js       THE role catalogue: every role, its level, scope and permissions
  src/middlewares/          verifyJWT (and optionalJWT), authorize(permission...), requireStepUp, rate limits
  src/services/
    authority.service.js    jurisdiction rules: does an assignment cover a record?
    workflow.service.js     shared helpers for case workflows (store, area checks, validation)
    candidate.service.js    which candidate an agent or candidate is acting for
    audit.service.js        append-only, hash-chained audit trail
    events.service.js       operational events for live screens (outbox pattern)
  src/controllers/          one file per workflow (see section 5)
  src/routes/               one router per workflow, mounted under /api/v1/...
  src/seed.js + seedData.js demo accounts, assignments and the synthetic dataset
  tests/                    node:test suites (needs a disposable Redis: TEST_REDIS_URL)

frontend/src/
  App.jsx                   every route (section 4)
  config/roles.js           role labels and where each role lands (homeFor)
  config/desks.js           each role's desk: authority, mission, tabs, screens, limits
  config/permissions.js     plain-language text for every permission
  pages/RoleDesk.jsx        the /desk page that renders a role's desk
  components/desk/          the desk panels (kit, forms, campaign, oversight, field, ops, cases)
  components/maps/          the MapLibre polling-station map
  pages/                    public pages, sign-in, voter dashboard, role work screens
```

**Data stores.** Redis is the system of record: every record and decision lives there. MongoDB, when `MONGODB_URI` is set, holds read models built for search: station geography for the map and nearest-station search, event history and the audit archive. When MongoDB is missing, the same queries run on Redis.

**Rule of authority.** Every write checks two things on the server:

1. **Permission.** The caller's role must carry the permission (`authorize("...")` on the route).
2. **Jurisdiction.** One of the caller's active assignments must cover the record: State, district, constituency, polling station and election.

Seeing a record on a dashboard never implies the right to change it.

---

## 3. Roles and their desks (34 roles)

Every role except the voter lands on `/desk`. The desk shows four things:

- the role's legal authority and current assignment;
- what the role may do (from the server's permission list) and what its login does **not** allow;
- a report for its jurisdiction, where the role has one;
- its work tabs, plus links to its dedicated work screens.

Demo identifiers sign in with an OTP printed in the backend terminal. BLOs sign in with a BLO ID and password.

| Role | Demo ID | Desk tabs (besides Overview) | Dedicated screens |
| --- | --- | --- | --- |
| Voter | ABC1234567 | — (lands on `/dashboard`) | `/dashboard`, `/verify` |
| Candidate | CAN1000001 | Campaign permissions, Expenditure register | `/candidate` |
| Election agent | EAG1000001 | Candidate's nomination, Campaign permissions, Expenditure register | `/agent` |
| Polling agent | PAG1000001 | — | `/poll-day` |
| Counting agent | CAG1000001 | — | `/counting` |
| Booth level agent (party) | BLA1000001 | Roll of your part, Polling-station problems | `/objection` |
| ERO | ERO1000001 (also ERO1000002, Amritsar East) | Forms 2-8, Appeal orders, BLOs, Station problems, Audit | `/ero` |
| AERO | AER1000001 | Forms 2-8, Appeal orders, Audit | `/ero` |
| BLO supervisor | BLS1000001 | Team and tasks, Field verification, Roll, Audit | — |
| BLO | BLO1000001 | Forms 2-8 field verification, Roll of your part, Station problems | `/admin`, `/poll-day` (voter assistance booth) |
| Returning officer | ROF1000001 | MCC complaints, Campaign permissions, Station reports, Directions, Station problems | `/ro`, `/counting`, `/control-room` |
| ARO | ARO1000001 | MCC complaints, Campaign permissions, Station reports, Station problems | `/ro`, `/control-room` |
| Sector officer | SCO1000001 | Polling logistics, Station problems, Directions | `/control-room` |
| Sector police officer | SPO1000001 | Security, Police remarks on permissions, Polling logistics | — |
| **Flying squad** (new) | FST1000001, FST1000002 | Assigned reports | — |
| Presiding officer | PRO1000001 | Machine log and PO report, Directions | `/poll-day/presiding-officer`, `/poll-day` |
| Polling officer | POL1000001 | Machine log | `/poll-day` |
| Counting supervisor | CSU1000001 | — | `/counting` |
| Counting assistant | CAS1000001 | — | `/counting` |
| DEO | DEO1000001 (also DEO1000002 Amritsar, DEO1000003 Shimla) | Polling-station changes, Station problems, MCC control room, Roll appeals, Nodal officers, Station reports, Observer reports, Directions, Permissions, Audit | `/deo`, `/control-room` |
| Deputy DEO | DDO1000001 | MCC control room, Nodal officers, Permissions | `/control-room` |
| District nodal officer | DNO1000001 (subject: EVM) | Your subject, Polling logistics | — |
| District police officer | DPO1000001 | Security plan, Police remarks on permissions, Directions | — |
| CEO | CEO1000001 (Punjab), CEO1000002 (Himachal) | Station proposals to forward, Second appeals, Station reports, State nodal officers, Directions, Audit | `/control-room`, `/states` |
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

### 3.1 Permissions by role (from `backend/src/config/roles.js`)

| Role | Permissions |
| --- | --- |
| voter | roll:view-own, application:submit, application:track, verification:own |
| candidate | nomination:submit, agent:appoint, permission:apply, expenditure:report |
| election_agent | nomination:assist, agent:appoint, permission:apply, expenditure:report |
| polling_agent | polling:observe, polling:object |
| counting_agent | counting:observe, counting:object |
| bla | roll:view-part, roll:claims-objections |
| ero | roll:manage, roll:publish, application:decide, blo:assign, audit:read |
| aero | roll:manage, application:decide, audit:read |
| blo_supervisor | blo:supervise, roll:view-part, verification:field-report, audit:read |
| blo | application:review, verification:field-report, roll:view-part |
| ro | nomination:scrutinise, scrutiny:delegate, candidates:publish, polling:arrange, counting:supervise, result:declare, station:view, control:view, incident:manage, permission:decide, complaint:dispatch, complaint:dispose |
| aro | nomination:scrutinise, polling:arrange, counting:assist, station:view, control:view, incident:manage, permission:decide, complaint:dispatch, complaint:dispose |
| sector_officer | polling:inspect, logistics:track, station:view, control:view, incident:report, incident:manage |
| sector_police_officer | security:coordinate, logistics:track |
| flying_squad | complaint:investigate |
| presiding_officer | polling:conduct, polling:report, station:view, incident:report |
| polling_officer | polling:identify-voter, polling:mark-register, polling:operate-evm |
| counting_supervisor | counting:supervise-table |
| counting_assistant | counting:record |
| deo | district:manage, staff:assign, nodal:coordinate, observer:view, audit:read, station:propose, control:view, incident:manage, complaint:dispatch, appeal:decide-first |
| deputy_deo | district:manage, nodal:coordinate, station:view, control:view, complaint:dispatch |
| district_nodal_officer | nodal:function-manage |
| district_police_officer | security:coordinate, security:plan |
| ceo | state:manage, staff:assign, nodal:coordinate, report:state, audit:read, station:view, control:view, incident:manage, appeal:decide-second |
| state_nodal_officer | nodal:function-manage |
| state_police_nodal | security:coordinate, security:plan |
| eci | national:manage, role:assign, blo:assign, verification:review, audit:read, integration:manage, election:manage, station:approve, control:view |
| cec | national:view, report:national, audit:read, control:view, direction:issue |
| election_commissioner | national:view, report:national, audit:read, control:view, direction:issue |
| general_observer | observer:report, record:read, audit:read, control:view |
| police_observer | observer:report, record:read |
| expenditure_observer | observer:report, expenditure:read |
| counting_observer | observer:report, counting:read |
| micro_observer | observer:report, incident:report |

---

## 4. Frontend routes (all 63)

### 4.1 Public

| Route | Page | What it does |
| --- | --- | --- |
| `/` | EntryGate | First visit: choose to sign in or browse. After that it goes to `/home`. |
| `/home` | Home | Landing page with news and quick links |
| `/voters` | Voters | Voter services and which form to use |
| `/voters/forms` | ElectoralFormsIndex | Index of Forms 2, 2A, 3, 6A, 6B, 7, 8 |
| `/voters/forms/form-2`, `-2a`, `-3` | ServiceVoterForms | Service-voter applications (Armed Forces, State Armed Police outside the State, Government of India post abroad) |
| `/voters/forms/form-6a` | Form6A | Overseas elector |
| `/voters/forms/form-6b` | Form6B | Aadhaar, or an alternative document, for authentication |
| `/voters/forms/form-7` | Form7 | Objection to inclusion, deletion, or self-deletion |
| `/voters/forms/form-8` | Form8 | Shift, correction, replacement EPIC, PwD marking |
| `/register` | Register | Form 6 (new elector) with documents |
| `/check-request` | CheckRequest | Status of a Form 6 or `EF…` form reference (`?ref=` prefills) |
| `/appeal` | Appeal | **New.** First appeal against an ERO order, tracking, second appeal |
| `/objection` | Objection | Form 7 objections for signed-in voters and BLAs |
| `/electoral-roll` | ElectoralRoll | Search the roll by EPIC or details |
| `/booths` | Booths | Find a polling station by EPIC or area |
| `/map` | PollingStationMapPage | **Fixed.** Map of approved stations, EPIC lookup, directions |
| `/report-violation` | ReportViolation | **Now live.** cVIGIL report with photo and location, and tracking |
| `/candidates` | Candidates | Published list of contesting candidates and affidavit headlines |
| `/results` | Results | Read-only counting from the registered result source (mock data is labelled) |
| `/states`, `/states/:slug` | StatePortal | State and UT election offices |
| `/media` | Media | Awareness and publications |
| `/roles` | Roles | Roles and what each may do |
| `/training`, `/training/poll-day` | Training, TrainingSimulator | Practice modules (signed-in roles) |
| `/phone` | PhoneScreen | Stand-alone phone simulator for demos |

### 4.2 Sign-in

| Route | Page |
| --- | --- |
| `/signin` | SignInHub: choose your role |
| `/signin/:roleId` | PortalLogin: EPIC-format ID, then OTP |
| `/login/otp` | LoginOtp |
| `/blo/*` | Redirects to `/signin/blo`: BLOs sign in with their BLO ID (BLO1000001) and a one-time code, like every officer; no password |

### 4.3 Signed-in work screens

| Route | For | What it does |
| --- | --- | --- |
| `/desk` | Every role except the voter | **The role's own dashboard** (section 3). `?tab=<id>` opens a tab. |
| `/dashboard` | Voter | Roll entry, Form 6 and Form 8 status, other forms, identity verification |
| `/verify` | Voter | Persona identity verification |
| `/admin` | BLO | Form 6 and Form 8 field verification, new-voter tasks, review cases |
| `/ero` | ERO, AERO | Form 6, 7 and 8 decisions, new-voter tasks, roll versions |
| `/deo` | DEO | Propose stations and relocations, appoint election staff |
| `/ro` | RO, ARO | Scrutiny, list of contesting candidates, scrutiny delegation, polling parties |
| `/candidate` | Candidate | File, track or withdraw a nomination; appoint agents |
| `/agent` | Election agent, counting agent | Agents and appointments |
| `/poll-day` | Polling party, BLO, polling agent, micro observer | Station screen: mock poll, open, mark, queue, cases, close |
| `/poll-day/presiding-officer` | Presiding officer | Checklists, register, cases |
| `/counting` | RO, ARO, counting staff, agents, observers | Plan, randomisation, rounds, discrepancies, recount requests, VVPAT draw |
| `/control-room` | Officials with `control:view` | Stations, alerts and incidents; escalation up to the Commission |
| `/eci/dashboard`, `/eci/elections`, `/eci/integrations`, `/eci/voting-verification` | ECI administrator | Accounts and assignments; elections and schedules; data sources and audit integrity; verification review |
| `/workspace` | Fallback | Redirects to `/desk` for every known role |

Old addresses are kept as redirects: `/login`, `/eci/login`, `/portals`, `/services`, `/cvigil`, `/suvidha`, `/encore`, `/ceo-himachal`, `/workflows`, `/media-publications`.

---

## 5. Backend modules

| Mount | Controller | Purpose |
| --- | --- | --- |
| `/auth` | auth.controller | OTP sign-in, BLO sign-in, Form 6 intake, step-up, sign-out |
| `/electors`, `/verification`, `/persona` | elector, verification | Roll search, identity verification, Persona webhook |
| `/admin` | admin.controllers | BLO field verification and ERO decisions for Form 6 and Form 8 |
| `/changes` | changeRequest | Form 8 from the voter dashboard |
| `/objections` | objection | Form 7 from voters and BLAs |
| `/elector-forms` | formcontroller | Forms 2, 2A, 3, 6A, 6B, 7, 8 |
| `/appeals` | appeal | **New.** s. 24 roll appeals |
| `/registration-tasks`, `/integrations` | registrationTask, integration | New-voter pipeline from approved data sources |
| `/roll-versions` | rollVersion | Immutable, hashed roll versions |
| `/assignments`, `/users` | assignment, user | Role assignments, including nodal subject and agent appointment |
| `/elections` | election | Election schedule and stage |
| `/polling-stations` | pollingStation | s. 25 workflow and station issues |
| `/nominations`, `/agents` | nomination, agent | Nominations, scrutiny, candidate list, agents |
| `/campaign-permissions`, `/expenditure` | campaignPermission, expenditure | Suvidha-style permissions; registers and shadow register |
| `/complaints` | complaint | **New.** cVIGIL complaints and seizures |
| `/poll-day` | pollDay, stationReport (**new**), offline | Station operations, machine log, PO report, offline package and sync |
| `/control-room` | controlRoom | Station overview, incidents, visits |
| `/security`, `/logistics`, `/nodal` | security, logistics, nodal | Police planning; party and material movement; nodal officers |
| `/oversight` | oversight | Observer reports and Commission directions |
| `/counting`, `/results` | counting, result | Counting operations; read-only results from a registered source |
| `/reports` | report | District, State and national summary; roll of a part |
| `/audit`, `/events`, `/devices`, `/training`, `/public` | … | Audit search and integrity, live events, station devices, training, public reads |

The full list of 242 endpoints is in **Appendix A**.

---

## 6. How things move from one step to the next

Each flow is shown as **who → action → record and state → who sees it next**. Every arrow writes an audit event. Most also write an operational event that live screens pick up.

### 6.1 Becoming an elector (Form 6)

1. **Applicant** (`/register`): sends `POST /auth/register`. A `registration` is created with status `pending`, documents stored separately, and a reference ID shown. An identical open application is refused.
2. **BLO** (`/admin` → Form 6 field verification): sends `POST /admin/registrations/:id/field-verify`. Status becomes `field_verified` and the BLO records the part number and polling station. **The roll is not changed.**
3. **ERO/AERO** (`/ero`): sends `POST /admin/registrations/:id/approve` (step-up). In one transaction, an **elector** record and EPIC are created, a voter account is created, the application becomes `approved`, and the documents are deleted. A rejection carries a reason.
4. **Applicant**: `/check-request` shows the timeline. The new voter can sign in at `/signin/voter`.
5. **Appeal** (optional): `/appeal`, within 15 days (6.4).

### 6.2 Forms 2, 2A, 3, 6A, 6B, 7 and 8 (`/voters/forms/...`)

1. **Anyone**: the form wizard's first step, "Addressed to", picks State, district and constituency; the form then sends `POST /elector-forms/form-xx`. An `eform` is created with status `submitted` and an `EF…` reference.
   - Aadhaar is never stored, only the last 4 digits and a salted hash.
   - Files are checked by their bytes (JPEG, PNG or PDF, up to 6 MB).
   - For Forms 6B, 8 and 7, the entry must be in the roll of the chosen constituency. The exception is a shift under Form 8, which is addressed to the new constituency.
2. **BLO** (desk → Forms 2-8 field verification): records a field report with a recommendation, the verification method, and the part and station for inclusions and shifts. Status becomes `field_verified`.
3. **ERO/AERO** (desk → Forms 2-8): approves (step-up) or rejects with a reason. **Only an approval changes the roll:**
   - 2, 2A, 3, 6A: a new elector (`service_voter` or `overseas_elector`) with an EPIC, plus a voter account
   - 6B: an authentication record on the entry
   - 7: the entry is marked `isActive: false` with the deletion order. Nothing is erased. The ERO cannot decide within the Form 7 notice period.
   - 8: a shift (new constituency, part, station and serial), a correction (up to 4 fields, before and after audited), a replacement EPIC, or PwD marking
4. **Applicant**: `/check-request?ref=EF…` shows the status and reasons, and the voter dashboard lists their forms.

### 6.3 Form 7 objections by voters and BLAs (`/objection`)

1. A voter or BLA files the objection (a BLA is limited to 10 a day, for their own part).
2. The elector objected to is notified and may reply during the notice period.
3. The BLO reports from the field.
4. The ERO decides (step-up). If accepted, the entry is marked deleted.

### 6.4 Roll appeals (new)

1. **Appellant** (`/appeal`): files an appeal giving the application reference and the date of birth. This is allowed only for an approved or rejected order, within 15 days, with one pending appeal per order. The appeal starts as `first_appeal`, reference `AP…`.
2. **DEO** (desk → Roll appeals): dismisses, allows or remands, with reasons and a hearing date (step-up). A dismissal makes the appeal `first_decided`. Allowing or remanding makes it `with_ero`.
3. **Appellant**: within 30 days of `first_decided`, files a second appeal from `/appeal` (Follow an appeal tab). The appeal becomes `second_appeal`.
4. **CEO** (desk → Second appeals): decides the second appeal. Same outcomes as step 2.
5. **ERO** (desk → Appeal orders): carries out the order in the roll and marks it implemented. The appeal becomes `implemented`.

### 6.5 Polling stations (RP Act 1951, s. 25)

**Before the workflow starts:** anyone working in the area (sector officer, RO, ERO, BLO, BLA, candidate) can report a problem with a station: `POST /polling-stations/issues`. The DEO closes it, saying what was done.

1. **DEO** (`/deo`): proposes a new station or a relocation. Stage `DISTRICT_REVIEW`. The station stays `PROPOSED` and is not public.
2. **DEO** (desk → Polling-station changes): records the consultation with the parties (who, date, outcome, objections). Stage `STAKEHOLDER_CONSULTATION`.
3. **DEO**: forwards it to the CEO. Stage `SENT_TO_CEO`. This is refused without a consultation record.
4. **CEO** (desk → Station proposals): forwards it with remarks (`SENT_TO_ECI`) or returns it (back to `DISTRICT_REVIEW`).
5. **ECI** (desk, or `/eci/elections`): gives prior approval with the Commission's **order reference** (step-up), asks for clarification (`CLARIFICATION_REQUIRED`), or rejects. The proposer can never approve their own change.
6. **DEO**: issues the final order and publishes (step-up). The station becomes `ACTIVE`, a new version is written, and the history records every stage. A relocation also moves every elector of that part to the new station and shows voters a relocation notice.
7. **Everyone**: `/booths`, `/map` and EPIC lookup show only `ACTIVE` stations, and staff assignments must name an active station.

### 6.6 Elections, nominations, scrutiny and the candidate list

1. **ECI** (`/eci/elections`): announces an election with its type, States and a full schedule (each date must follow the one before). The stage follows the IST calendar. A revised schedule needs a reason, and the old schedule is kept.
2. **Candidate** (`/candidate`): files a nomination while nominations are open. The candidate must be 25 or older on scrutiny day, with one live nomination per election. They may withdraw until the last date of withdrawal.
3. **RO, or an ARO the RO has delegated to** (`/ro`): accepts or rejects in scrutiny, with reasons.
4. **RO**: publishes the list of contesting candidates (step-up) once every nomination has been scrutinised. It cannot be changed afterwards, and `/candidates` shows it publicly.
5. **Candidate**: appoints an election agent, polling agents and counting agents (`/candidate`, `/agent`). The election agent's desk shows the nomination (read only).

### 6.7 Campaign permissions

1. **Candidate or election agent**: applies for a meeting, rally, procession, vehicle, loudspeaker, office, helipad or door-to-door team, with date, time and venue. Meetings and processions in the 48 hours before the poll closes are refused (s. 126).
2. **Police** (sector or district police officer): give "no objection", or an objection with reasons. This step applies only to events in public places.
3. **RO/ARO**: grants with conditions (a permit number is issued) or refuses with a reason. Granting despite a police objection needs a recorded reason.
4. **Applicant**: sees the outcome and can withdraw while the application is open.

### 6.8 Expenditure

1. **Candidate or election agent**: adds register entries (date, head, amount, mode, payee, voucher). Entries are append-only; a correction supersedes an entry, with a reason. A cash payment above ₹10,000, or a missing voucher, is flagged. Totals are shown against the ceiling (₹40 lakh for an Assembly constituency, ₹95 lakh for a Parliamentary constituency; both can be changed in env).
2. **Expenditure observer**: reads each candidate's register, adds notes (discrepancy, query, verified), and keeps the **shadow register** of events they saw with estimated costs. The difference between observed and reported spend is highlighted.
3. **Observer → Commission**: files a report (6.11). The Commission may direct the RO to issue a notice.

### 6.9 MCC complaints (cVIGIL, new)

1. **Anyone** (`/report-violation`): reports with category, constituency, place, an optional GPS location and photo, anonymously or not. The complaint is `received`, gets a `CV…` reference, and the **100-minute clock** starts.
2. **DEO, Deputy DEO, RO or ARO** (desk → MCC control room): dispatches a flying squad of that constituency (`assigned`), or drops the report with a reason (`dropped`).
3. **Flying squad** (desk → Assigned reports): reports what it found and did, and any seizures (cash, liquor, drugs, freebies, precious metals) with their value. The complaint becomes `field_reported`.
4. **RO/ARO**: disposes of it with a reason: action taken, notice issued, referred to police, referred elsewhere, or not substantiated. The complaint is `disposed`.
5. **Complainant**: follows the report by reference and sees the steps and disposal, never the officers' identities. Seizures roll up into the district report.

### 6.10 Poll day

| Step | Who | Action and record |
| --- | --- | --- |
| Before | Sector officer | Logistics: party dispatched → reached → station set up (desk → Polling logistics) |
| Before | Police | Vulnerability category per station, deployments, situation reports |
| Morning | Presiding officer | Mock poll, then poll open (`/poll-day`, poll date only). The machine log records mock poll, clearing and sealing. |
| During | Polling officer | Searches the part, checks the ID document, confirms the photo match and indelible ink, and marks the register. An elector is marked once per election, even if two officers try at once. |
| During | Polling officer or agent | Raises an identity doubt or challenge, which blocks marking until the presiding officer decides |
| During | Presiding officer | Tendered votes, assisted voters, queue reports (the queue is public at `/public/stations/:id/queue`) |
| Any time | PO, micro observer, sector officer | Reports an incident, which goes to the control room. Incidents escalate sector officer → RO → DEO → CEO → **Election Commission** (only the CEO can refer to the Commission). An incident with the Commission is closed only after a Commission direction on it is complied with (s. 57 / 58 / 58A path). |
| Close | Presiding officer | Poll closed (the electors-in-register count is recorded). The machine log records close pressed and sealing after the poll. |
| After | Presiding officer | **PO report** (diary plus Form 17C Part I): electors assigned, votes recorded, tendered and challenged votes, seals. It is compared with the register, and differences are flagged. |
| After | Sector officer | Logistics: party departed → material received → strong room sealed |
| After | RO, DEO, CEO, observers | Desk → Station reports: PO reports, flags, replacements, malfunctions |

The register stores who voted (serial, document type, time, officer), **never how anyone voted**.

### 6.11 Observers and Commission directions

1. **Observer**: files a report (topic, severity, facts, recommendation). A micro observer's report also reaches the general observer. Reports are confidential: the DEO sees those for the district; RO, candidates and agents never do.
2. **CEC/EC/ECI**: acknowledges, seeks information (the observer then supplements the report), or closes it.
3. **CEC/EC**: issues a **direction** to an addressee role in an area, under a legal basis (Article 324, s. 20B, s. 57, s. 58, s. 58A, MCC, expenditure, administrative), about a report, an incident or a general matter (step-up).
4. **Addressee** (desk → Directions): reports compliance with evidence.
5. **CEC/EC**: closes the direction or returns it.

### 6.12 Nodal officers

1. **DEO or CEO**: designates a nodal officer for **one subject** (EVM, training, transport, material, expenditure, MCC, media, SVEEP, postal ballot, accessibility, IT, law and order, manpower, complaints).
2. **DEO, Deputy DEO or CEO**: gives tasks to a subject.
3. **Nodal officer**: files progress reports (percentage, status, issues) and works tasks **for their subject only**.
4. **Coordinator**: sees "functions at a glance".

### 6.13 Counting and results

1. **RO**: sets up the counting plan, randomises staff to tables, enters table figures by round (counting supervisors enter their own tables; the ARO assists), runs the VVPAT draw, and decides discrepancies.
2. **Counting agent** (or a supervisor or observer): raises a discrepancy, including a **Rule 63 written recount request**. The RO decides it with reasons.
3. **Results** (`/results`): shows exactly what a **registered result source** sends. That is either an official feed (with its legal basis) or a mock, which is labelled. It runs checks: machine count against the register, more votes than electors, corrections received, and a declared winner who is not ahead. There are no endpoints to edit or delete results.

### 6.14 Reports

`GET /reports/summary` (desk overview for the DEO, CEO, ECI, CEC, ECs, RO, ERO, observers and others) counts electors, pending applications, stations and their stage, staff, nominations, incidents, permissions, expenditure, observer reports (only for roles allowed to see them), directions, nodal tasks, complaints, seizures and appeals. It breaks the counts down one level below the caller: national → State, State → district, district → constituency. The table downloads as CSV.

---

## 7. What changes what

| Action | Records written | Visible to / effect |
| --- | --- | --- |
| ERO approves a Form 6 | `elector`, `user`, `registration`, audit, event `REGISTRATION_DECIDED` | Roll search, voter sign-in, `/booths`, poll-day part list, reports |
| ERO approves a Form 2/2A/3/6A | `elector` (category), `user`, `eform` | Same as above, counted as service or overseas electors |
| ERO approves a Form 7 deletion | `elector.isActive=false` plus the deletion order | Gone from search, poll-day part list and roll versions; still in the record |
| ERO approves a Form 8 shift | `elector` (constituency, part, station, serial) | New part's poll-day list; the old part loses the elector |
| DEO publishes a relocation | `station` (new version), every elector of the part | `/booths` and `/map` show the new place with a relocation notice; staff and the poll-day station follow |
| ECI approves a station | `pendingChange.stage=ECI_APPROVED`, audit | DEO's desk shows "Issue order and publish"; nothing public yet |
| RO publishes the candidate list | `contesting list` (frozen) | `/candidates`; counting and results must match this list |
| Polling officer marks an elector | register entry, `poll:voted`, event `TURNOUT_UPDATED` | Turnout on the station, control room and `/results` turnout |
| Presiding officer closes the poll | poll state `closed` | PO report becomes possible; control-room alerts stop for the station |
| Incident escalated to the Commission | incident level 4 | CEC/EC can direct; the DEO and below cannot resolve it until the direction is complied with |
| Flying squad records a seizure | complaint `seizures[]` | District and State report "Seized"; expenditure observer's view |
| Police mark a station critical | `security-assessment` (new version) | Security panels for police, the civil chain and observers; never public |
| Nodal officer files a report | `nodal-report` | DEO/CEO "functions at a glance" |
| Commission issues a direction | `direction`, the linked report becomes `direction_issued` | Addressee's desk (needs compliance), observers in the area |
| Appeal allowed | appeal `with_ero` | ERO's desk "Appeal orders" until implemented |

---

## 8. Demonstration script (about 25 minutes)

**Setup.** Start Redis, then run `cd backend && npm run seed && npm run dev`. Separately, run `cd frontend && npm run dev`. OTPs print in the backend terminal.

1. **Public side (3 min).**
   - Open `/home` → Voters → **Polling station map**. Zoom into Ludhiana, click a station (facilities, Directions), then find EPIC `DMB5000001`.
   - Open `/report-violation`: file a cash complaint in Punjab → Ludhiana → Ludhiana South. Note the `CV…` reference and the clock.
2. **cVIGIL loop (4 min).**
   - Sign in as **DEO1000001** → desk → MCC control room. The new report is on top: send it to FST1000001.
   - Sign in as **FST1000001** → Assigned reports: send a field report with a ₹50,000 cash seizure.
   - Sign in as **ROF1000001** → MCC complaints: dispose of it as "referred to police".
   - Back on `/report-violation` → Follow a report: it shows disposed and the time against the 100-minute target.
3. **Roll (5 min).**
   - Open `/voters/forms/form-8` as the public: address it to Ludhiana South, use EPIC `DMB5000003`, correct the name, submit.
   - Sign in as **BLO1000001** → desk → Forms 2-8: field-verify it.
   - Sign in as **ERO1000001** → Forms 2-8: approve it. `/electoral-roll` now shows the corrected name.
   - Show the demo rejected Form 6A and its appeal: as **DEO1000001** → Roll appeals, allow it; as **ERO1000001** → Appeal orders, mark it implemented.
4. **Polling station change (4 min).**
   - As **DEO1000001** → Polling-station changes: "Community Hall, Haibowal Kalan" is consulted, so forward it to the CEO.
   - As **CEO1000001** → forward it with remarks.
   - As **ECI1234567** → Polling-station approvals: approve with reference `ECI/464/PS/2026`.
   - As **DEO1000001** → issue the order and publish. The station now appears on `/map` and `/booths`.
5. **Campaign (3 min).**
   - As **EAG1000001** → Campaign permissions: apply for a rally in 3 days.
   - As **SPO1000001** → Police remarks: no objection.
   - As **ROF1000001** → grant it with conditions.
   - As **EOB1000001** → Candidates' registers: see that Gurpreet Sandhu's shadow register exceeds the reported spend.
6. **Poll day (4 min).**
   - As **PRO1000001** → `/poll-day`: mock poll, then open (on the demo poll-day date).
   - As **POL1000001** → mark an elector.
   - As **PRO1000001** → report an EVM malfunction, then desk → Machine log: "Unit replaced".
   - Close the poll, then submit the PO report with a deliberately different vote count.
   - As **ROF1000001** → Station reports: the difference is flagged.
7. **Oversight (2 min).**
   - As **CEC1000001** → Observer reports: the expenditure observer's report has a direction to the RO.
   - As **ROF1000001** → Directions: report compliance.
   - As **CEC1000001** → close the direction.
8. **Reports (1 min).**
   - As **CEO1000001** → the State report, broken down by district; download the CSV.
   - As **ECI1234567** → the national picture, broken down by State (Punjab, Himachal Pradesh, Delhi).

---

## 9. Demo data (synthetic)

`npm run seed` is safe to run again; each block is written once.

| Data | Amount |
| --- | --- |
| Demo accounts | One per role (34), plus DEO Amritsar, DEO Shimla, CEO Himachal, ERO Amritsar East and a second flying squad, each with an assignment |
| Elections | Demo general election (nominations open), Demo bye-election (scrutiny), Demo poll-day election (poll date = day of seeding), Demo past bye-election (completed, mock results) |
| Approved polling stations | 93 with map locations: Ludhiana (8 constituencies), Amritsar (4), Jalandhar (3), Patiala (2), Shimla (3), New Delhi (2) |
| Station proposals | 5, at Draft, Consulted, With CEO (two) and With ECI |
| Electors | About 2,000 with serials, relatives and houses; some service voters, overseas electors and PwD electors |
| Forms 2-8 | 7 across every status (submitted, field verified, approved, rejected) |
| MCC complaints | 8 across every status, with seizures and 2 flying squads |
| Campaign permissions | 7 across every status |
| Expenditure | 30 register entries for 4 candidates, with flags and an observer note; 1 shadow-register entry |
| Observer reports and directions | 3 reports (general, micro, expenditure); 2 directions (one issued, one complied) |
| Roll appeals | 1 first appeal |
| Poll-day incidents | 4, at different severities and states |
| Logistics | Steps for every Ludhiana South station |
| Security | 15 assessments (normal, sensitive, critical), 4 deployments, 4 situation reports |
| Nodal | 5 reports, 4 tasks |
| Station problems | 2 open |

To reseed from scratch, flush Redis (`redis-cli flushall`) and run `npm run seed`.

---

## 10. Known limitations and what is still needed

1. **OTPs are printed in the terminal.** They live in memory; production needs SMS and Redis-backed OTPs.
2. **Biometrics.** The fingerprint is simulated. Persona needs real sandbox credentials.
3. **Appellate authority is configured as the DEO.** Under s. 24 it is the officer the State notifies (DM, ADM or another officer). A production system should map this per State.
4. **Documents.** Forms 2-8 and complaint photos are stored in Redis as data URLs. Production needs object storage with encryption and retention rules.
5. **No Record Office or Commandant step** for Forms 2 and 2A (certifying service voters). The BLO step stands in for it.
6. **The flying squad's seizures are not reconciled with the treasury or income-tax handover.** There is no grievance committee release workflow.
7. **The PO report covers Form 17C Part I only.** Part II (counting) remains with the counting module and the registered result source.
8. **Election petitions (Part VI)** and court orders are not modelled. A declared result cannot be reversed in the platform, by design.
9. **Map tiles** come from OpenFreeMap or OpenStreetMap. A government deployment would host its own tiles. Station locations in the demo are approximate and invented.
10. **Real-time on serverless.** Socket.IO only runs on a long-running server, not on Vercel.
11. **Accessibility and translation.** The new desk text is English only; the voter-facing pages have translations in 5 languages.
12. **Load.** Many lists scan Redis sets. They are fine for demo volumes; MongoDB read models (or Redis indexes) are needed beyond tens of thousands of records.

---

## 11. Running and testing

```bash
# backend
cd backend && cp .env.example .env    # set ACCESS_TOKEN_SECRET, REDIS_URL
npm install && npm run seed && npm run dev

# frontend
cd frontend && npm install && npm run dev    # http://localhost:5173

# tests (disposable Redis on another port)
docker run -d --name eci-redis-test -p 6390:6379 redis
TEST_REDIS_URL=redis://127.0.0.1:6390 npm test     # 130 pass, 1 skipped (needs MongoDB)
```

Set `STEP_UP_REQUIRED=false` in `backend/.env` for a faster demo. Otherwise approvals ask for a fresh OTP.

---

## Appendix A. Every backend endpoint

These names in the tables are constants defined in the route files:

| Constant | Permissions it stands for |
| --- | --- |
| `CAN_SEE_APPLICATIONS` | application:review, verification:field-report, application:decide |
| `STATION_TEAM` | polling:conduct, polling:identify-voter, polling:mark-register, polling:operate-evm, polling:observe, observer:report |
| `COUNTING` | counting:supervise, counting:assist, result:declare, counting:supervise-table, counting:record, counting:observe, counting:object, counting:read, observer:report |
| `CAN_REPORT_ISSUE` | station:view, station:propose, polling:inspect, roll:view-part, application:decide, roll:claims-objections, nomination:submit |
| `STAFF` (elector forms) | application:decide, verification:field-report, application:review, record:read, roll:manage |
| `STAFF` (complaints) | the complaint permissions, record:read, expenditure:read, national and state readers |
| `READ` (security) | security:*, control:view, district:manage, state:manage, record:read, logistics:track |
| `READ_REPORTS`, `OFFICIALS` (oversight) | observer and national permissions; any official who can be an addressee |

"stepup" means a fresh OTP is required. Routes under a `router.use(verifyJWT)` need a signed-in user even when no permission is listed.

#### `/api/v1/electors`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/electors/search` | Public (or signed-in, checked inside) |

#### `/api/v1/verification`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/verification/otp/send` | Public (or signed-in, checked inside) |
| POST | `/api/v1/verification/otp/verify` | Public (or signed-in, checked inside) |
| POST | `/api/v1/verification/identity` | Public (or signed-in, checked inside) |
| POST | `/api/v1/verification/:id/challenge` | Public (or signed-in, checked inside) |
| POST | `/api/v1/verification/:id/face` | Public (or signed-in, checked inside) |

#### `/api/v1/auth`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | Public (or signed-in, checked inside) |
| POST | `/api/v1/auth/register` | Public (or signed-in, checked inside) |
| GET | `/api/v1/auth/register/:id` | Public (or signed-in, checked inside) |
| POST | `/api/v1/auth/register/:id/information` | Public (or signed-in, checked inside) |
| GET | `/api/v1/auth/geography` | Public (or signed-in, checked inside) |
| GET | `/api/v1/auth/roles` | Public (or signed-in, checked inside) |
| POST | `/api/v1/auth/logout` | Public (or signed-in, checked inside) |
| POST | `/api/v1/auth/logout-all` | Public (or signed-in, checked inside) |
| GET | `/api/v1/auth/me` | Public (or signed-in, checked inside) |
| POST | `/api/v1/auth/step-up/request` | Public (or signed-in, checked inside) |
| POST | `/api/v1/auth/step-up/verify` | Public (or signed-in, checked inside) |

#### `/api/v1/admin`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/admin/verifications` | Public (or signed-in, checked inside) |
| PATCH | `/api/v1/admin/verifications/:id/resolve` | Public (or signed-in, checked inside) |
| GET | `/api/v1/admin/stats` | Public (or signed-in, checked inside) |
| GET | `/api/v1/admin/registrations` | CAN_SEE_APPLICATIONS |
| GET | `/api/v1/admin/registrations/:id/documents/:category` | CAN_SEE_APPLICATIONS |
| POST | `/api/v1/admin/registrations/:id/field-verification` | verification:field-report |
| POST | `/api/v1/admin/registrations/:id/approve` | application:decide stepup |
| POST | `/api/v1/admin/registrations/:id/reject` | application:decide stepup |
| POST | `/api/v1/admin/registrations/:id/request-information` | application:decide |
| POST | `/api/v1/admin/registrations/:id/request-reverification` | application:decide |
| GET | `/api/v1/admin/changes` | CAN_SEE_APPLICATIONS |
| POST | `/api/v1/admin/changes/:id/field-verification` | verification:field-report |
| POST | `/api/v1/admin/changes/:id/approve` | application:decide stepup |
| POST | `/api/v1/admin/changes/:id/reject` | application:decide stepup |
| POST | `/api/v1/admin/changes/:id/request-information` | application:decide |
| POST | `/api/v1/admin/changes/:id/request-reverification` | application:decide |

#### `/api/v1/voting-verification`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/voting-verification/start` | Public (or signed-in, checked inside) |
| POST | `/api/v1/voting-verification/:id/persona/start` | Public (or signed-in, checked inside) |
| POST | `/api/v1/voting-verification/:id/persona/sync` | Public (or signed-in, checked inside) |
| GET | `/api/v1/voting-verification/:id/reference-photo` | Public (or signed-in, checked inside) |
| POST | `/api/v1/voting-verification/:id/document` | Public (or signed-in, checked inside) |
| POST | `/api/v1/voting-verification/:id/face/challenge` | Public (or signed-in, checked inside) |
| POST | `/api/v1/voting-verification/:id/face` | Public (or signed-in, checked inside) |
| POST | `/api/v1/voting-verification/:id/fingerprint` | Public (or signed-in, checked inside) |

#### `/api/v1/persona`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/persona/start` | Public (or signed-in, checked inside) |
| GET | `/api/v1/persona/status` | Public (or signed-in, checked inside) |
| POST | `/api/v1/persona/sync` | Public (or signed-in, checked inside) |
| POST | `/api/v1/persona/complete-verification` | Public (or signed-in, checked inside) |

#### `/api/v1/notifications`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/notifications/` | Public (or signed-in, checked inside) |

#### `/api/v1/changes`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/changes/` | application:submit role:voter |
| GET | `/api/v1/changes/my` | application:track role:voter |
| POST | `/api/v1/changes/:id/information` | role:voter |

#### `/api/v1/eci`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/eci/blo-list` | Public (or signed-in, checked inside) |
| POST | `/api/v1/eci/blo/assign` | Public (or signed-in, checked inside) |
| POST | `/api/v1/eci/blo/remove` | Public (or signed-in, checked inside) |
| GET | `/api/v1/eci/voters` | Public (or signed-in, checked inside) |

#### `/api/v1/assignments`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/assignments/me` | Public (or signed-in, checked inside) |
| GET | `/api/v1/assignments/` | role:assign, blo:assign, staff:assign, polling:arrange, audit:read |
| POST | `/api/v1/assignments/` | role:assign, blo:assign, staff:assign, polling:arrange stepup |
| POST | `/api/v1/assignments/:id/revoke` | role:assign, blo:assign, staff:assign, polling:arrange stepup |

#### `/api/v1/audit`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/audit/` | Public (or signed-in, checked inside) |
| GET | `/api/v1/audit/search` | Public (or signed-in, checked inside) |
| GET | `/api/v1/audit/integrity` | national:manage |
| GET | `/api/v1/audit/:type/:id` | Public (or signed-in, checked inside) |

#### `/api/v1/integrations`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/integrations/sources` | Public (or signed-in, checked inside) |
| POST | `/api/v1/integrations/sources` | stepup |
| POST | `/api/v1/integrations/sources/:id/suspend` | stepup |
| POST | `/api/v1/integrations/sources/:id/runs` | Public (or signed-in, checked inside) |
| GET | `/api/v1/integrations/runs` | Public (or signed-in, checked inside) |
| POST | `/api/v1/integrations/rescreen` | Public (or signed-in, checked inside) |

#### `/api/v1/registration-tasks`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/registration-tasks/` | verification:field-report, application:decide, blo:supervise, blo:assign |
| POST | `/api/v1/registration-tasks/:id/outcome` | verification:field-report role:blo, admin |
| POST | `/api/v1/registration-tasks/:id/assign` | blo:assign, blo:supervise |

#### `/api/v1/roll-versions`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/roll-versions/` | roll:publish stepup |
| GET | `/api/v1/roll-versions/` | roll:publish, roll:manage, audit:read |
| GET | `/api/v1/roll-versions/:id` | roll:publish, roll:manage, audit:read |

#### `/api/v1/elections`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/elections/` | Public (or signed-in, checked inside) |
| POST | `/api/v1/elections/` | Public (or signed-in, checked inside) |
| POST | `/api/v1/elections/:id/schedule` | Public (or signed-in, checked inside) |

#### `/api/v1/polling-stations`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/polling-stations/` | station:view, station:propose, station:approve, state:manage |
| GET | `/api/v1/polling-stations/issues` | CAN_REPORT_ISSUE, state:manage, station:approve |
| POST | `/api/v1/polling-stations/issues` | CAN_REPORT_ISSUE |
| POST | `/api/v1/polling-stations/issues/:issueId/close` | station:propose |
| POST | `/api/v1/polling-stations/` | station:propose |
| POST | `/api/v1/polling-stations/import` | station:propose |
| POST | `/api/v1/polling-stations/:id/relocation` | station:propose |
| POST | `/api/v1/polling-stations/:id/consultation` | station:propose |
| POST | `/api/v1/polling-stations/:id/forward` | station:propose |
| POST | `/api/v1/polling-stations/:id/ceo-forward` | state:manage |
| POST | `/api/v1/polling-stations/:id/clarification` | station:approve |
| POST | `/api/v1/polling-stations/:id/approve` | station:approve stepup |
| POST | `/api/v1/polling-stations/:id/publish` | station:propose stepup |
| POST | `/api/v1/polling-stations/:id/reject` | station:approve stepup |

#### `/api/v1/nominations`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/nominations/` | nomination:submit |
| GET | `/api/v1/nominations/mine` | nomination:submit |
| GET | `/api/v1/nominations/assisted` | nomination:assist |
| POST | `/api/v1/nominations/:id/withdraw` | nomination:submit |
| GET | `/api/v1/nominations/` | nomination:scrutinise |
| POST | `/api/v1/nominations/:id/scrutiny` | nomination:scrutinise |
| GET | `/api/v1/nominations/scrutiny-delegation` | nomination:scrutinise |
| POST | `/api/v1/nominations/scrutiny-delegation` | scrutiny:delegate stepup |
| POST | `/api/v1/nominations/scrutiny-delegation/revoke` | scrutiny:delegate stepup |
| POST | `/api/v1/nominations/contesting` | candidates:publish stepup |

#### `/api/v1/public`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/public/elections` | Public (or signed-in, checked inside) |
| GET | `/api/v1/public/stations/map` | Public (or signed-in, checked inside) |
| GET | `/api/v1/public/stations` | Public (or signed-in, checked inside) |
| GET | `/api/v1/public/stations/near` | Public (or signed-in, checked inside) |
| GET | `/api/v1/public/stations/epic/:epic` | Public (or signed-in, checked inside) |
| GET | `/api/v1/public/stations/:id/queue` | Public (or signed-in, checked inside) |
| GET | `/api/v1/public/candidates` | Public (or signed-in, checked inside) |
| GET | `/api/v1/public/results` | Public (or signed-in, checked inside) |
| GET | `/api/v1/public/turnout` | Public (or signed-in, checked inside) |

#### `/api/v1/poll-day`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/poll-day/station` | STATION_TEAM, roll:view-part |
| GET | `/api/v1/poll-day/electors` | polling:conduct, polling:identify-voter, polling:mark-register, roll:view-part |
| POST | `/api/v1/poll-day/electors/:epic/mark` | polling:mark-register, polling:conduct |
| POST | `/api/v1/poll-day/poll/status` | polling:conduct |
| POST | `/api/v1/poll-day/queue` | polling:conduct, polling:identify-voter |
| GET | `/api/v1/poll-day/cases` | STATION_TEAM |
| POST | `/api/v1/poll-day/cases` | polling:conduct, polling:identify-voter, polling:mark-register, polling:object |
| POST | `/api/v1/poll-day/cases/:id/resolve` | polling:conduct |
| POST | `/api/v1/poll-day/vab-slips/:epic` | roll:view-part role:blo, admin |
| GET | `/api/v1/poll-day/vab-slips/:slipId` | polling:identify-voter, polling:mark-register, polling:conduct |
| GET | `/api/v1/poll-day/register` | polling:conduct |
| GET | `/api/v1/poll-day/records` | polling:conduct, polling:operate-evm, polling:report |
| POST | `/api/v1/poll-day/machine-events` | polling:operate-evm, polling:conduct |
| POST | `/api/v1/poll-day/po-report` | polling:report |
| GET | `/api/v1/poll-day/station-reports` | control:view, record:read, counting:read, district:manage, state:manage |
| GET | `/api/v1/poll-day/procedures` | STATION_TEAM |
| GET | `/api/v1/poll-day/assistant` | polling:conduct |
| POST | `/api/v1/poll-day/checklists/:kind` | polling:conduct |
| GET | `/api/v1/poll-day/package/public-key` | STATION_TEAM |
| GET | `/api/v1/poll-day/package` | polling:conduct, polling:identify-voter, polling:mark-register |
| POST | `/api/v1/poll-day/sync` | polling:conduct, polling:mark-register |
| GET | `/api/v1/poll-day/sync-conflicts` | polling:conduct |
| POST | `/api/v1/poll-day/sync-conflicts/:id/resolve` | polling:conduct |

#### `/api/v1/control-room`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/control-room/` | control:view |
| POST | `/api/v1/control-room/incidents` | incident:report |
| POST | `/api/v1/control-room/incidents/:id` | incident:manage |
| POST | `/api/v1/control-room/stations/:stationId/visits` | polling:inspect |

#### `/api/v1/results`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/results/sources` | Public (or signed-in, checked inside) |
| POST | `/api/v1/results/sources` | stepup |
| POST | `/api/v1/results/sources/:sourceId/entries` | Public (or signed-in, checked inside) |
| POST | `/api/v1/results/sources/:sourceId/publication` | Public (or signed-in, checked inside) |
| POST | `/api/v1/results/sources/:sourceId/mock` | Public (or signed-in, checked inside) |

#### `/api/v1/training`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/training/modules` | Public (or signed-in, checked inside) |
| POST | `/api/v1/training/modules/:id/attempts` | Public (or signed-in, checked inside) |
| GET | `/api/v1/training/scenarios` | Public (or signed-in, checked inside) |
| POST | `/api/v1/training/scenarios/:id/start` | Public (or signed-in, checked inside) |
| POST | `/api/v1/training/runs/:runId/submit` | Public (or signed-in, checked inside) |
| GET | `/api/v1/training/report` | Public (or signed-in, checked inside) |
| GET | `/api/v1/training/team` | blo:assign, blo:supervise, staff:assign, polling:arrange |

#### `/api/v1/agents`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/agents/mine` | agent:appoint |
| POST | `/api/v1/agents/` | agent:appoint |
| POST | `/api/v1/agents/:id/revoke` | agent:appoint |
| GET | `/api/v1/agents/` | nomination:scrutinise |

#### `/api/v1/users`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/users/:epic` | Public (or signed-in, checked inside) |
| POST | `/api/v1/users/:epic/suspend` | stepup |
| POST | `/api/v1/users/:epic/reinstate` | stepup |

#### `/api/v1/events`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/events/` | Public (or signed-in, checked inside) |
| GET | `/api/v1/events/history` | Public (or signed-in, checked inside) |

#### `/api/v1/devices`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/devices/mine` | Public (or signed-in, checked inside) |
| POST | `/api/v1/devices/register` | Public (or signed-in, checked inside) |
| POST | `/api/v1/devices/heartbeat` | Public (or signed-in, checked inside) |
| POST | `/api/v1/devices/:id/revoke` | polling:conduct, incident:manage |

#### `/api/v1/counting`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/counting/:electionId` | COUNTING |
| GET | `/api/v1/counting/:electionId/staff` | counting:supervise, counting:assist, result:declare |
| POST | `/api/v1/counting/:electionId/plan` | counting:supervise, result:declare |
| POST | `/api/v1/counting/:electionId/randomise` | counting:supervise, result:declare |
| POST | `/api/v1/counting/:electionId/vvpat-draw` | counting:supervise, result:declare |
| POST | `/api/v1/counting/:electionId/rounds/:round/tables/:table` | counting:supervise, counting:assist, result:declare, counting:supervise-table |
| POST | `/api/v1/counting/:electionId/rounds/:round/complete` | counting:supervise, result:declare |
| POST | `/api/v1/counting/:electionId/discrepancies` | counting:object, counting:supervise-table, observer:report |
| POST | `/api/v1/counting/:electionId/discrepancies/:id/decide` | counting:supervise, result:declare |
| POST | `/api/v1/counting/:electionId/observer-reports` | observer:report |

#### `/api/v1/objections`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/objections/` | Public (or signed-in, checked inside) |
| GET | `/api/v1/objections/my` | Public (or signed-in, checked inside) |
| POST | `/api/v1/objections/:id/withdraw` | Public (or signed-in, checked inside) |
| POST | `/api/v1/objections/:id/reply` | roll:view-own role:voter |
| GET | `/api/v1/objections/staff` | application:decide, verification:field-report |
| POST | `/api/v1/objections/staff/:id/field-report` | verification:field-report |
| POST | `/api/v1/objections/staff/:id/decide` | application:decide stepup |

#### `/api/v1/elector-forms`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/elector-forms/` | Public (or signed-in, checked inside) |
| GET | `/api/v1/elector-forms/status/:ref` | Public (or signed-in, checked inside) |
| GET | `/api/v1/elector-forms/mine` | application:track |
| POST | `/api/v1/elector-forms/mine/:id/withdraw` | Public (or signed-in, checked inside) |
| GET | `/api/v1/elector-forms/staff` | STAFF |
| GET | `/api/v1/elector-forms/staff/:id` | STAFF |
| GET | `/api/v1/elector-forms/staff/:id/documents/:name` | application:decide, verification:field-report |
| POST | `/api/v1/elector-forms/staff/:id/field-report` | verification:field-report |
| POST | `/api/v1/elector-forms/staff/:id/decide` | application:decide stepup |
| POST | `/api/v1/elector-forms/:form` | Public (or signed-in, checked inside) |

#### `/api/v1/campaign-permissions`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/campaign-permissions/` | permission:apply |
| GET | `/api/v1/campaign-permissions/mine` | permission:apply |
| POST | `/api/v1/campaign-permissions/mine/:id/withdraw` | permission:apply |
| GET | `/api/v1/campaign-permissions/` | permission:decide, security:coordinate, record:read, district:manage, state:manage, national:view, national:manage |
| POST | `/api/v1/campaign-permissions/:id/police` | security:coordinate |
| POST | `/api/v1/campaign-permissions/:id/decide` | permission:decide |

#### `/api/v1/expenditure`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/expenditure/mine` | expenditure:report |
| POST | `/api/v1/expenditure/` | expenditure:report |
| POST | `/api/v1/expenditure/:id/correct` | expenditure:report |
| GET | `/api/v1/expenditure/` | expenditure:read, record:read, permission:decide, district:manage, state:manage, national:view, national:manage |
| POST | `/api/v1/expenditure/:id/notes` | expenditure:read |
| POST | `/api/v1/expenditure/shadow` | expenditure:read |

#### `/api/v1/oversight`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/oversight/observer-reports` | READ_REPORTS |
| POST | `/api/v1/oversight/observer-reports` | observer:report |
| POST | `/api/v1/oversight/observer-reports/:id/review` | national:manage, direction:issue |
| POST | `/api/v1/oversight/observer-reports/:id/supplement` | observer:report |
| GET | `/api/v1/oversight/directions` | OFFICIALS |
| POST | `/api/v1/oversight/directions` | direction:issue stepup |
| POST | `/api/v1/oversight/directions/:id/comply` | OFFICIALS |
| POST | `/api/v1/oversight/directions/:id/close` | direction:issue |

#### `/api/v1/security`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/security/` | READ |
| POST | `/api/v1/security/stations/:stationId/assessment` | security:plan |
| POST | `/api/v1/security/deployments` | security:plan |
| POST | `/api/v1/security/deployments/:id` | security:plan, security:coordinate |
| POST | `/api/v1/security/sitreps` | security:coordinate |

#### `/api/v1/logistics`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/logistics/` | logistics:track, control:view, district:manage, state:manage, record:read, nodal:function-manage |
| POST | `/api/v1/logistics/stations/:stationId` | logistics:track |

#### `/api/v1/nodal`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/nodal/` | nodal:function-manage, nodal:coordinate |
| POST | `/api/v1/nodal/reports` | nodal:function-manage |
| POST | `/api/v1/nodal/tasks` | nodal:coordinate |
| POST | `/api/v1/nodal/tasks/:id` | nodal:function-manage, nodal:coordinate |

#### `/api/v1/reports`

| Method | Path | Who may call it |
| --- | --- | --- |
| GET | `/api/v1/reports/summary` | district:manage, state:manage, report:state, report:national, national:view, national:manage, record:read, application:decide, nomination:scrutinise, control:view, blo:supervise, observer:view |
| GET | `/api/v1/reports/roll-part` | roll:view-part |

#### `/api/v1/complaints`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/complaints/` | Public (or signed-in, checked inside) |
| GET | `/api/v1/complaints/track/:ref` | Public (or signed-in, checked inside) |
| GET | `/api/v1/complaints/` | STAFF |
| GET | `/api/v1/complaints/:id/photo` | STAFF |
| POST | `/api/v1/complaints/:id/dispatch` | complaint:dispatch |
| POST | `/api/v1/complaints/:id/field-report` | complaint:investigate |
| POST | `/api/v1/complaints/:id/dispose` | complaint:dispose |

#### `/api/v1/appeals`

| Method | Path | Who may call it |
| --- | --- | --- |
| POST | `/api/v1/appeals/` | Public (or signed-in, checked inside) |
| GET | `/api/v1/appeals/track/:ref` | Public (or signed-in, checked inside) |
| POST | `/api/v1/appeals/track/:ref/second` | Public (or signed-in, checked inside) |
| GET | `/api/v1/appeals/` | appeal:decide-first, appeal:decide-second, application:decide, record:read |
| POST | `/api/v1/appeals/:id/first` | appeal:decide-first stepup |
| POST | `/api/v1/appeals/:id/second` | appeal:decide-second stepup |
| POST | `/api/v1/appeals/:id/implement` | application:decide |
