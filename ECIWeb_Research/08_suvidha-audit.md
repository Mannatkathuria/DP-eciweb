# Suvidha / Suvidha 2.0 audit

**Portal:** `https://suvidha.eci.gov.in/`  
**Related official workflow:** ENCORE election permission and candidate nomination modules.

## Purpose

ECI describes Suvidha as a single-window system for candidates and political parties to submit election-related permission requests and, in the online nomination workflow, to begin candidate nomination. ECI also describes a mobile app (Suvidha 2.0) supporting campaign-permission applications, status tracking, approval downloads and ECI updates.

## Candidate / party profile and nomination

Published ECI candidate-nomination material says the process begins with login to Suvidha and a candidate profile. The profile collects basic details used in the nomination form, including applicant type, party name, voter ID / EPIC number, candidate name and other particulars.

Documented online-nomination features:

- Complete nomination form completion.
- Affidavit / e-affidavit upload or completion.
- Online security deposit via multiple modes.
- Choice of preferred date/time for physical verification / visit to RO.
- Filing multiple nominations.
- Separate portal surfaces for candidate / political party and ECI officials.

For offline nomination, RO office receives a physical nomination and records / digitizes it in ENCORE. The public-facing candidate profile / affidavit information is made available through connected candidate / citizen channels according to ECI’s description.

## Campaign permission workflow

Published feature description:

1. Candidate / political party creates a profile using a mobile number.
2. Candidate / party submits an online permission request or an offline request is received and digitized by officials.
3. Digitized / online request is sent through ENCORE to the concerned officer and departmental nodal officer(s).
4. Nodal officer(s) provide required consent / decision.
5. Candidate / party can track status through Suvidha / Candidate App.
6. Once approved, permission copy can be downloaded.

Documented system features:

- Both online and offline permission intake.
- Auto-forwarding to concerned nodal officer.
- Separate Nodal App for departmental nodal officers.
- Multiple nodal officers can be assigned to selected permission categories.
- End-to-end request tracking.

A Suvidha 2.0 ECI press note (24 October 2024) additionally describes downloading application forms, declarations and supporting documents; generation of a reference ID; mobile application for seeking, tracking and downloading campaign permissions; and a First-In-First-Out principle for transparent handling. Confirm current operational categories and SLA in live portal / current circulars.

## Application and integration boundary

- Suvidha is candidate / party facing.
- ENCORE is the official election-management platform where requests are processed and routed.
- A Nodal App is described for other departments whose consent is required.
- Candidate App supports status tracking and downloading approvals.

## Not inspected

- Exact category list for permissions (e.g. vehicle, rally, loudspeaker etc.) is not asserted here because the currently indexed official pages do not provide a complete authoritative list in the material reviewed.
- Exact profile fields beyond the fields named in ECI descriptions.
- Document upload format/size, payment provider / gateway contract, reference-ID format, queue semantics, rejection reason list, appeals, SLA, API endpoints and all screen/button states.

## ECIWeb design proposal

[Inferred / proposal]

Use a configurable permission catalogue. Each category defines required attachments, geographic jurisdiction, required nodal departments, time-window constraints, review stages, fee rules if any, and downloadable approval template. Support online and staff-entered offline submissions under the same case ID, with immutable source/channel metadata. Enforce FIFO or other queue policy only if the current ECI rule is confirmed.
