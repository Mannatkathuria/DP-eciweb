# ECI system research

**Scope.** What each official ECI system does, who runs it, whether it offers an interface ECIWEB could use, and what ECIWEB can add without duplicating or misrepresenting it.

**Evidence.** This builds on the project's earlier research bundle in [`ECIWeb_Research/`](../ECIWeb_Research/README.md) (research date 31 October 2026), which used official ECI pages and user-supplied page snapshots. No authenticated official system was accessed for this work, and none should be without written authorisation. "Not published" below means no public API documentation was found in that research. It does not mean no interface exists.

## Summary

| System | Responsible authority | Users | Public API documented? | Formal access needed? | Can ECIWEB import its data? | ECIWEB's role |
| --- | --- | --- | --- | --- | --- | --- |
| ECINET (`ecinet.eci.gov.in`) | ECI | Citizens, candidates and parties, election officials | Not published | Yes | Only under a data-sharing agreement | Training and workflow prototype; must not present itself as ECINET |
| ERONET (officials' roll processing) | ECI; operated by CEOs, DEOs, EROs | EROs, AEROs, BLOs | Not published | Yes | Only under agreement; roll data is personal data | Mirrors the BLO → ERO workflow for training and testing; no live roll |
| Voters' Service Portal (`voters.eci.gov.in`) | ECI | Citizens | Not published | n/a for citizens | No | ECIWEB's Form 6/8 screens must say they are not the official portal |
| Electoral search (`electoralsearch.eci.gov.in`) | ECI | Public | Not published (captcha-protected) | Yes for bulk access | **No**, never scrape | Synthetic roll search only |
| ENCORE (`encore.eci.gov.in`) | ECI; used by RO, ARO, DEO, CEO | Election officials | Not published | Yes | Only under agreement | Nomination, scrutiny, turnout and counting workflows for training; results only from an authorised feed |
| Suvidha (`suvidha.eci.gov.in`) | ECI | Candidates, parties | Not published | Yes | Only under agreement | Candidate nomination and agent appointment workflow |
| cVIGIL (app and official portal) | ECI; handled by DEO control rooms and flying squads | Citizens, officials | Not published | Yes | Only under agreement | The `/report-violation` page is a labelled sample; it sends nothing |
| Results portal (`results.eci.gov.in`) | ECI | Public | Not published as an API | Yes for a feed | Only through an authorised feed; never scrape | Read-only results from a registered source |
| CEO State portals (for example `ceohimachal.hp.gov.in`) | State CEO | Public | Mostly static pages and PDFs | Depends on State | Published PDFs can be reused within their terms; check each State | State pages link to the official CEO site |
| Electoral roll PDFs (published rolls) | EROs through CEO sites | Public, with captcha and terms | No API | Use is restricted by ECI instructions | **No** bulk import; personal data | Not used |
| Election planning, Observer portal, ETPBMS | ECI | Officials, observers, service electors | Not published | Yes | No | Out of scope |

## System notes

### ECINET
ECI describes ECINET as one platform connecting citizens, candidates and parties, and officials, covering registration, application tracking, e-EPIC, roll search, BLO call booking, candidate information, MCC complaints and Suvidha 2.0 ([ECI ICT applications](https://www.eci.gov.in/ict-app); see `ECIWeb_Research/01_ecosystem-map.md`). Its authenticated modules were not inspected. **Implication:** ECIWEB overlaps ECINET's scope by design. It is a prototype and training platform, so every page must avoid ECI branding and claims that would make it look like ECINET (see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) on branding).

### ERONET
The officials' roll-processing system: Form 6, 7 and 8 processing, field verification by BLOs (BLO app), ERO decisions and roll publication ([ECI officials](https://www.eci.gov.in/eci-officials)). **Implication:** ECIWEB's Form 6/8 workflow follows the same separation (BLO verifies, ERO/AERO decides). Live integration would need ECI's agreement, and roll data falls under the Digital Personal Data Protection Act, 2023 (DPDP Act) and ECI's own rules on roll use.

### ENCORE
Officials' modules for nomination, scrutiny and finalisation (Form 7A), permissions, poll-day turnout at fixed time slots (9, 11, 13, 15, 17 and 19 hours), counting by round (EVM and postal), and the Index Card ([ECI candidate nomination](https://www.eci.gov.in/candidate-nomination), [scrutiny](https://www.eci.gov.in/candidate-scrutiny), [voter turnout](https://www.eci.gov.in/voter-turnout/), [counting](https://www.eci.gov.in/election-counting); see `ECIWeb_Research/06_encore-audit.md`). **Implication:** ECIWEB models nomination, scrutiny, the contesting list and round-wise counting records. It must never present its counting records as results; official results come only from the RO's declaration through an authorised source.

### Suvidha
Candidate and party portal for nominations, affidavits, deposits, appointment slots and campaign permissions, routed to ENCORE ([ECI election permissions](https://www.eci.gov.in/election-permissions)). **Implication:** ECIWEB's candidate desk covers nomination, affidavit summary and agent appointments. Campaign permissions are sample data only.

### cVIGIL
A citizen app for geotagged evidence of MCC violations, with a 100-minute response target handled by district control rooms and flying squads ([ECI cVIGIL](https://www.eci.gov.in/cvigil); see `ECIWeb_Research/07_cvigil-audit.md`). **Implication:** ECIWEB's violation page stays a labelled sample until an authorised integration exists.

### Results portal
The public results site. No public API is documented. **Implication:** ECIWEB's results module accepts only a registered source with a legal basis and agreement reference, or a mock that is labelled on every view.

## What ECIWEB can legitimately complement

1. **Training and rehearsal** of every official workflow with synthetic data, in a clearly marked training environment.
2. **Workflow prototyping** for ECI or a CEO to evaluate, for example offline poll-day operations and fuzzy roll search.
3. **Accountability tooling** (audit trails, reconciliation checks) that could be offered to ECI as a design.

## What ECIWEB must not do

- Scrape or bulk-download any ECI system, including published roll PDFs.
- Present synthetic records as real, or itself as an official ECI system.
- Claim an integration works without testing it against the authorised source (see [EXTERNAL_DATA_SOURCES.md](EXTERNAL_DATA_SOURCES.md)).
