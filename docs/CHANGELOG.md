# Changelog

All work is on branch `feature/phase0-authority`. Nothing has been pushed to GitHub.

## Master directive (2–3 November 2026)

- **Fix:** audit integrity check no longer raises a false alarm when events are written during the check. Test files use separate constituencies.
- **Phase 7:** poll-day training simulator with 11 scenarios, server-timed runs, feedback, scoring and a completion record. Hindi and Punjabi text for information requests, the application timeline, the public queue and VAB slips.
- **Phase 6:** counting operations: plan, randomised staff allocation, rounds, discrepancies, observer reports, VVPAT draw. No vote figures are stored.
- **Poll day:** queue wait estimates from the measured service rate (also public), the presiding officer assistant with checklists and a sourced procedure library, and control room filters.
- **Phase 4:** offline poll day: Ed25519-signed, AES-GCM-encrypted station packages per device, Dexie storage, idempotent outbox sync, conflicts for the presiding officer, service worker.
- **Phase 5:** operational events (outbox) with Socket.IO jurisdiction filtering and catch-up; device registry and verified heartbeats; connectivity in the control room; incident escalation.
- **Phase 1:** account suspension; parliamentary-constituency jurisdiction for RO and observer roles.
- **Phase 0:** project audit and research documents. Fixed the legacy admin escalation (S1), the date-of-birth exposure (S2) and CSRF (S5).

## Gaps from the first plan (2 November 2026)

- Fuzzy poll-day search; voter assistance booth slips with an opaque QR.
- Candidate-appointed election, polling and counting agents.
- ARO scrutiny only under the RO's delegation; time-limited assignments; step-up re-authentication; follow-up states for Form 6 and Form 8.

## First plan (earlier)

- Phase 6: training environment and modules; security headers and start-up checks.
- Phase 5: read-only results from a registered source; mock labelled.
- Phase 4: control room, incidents, sector officer visits.
- Phase 3: poll day at the polling station.
- Phase 2: elections, polling stations, election staff, nominations.
- Phase 1: new-voter pipeline, published roll versions, applicant timeline.
- Form 8 with BLO verification and ERO/AERO decision.
- Phase 0: permissions, jurisdiction assignments, audit trail.

## Before this branch

Form 6 registration with ECI constituency data, Persona integration, BLO password sign-in, AI document review, Telugu, Tamil and Kannada support, Vercel deployment.
