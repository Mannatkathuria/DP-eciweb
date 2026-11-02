# Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Server exits with `STARTUP FAILED` or a list of configuration problems | Production start-up checks | Set the variables it names; see [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md). |
| `ECONNREFUSED 127.0.0.1:6379` | Redis not running or wrong `REDIS_URL` | Start Redis; `redis-cli ping` should print PONG. |
| No OTP arrives | No SMS gateway exists | Read the code from the backend terminal (`[DEMO OTP] ...`). |
| OTP "invalid" on Vercel | Codes are kept per instance and another instance answered | Use a long-running server, or move OTPs to Redis (roadmap). |
| 401 with `STEP_UP_REQUIRED` | Sensitive action needs a fresh code | Enter the code in the dialog. With curl, call `/auth/step-up/request` and `/auth/step-up/verify`, then send `X-Step-Up`. |
| 403 "missing anti-forgery header" | Cookie-only session without `X-Requested-With` | Send `X-Requested-With: XMLHttpRequest` or use the bearer token. |
| 403 "outside your jurisdiction" | No active assignment covers the record, it is outside its validity window, or it is for another election | Check `/assignments/me`; ask an official with `role:assign` or `staff:assign`. |
| Control room says "refreshes every 10 seconds" instead of "live updates on" | No Socket.IO (Vercel, `REALTIME=off`, proxy blocks WebSockets) | Expected on Vercel. On a server, let the proxy upgrade `/socket.io`. |
| Station shows "No device" | No device registered for the station | The presiding or polling officer registers the device on `/poll-day`. |
| Device heartbeat refused after working | Device revoked, or the browser storage was cleared | Register the device again. |
| "The package signature is not valid" | Package altered, or `PACKAGE_SIGNING_KEY` changed since download | Download it again; if it keeps failing, report it. |
| "This browser cannot check package signatures" | No Ed25519 in WebCrypto | Update the browser (Chrome/Edge 137+, Firefox 129+, Safari 17+). |
| "Station packages can be downloaded on the day before the poll and on poll day" | Download attempted too early | Expected. |
| Offline records stuck at "Waiting to send" | No connection or session expired | Reconnect and sign in again; then "Send now". |
| A record shows "Conflict" | The elector was already marked elsewhere | The presiding officer decides it on the poll-day screen. |
| Counting "Record" refused | Not counting day, not your table, Form 17C Part II not confirmed, or an earlier round open | Follow the message. |
| Tests fail with 409 on polling stations | A non-flushed test Redis with stations from an old run | `redis-cli -p 6390 flushall`, seed, run again. |
| `/audit/integrity` reports "altered" | A stored audit event no longer matches its hash | Investigate immediately; compare with backups. |
