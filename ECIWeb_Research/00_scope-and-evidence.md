# Scope, methodology, and evidence quality

## Requested scope

This pass covers the URLs and applications named in the request:

- `ecinet.gov.in` (also checking the ECI-linked ECINET canonical host)
- `voters.eci.gov.in`
- `ceohimachal.hp.gov.in`
- ECI public Election Management information
- ENCORE
- cVIGIL
- Suvidha / Suvidha 2.0

## What was actually inspected

1. **User-supplied HTML — ECI homepage.** Parsed the uploaded file `Pasted text(20261031-171124).txt` (112,186 bytes on disk). Its `<title>` is `Home | Election Commission of India | Election Commission of India`. The footer says content copyright 2026 and last updated 15 October 2026. The HTML contains navigation links, page content, carousel controls, tab buttons, accessibility buttons, asset references, and outbound URLs.
2. **User-supplied HTML — Citizen Service Portal.** Parsed `Pasted text (2)(1).txt` (141,355 bytes on disk). Its title is `Citizen Service Portal`. It includes the SIR 2026 region, registration cards, service cards, login/sign-up buttons, forms-related actions, election/results buttons, and framework/asset references.
3. **Public ECI and CEO Himachal documentation.** Queried official public ECI pages describing ECINET, election-management categories, ERONET, candidate nomination, scrutiny, turnout, counting, index cards, cVIGIL, and Suvidha. Queried CEO Himachal home, sitemap, voter-forms page, and electoral-profile page.
4. **URL checks.** A direct attempt to open `https://ecinet.gov.in/` returned a gateway error (502) in this research environment. The ECI homepage HTML links to `https://ecinet.eci.gov.in/`, which is treated here as the ECI-linked canonical portal host. Direct rendering of some JS-heavy ECI and voter pages was rejected or timed out by the web retrieval layer; indexed content and supplied HTML were used instead.

## What this does not prove

- A static DOM snapshot cannot reveal all React/Angular runtime routes or dynamically rendered modals.
- A button without an `href` does not reveal its destination. The click handler is usually in a JavaScript bundle or framework runtime.
- HTML does not disclose backend source code, private database structure, internal service-to-service calls, or API contracts unless those are explicitly embedded in the page.
- A public description of ENCORE or cVIGIL does not reveal its complete role-specific dashboard, button-level interaction, validation rules, or endpoint list.
- Public search indexing is not a substitute for a live authenticated application audit.

## Evidence grading

| Grade | Meaning | Example |
|---|---|---|
| A | Directly extracted from supplied HTML | `Fill Form 6`, Login, Sign-Up, the script paths |
| B | Official ECI/CEO page states the feature | ENCORE counting module, cVIGIL 100-minute response design |
| C | Search-indexed page content | Forms dashboard and CEO HP page text visible in index |
| D | Engineering recommendation | ECIWeb route names, database entities, state transitions |
| U | Uninspected | API endpoint / authenticated screen / exact hidden action |

## Ethical / security boundary

Only inspect pages and actions you are authorized to use. Do not evade login, CAPTCHA, access controls, rate limits, or network restrictions. When capturing traffic, redact personal voter information, OTPs, passwords, access tokens, session cookies, and government-only data. Implement your own test data and your own backend for ECIWeb; do not rely on undocumented private endpoints for a production election system.
