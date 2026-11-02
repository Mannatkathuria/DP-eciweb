# Election Management Prototype

A React + Express election-management prototype with role-based dashboards, OTP sign-in, voter registration, and Persona Sandbox identity verification.

## Architecture

```text
Voter / BLO / ECI React portals
             │
             ▼
      Node / Express API ───── Persona Embedded Flow + API + webhooks
             │
             ▼
           Redis
```

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

## Configure and start the backend

```bash
cd backend
cp .env.example .env        # Windows Command Prompt: copy .env.example .env
npm install
npm run seed
npm run create-blo -- --name "Ravi Kumar" --mobile 9876543210 --state UP
npm run dev
```

In `backend/.env`, replace `ACCESS_TOKEN_SECRET` with a long random string before starting the server. Keep `REDIS_URL=redis://127.0.0.1:6379` for the Docker Redis above. `npm run create-blo` prints a BLO ID and temporary password (see [BLO accounts](#blo-accounts)); run it in a separate terminal if the server is already running.

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

Voters and ECI officials sign in with the EPIC only. The backend generates an OTP and prints it in the backend terminal; no SMS is sent. Voters go to `/dashboard`, ECI officials to `/eci/dashboard` and EROs/AEROs to `/ero`.

### BLO accounts

BLOs sign in with a **BLO ID and password**, followed by an OTP sent to their registered mobile number that is valid for **2 minutes** (in this prototype the OTP is printed in the backend terminal). Create a BLO from the `backend` folder:

```bash
npm run create-blo -- --name "Ravi Kumar" --mobile 9876543210 --state UP
```

The command prints the BLO ID (for example `BLO-UP-000001`) and a one-time temporary password. On first sign-in the BLO must set their own password before reaching `/admin`. Five wrong passwords lock the account for 15 minutes.

A BLO who forgets their password uses **Forgot password?** on the sign-in page: an OTP (valid 2 minutes) is sent to the mobile number registered for that BLO ID, and after entering it plus the new password twice, the stored password is replaced. A reset also clears a lockout and signs out existing sessions.

## Voter registration (Form 6): BLO verifies, ERO decides

The workflow follows the Representation of the People Act, 1950: the **BLO verifies in the field and recommends**, and only the **ERO or AERO decides** (ss. 13B, 13C, 23).

1. **Voter applies** at `/register` with name, date of birth, gender, **State/UT -> District -> Assembly constituency** (dependent dropdowns), **full address**, a **six-digit PIN code** and an **identity / address proof document** (required; JPEG, PNG or WebP up to 4 MB, checked again by the backend). The voter does not enter a part number or polling station. The request gets a reference ID for checking its status at `/check-request`. An identical application cannot be submitted again while the first one is still open.
2. **BLO field verification** on `/admin` (tab *Form 6 field verification*). The BLO sees only applications in their assigned constituency. They record the **part number** (1-9999) and **polling station** (pre-filled from their own assignment) and choose **Verified: recommend approval**, or **Recommend rejection** with a reason. The status becomes `field_verified`. Nothing is added to the roll at this step.
3. **ERO/AERO decision** on `/ero`. The officer sees field-verified applications in their constituency, the BLO's recommendation, note and history. They can correct the booth, then **Approve & add to roll** (issues the EPIC, creates the electoral-roll record and the voter account in one transaction) or **Reject** with a reason shown to the applicant. They can also reject an application that is still waiting for the BLO.
4. Every step is written to the **audit trail** with who acted, under which role and assignment, and what changed.

## Roles, assignments and audit (Phase 0)

- **Permissions** come from `backend/src/config/roles.js`. Routes use `authorize("<permission>")` (`backend/src/middlewares/authorize.middleware.js`), not role names, so a dashboard showing a record never implies the right to change it.
- **Assignments** tie an account to its role for an optional election and a jurisdiction (State/UT, district, constituency, polling station, part number). They are never deleted, only revoked. Every write endpoint checks that one of the caller's active assignments covers the record it is about to change. National roles (ECI, CEC, ECs) cover the whole country. An account with no assignment sees no applications.
  - `GET /api/v1/assignments/me`: the caller's own assignments.
  - `POST /api/v1/assignments` `{ epic, role, election?, jurisdiction }`: the ECI administrator (`role:assign`) can assign any role; an ERO (`blo:assign`) can assign BLOs inside their own constituency only.
  - `POST /api/v1/assignments/:id/revoke` `{ reason }`.
  - Promoting a voter to BLO from the ECI dashboard assigns them to the constituency they are enrolled in.
- **Audit trail**: append-only, in Redis (`audit:event:*`). There is no endpoint to change or delete an event. `GET /api/v1/audit` and `GET /api/v1/audit/:type/:id` (for example `/audit/registration/<id>`) need `audit:read` (ERO, AERO, BLO supervisor, DEO, CEO, ECI, CEC, ECs, general observer) and only return events from inside the caller's jurisdiction.
- `npm run seed` gives every seeded staff account an assignment in the demo jurisdiction (Ludhiana South, Ludhiana, Punjab). The demo BLO `BLO-PB-000001` is assigned to part 18, Government Girls Senior Secondary School, and the demo ERO is `ERO1000001`. A BLO created with `npm run create-blo` has no jurisdiction until one is assigned through the API.

### State, district and constituency data

The State/UT → District → Assembly Constituency dropdowns use the Election Commission of India's own master lists (Voters' Services Portal), stored in `backend/src/data/geography.json`. They cover all 36 States/UTs, 787 districts and 4,123 assembly constituencies, each with its official number (shown as `31 – VIKASPURI`). UTs without a Legislative Assembly offer their Parliamentary Constituency. Sources, checks, limitations and how to refresh the data are in [docs/CONSTITUENCY_DATA.md](docs/CONSTITUENCY_DATA.md).

## Running the tests

From `backend`:

```bash
npm test
```

The end-to-end and integration tests (registration, BLO sign-in, BLO decisions, Form 8, verification and polling day) need their own **disposable** Redis, never your development database, and are skipped otherwise:

```bash
docker run -d --name eci-redis-test -p 6390:6379 redis
TEST_REDIS_URL=redis://127.0.0.1:6390 npm test
```

On Windows Command Prompt use `set TEST_REDIS_URL=redis://127.0.0.1:6390&& npm test`; in PowerShell use `$env:TEST_REDIS_URL="redis://127.0.0.1:6390"; npm test`. Without `TEST_REDIS_URL` those tests are skipped and the remaining tests need no Redis.

## ECI polling-station demo

During the ECI polling-station flow, the demonstration scanner token is `FP-<EPIC>` (for example, `FP-ABC1234567`). This token is a demo adapter, not a real fingerprint scan.

## Main routes

```text
/                 Portal selection
/login            Voter sign-in
/register         Voter registration request (address, PIN code, State/District/Constituency)
/electoral-roll   Electoral-roll search, including assigned part number and polling station
/blo/login        BLO sign-in (BLO ID, password, mobile OTP)
/blo/password     BLO password change (required on first sign-in)
/blo/forgot       BLO forgot password (mobile OTP, then new password)
/login/otp        OTP confirmation
/dashboard        Voter dashboard and Persona status
/verify           Embedded Persona document and face verification
/admin            BLO dashboard: registrations and review cases
/eci/login        ECI sign-in
/eci/dashboard    ECI official dashboard
/eci/voting-verification  Persona and demo fingerprint workflow
```

## Notes

- Persona inquiry status changes come from its API and signed webhooks. A browser callback alone never marks a voter verified.
- Persona's template controls the document and face checks shown in the flow. Enable the appropriate checks and publish the template in the Sandbox environment.
- The fingerprint step is synthetic for this prototype. A production deployment needs the certified scanner integration approved for that environment.
- OTPs are demo-only: they are printed in the backend terminal instead of being sent by SMS, and are held in the API process's memory, so restarting the backend cancels pending OTPs. On serverless hosting (Vercel), store them in Redis instead for reliable sign-in.
- BLO accounts live in whichever Redis `REDIS_URL` points to, so a deployed site needs its own `npm run create-blo` run against the production Redis.
- The project is a prototype and is not an election system or a legal eligibility decision service.
