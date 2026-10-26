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

Run `npm run seed` to create these accounts:

| Role | EPIC |
| --- | --- |
| Voter | `ABC1234567` |
| ECI official | `ECI1234567` |

Voters and ECI officials sign in with the EPIC only. The backend generates an OTP and prints it in the backend terminal; no SMS is sent. Voters go to `/dashboard` and ECI officials to `/eci/dashboard`.

### BLO accounts

BLOs sign in with a **BLO ID and password**, followed by an OTP sent to their registered mobile number that is valid for **2 minutes** (in this prototype the OTP is printed in the backend terminal). Create a BLO from the `backend` folder:

```bash
npm run create-blo -- --name "Ravi Kumar" --mobile 9876543210 --state UP
```

The command prints the BLO ID (for example `BLO-UP-000001`) and a one-time temporary password. On first sign-in the BLO must set their own password before reaching `/admin`. Five wrong passwords lock the account for 15 minutes.

A BLO who forgets their password uses **Forgot password?** on the sign-in page: an OTP (valid 2 minutes) is sent to the mobile number registered for that BLO ID, and after entering it plus the new password twice, the stored password is replaced. A reset also clears a lockout and signs out existing sessions.

## Voter registration and booth assignment

1. **Voter applies** at `/register` with name, date of birth, gender, **State/UT -> District -> Assembly constituency** (dependent dropdowns: choosing a state lists only its districts, choosing a district lists only its constituencies, and changing a choice clears the ones below it), **full address** and a **six-digit PIN code**. The voter does not enter a part number or polling station. The request gets a reference ID for checking its status.
2. **BLO reviews** the request on `/admin`, which shows the address and PIN code, and enters the **part number** (1-9999) and **polling station** for that address. **Approve** stays disabled until both are filled in, and the API refuses an approval without them. Rejection works as before.
3. **On approval** the voter receives an EPIC number. The assigned part number and polling station are saved on the request and the electoral-roll record, shown on the voter's dashboard ("Your polling booth"), and returned by the electoral-roll search.

### State, district and constituency data

The dropdowns use `backend/src/data/geography.json`, built from the official [Local Government Directory](https://lgdirectory.gov.in) (LGD) exports retrieved on 25 October 2026 (via the daily mirror at https://github.com/ramSeraph/opendata, release `lgd-latest`). It covers all 36 States/UTs and their districts; a constituency is listed under a district only where LGD's own constituency coverage records link them. Gaps, which the form shows instead of guessing:

- **Delhi**: LGD does not map its constituencies to districts, so its constituency list is unavailable.
- **Jammu and Kashmir, Assam**: LGD still lists constituencies from before the 2022 and 2023 delimitations, so they are withheld.
- **Andaman and Nicobar Islands, Chandigarh, Dadra and Nagar Haveli and Daman and Diu, Ladakh, Lakshadweep**: no legislative assembly.
- A few urban constituencies without LGD coverage records are not listed; they are named under `unmappedConstituencies` in the JSON file.

Polling stations and part numbers are not in LGD, so the BLO types them in. To refresh the data, download the LGD CSV exports (`states`, `districts`, `subdistricts`, `villages`, `statewise_ulbs_coverage`, `urban_local_body_wards`, `assembly_constituencies`, `constituency_coverage`) into one folder and run, from `backend`:

```bash
node scripts/build-geography.js <folder-with-the-csv-files> <retrieved-date YYYY-MM-DD>
```

## Running the tests

From `backend`:

```bash
npm test
```

The end-to-end tests for registration and BLO sign-in need their own **disposable** Redis, never your development database, and are skipped otherwise:

```bash
docker run -d --name eci-redis-test -p 6390:6379 redis
TEST_REDIS_URL=redis://127.0.0.1:6390 npm test
```

On Windows Command Prompt use `set TEST_REDIS_URL=redis://127.0.0.1:6390&& npm test`; in PowerShell use `$env:TEST_REDIS_URL="redis://127.0.0.1:6390"; npm test`. The test "HTTP: health, 404, validation" in `tests/backend.test.js` currently fails because `POST /verification/identity` returns 500 when Redis is not connected; this predates the registration and BLO changes.

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
