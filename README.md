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

## Start Redis

Run Redis locally or set `REDIS_URL` to your Redis provider URL. Check it with:

```bash
redis-cli ping
```

## Configure and start the backend

```bash
cd backend
cp .env.example .env
npm install
npm run seed
npm run dev
```

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
npm install
npm run dev
```

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

During the ECI polling-station flow, the demonstration scanner token is `FP-<EPIC>` (for example, `FP-ABC1234567`). This token is a demo adapter, not a real fingerprint scan.

## Main routes

```text
/                 Portal selection
/login            Voter sign-in
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
- The project is a prototype and is not an election system or a legal eligibility decision service.
