# ENCORE functional audit

**Official access URL:** `https://encore.eci.gov.in/`  
**Evidence basis:** official ECI module descriptions and public ECI documents. The live role-protected ENCORE interface was not captured.

## System position

ECI describes ENCORE as an integrated system covering major activities in the conduct of elections. Published descriptions identify the core official roles as CEO, DEO, RO and ARO (role participation varies by module and election type). Candidate/permission submissions from Suvidha are routed into official ENCORE workflows.

## Module A — Candidate Nomination

### Online nomination

- Candidate begins from Suvidha login/profile.
- Candidate profile data includes applicant type, party name, voter ID / EPIC number, candidate name and other basic information.
- Candidate fills the nomination form.
- Candidate can upload affidavit / e-affidavit.
- Online security deposit is supported.
- Candidate can choose a preferred date/time slot for physical verification / visit.
- Multiple nominations can be filed.
- Public information / candidate details can be surfaced to citizen-facing channels.

### Offline nomination digitization

- RO staff digitize physically received nomination forms in ENCORE.
- System generates a candidate profile from the recorded data.
- Affidavit can be uploaded.
- Criminal antecedent details can be marked.
- Published ECI descriptions say details are made visible to candidate / citizen-facing channels including candidate app, Affidavit portal, Voter Helpline app, KYC app and Saksham app.

**Source:** [Candidate Nomination](https://www.eci.gov.in/candidate-nomination).

## Module B — Candidate Scrutiny and Finalization

Published features include:

- Mark a nomination as accepted or rejected.
- Accept / reject multiple nominations for a single candidate as applicable.
- Mark withdrawal of candidature.
- Allot election symbols.
- Prepare, serialize and finalize the final contesting-candidate list.
- Generate Form 7A.

Nomination status is propagated to citizen / candidate-facing channels according to ECI’s public description. The exact approval sequence, reason codes, quorum / hearing steps, audit events and role permissions must be verified against current manuals and authorized UI.

**Source:** [Candidate Scrutiny](https://www.eci.gov.in/candidate-scrutiny).

## Module C — Election Permission

- Receives permission requests created through Suvidha (online) or received physically and digitized by staff.
- Routes requests to the concerned officer / departmental nodal officer for approval.
- A separate Nodal App is described for nodal officers.
- Multiple nodal officers may be assigned for certain permission categories.
- End-to-end status tracking is described.
- Approved permission can be downloaded from candidate-facing Suvidha / Candidate App surfaces.

**Source:** [Election Permissions](https://www.eci.gov.in/election-permissions).

## Module D — Voter Turnout

This ENCORE module runs on poll day and captures estimated cumulative turnout percentages at designated two-hour slots. The ECI page identifies these slots:

- 9 AM
- 11 AM
- 1 PM
- 3 PM
- 5 PM
- 7 PM

Published features include slot-wise entry and publication, polling-station-wise end-of-poll data entry, multi-level verification of final poll percentage, and CEO-level monitoring to identify missing constituency entries. End-of-poll detailed data includes constituency / polling-station and male, female and third-gender elector counts against total electors.

**Source:** [Voter Turnout](https://www.eci.gov.in/voter-turnout/).

## Module E — Election Counting

- Counting module is used by ARO & ROPC for parliamentary elections and RO for Assembly Constituency elections (as stated on the ECI counting page).
- Module activates in two phases: pre-counting (one day before counting) and counting day.
- Counting-day data entry includes EVM and postal votes.
- EVM / postal ballot data is tabulated by round to support declaration of results.

Exact round tables, candidate-wise data entry, correction / recount process, validation, observer review, result sign-off and publication events require authorized browser observation and current counting instructions.

**Source:** [Election Counting](https://www.eci.gov.in/election-counting).

## Module F — Index Card / Statistical Reporting

- Index Card uses data from nomination, turnout and counting modules.
- RO fills the constituency Index Card after counting.
- It captures the election from schedule through result declaration, including electors, voters, candidates, parties, votes, results and returned candidate.
- CEO and the ECI Statistical Division verify the data.
- A public ECI press document describes publication facilitation within 72 hours after result declaration; confirm the active current requirement in the latest ECI instructions.

**Source:** [Index Card & Statistical Reporting](https://www.eci.gov.in/index-card-statistical-reporting).

## Proposed ECIWeb module decomposition

[Inferred / proposal]

- `candidate-nomination` — candidate records, nomination submissions, affidavit uploads, deposits and slot booking.
- `nomination-scrutiny` — scrutiny events, accepted/rejected reasons, withdrawals, symbols and Form 7A.
- `permission-management` — request intake, category rules, nodal assignments, approvals, downloadable permission documents.
- `turnout-reporting` — time-slot submissions, late-entry flags, polling-station final data, verification.
- `counting` — constituency, rounds, EVM / postal vote entries, reconciliation and declaration workflow.
- `index-card` — post-count report, cross-module data snapshot, CEO and ECI verification.

## Not inspected / do not assume

No live ENCORE login, route catalogue, button inventory, request methods, API paths, DB schema, status enum, upload limits, MFA requirements or user-specific screen was available. Those must be captured from an authorized RO/ARO/DEO/CEO test account.
