# Deployment guide

## Local development

Requirements: Node.js 22+, Redis 6+ (local, Docker or hosted).

```bash
# Redis
docker run -d --name eci-redis -p 6379:6379 redis

# Backend
cd backend
cp .env.example .env          # set ACCESS_TOKEN_SECRET to a long random string
npm install
npm run seed                  # demo accounts, stations, elections (synthetic)
npm run dev                   # http://localhost:8000, Socket.IO on the same port

# Frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

The seed prints its demo accounts. They include ECI1234567 (ECI administrator), DEO1000001, ROF1000001 (RO), ARO1000001, ERO1000001, PRO1000001 (presiding officer), SCO1000001 (sector officer), CAN1000001 (candidate), EAG1000001 (election agent) and BLO1000001 (BLO, part 18 Ludhiana South). OTPs appear in the backend terminal as `[DEMO OTP] ...`.

## Long-running server (recommended for poll day)

1. Provision Redis with persistence (AOF), backups and a password; set `REDIS_URL`.
2. Set the production variables from [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md):
   - `NODE_ENV=production`
   - `ACCESS_TOKEN_SECRET` (32+ characters)
   - `CLIENT_URL`
   - `PACKAGE_SIGNING_KEY`
   - `AADHAAR_ENCRYPTION_KEY`
   
   The server refuses to start with unsafe settings.
3. `cd backend && npm ci && npm start` behind a TLS-terminating reverse proxy that passes WebSocket upgrades on `/socket.io`.
4. Build the frontend with `VITE_API_URL=https://<host>/api/v1 npm run build` and serve `frontend/dist` with SPA fallback to `index.html`. Serve `sw.js` with `Cache-Control: no-cache`.
5. Run more than one API instance only behind sticky sessions for Socket.IO. Events already fan out through Redis, so any instance can publish.

## Vercel

`vercel.json` deploys the frontend as a static Vite build and the backend as an Express serverless function, with `/api/*` rewritten to the backend.

- **Live updates do not run on Vercel** (serverless functions cannot hold WebSocket connections). Screens poll instead.
- The device offline sweep runs on each control-room load instead of every minute.
- OTPs and rate-limit counters are kept per instance, so sign-in is unreliable on multi-instance serverless hosting until OTPs move to Redis and an SMS gateway exists (S3).

## Training deployment

Set `APP_MODE=training` on a separate deployment with its **own Redis**. Every response is labelled, only synthetic or mock sources can be connected, and step-up may be relaxed for exercises.

## Generating keys

```bash
# ACCESS_TOKEN_SECRET / AADHAAR_ENCRYPTION_KEY (64 hex characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# PACKAGE_SIGNING_KEY (Ed25519, PKCS#8 PEM)
node -e "console.log(require('crypto').generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}))"
```

Changing `PACKAGE_SIGNING_KEY` invalidates packages already on devices (they must be downloaded again). Changing `AADHAAR_ENCRYPTION_KEY` makes stored Aadhaar numbers unreadable.

## Before a real election

This is a prototype. The items in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) marked as blocking production must be resolved first, at minimum:
- an SMS gateway and OTP state in Redis;
- short sessions with revocation;
- a reviewed procedure library;
- authorised data sources;
- a security assessment.
