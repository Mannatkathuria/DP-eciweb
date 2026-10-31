# ECI Election Management public information architecture

**Public landing page:** `https://www.eci.gov.in/election-management`

The Election Management page is a public directory of election information and related functional modules. It should not be mistaken for the authenticated ENCORE application itself.

## Categories shown on the official ECI page

### Results and statistics

- General Parliamentary Elections Results.
- State Legislative Assemblies Elections.
- Form 20 links.
- Detailed bye-election results.
- Bye-election results (Forms 21D and 21E).
- Miscellaneous statistics.

### Conduct of elections

- Handbooks / Manuals / Model Checklists.
- Compendium of Instructions.
- Training Material.
- FAQs.
- Electoral Roll Management.
- Election Planning & Vacancy Management.
- Grievance redressal.
- Scrutiny of Nominations.
- Postal ballot.
- Permission Management.
- Citizen Complaint during MCC.
- Observer Portal.

### Historical election navigation

The ECI public homepage snapshot links to current state election detail pages, bye-elections, past assembly elections, general elections, presidential / vice-presidential elections and election result portals. The routes are enumerated in `appendix_eci_homepage-links.md`.

## Related operational applications

| Public information category | Related system / page | Published function |
|---|---|---|
| Electoral Roll Management | ERONET | Registration, field verification, ERO decision support, roll management and reporting |
| Election Planning & Vacancy Management | Election Planning Portal | Dashboard for planning, vacancies, upcoming elections, holiday management and alerts |
| Scrutiny of Nominations | ENCORE candidate-scrutiny module | Accept / reject nominations, withdrawals, symbol allocation, final contesting list and Form 7A |
| Postal ballot | ETPBMS | Secure electronic transmission of postal ballots for service voters |
| Permission Management | Suvidha intake + ENCORE processing | Online / offline permission intake and routed approval |
| Citizen complaint during MCC | cVIGIL | Capture, assignment, field investigation, RO decision and status communication |
| Observer Portal | Observer portal | Observer profile, deployment, notices and report upload |
| Counting / results | ENCORE counting and public results | Round-wise vote entry, result declaration and statistical reporting |

## Functional lifecycle to reflect in ECIWeb

1. **Pre-election readiness:** schedule, vacancies, constituency data, polling-station readiness, election staff and materials.
2. **Electoral roll readiness:** continuous updates / claims and objections, field verification, ERO decisions, roll publication.
3. **Candidate and party activity:** nomination, affidavit, scrutiny, withdrawal, symbols, permissions and candidate information.
4. **Campaign monitoring:** MCC complaints, expenditure and media monitoring, observers, field squads and escalations.
5. **Poll day:** turnout reporting, polling-station operational status, field incidents, postal ballot handling.
6. **Counting and declaration:** EVM/postal ballot data entry, rounds, verification, result declaration and publication.
7. **Post-election reporting:** Index Card, statistical reports, audit trail and archival.

These are broad functional stages synthesized from ECI’s public module descriptions and manuals. Do not interpret them as a complete legal procedure or a replacement for current ECI instructions.
