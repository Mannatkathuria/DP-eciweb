# Routes and link inventory

This file records known public destinations. Route discovery is not exhaustive: the source HTML does not expose routes opened exclusively by JavaScript button handlers, and authenticated systems can have role-specific route tables.

## Domains and application entry points

| Purpose | URL |
|---|---|
| ECI public website | `https://www.eci.gov.in/` |
| ECINET URL linked from ECI | `https://ecinet.eci.gov.in/` |
| User-requested hostname (failed direct fetch) | `https://ecinet.gov.in/` |
| Citizen Service Portal | `https://voters.eci.gov.in/` |
| CEO Himachal | `https://ceohimachal.hp.gov.in/` |
| ENCORE | `https://encore.eci.gov.in/` |
| Suvidha | `https://suvidha.eci.gov.in/` |
| cVIGIL portal | `https://cvigil.eci.gov.in/` |
| Electoral Search | `https://electoralsearch.eci.gov.in/` |
| Results | `https://results.eci.gov.in/` |
| ECI Officials / ERONET | `https://officials.eci.gov.in/` |
| Observer portal | `https://observers.eci.gov.in/` |
| Election Planning | `https://eplan.eci.gov.in/` |
| Service Voter Portal | `https://svp.eci.gov.in/` |
| ETPBMS | `https://etpbms.eci.gov.in/` |

## Voters Portal paths evidenced by public indexing / links

| Path | Page / feature | Evidence |
|---|---|---|
| `/` | Citizen Service Portal home | Supplied HTML + indexed page |
| `/home/forms` | Forms Dashboard | Official indexed page |
| `/download-eroll` | Electoral Roll download | Official indexed page; controls State, Year of Revision, Download Selected PDFs |
| `/home/ngsp/` | National Grievance Redressal System | Official indexed page |
| `/searchInSIR/S2UA4DPDF-JK4QWODSE` | Example SIR search path | ECI homepage HTML link; opaque path, may be time-bound |

**Not found in HTML:** exact paths behind Login, Sign-Up, form submit, track application, BLO call booking, appeals, e-EPIC or voter search cards. Record them in a live browser audit rather than guessing.

## CEO Himachal paths evidenced

| Path | Feature |
|---|---|
| `/` or `/Home/` | Home page |
| `/Home/SiteMap` | Sitemap |
| `/CommonControls/ViewCMSHtmlPage?qs=LdEF%2BAuYkB5QTKZ5mTNeTw%3D%3D` | Forms for Voters CMS page |
| `/CommonControls/ViewCMSHtmlPage?qs=LdEF%2BAuYkB4Kmrt1jYSRKg%3D%3D` | Electoral Profile of HP CMS page |

Opaque `qs` values should be copied only from a verified public link. Do not derive new values.

## ECI public-site path inventory

The supplied HTML has 207 anchor elements. A deduplicated listing of text and href pairs is in `appendix_eci_homepage-links.md`. Important internal paths include:

- `/electors`, `/voter-education`, `/election-management`, `/candidate-politicalparty`, `/media-publication`, `/evm-vvpat`, `/eci-officials`, `/ict-app`
- `/download-forms`, `/general-elections`, `/bye-elections`, `/term-of-the-houses`, `/electoral-roll`, `/mcc`, `/judicial-reference`, `/delimitation`
- `/political-party-registration`, `/election-symbol`, `/contribution-reports`, `/expenditure-reports`, `/disclosure-of-electoral-bonds`, `/nomination-related-forms`, `/affidavitt-portal`, `/suvidha-candidate`
- `/compendium-of-instructions`, `/statistical-reports`, `/narrative-reports-and-other-publication`, `/electoral-statistics-pocket-books`, `/miscellaneous-statistics-and-papers`
- `/handbooks-manuals-modelchecklist`, `/eBooks`, `/faq`, `/about-eci`, `/honble-commission`, `/former-cec-ec`, `/officers-directory`, `/contact-us`, `/site-map`

The spelling of some route slugs reflects the source HTML exactly (for example `/affidavitt-portal`); do not normalize slugs without verifying redirects.

## ENCORE / cVIGIL / Suvidha

Their root hostnames are known from official ECI descriptions. Their authenticated internal routes are **not inspected** and are intentionally omitted.
