# Live browser audit checklist

Use this to turn the current public research into a button-by-button and API-by-API audit. Only use accounts and functions you are authorized to access.

## A. Before starting

- [ ] Confirm exact official hostname and environment (production / test / demo).
- [ ] Confirm which roles are authorized and who owns each account.
- [ ] Use synthetic / dummy records wherever the portal supports it.
- [ ] Keep a separate browser profile for research.
- [ ] Do not export real personal data, tokens, cookies, OTPs, or credentials.
- [ ] Record audit date, browser/version, viewport, language and logged-in role (role label only; no identity data).

## B. Per-page capture

For every public and authorized page:

- [ ] URL and page title.
- [ ] Parent page / source link.
- [ ] Screenshot at top, middle and bottom.
- [ ] Full page text and section headings.
- [ ] All links (label + href + same/new tab behavior).
- [ ] All buttons (visible label + aria-label + enabled/disabled state).
- [ ] Inputs (label, type, required/optional, format, placeholder).
- [ ] Selects and options.
- [ ] Modals, drawers, tabs, accordions and tooltips.
- [ ] Keyboard behavior and accessibility labels.
- [ ] Mobile / tablet responsive behavior.

## C. Per-button test case

```yaml
id: VOTERS-HOME-BTN-001
page: https://voters.eci.gov.in/
role: anonymous
control_label: "Track Application Status"
control_type: card/button/link
preconditions: []
action: click
observed_result:
  route: "RECORD LIVE ROUTE"
  modal: null
  visible_state: "RECORD RESULT"
network:
  - request_id: "HAR entry ID"
    method: "RECORD"
    url: "REDACTED URL IF SENSITIVE"
    status: 200
    request_schema: "REDACTED / SYNTHETIC"
    response_schema: "REDACTED / SYNTHETIC"
status_transition: "RECORD"
notes: "No personal information or tokens"
```

## D. Network capture

- [ ] DevTools → Network → Fetch/XHR.
- [ ] Enable Preserve log.
- [ ] Start from an empty request list.
- [ ] Trigger only one interaction at a time.
- [ ] Save request method, path, status, content type, initiator and timing.
- [ ] Replace values with placeholders in request/response bodies.
- [ ] Remove cookie, authorization, CSRF, OTP, identity and contact values before sharing.
- [ ] Export sanitized HAR, not a raw HAR containing credentials.
- [ ] Record server-generated IDs as placeholders in shared notes.

## E. Role audit

Repeat applicable screens for each role:

- [ ] Citizen / elector.
- [ ] Candidate / party representative.
- [ ] BLO.
- [ ] AERO / ERO.
- [ ] DEO / CEO.
- [ ] RO / ARO.
- [ ] Departmental nodal officer.
- [ ] Observer.
- [ ] System administrator (only if authorized).

For every role, test both permitted and prohibited operations. Record jurisdiction scope and whether data visibility changes by election / district / constituency.

## F. Module-specific test checklist

### Citizen Service Portal

- [ ] Login and sign-up flows.
- [ ] Form 6, 6A, 7, 8 and overseas variants.
- [ ] Draft save / resume / final submit.
- [ ] Declarations and supporting documents.
- [ ] Track application status.
- [ ] Download electoral roll.
- [ ] NGSP complaint, tracking, suggestion.
- [ ] BLO call booking.
- [ ] Appeal and track appeal.
- [ ] e-EPIC eligibility and download.
- [ ] SIR search / enumeration / notice-document actions.
- [ ] Voter search / polling information.

### CEO Himachal

- [ ] Sitemap page-by-page crawl.
- [ ] All public CMS pages and downloads.
- [ ] Electoral profile tables and map links.
- [ ] Polling-station / GIS map interactions.
- [ ] Voter Saathi question / answer tree.
- [ ] Voter forms and language PDFs.
- [ ] District Election Office links.

### ENCORE / Suvidha / cVIGIL

- [ ] Candidate nomination profile and filing.
- [ ] Scrutiny, withdrawal, symbol and Form 7A outputs.
- [ ] Permission category catalogue and nodal assignments.
- [ ] Nodal decision, candidate tracking and download.
- [ ] cVIGIL live capture, assignment, field report and RO decision.
- [ ] Turnout slot submission and verification.
- [ ] Counting pre-count, round-wise data and result declaration.
- [ ] Index Card completion and verification.

## G. Exit criteria

A module is **button-level audited** only when every visible control has a recorded outcome. It is **API-audited** only when every interaction's relevant requests and response schemas have been captured and sanitized. It is **role-audited** only when every authorized role's allowed and denied actions are documented. Mark inaccessible screens as blocked / not inspected; do not mark them complete.
