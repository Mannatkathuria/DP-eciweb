# ECIWeb implementation roadmap

This is a proposed implementation plan based on your existing React + Express application, not a statement about ECI's own source code.

## Product boundary

Do not attempt to reproduce every government department workflow in one monolithic dashboard. Build a core platform and enable modules according to role, election, geography and operational maturity.

## Suggested frontend route structure

```text
/
/public
  /electors
  /voter-search
  /electoral-rolls
  /application-status
  /grievances
  /appeals
  /blo-call
  /candidate-directory
  /election-results
/candidate
  /profile
  /nominations
  /affidavits
  /permissions
  /submissions/:id
/blo
  /dashboard
  /assigned-verifications
  /field-visit/:id
  /polling-station
/ero
  /dashboard
  /applications
  /application/:id
  /electoral-roll-reports
/deo
  /dashboard
  /complaints
  /field-units
  /polling-readiness
/ro
  /dashboard
  /nominations
  /scrutiny
  /permissions
  /turnout
  /counting
  /index-card
/ceo
  /state-dashboard
  /district-monitoring
  /turnout-monitoring
  /reports
/admin
  /users
  /roles
  /reference-data
  /audit-logs
```

These are proposed ECIWeb routes and can be changed to fit your existing React Router setup.

## Suggested backend module boundaries

- `auth`: login, OTP / verification, session, refresh, logout, MFA where appropriate.
- `users-and-roles`: users, roles, permissions, jurisdiction assignments.
- `reference-data`: states, districts, parliamentary constituencies, assembly constituencies, polling parts, polling stations, election events.
- `elector-applications`: Form 6/6A/7/8 application intake, attachments, status, draft and submit.
- `field-verification`: BLO task assignment, checklists, visit report, geo-tag metadata.
- `electoral-roll`: roll publication metadata, PDF catalogue, search integration / own test data.
- `grievances`: complaint intake, tracking, response, escalation.
- `appeals`: appeal submission and adjudication flow.
- `candidate`: candidate/party profiles, nominations, affidavits.
- `permissions`: category catalogue, requests, nodal assignment and approval.
- `cvigil-cases`: incident reporting, field assignment and RO decision.
- `turnout`: time-slot reporting and verification.
- `counting`: round data, postal / EVM entries, reconciliation and results.
- `notifications`: email/SMS/in-app delivery and delivery audit.
- `documents`: upload, scanning, metadata, retention and signed downloads.
- `audit`: append-only event log for every sensitive action.

## Data model starting point

| Entity | Important fields |
|---|---|
| `Election` | id, type, year, state, schedule, status |
| `Jurisdiction` | state, district, PC, AC, part, polling station, parent ID |
| `User` | id, identity reference, account status, contact verification state |
| `RoleAssignment` | user ID, role, jurisdiction scope, election scope, start/end |
| `VoterApplication` | application ID, form type, applicant reference, jurisdiction, state, submittedAt |
| `VerificationTask` | application ID, assigned BLO, dueAt, checklist, location, report |
| `Grievance` | case ID, category, source, subject, status, assigned office, dueAt |
| `Appeal` | appeal ID, original case/application, grounds, evidence, decision |
| `Candidate` | candidate ID, election ID, party, candidate profile, public/private fields |
| `Nomination` | nomination ID, candidate, election, filing channel, affidavit, scrutiny status |
| `PermissionRequest` | request ID, applicant, category, event details, required nodal approvals, decision |
| `IncidentCase` | case ID, category, media metadata, geo metadata, assigned field unit, RO decision |
| `TurnoutSubmission` | election, AC, polling station, slot, totals by category, submittedBy, verifiedBy |
| `CountingRound` | election, constituency, round, candidate-wise votes, source, verifier |
| `IndexCard` | election, constituency, report data, RO submit, CEO verify, ECI verify |
| `AuditEvent` | actor, role, action, object, previous state, new state, timestamp, reason |

## Implementation priorities

### Phase 1 — public foundation

- Public portal with service cards and site map.
- Election / constituency / polling-station reference data.
- Voter form information and application status demo using synthetic records.
- Role-based authentication and audit event infrastructure.

### Phase 2 — voter and BLO workflows

- Form intake, document uploads, drafts, submission, status timeline.
- BLO assignment, field checklist, visit evidence and submission.
- ERO review / return-for-correction / approve / reject states.
- Notification and grievance tracking.

### Phase 3 — candidate and permissions

- Candidate / party profile.
- Nomination draft, affidavit upload and deposit simulation for demo.
- Permission request catalogue and configurable nodal approval chain.
- RO / nodal dashboards and status tracking.

### Phase 4 — election operations

- Polling-station readiness and field-unit directory.
- cVIGIL-like incident reporting with test evidence and map assignment.
- Turnout slots and missing-entry dashboard.
- Counting-round data and reconciliation for synthetic election fixtures.

### Phase 5 — reporting and governance

- Index Card and statistics.
- Audit search, retention, exports and access reports.
- Accessibility, language support, performance and security testing.

## Non-negotiable engineering controls

- Use synthetic voter / candidate data in development.
- Never collect Aadhaar unless a legal basis and explicit required purpose have been reviewed; do not store raw Aadhaar casually.
- Do not use face matching or liveness as a substitute for legally prescribed electoral-roll procedures without authorization and legal review.
- Encrypt sensitive data in transit and at rest; scope staff access narrowly.
- Keep immutable audit events for decision actions.
- Separate public information from private records.
- Rate-limit login, OTP, search, complaint and upload endpoints.
- Validate file type/content; virus scan; store outside public web root.
- Use tested recovery, backup, incident response and key rotation procedures.
