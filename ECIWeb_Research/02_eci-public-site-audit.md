# ECI public website audit

**Source:** supplied ECI homepage HTML snapshot; public ECI information architecture.

## Page purpose and layout

The supplied homepage is a public information and service-discovery portal. It is not the underlying authenticated election operations application.

### Top utility / global elements [HTML — supplied]

- Header/menu button labelled `Menu`.
- Toll-free number reference: `1950`.
- `Screen Reader Access` and `Skip to Main Content` links.
- Hindi-language site link.
- Search link (`/global-search`).
- Main navigation toggle button.
- Social links: Facebook, Instagram, X/Twitter, YouTube.

### Main navigation groups [HTML — supplied]

1. **Voters** — registration, application status, e-EPIC, electoral search, forms, polling booth, service voters, overseas voters, complaints, voter education.
2. **Election Management** — current / past elections, results, electoral roll, MCC, judicial references, delimitation.
3. **Political Parties/Candidate** — party registration, symbols, contribution and expenditure reports, nomination forms, affidavits, candidate app, permissions.
4. **Media & Publications** — ECI publications, compendiums, statistical reports, narrative reports, pocket books, miscellaneous statistics.
5. **EVM/VVPAT** — FAQs, presentations, status paper, manuals and legal history.
6. **ECI Officials** — instructions, ECINET, handbooks, eBooks, FAQs and official reference material.

### Homepage content blocks [HTML — supplied]

- Hero / carousel with slide buttons. The source contains 14 slide-control buttons in the main slider and 3 in the commission/profile carousel.
- News and update tabs: Current Issues, Press Releases, Instructions, Tender & Vacancies, Election Stories, FAQs, Court Orders.
- Election and commission information, including office-holder profile links.
- Document and press-note links (PDFs / public document API paths).
- Service boxes for Electors, Political Parties/Candidates, and ECI Officials.
- Election cards for states / bye-elections and historical election links.
- Video / social embeds.
- IIIDEM and SVEEP explanatory blocks.
- Footer quick links, social links, contact address and ECINET application card.

### Footer and contact details in snapshot

- Election Commission of India, Nirvachan Sadan, Ashoka Road, New Delhi 110001.
- Footer includes About ECI, Directory, Contact Us, Public Grievance, RTI, eOffice, Help, voter registration, SVEEP, service voters, cVIGIL app, candidate affidavits, APAR, international cooperation, India A-WEB Centre, VoiceNet, MCC cases, political-party registration, terms, sitemap, and feedback/complaints.
- Snapshot footer says copyright 2026 and last updated 15 October 2026.

## Interaction inventory from supplied HTML

- **207 anchor elements** in the source (some repeated); a deduplicated destination inventory is in `appendix_eci_homepage-links.md`.
- **42 button elements** in the source: menu controls, slider controls, seven news tabs, navigation close, and accessibility widget controls.
- No HTML `<form>` element is present in this snapshot.
- A checkbox is present for light/dark mode.
- A button with no `href` cannot be mapped to its real route from the HTML alone. The related JS runtime and live click event would need inspection.

## Frontend assets and likely implementation clues [HTML — supplied]

| Asset / library family | Source references |
|---|---|
| Main SPA bundle | `/static/js/main.262356cd.js` |
| Main stylesheet | `/static/css/main.80c35696.css` |
| Bootstrap / custom responsive CSS | `/newcss/bootstrap.min.css`, `/newcss/custom.css`, `/newcss/responsive.css` |
| Accessibility widget stylesheet/script | `/newcss/accessibility-widget.css`, `/newjs/accessibility-widget.js` |
| Fonts / icons | Poppins and Font Awesome asset paths |
| Client scripts | jQuery, custom jQuery, Bootstrap bundle |
| Third-party embeds / analytics | Facebook SDK, Twitter widget scripts, Google Tag Manager / gtag reference |

The snapshot suggests a React-style SPA bundle coexisting with legacy jQuery/Bootstrap enhancements. This is an asset observation, not a claim about source-code architecture.

## ECIWeb takeaways

- Build a clear public home / service directory with separate voter, candidate, official and election-management sections.
- Treat news/document lists as content-management data, not hard-coded UI.
- Provide accessibility actions as first-class features (keyboard access, contrast, font scaling, read-aloud, hide images).
- Use route-level metadata and a site map so every public module has a discoverable entry.
