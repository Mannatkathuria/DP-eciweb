# Counting and results

ECIWEB does not count votes, does not connect to EVMs, and holds no vote figures of its own. The count belongs to the Returning Officer under the Conduct of Elections Rules, 1961 (Part V). The official national system for results is the Commission's own (ENCORE and the results website); ECIWEB has no authorised access to it. See [ECI_SYSTEM_RESEARCH.md](ECI_SYSTEM_RESEARCH.md).

## Counting operations (`/counting`)

An operational record of the count, per assembly constituency and election.

| Step | Who | Endpoint | Rule |
| --- | --- | --- | --- |
| Plan the centre, halls and tables | RO | `POST /counting/:electionId/plan` | Up to 10 halls and 30 tables. Rounds are generated from the approved stations in part order, one per table per round. Fixed once counting starts. |
| Allocate staff at random | RO | `POST /counting/:electionId/randomise` | Only counting supervisors and assistants assigned to that constituency and election. HMAC-SHA256 ordering with a random seed. The seed is recorded so the allocation can be re-derived. Extras are kept as reserve. |
| Record a table | supervisor of that table, or the RO | `POST /counting/:electionId/rounds/:round/tables/:table` | On counting day only. Requires confirmation that Form 17C Part II is completed and signed. No figures are entered. Rounds go in order. |
| Complete a round | RO | `POST /counting/:electionId/rounds/:round/complete` | Every table recorded and no open discrepancy for the round. |
| Report a discrepancy | counting agent, supervisor, observer | `POST /counting/:electionId/discrepancies` | Seal, Form 17C mismatch, control unit display, serial number, postal ballot, other. |
| Decide a discrepancy | RO | `POST /counting/:electionId/discrepancies/:id/decide` | Accepted, rejected or referred to the Commission, with a reason. |
| Observer report | counting observer | `POST /counting/:electionId/observer-reports` | Routine, concern or serious. |
| VVPAT draw | RO | `POST /counting/:electionId/vvpat-draw` | Five polling stations per assembly constituency, drawn by lot (Supreme Court order of 8 April 2019). Witnesses recorded, seed recorded, made once. |

Read access (`GET /counting/:electionId?state=&district=&constituency=`) is limited to counting roles, observers and the RO of that constituency and election.

## Results (`/results`)

- Results come only from a **registered result source** (`/results/sources`, `integration:manage`). Source types are an official feed (none is authorised, so none exists) or a mock.
- Entries (round-wise or final) and publication status are received from the source and stored append-only with the source's name, version and time.
- Nothing is accepted from an official feed before counting day.
- **Mock data** can be generated only from a mock source and is labelled "MOCK DATA, not an election result" on every view, with no declared winner.
- Reconciliation checks compare the votes reported with the register entries of the constituency's stations and flag differences.
- Public endpoints: `GET /public/results`, `GET /public/turnout` (turnout is labelled approximate).

## What would be needed for real results

An authorised, documented interface from the Commission (or the CEO's office), with credentials and a data-sharing agreement. Until then the integration is BLOCKED; see [INTEGRATION_ARCHITECTURE.md](INTEGRATION_ARCHITECTURE.md).
