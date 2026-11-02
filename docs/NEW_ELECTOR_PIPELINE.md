# New elector pipeline

Purpose: help BLOs reach people who will be eligible but are not on the roll (young people turning 18, new residents), **without** registering anyone automatically.

```text
authorised data source ──ingestion run──► prospects (kept apart from the roll)
                                              │  eligibility by qualifying date
                                              ▼
                                   BLO task for the part ──► BLO contacts the person
                                              │                    │
                                              │                    └─► person submits Form 6 themselves (normal workflow)
                                              └─► outcome recorded: contacted, form6_submitted, declined, not_found, ineligible
```

## Data sources

Registered by an official with `integration:manage` (step-up). Each source records its legal basis, owner, data-sharing agreement reference and status. In this prototype **only synthetic sources can be connected**; every real source (school boards, birth registers, UIDAI, other government feeds) is BLOCKED because no authorised access exists. See [EXTERNAL_DATA_SOURCES.md](EXTERNAL_DATA_SOURCES.md).

## Ingestion runs

`POST /integrations/sources/:id/runs` records a run with provenance (source, time, counts, rejects). Records become **prospects**, never electors. A prospect holds only what a BLO needs to make contact, with the source reference (`prospect:ref:{source}:{ref}` prevents duplicates).

## Eligibility

`services/eligibility.service.js` computes eligibility against the four qualifying dates (1 January, 1 April, 1 July, 1 October; Representation of the People Act, 1950, section 14 as amended in 2021). People who will turn 18 by a coming qualifying date can be contacted in advance. `POST /integrations/rescreen` re-checks prospects as dates pass.

## BLO tasks

Tasks are grouped by part and assigned by BLO supervisors (`POST /registration-tasks/:id/assign`). The BLO records the outcome (`POST /registration-tasks/:id/outcome`). When the person files a Form 6, the task and prospect are linked to the application, which then follows the [electoral roll workflow](ELECTORAL_ROLL_WORKFLOW.md) like any other.

## Safeguards

- Prospects are never shown publicly and never become electors without a Form 6 decided by the ERO/AERO.
- Every run, assignment and outcome is audited.
- `BLO_ASSIGNED` and `APPLICATION_SUBMITTED` events carry counts and areas, not names.
