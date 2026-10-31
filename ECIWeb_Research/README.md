# ECIWeb research pack

**Prepared:** 31 October 2026  
**Purpose:** Functional research pack for the ECIWeb project. This is a reference and implementation-planning bundle, not a clone of ECI source code and not an authenticated audit of every government application.

## Contents

| File | What it contains |
|---|---|
| `00_scope-and-evidence.md` | Coverage, evidence grades, limitations, and what “complete” means for this pass |
| `01_ecosystem-map.md` | Domains, portals, users, and the relationships between services |
| `02_eci-public-site-audit.md` | Homepage structure, navigation groups, controls, assets, and linked destinations |
| `03_citizen-service-portal-audit.md` | Voters portal services, Forms 6/6A/7/8, SIR 2026 area, and observed UI controls |
| `04_ceo-himachal-audit.md` | Himachal CEO home page, voter assistant categories, public resources, and sitemap |
| `05_election-management-audit.md` | The ECI public Election Management information architecture |
| `06_encore-audit.md` | ENCORE documented functional modules and operational workflows |
| `07_cvigil-audit.md` | Citizen report flow and official control-room / field-unit workflow |
| `08_suvidha-audit.md` | Candidate/party nomination and campaign-permission workflows |
| `09_workflow-blueprints.md` | Cross-module workflows to implement in ECIWeb |
| `10_roles-and-access-matrix.md` | Roles and capabilities supported by published descriptions |
| `11_api-and-network-inventory.md` | What API evidence exists, what does not, and how to collect it safely |
| `12_routes-and-link-inventory.md` | Important URLs and page destinations |
| `13_ui-control-inventory.md` | Exact controls extracted from the two supplied HTML files |
| `14_eciweb-implementation-roadmap.md` | Proposed React/Express implementation plan and data model |
| `15_live-browser-audit-checklist.md` | Checklist for completing an interactive / authenticated audit |
| `16_sources-and-references.md` | Primary official links and capture provenance |
| `appendix_eci_homepage-links.md` | Deduplicated anchor/link inventory extracted from supplied ECI homepage HTML |
| `appendix_voters-portal-controls.md` | Detailed control and script inventory extracted from supplied voters portal HTML |

## Important findings at a glance

- The ECI homepage snapshot is a public-facing portal with six major navigation groups: Voters, Election Management, Political Parties/Candidate, Media & Publications, EVM/VVPAT, and ECI Officials.
- The voters portal snapshot exposes login/sign-up, SIR 2026 actions, statutory form entry points, downloads/guidelines, grievance and status services, BLO call booking, appeals, e-EPIC, voter search, election information and results.
- ECI’s published descriptions document ENCORE nomination, scrutiny, permissions, counting, turnout, and index-card/reporting workflows; Suvidha and cVIGIL connect to parts of this workflow.
- CEO Himachal provides state-specific electoral information, voter forms, polling-station and GIS resources, BLO resources, and a Voter Saathi assistant.

## Critical limitation

This pack does **not** claim to enumerate every screen, button, or API request in every live application. The supplied HTML files are static snapshots, not full browser exports, and do not include the JavaScript bundle contents, route manifests, HAR files, or authenticated screens. Several applications require authorized role-based login. Anything not directly evidenced is marked as an item to verify.

## Evidence labels

- **[HTML — supplied]**: directly extracted from the two HTML files you uploaded.
- **[ECI — published]**: stated by an official ECI page, portal, or public document.
- **[CEO HP — published]**: stated by the public CEO Himachal site or its public sitemap/content pages.
- **[Search-indexed]**: visible in the public search index; the live page was not independently rendered by the browser tool.
- **[Inferred / proposal]**: a suggested ECIWeb design or workflow, not a claim about ECI’s internal implementation.
- **[Not inspected]**: requires a direct browser session, role credentials, or a fresh network capture.

## How to use

Start with `01_ecosystem-map.md`, then read the portal-specific audits. Use `11_api-and-network-inventory.md` and `15_live-browser-audit-checklist.md` to gather the missing API and authenticated UI evidence. Do not copy or reuse real user records, session cookies, bearer tokens, OTPs, or confidential official data in ECIWeb.
