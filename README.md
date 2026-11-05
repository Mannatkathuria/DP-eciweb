# Election Management Prototype

A React + Express election-management prototype with role-based dashboards, OTP sign-in, voter registration, and Persona Sandbox identity verification.

> **ECI systems coverage** (every ERONET, BLO App, ePlan, Observer, ENCORE, cVIGIL, ETPBMS, NGSP, ESMS, IEMS and EMS 2.0 feature, where it is, which database holds it and how data flows): [docs/ECI_SYSTEMS_COVERAGE.md](docs/ECI_SYSTEMS_COVERAGE.md)

## Architecture

```text
Voter / BLO / ECI React portals
             │
             ▼
      Node / Express API ───── Persona Embedded Flow + API + webhooks
             │
             ▼
   Redis (system of record) ──projector──▶ MongoDB (optional read models)
```

Redis holds every record and decision. MongoDB, when `MONGODB_URI` is set, holds copies built for search: polling-station geography (nearest stations), the full operational-event history and the audit archive with its hash chain. See [docs/DATA_STORES.md](docs/DATA_STORES.md).

Persona runs the configured document and face-verification steps inside the app. The local Python face service and Aadhaar QR decoder are no longer used.

## Requirements

- Node.js 22 or newer (`node -v`)
- Redis: local, Docker, or a hosted provider such as Upstash

## Start Redis

Run Redis locally or set `REDIS_URL` to your Redis provider URL. With Docker:

```bash
docker run -d --name eci-redis -p 6379:6379 redis   # first time
docker start eci-redis                               # later runs
docker exec eci-redis redis-cli ping                 # should print PONG
```

With a local install, check it with `redis-cli ping`.

### MongoDB (optional)

```bash
docker run -d --name eci-mongo -p 27017:27017 mongo:8   # first time
# backend/.env:  MONGODB_URI=mongodb://127.0.0.1:27017/eciweb
cd backend && npm run mongo:sync                        # copy existing Redis data into MongoDB
```

Without MongoDB the app runs fully; nearest-station search, event history and audit search then use slower Redis queries and say so.

## Configure and start the backend

```bash
cd backend
cp .env.example .env        # Windows Command Prompt: copy .env.example .env
npm install
npm run seed
npm run create-blo -- --name "Ravi Kumar" --mobile 9876543210 --state UP
npm run dev
```

In `backend/.env`, replace `ACCESS_TOKEN_SECRET` with a long random string before starting the server. Keep `REDIS_URL=redis://127.0.0.1:6379` for the Docker Redis above. `npm run create-blo` prints a BLO ID (see [BLO accounts](#blo-accounts)); run it in a separate terminal if the server is already running.

Set these values in `backend/.env` using the Persona Sandbox dashboard:

```env
PERSONA_API_KEY=persona_sandbox_your_key
PERSONA_TEMPLATE_ID=itmpl_your_template_id
PERSONA_ENVIRONMENT_ID=env_your_sandbox_environment_id
PERSONA_API_VERSION=2026-09-29
PERSONA_WEBHOOK_SECRET=wbhsec_your_webhook_secret
```

`PERSONA_DEMO_MODE` (default `false`) controls the ECI polling-station identity step, which is not connected to a real Persona inquiry yet. While it is `false` that step reports that it cannot run; set it to `true` only for a demonstration, and every result is then labelled "simulated".

Keep Persona credentials on the backend. Do not add them to frontend environment variables or commit `backend/.env`.

### Persona webhook

Create a webhook in the Persona Sandbox environment with this endpoint:

```text
https://<your-public-api-host>/api/v1/persona/webhook
```

Enable at least `inquiry.completed`, `inquiry.approved`, `inquiry.declined`, and `inquiry.marked-for-review`. The backend verifies Persona's HMAC signature with `PERSONA_WEBHOOK_SECRET`. For local development, expose the API with a tunnel and set the webhook URL to that public address.

Allow your frontend origin in Persona's Embedded Flow security settings so its verification iframe can load.

The app treats `approved` as verified. `completed` means the user finished the Persona flow, so the dashboard shows that the inquiry is awaiting a decision until Persona approves it.

## Start the frontend

```bash
cd frontend
cp .env.example .env        # Windows Command Prompt: copy .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

Set `VITE_API_URL` in `frontend/.env` only if the API is not at `http://localhost:8000/api/v1`. Persona's embedded Web SDK is loaded by the frontend; the API key stays on the backend.

## Sandbox demo accounts

Run `npm run seed` to create these accounts. It is safe to run again: existing accounts, electoral-roll records and demo applications are left unchanged.

| Role | EPIC |
| --- | --- |
| Voter | `ABC1234567` |
| ECI official | `ECI1234567` |
| Electoral registration officer (Ludhiana South) | `ERO1000001` |
| District election officer (Ludhiana) | `DEO1000001` |
| Returning officer (Ludhiana South) | `ROF1000001` |
| Candidate (Ludhiana South) | `CAN1000001` |

Voters and ECI officials sign in with the EPIC only. The backend generates an OTP and prints it in the backend terminal; no SMS is sent. Voters go to `/dashboard`, ECI officials to `/eci/dashboard`, EROs/AEROs to `/ero`, DEOs to `/deo`, ROs/AROs to `/ro` and candidates to `/candidate`.

### BLO accounts

BLOs sign in like every other officer, on `/signin/blo`: their **BLO ID** (shaped like an EPIC, for example `BLO1000001`) and a one-time code (in this prototype the code is printed in the backend terminal). There is no password. Create a BLO from the `backend` folder:

```bash
npm run create-blo -- --name "Ravi Kumar" --mobile 9876543210 --state UP
```

The command prints the BLO ID (the next in one national series: `BLO1000002`, `BLO1000003`, ...). Older accounts with IDs like `BLO1000001` are renamed, and their passwords removed, by `npm run migrate:blo-ids` (which `npm run seed` also runs). Every reference is rewritten, except the audit trail and event history, which keep the old ID as a record of what happened.

## Voter registration (Form 6) and corrections (Form 8): BLO verifies, ERO decides

The workflow follows the Representation of the People Act, 1950: the **BLO verifies in the field and recommends**, and only the **ERO or AERO decides** (ss. 13B, 13C, 23).

1. **Voter applies** at `/register` with name, date of birth, gender, **State/UT -> District -> Assembly constituency** (dependent dropdowns), **full address**, a **six-digit PIN code** and an **identity / address proof document** (required; JPEG, PNG or WebP up to 4 MB, checked again by the backend). The voter does not enter a part number or polling station. The request gets a reference ID for checking its status at `/check-request`. An identical application cannot be submitted again while the first one is still open.
2. **BLO field verification** on `/admin` (tab *Form 6 field verification*). The BLO sees only applications in their assigned constituency. They record the **part number** (1-9999) and **polling station** (pre-filled from their own assignment) and choose **Verified: recommend approval**, or **Recommend rejection** with a reason. The status becomes `field_verified`. Nothing is added to the roll at this step.
3. **ERO/AERO decision** on `/ero`. The officer sees field-verified applications in their constituency, the BLO's recommendation, note and history. They can correct the booth, then **Approve & add to roll** (issues the EPIC, creates the electoral-roll record and the voter account in one transaction) or **Reject** with a reason shown to the applicant. They can also reject an application that is still waiting for the BLO.
4. Every step is written to the **audit trail** with who acted, under which role and assignment, and what changed.

### Corrections and shifts (Form 8)

Form 8 follows the same split (RP Act 1950, s. 22). The voter submits a correction with a proof document from their dashboard. The BLO verifies it on `/admin` (tab *Form 8 field verification*) and recommends approval or rejection; the ERO/AERO decides on `/ero`, and only an approval changes the roll. A request belongs to the area the elector will be in **after** the change, so a **shift of residence** to another constituency is verified by the BLO and decided by the ERO of the new constituency, and the BLO must record the new part number and polling station. The audit entry for an approval lists each corrected field before and after. Officials use `/api/v1/admin/changes`; the old unchecked review routes under `/api/v1/changes` were removed.

## New-voter pipeline and published roll versions (Phase 1)

**Young elector identification and registration assistance.** Nobody is ever enrolled automatically; the pipeline only finds people a BLO should help.

1. **Approved data sources** (`/eci/integrations`, ECI administrator only). A source is `synthetic`, `approved_api` or `approved_export`. Real sources must record their legal basis and data-sharing agreement reference. Scraped websites or databases that merely happen to be reachable are not valid sources. The prototype seeds a synthetic feed of invented people.
2. **Import** (`POST /api/v1/integrations/sources/:id/runs` with `{ records: [...] }`, up to 1,000 per run). Only the minimum fields are kept (`sourceReference, name, dateOfBirth, gender, state, district, constituency, partNumber, pollingStation, address`). Records are validated against the ECI constituency list, de-duplicated (same reference, same person from another run, already on the roll, already applied) and staged as *prospective electors*, kept apart from the roll. Every run is recorded with its counts and rejection reasons.
3. **Eligibility by qualifying date** (`backend/src/services/eligibility.service.js`). Qualifying dates are 1 January, 1 April, 1 July and 1 October (RP Act 1950, s. 14(b), as amended in 2021). `ELIGIBLE` means 18 on a qualifying date that has passed; `ADVANCE` means 17 or older with the first qualifying date still ahead (advance application); `FUTURE` means younger. Future people get no task until `POST /api/v1/integrations/rescreen` finds they have come of age.
4. **BLO task** for each eligible or advance person, routed to the BLO whose assignment names their part or polling station, or to the only BLO of the constituency. Otherwise the task is unassigned and the ERO or BLO supervisor assigns it. BLOs work tasks on `/admin` (tab *New voter tasks*): contacted, Form 6 filed (linked by reference ID, checked to be the same person), declined, not found or not eligible.
5. The linked Form 6 then follows the normal workflow (BLO field verification, ERO decision). The task shows the result (`registered` with the EPIC, or `application_rejected`).
6. **The applicant's status page** (`/check-request`) shows a timeline of official steps (submitted, field verified, approved or rejected), without officers' identities.

**Roll versions.** On `/ero` the ERO publishes the current roll of their constituency as a numbered, immutable version (`POST /api/v1/roll-versions`). Each version stores a snapshot (EPIC, name, gender, age, part, polling station; no addresses), a SHA-256 content hash, and the electors added, removed or changed since the previous version. Reading a version re-checks the hash. Publishing an unchanged roll is refused.

## Elections, polling stations, staff and nominations (Phase 2)

**Elections** (`/eci/elections`, ECI administrator). An election has a type, the States/UTs it covers and a full schedule: notification, last date of nominations, scrutiny, last date of withdrawal, poll and counting. Every date must come after the one before. The stage (nominations open, scrutiny and withdrawal, campaign, poll day and so on) follows the calendar in Indian Standard Time. A revised schedule needs a reason, and the earlier schedule is kept.

**Polling stations** (RP Act 1951, s. 25: provided by the DEO with the Commission's approval). The DEO (`/deo`) proposes a station for a part of a constituency in their district (one station per part, name, address, optional location inside India, accessibility facilities) or a relocation with a reason. The ECI approves or rejects with a reason; the proposer can never approve their own change. Only approved stations are public or usable for staff. Each approval is a new version, and a relocation moves every elector of that part to the new station in the same transaction and shows voters a relocation notice. The public page `/booths` finds a station by EPIC (returns only the part and station) or by area.

**Election staff.** The DEO (and CEO) appoints presiding, polling, counting and sector staff inside their own jurisdiction; the RO/ARO arranges presiding and polling officers inside their constituency. Once a constituency has approved stations, a station-level appointment must name one of them. Duplicate appointments are refused, and revoking needs a reason.

**Nominations.** A candidate (`/candidate`) files for the constituency of their candidate assignment during the nomination period, with the Form 26 affidavit headline figures and a declaration; they must be at least 25 on the scrutiny date, and may have one live nomination per election. The RO or ARO of that constituency (`/ro`) accepts or rejects (with a reason the candidate sees) from the scrutiny date until the last date of withdrawal. The candidate may withdraw until the last date of withdrawal. After that the RO publishes the list of contesting candidates (party candidates, then independents, alphabetically), once every nomination is scrutinised; it cannot be changed. The public "Know your candidate" tab on `/candidates` reads that list.

The seed adds a demo election with nominations open, a demo bye-election in its scrutiny period with three synthetic nominations, three approved stations in Ludhiana South (parts 18 to 20) and one proposal awaiting ECI approval (part 21).

## Poll day at the polling station (Phase 3)

`/poll-day` is the station screen for the presiding officer, polling officers, polling agents and micro observers; the BLO uses it as the voter assistance booth. The station always comes from the signed-in person's own assignment, so nobody can act on another station by changing an id.

- **Order of the poll.** Only the presiding officer moves it forward, and only on the poll date: mock poll held, poll open, poll closed. Closing records how many electors are in the register.
- **Station-scoped search.** Polling officers see only the electors of their part, with a serial number and whether they have voted. The BLO at the voter assistance booth sees the serial and station, not who has voted. Agents and observers cannot search.
- **Guided marking.** The polling officer records which identity document was shown (the EPIC or one of the alternatives ECI notifies), confirms the photo match and the indelible ink, and marks the elector. An elector is marked once per election, even when two officers try at the same moment; the register keeps a serial, the document type, the time and the officer (no document numbers). The register is shown only to the presiding officer.
- **Exceptions.** A polling officer can raise an identity doubt; a polling agent can challenge an elector's identity. Either stops marking until the presiding officer decides; refusing or upholding needs a reason. The presiding officer records tendered votes (only for an elector already marked) and companions for assisted voters (Rule 49N). Every step is audited.
- **Queue and turnout.** Officers report how many people are waiting while the poll is open; the station shows turnout so far.

The seed adds a "Demo poll-day election, Ludhiana South" whose poll date is the day you run the seed, twelve synthetic electors in part 18, and assigns the demo presiding officer (`PRO1000001`), polling officer (`POL1000001`), polling agent (`PAG1000001`) and micro observer (`MOB1000001`) to it.

## Control room and incidents (Phase 4)

`/control-room` shows every approved polling station in the signed-in official's jurisdiction for the chosen election: a sector officer's or RO's constituency, a DEO's district, a CEO's State, or the whole country for the Commission. Observers can read it but not act. It refreshes every 10 seconds and lists stations with alerts first. For each station it shows poll status, turnout, the latest queue report, open cases and incidents, and the last sector officer visit.

- **Alerts:** a poll not opened by 07:30 IST (start time set by `POLL_START_IST`, default 07:00, plus 30 minutes), no queue report for an hour while the poll is open, a doubt or challenge waiting more than 30 minutes, and an unresolved high or critical incident.
- **Incidents** are reported at a station by its presiding officer or micro observer, or by the sector officer. Each has a type (EVM or VVPAT malfunction, law and order, power, staff absent, accessibility, MCC violation, other) and a severity. The sector officer, RO, DEO or CEO covering the station acknowledges it, adds updates, and resolves it with a note. Every step is timestamped and audited.
- **Visits:** sector officers record visits to stations in their sector.

## Counting and results, read-only (Phase 5)

The platform never counts votes or declares a result. Counting is conducted by the Returning Officer, and the RO's declaration is the official result. `/results` shows exactly what a **registered result source** sends:

- **Sources** are registered by the ECI administrator (`POST /api/v1/results/sources`). There are two types. An `official_feed` must record its legal basis and agreement reference. A `mock` produces invented figures, and every view labels them "MOCK DATA ... not an election result".
- **Entries** (`POST /api/v1/results/sources/:id/entries`) are append-only:
  - Counting rounds come in order, optionally by counting table. Table figures must add up to the round.
  - Postal ballots are received once.
  - A correction names an earlier round and carries the source's reason. The original figures stay on record.
  - Votes must cover exactly the candidates on the published list of contesting candidates. An official feed is refused before the counting date.
  - Publication status moves from in progress to completed to declared, never backwards. The declared winner (by serial number) comes from the source. Nothing can be added after the declaration.
- **The public view** shows the source and its label, the standings (a display sum of the received figures), a round-by-round table with a slider, NOTA and postal ballots. It also runs **checks** that flag differences without changing anything:
  - EVM votes against the votes recorded in this platform's station registers.
  - More votes than electors on the roll (official feeds only).
  - Corrections received.
  - A declared winner who is not ahead in the figures received.
- **Turnout** (`/public/turnout`) is shown per polling station from the station registers, and labelled approximate.
- There are no endpoints to edit or delete results.

The seed adds a completed "Demo past bye-election, Ludhiana South" with a published candidate list and a full count from the "Demo mock results feed".

## Training environment, training modules and hardening (Phase 6)

**Training environment.** Start the backend with `APP_MODE=training` to run a practice copy. Every API response carries `X-App-Mode: training`, `/api/v1/health` reports the mode, and every screen shows a banner. Only synthetic data sources and mock result sources can be registered, so nothing real can be connected by mistake.

**Training modules** (`/training`). Each role sees its own modules (BLO, ERO/AERO, polling party, presiding officer, sector officer and control room, returning officer, DEO). Each module walks through the real screens step by step and ends with a short knowledge check. The answers stay on the server, the pass mark is 80%, and a pass is kept even if a later attempt fails. Supervisors see their staff's progress inside their own jurisdiction: EROs and BLO supervisors see BLOs, DEOs see polling, counting and sector staff, and ROs see polling parties. This is prototype material, not official ECI training.

**Hardening.**
- **Tamper-evident audit trail.** Every event stores a SHA-256 hash of its content, and an event counter is written in the same transaction. `GET /api/v1/audit/integrity` (ECI administrator; there is also a button on `/eci/integrations`) recomputes every hash and compares the count. An edited, missing or uncounted event is reported.
- **Security headers** on every response: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a `default-src 'none'` content security policy and `Cache-Control: no-store`. `X-Powered-By` is removed.
- **Start-up configuration check.** With `NODE_ENV=production`, the server refuses to start if `ACCESS_TOKEN_SECRET` is shorter than 32 characters, if `PERSONA_DEMO_MODE` is on in a live deployment, or if `CLIENT_URL` is missing.

## Roles, assignments and audit (Phase 0)

- **Permissions** come from `backend/src/config/roles.js`. Routes use `authorize("<permission>")` (`backend/src/middlewares/authorize.middleware.js`), not role names, so a dashboard showing a record never implies the right to change it.
- **Assignments** tie an account to its role for an optional election and a jurisdiction (State/UT, district, constituency, polling station, part number). They are never deleted, only revoked. Every write endpoint checks that one of the caller's active assignments covers the record it is about to change. National roles (ECI, CEC, ECs) cover the whole country. An account with no assignment sees no applications.
  - `GET /api/v1/assignments/me`: the caller's own assignments.
  - `POST /api/v1/assignments` `{ epic, role, election?, jurisdiction }`: the ECI administrator (`role:assign`) can assign any role; an ERO (`blo:assign`) can assign BLOs inside their own constituency only.
  - `POST /api/v1/assignments/:id/revoke` `{ reason }`.
  - Promoting a voter to BLO from the ECI dashboard assigns them to the constituency they are enrolled in.
- **Audit trail**: append-only, in Redis (`audit:event:*`). There is no endpoint to change or delete an event. `GET /api/v1/audit` and `GET /api/v1/audit/:type/:id` (for example `/audit/registration/<id>`) need `audit:read` (ERO, AERO, BLO supervisor, DEO, CEO, ECI, CEC, ECs, general observer) and only return events from inside the caller's jurisdiction.
- `npm run seed` gives every seeded staff account an assignment in the demo jurisdiction (Ludhiana South, Ludhiana, Punjab). The demo BLO `BLO1000001` is assigned to part 18, Government Girls Senior Secondary School, and the demo ERO is `ERO1000001`. A BLO created with `npm run create-blo` has no jurisdiction until one is assigned through the API.

### State, district and constituency data

The State/UT → District → Assembly Constituency dropdowns use the Election Commission of India's own master lists (Voters' Services Portal), stored in `backend/src/data/geography.json`. They cover all 36 States/UTs, 787 districts and 4,123 assembly constituencies, each with its official number (shown as `31 – VIKASPURI`). UTs without a Legislative Assembly offer their Parliamentary Constituency. Sources, checks, limitations and how to refresh the data are in [docs/CONSTITUENCY_DATA.md](docs/CONSTITUENCY_DATA.md).

## Running the tests

From `backend`:

```bash
npm test
```

The end-to-end and integration tests (registration, BLO sign-in, BLO decisions, Form 8, verification, polling day, and the Phase 1 to 6 suites) need their own **disposable** Redis, never your development database, and are skipped otherwise:

```bash
docker run -d --name eci-redis-test -p 6390:6379 redis
TEST_REDIS_URL=redis://127.0.0.1:6390 npm test
```

To also run the MongoDB read-model tests (including audit tamper detection through the hash chain), add a disposable MongoDB: `TEST_MONGODB_URI=mongodb://127.0.0.1:27018/eciweb_test`.

On Windows Command Prompt use `set TEST_REDIS_URL=redis://127.0.0.1:6390&& npm test`; in PowerShell use `$env:TEST_REDIS_URL="redis://127.0.0.1:6390"; npm test`. Without `TEST_REDIS_URL` those tests are skipped and the remaining tests need no Redis.

## ECI polling-station demo

During the ECI polling-station flow, the demonstration scanner token is `FP-<EPIC>` (for example, `FP-ABC1234567`). This token is a demo adapter, not a real fingerprint scan.

## Full platform report

See [docs/PLATFORM_REPORT.md](docs/PLATFORM_REPORT.md): every role and power, every frontend route and backend endpoint, how each workflow moves step by step, what changes what, the demo data and a demonstration script.

## Role desks and the data flows behind them

Every role except the voter now signs in to its own desk at `/desk` (`frontend/src/pages/RoleDesk.jsx`, configured per role in `frontend/src/config/desks.js`). A desk shows the role's authority and assignment, what it may and may not do, a report for its jurisdiction where the role has one, its work panels, and links to its dedicated work screens (`/ero`, `/deo`, `/ro`, `/poll-day`, `/counting` and so on). Every panel calls the backend, which checks permission, jurisdiction and stage for each record.

New backend workflows (all audited, all jurisdiction-checked):

| Area | Endpoints | Flow |
| --- | --- | --- |
| Electoral forms 2, 2A, 3, 6A, 6B, 7, 8 | `/api/v1/elector-forms` | Anyone submits to the ERO of a chosen constituency and tracks by `EF…` reference (also on `/check-request`). The BLO records a field report; only the ERO/AERO decides (step-up). Approval changes the roll: new service/overseas entry, deletion marked (never erased), correction, shift, PwD, authentication record. Aadhaar numbers are never stored (last four digits and a salted hash only); documents are byte-checked and deleted after the decision. |
| Polling stations (RP Act 1951, s. 25) | `/api/v1/polling-stations/:id/consultation`, `/forward`, `/ceo-forward`, `/clarification`, `/approve`, `/publish`; `/issues` | DEO drafts and records the party consultation, forwards to the CEO; CEO forwards to the Commission or returns; the Commission gives prior approval with its order reference (or asks for clarification / rejects); the DEO then publishes and only then is the station active. Anyone working in the area can report a problem with a station; the DEO closes it. |
| Campaign permissions | `/api/v1/campaign-permissions` | Candidate or election agent applies; police (sector / district police officer) remark on events in public places; RO/ARO grants with conditions or refuses. No meeting or procession in the 48 hours before the poll closes (s. 126). |
| Expenditure | `/api/v1/expenditure` | Append-only register per candidate (corrections supersede with a reason; cash above ₹10,000 flagged); the expenditure observer reads it, notes entries and keeps a shadow register; totals against the ceiling. |
| Observer reports and directions | `/api/v1/oversight/observer-reports`, `/api/v1/oversight/directions` | Observers file confidential reports (micro observers' also reach the general observer; the DEO sees the district's). The CEC and Election Commissioners issue directions under a named legal basis; the addressee reports compliance; the Commission closes. Incidents can now be referred by the CEO to the Commission and are then closed only after a complied direction. |
| Security | `/api/v1/security` | Police planners categorise stations (normal / sensitive / critical) and plan deployments; field police send situation reports. Never shown to candidates or agents. |
| Logistics | `/api/v1/logistics` | Sector officers record the polling party and machine custody chain, station by station. |
| Nodal officers | `/api/v1/nodal` | A nodal assignment names its subject (`function`, e.g. `evm`); the officer reports only on that subject; the DEO / Deputy DEO / CEO give tasks and read all subjects. |
| Reports | `/api/v1/reports/summary`, `/api/v1/reports/roll-part` | Counts for the caller's district, State or the country, one level broken down, with CSV download; the published roll of a BLA's or BLO's part (no addresses or documents). |
| Counting | `recount_request` discrepancy type | Rule 63 written recount request, decided by the RO. |
| MCC complaints (cVIGIL) | `/api/v1/complaints` | Anyone reports on `/report-violation`; DEO / Deputy DEO / RO / ARO dispatch a flying squad (new role `flying_squad`); the squad reports and records seizures; the RO/ARO disposes. 100-minute clock. |
| Roll appeals | `/api/v1/appeals` | `/appeal`: first appeal to the DEO, second to the CEO (s. 24); an allowed appeal is implemented by the ERO. |
| Presiding Officer's records | `/api/v1/poll-day/records`, `/machine-events`, `/po-report`, `/station-reports` | Machine log and the PO's report (Form 17C Part I), compared with the register; flags reach the RO, DEO, CEO and observers. |

Two permissions were added: `permission:decide` (RO, ARO) and `direction:issue` (CEC, Election Commissioners). The seed adds demo records for the desks. The tests for these flows are in `backend/tests/workflows.test.js`; `tests/helpers/stationApproval.js` walks a station through the s. 25 stages.

## Main routes

```text
/                 Portal selection
/login            Voter sign-in
/register         Voter registration request (address, PIN code, State/District/Constituency)
/electoral-roll   Electoral-roll search, including assigned part number and polling station
/signin/blo       BLO sign-in (BLO ID such as BLO1000001, then a one-time code; /blo/* redirects here)
/login/otp        OTP confirmation
/dashboard        Voter dashboard and Persona status
/verify           Embedded Persona document and face verification
/admin            BLO dashboard: registrations and review cases
/eci/login        ECI sign-in
/eci/dashboard    ECI official dashboard
/eci/voting-verification  Persona and demo fingerprint workflow
/eci/integrations Approved data sources and imports (new-voter pipeline)
/eci/elections    Elections, schedules and polling-station approvals
/ero              ERO/AERO decisions, new-voter tasks and roll versions
/deo              DEO: polling stations and election staff
/ro               RO/ARO: scrutiny, list of contesting candidates, polling parties
/candidate        Candidate: file, track and withdraw a nomination
/booths           Public polling-station search
/poll-day         Poll day at the officer's own polling station (and the BLO's voter assistance booth)
/control-room     Stations, alerts and incidents across the official's jurisdiction
/results          Read-only counting and turnout (registered source or labelled mock)
/training         Training modules for the signed-in role, and staff progress for supervisors
/desk             The signed-in role's own dashboard (every role except the voter)
/map              Map of approved polling stations
/appeal           Roll appeals (first and second)
/voters/forms     Forms 2, 2A, 3, 6A, 6B, 7 and 8
```

## Notes

- Persona inquiry status changes come from its API and signed webhooks. A browser callback alone never marks a voter verified.
- Persona's template controls the document and face checks shown in the flow. Enable the appropriate checks and publish the template in the Sandbox environment.
- The fingerprint step is synthetic for this prototype. A production deployment needs the certified scanner integration approved for that environment.
- OTPs are demo-only: they are printed in the backend terminal instead of being sent by SMS, and are held in the API process's memory, so restarting the backend cancels pending OTPs. On serverless hosting (Vercel), store them in Redis instead for reliable sign-in.
- BLO accounts live in whichever Redis `REDIS_URL` points to, so a deployed site needs its own `npm run create-blo` run against the production Redis.
- The project is a prototype and is not an election system or a legal eligibility decision service.
