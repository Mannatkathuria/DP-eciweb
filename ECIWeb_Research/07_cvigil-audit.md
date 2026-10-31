# cVIGIL audit

**Public ECI pages:** Citizen app description and official portal description.  
**Operational portal:** `https://cvigil.eci.gov.in/` (official ECI page links this address).

## Citizen-facing function

cVIGIL is described by ECI as a mobile application for citizens to report Model Code of Conduct (MCC) violations during election periods. The official description includes:

- Select the type/category of violation.
- Submit details of the incident.
- Provide location and time.
- Capture and submit live photo or video evidence.
- GPS / GIS-based location support.
- Track progress / receive status updates.
- Anonymous reporting option is described.
- Examples include bribery, distribution of gifts or liquor, and loudspeakers beyond permitted hours.

The official page says the app requires live incident capture; do not build an upload-existing-gallery-photo path unless the current official requirements explicitly support it.

## Official portal / role-based workflow

The ECI cVIGIL portal description says it is accessible to ECI officials such as CEO, DEO and RO, with role-based features.

1. Citizen submits complaint with live photo/video and location.
2. Complaint appears in the District Control Centre (DCC).
3. DCC assigns the complaint to the nearest appropriate Field Unit / FST using a map view.
4. Field Unit uses a GIS-enabled investigator app to navigate to the reported location and act.
5. Field Unit submits its report online.
6. RO reviews the complaint and field report.
7. RO may take a final decision such as Drop, Dispose or Escalate (terms listed by ECI).
8. Citizen receives status / action update.

The ECI page describes a 100-minute timeline for responding to cases. A public ECI handbook illustration breaks the target into approximate stages: 5 minutes to capture evidence, 5 minutes to upload, 5 minutes for DCC assignment, 15 minutes for field arrival, 30 minutes for action/report, and 50 minutes for RO status communication. Treat these numbers as the handbook’s process illustration, not as measured performance or a guarantee for every case.

## Operational features published by ECI

- Map-based case assignment at DCC level to locate nearest FST team.
- Real-time field-unit status / location tracking.
- RO access to complaint details and FST reports.
- Final RO decision after review.
- Alerts against assigned timeline / overdue status.
- Monitoring by CEO / DEO / RO to investigate delays and incorrect decisions.

## UI and API evidence gap

No cVIGIL UI HTML, dashboard screenshot, mobile-app capture, route list or HAR was supplied. Exact complaint categories, required fields, media constraints, location permissions, anonymous-mode tradeoffs, case status codes, notification channels, assignment rules and API requests remain unverified.

## ECIWeb design proposal

[Inferred / proposal]

- Citizen report should store: case ID, category, event timestamp, submission timestamp, location capture, evidence metadata, optional contact preference, anonymity flag, consent and public status token.
- A separate secure media service should retain evidence with integrity hashes and access logging.
- DCC queue should support map/list views, priority, SLA timers and assignment reason.
- Field-unit mobile workflow should include accepted assignment, en-route, arrived, evidence / action note, submitted report, GPS timestamp and supervisor escalation.
- RO decision states should be explicit and auditable: pending review, drop, dispose, escalate, reopen / correction (only if authorized policy defines it).
- Public status view should expose minimum necessary information; never expose internal personnel tracking or sensitive evidence.
