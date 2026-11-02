# Implementation roadmap

## Done (this branch)

| Phase | Delivered |
| --- | --- |
| Directive 0: audit and research | [PROJECT_AUDIT.md](PROJECT_AUDIT.md), [ECI_SYSTEM_RESEARCH.md](ECI_SYSTEM_RESEARCH.md), [ROLE_AND_AUTHORITY_RESEARCH.md](ROLE_AND_AUTHORITY_RESEARCH.md), [EXTERNAL_DATA_SOURCES.md](EXTERNAL_DATA_SOURCES.md). Security fixes S1, S2, S5. |
| 1: core architecture | 33 roles with permissions; jurisdiction assignments with election scope and validity windows; parliamentary-constituency jurisdiction for RO and observers; account suspension; step-up re-authentication; anti-forgery guard; hashed audit trail. |
| 2: electoral data | Form 6 and Form 8 with BLO verification, ERO/AERO decisions, information requests and re-verification; roll versions; new-elector pipeline (synthetic sources). |
| 3: elections and stations | Elections and schedules, polling stations (propose, approve, import, relocate), nominations, scrutiny with ARO delegation, contesting list, candidate-appointed agents. |
| 4: poll day and offline | Station-scoped fuzzy search, guided marking, exceptions, queue estimates from measured pace, VAB slips with opaque QR, presiding officer assistant, signed and encrypted station packages, offline outbox with idempotent sync and conflicts. |
| 5: control room and devices | Operational events (outbox) with Socket.IO, jurisdiction-filtered; device registry and verified heartbeats; connectivity, package and sync status; incident escalation; filters. |
| 6: counting | Counting plan, randomised staff, rounds, discrepancies, observer reports, VVPAT draw; results only from a registered source. |
| 7: training, languages | Role modules, scenario simulator with scoring and completion record; Hindi and Punjabi for the new voter text. |
| 8: validation | 115 automated tests; this documentation set; browser checks of each new screen. |

## Next, before any real use (blocks production)

1. **OTP:** move OTP state to Redis with expiry and attempt limits; integrate a DLT-registered SMS gateway.
2. **Sessions:** short access token (15 minutes), rotating refresh token in an `httpOnly` cookie, server-side revocation list, nothing in `localStorage`.
3. **Procedure library:** load the current ECI handbook; have an authorised official review every entry and set `reviewStatus`.
4. **Security assessment:** external penetration test, dependency audit, secrets in a managed store, WAF and CDN.
5. **Shared rate limits** in Redis.

## Then

- Audit hash chain (each event includes the previous hash) with periodic external anchoring.
- Hardware-backed device keys or a device PIN for station packages.
- Automated browser end-to-end tests (Playwright) for the directive's journeys, plus load tests for poll day.
- Form 7 objections and deletions.
- Postal-ballot workflow and Form 20 compilation, as an operational record only.
- Geographic search for polling stations (Redis GEO, or a database with geospatial indexes).
- Dedicated dashboards for the nine roles that use the generic workspace (police and nodal officers, BLO supervisor, booth level agent, police and expenditure observers).
- Translations of officer screens, reviewed by native speakers.
- Real notifications (SMS, email) once a gateway is authorised.

## Database migration path (if Redis is replaced)

The repositories isolate the key layout, so a move to MongoDB or PostgreSQL would:
1. implement the same repository functions on the new store;
2. replace `MULTI` transactions with database transactions and `SET NX` locks with row or document locks;
3. migrate data family by family, with the audit trail first;
4. keep Redis for pub/sub, locks and short-lived keys.

## Integrations, when authorised

ERONET roll exchange, ENCORE nominations, counting and turnout feeds, and the results feed, each following the steps in [INTEGRATION_ARCHITECTURE.md](INTEGRATION_ARCHITECTURE.md).
