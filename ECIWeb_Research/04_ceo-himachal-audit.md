# CEO Himachal Pradesh website audit

**Public host:** `https://ceohimachal.hp.gov.in/`  
**Evidence:** publicly indexed homepage, public sitemap, and public CMS content pages. No user-supplied HTML snapshot or authenticated staff dashboard capture was available in this pass.

## Homepage feature groups identified

The public homepage exposes information / entry points for:

- Special Summary Revision and revision-related information.
- Electoral Profile of Himachal Pradesh.
- `Main Bharat Hoon` election awareness / song.
- Search name in the SIR-2002 electoral roll and PDF files.
- Search name in the last SIR electoral roll on ECI portal.
- Contact BLO of the polling station.
- ECI visit / poll preparedness information.
- Elections 2024 (Lok Sabha and bye-election information).
- Important functionaries.
- GIS maps for State, Districts and Assembly Constituencies.
- EVM / VVPAT information.
- Previous election information, Form-20 result, and previous-election reports.
- BLO resources for revision.
- Media Corner, Employee Corner, Budget, Training, Handbooks / Manuals / Checklists, Electoral Literacy Club, Tenders, ECI mobile app links, annual administrative reports, and district election office websites.

## Voter Saathi assistant

The homepage indexed content describes Voter Saathi as an always-available assistant and displays these entry categories:

- New Elector/Voter
- Existing Elector/Voter
- Overseas Elector
- PwD Elector/Voter
- Service Electors
- Complaints
- Candidates
- Political Parties
- Know Your Candidate
- Know your BLO, ERO, DEO and Polling Station
- GIS Maps of HP
- Final list of Polling Stations-2024
- Voters List
- Instructions to fill form online/offline

The prompt categories are evidenced; the full chatbot question trees, intents, response text, handoff rules, and backend integration were not available.

## Public resources / profile page

The Electoral Profile page lists:

- Draft list of Polling Stations-2025.
- AC-wise electors in the Final Roll as on 06.01.2025.
- Maps for Parliamentary and Assembly Constituencies of HP.
- AC-wise electors for Final publication of PER 2024 (as on 05-01-2024).
- List of Parliamentary and Assembly Constituencies.
- List of District Election Officers.
- List of ACs district-wise.
- AC–District–PC mapping.
- Final list of Polling Stations-2024.

## Voter forms page

The public Forms for Voters page lists:

- Form 6 — application for new voters.
- Form 6A — overseas electors.
- Form 6B — information of Aadhaar number for electoral-roll authentication.
- Form 7 — objection to proposed inclusion / deletion from an existing electoral roll.
- Form 8 — shifting, correction, EPIC replacement, or marking PwD.
- Form 2 — armed forces.
- Form 2A — armed police force of a State serving outside that State.
- Form 3 — ordinary residence for a Government of India employee posted outside India.

The page provides Hindi and English versions. Confirm current downloadable PDFs and instructions in the live portal before building form templates.

## Sitemap and navigation

- Public sitemap: `/Home/SiteMap`.
- Home page includes public CMS pages using an opaque query parameter (e.g. `/CommonControls/ViewCMSHtmlPage?qs=...`).
- The opaque `qs` values should be treated as CMS lookup tokens; do not attempt to reverse or synthesize them.
- Sitemap entries should be used as the initial crawl seed for a future page-by-page audit. This pass does not contain the entire rendered HTML of every sitemap destination.

## Contact details displayed on public site

The homepage displays the Chief Electoral Officer, Himachal Pradesh office at 38, SDA Complex, Kasumpti-Shimla-9, Himachal Pradesh, plus a phone number beginning `+91 177` and the email rendered as `election-hp[at]nic[dot]in`. The site identifies content as published and managed by the Election Department Himachal Pradesh and website design/development by NIC Himachal Pradesh.

## ECIWeb implementation opportunities

[Inferred / proposal]

- State-aware administrative dashboards for CEO / DEO / ERO / BLO.
- Constituency and polling-station directory with district → AC → PC → polling-station hierarchy.
- Search and download workflows for roll PDFs and electoral profiles.
- Voter-assistance chatbot that maps to deterministic service intents and links, with a clear human-contact route.
- Public information CMS for notices, training resources, reports, staff orders and tender notices.
- GIS pages backed by verified, versioned polling-station coordinates.

## Unknowns

The exact menu click map, all CMS pages and downloadable resources, Voter Saathi conversation tree, GIS map interactions, BLO-only screens, and state staff portal APIs remain uninspected.
