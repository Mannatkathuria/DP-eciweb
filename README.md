# Election Management Prototype

A React + Express election-management prototype with three distinct workflows:

- **Voter portal:** registration, electoral-roll lookup and pre-election identity verification.
- **BLO/officer portal:** manual review of verification cases.
- **ECI official portal:** restricted during-voting verification using document OCR → face/liveness → fingerprint-scanner adapter.

## Architecture

```text
Voter/BLO/ECI React portals
          │
          ▼
      Node/Express API
          │
     ┌────┴───────────────┐
     ▼                    ▼
   Redis              Face service
 (records, auth,       (Python,
  sessions, audit)    face+liveness)
                           │
                           ▼
                  local reference images
```

Redis is now the application database. Biometric reference images are intentionally kept outside Redis; production should place them behind a controlled encrypted biometric service/storage layer.

## 1. Redis

Install/run Redis locally:

```bash
sudo pacman -S redis
sudo systemctl enable --now redis
redis-cli ping
```

Expected:

```text
PONG
```

For Redis Cloud/Upstash, set `REDIS_URL` to the provider connection URL.

## 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run seed
npm run dev
```

Important `.env` values:

```env
REDIS_URL=redis://127.0.0.1:6379
ACCESS_TOKEN_SECRET=replace_with_a_long_random_secret
FACE_SERVICE_URL=http://localhost:5000
ALLOW_ENROLL=1
```

Demo accounts created by `npm run seed`:

```text
admin / ChangeMe@123
blo   / ChangeMe@123
eci   / ChangeMe@123
```

Change these before using the project beyond a local demo.

## 3. Face service

The existing Python service performs face detection, face matching and liveness.

```bash
cd face-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

`ALLOW_ENROLL=1` is required if voter registration should enrol a reference face.

## 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend uses Tesseract.js for document OCR.

## Main routes

```text
/                         Public voter portal
/register                 Voter registration
/login                    Voter/BLO sign-in
/verify                   Pre-election verification
/electoral-roll           Electoral-roll lookup
/admin                    BLO/officer review portal

/eci/login                Separate ECI official login
/eci/voting-verification  Restricted during-voting verification
```

## During-voting flow

1. ECI official signs in through `/eci/login`.
2. Official enters the voter's EPIC.
3. The backend creates a short-lived verification session.
4. Official uploads/scans the voter document.
5. Tesseract OCR extracts EPIC/name/DOB.
6. Backend compares extracted data against the Redis electoral record.
7. Face + server-selected liveness challenge runs through the Python face service.
8. Fingerprint stage invokes the scanner adapter.
9. On success, the session becomes `verified`; mismatches go to `review_required`.

### Fingerprint limitation

A normal browser cannot expose a raw fingerprint image/template to JavaScript. Therefore this repository contains a **demo scanner adapter**, not a real fingerprint biometric integration. The demo uses a one-time synthetic scan token.

For production, replace that adapter with the certified fingerprint scanner SDK/API approved for the deployment environment. Do not pretend that a webcam or browser API is equivalent to a fingerprint scanner.

### Government integrations

Aadhaar/DigiLocker/PAN/DL integrations remain sandbox adapters. Real government identity systems require the relevant authorisation and security controls.

## Redis data layout

Examples:

```text
elector:<EPIC>
user:<username>
user:id:<UUID>
verification:<UUID>
voting-verification:<UUID>

electors:all
users:all
verifications:all
```

Records are stored as JSON values. Sets provide simple indexes for the prototype.

## Security boundary

The ECI voting-verification API is protected by:

```text
JWT authentication
+
role === "eci"
```

So the public voter/BLO UI cannot directly invoke the during-voting workflow.

This remains a prototype and should not be used as an actual election system without formal security review, certified biometric integrations, privacy controls, audit design, threat modelling, and government authorisation.
