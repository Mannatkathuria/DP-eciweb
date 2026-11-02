# Environment variables

Backend variables go in `backend/.env` (template: `backend/.env.example`); frontend variables in `frontend/.env` (template: `frontend/.env.example`). In production, `checkConfig()` (`backend/src/config/appMode.js`) refuses to start when a required setting is missing or unsafe.

## Backend

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | yes in production | `development` | `production` turns on secure cookies, HSTS and the start-up checks |
| `PORT` | no | `8000` | HTTP port (long-running server) |
| `CLIENT_URL` | **production** | `http://localhost:5173` | Allowed web origins for CORS and Socket.IO, comma-separated |
| `REDIS_URL` | yes | `redis://127.0.0.1:6379` | Redis connection (system of record) |
| `ACCESS_TOKEN_SECRET` | yes; 32+ chars in production | — | Signs session and step-up tokens |
| `ACCESS_TOKEN_EXPIRY` | no | `8h` | Session lifetime |
| `STEP_UP_REQUIRED` | no | `true` | `false` turns off step-up re-authentication. Refused in production unless `APP_MODE=training`. |
| `STEP_UP_MINUTES` | no | `10` | Step-up token lifetime (1–30) |
| `APP_MODE` | no | `live` | `training` labels every response and allows only synthetic or mock sources |
| `REALTIME` | no | on | `off` disables Socket.IO on a long-running server |
| `PACKAGE_SIGNING_KEY` | **production** | dev key kept in Redis | Ed25519 private key (PKCS#8 PEM or its base64) that signs offline station packages |
| `POLL_START_IST` | no | `07:00` | Poll start time for control-room "not opened" alerts |
| `MAX_COUNTING_AGENTS` | no | `15` | Counting agents per candidate per constituency |
| `AADHAAR_ENCRYPTION_KEY` | recommended | empty | 64 hex characters. When set, Aadhaar numbers are stored encrypted (AES-256-GCM); when empty, only the last four digits are kept. Never change it once data is stored. |
| `ADMIN_EPIC`, `ECI_EPIC` | no | `ADM0000001`, `ECI0000001` | Seeded legacy admin and ECI administrator accounts |
| `ENABLE_DEMO_OTP_NOTIFICATIONS` | no | off | Shows OTPs in the browser's demo notification feed (never in production) |
| `PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID`, `PERSONA_ENVIRONMENT_ID`, `PERSONA_WEBHOOK_SECRET`, `PERSONA_API_VERSION` | for Persona | — | Identity verification sandbox. The webhook is refused without its secret. |
| `PERSONA_DEMO_MODE` | no | off | Lets the legacy poll-day identity step pass, labelled "simulated". Refused in live production. |
| `GEMINI_API` (or `GEMINI_API_KEY`) | no | empty | Optional AI document review; a rule engine runs without it |
| `FACE_SERVICE_URL`, `FACE_REFERENCE_DIR` | no | `http://localhost:5000`, `../face-service/reference` | Legacy face-match demo service |
| `VERCEL` | set by Vercel | — | Serverless mode: no listener, no Socket.IO, no timers |
| `TEST_REDIS_URL` | tests only | — | A **disposable** Redis for the test suite (it writes freely) |

## Frontend

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8000/api/v1` | API base URL. The Socket.IO origin is derived from it. |
| `VITE_REALTIME` | on | `off` stops the browser from opening a live connection; screens poll |
| `VITE_SW` | off | `on` registers the offline service worker in development (always on in production builds) |
