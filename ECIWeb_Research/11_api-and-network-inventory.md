# API and network inventory

## Findings from supplied HTML

| Site snapshot | Scripts / assets observed | HTML forms | Native controls / buttons | API contract evidence |
|---|---|---:|---|---|
| ECI homepage | SPA bundle `/static/js/main.262356cd.js`; main CSS; Bootstrap / custom CSS; jQuery; accessibility script; Facebook / Twitter SDKs; Google tag script | 0 | 42 buttons; 1 checkbox; 207 anchors | No documented JSON API endpoint, method, request body or response schema exposed in HTML snapshot |
| Citizen Service Portal | Angular runtime/main/scripts files; React-style bundle `/static/js/main.27e3f4f8.js`; jQuery; CDAC/GIST transliteration scripts; Bootstrap and icon CSS | 0 | 27 buttons; 1 select; 17 anchors | No documented JSON API endpoint, method, request body or response schema exposed in HTML snapshot |

The page includes asset URLs and user-facing links; those are not equivalent to backend API endpoints. The static HTML does not expose the runtime click handlers in the bundles.

## Public URL destinations are not automatically APIs

Examples:

- `/home/forms`
- `/download-eroll`
- `/home/ngsp/`
- `/electoral-search` external site
- `https://encore.eci.gov.in/`
- `https://suvidha.eci.gov.in/`
- `https://cvigil.eci.gov.in/`

These are public web routes or application URLs, not proven REST endpoints. Do not label them as API endpoints.

## Verified API endpoint catalogue

**No ECI backend API endpoint (HTTP method + endpoint path + request schema + response schema) was verified from the two supplied HTML files or public pages in this pass.** This is deliberate: fabricating endpoint patterns would be misleading and could cause ECIWeb to depend on unsupported private services.

| API capability | Endpoint | Method | Request / response schema | Status |
|---|---|---|---|---|
| Login / OTP | Not captured | Unknown | Not captured | U — capture authorized browser Network traffic |
| Submit Form 6 / 6A / 7 / 8 | Not captured | Unknown | Not captured | U |
| Track application | Not captured | Unknown | Not captured | U |
| Book BLO call | Not captured | Unknown | Not captured | U |
| Submit / track NGSP complaint | Not captured | Unknown | Not captured | U |
| Download e-EPIC | Not captured | Unknown | Not captured | U |
| Download electoral roll | Public UI route known; backend API not captured | Unknown | Not captured | U |
| cVIGIL citizen complaint | App backend not captured | Unknown | Not captured | U |
| cVIGIL DCC assignment | Official portal API not captured | Unknown | Not captured | U |
| Suvidha nomination / permission | Portal backend not captured | Unknown | Not captured | U |
| ENCORE review / counting / turnout | Official backend not captured | Unknown | Not captured | U |

## How to capture exact API requests (authorized account only)

1. Open the official portal in a normal browser session using an account you are authorized to use.
2. Press `F12` → Network → Fetch/XHR. Enable `Preserve log` and disable cache while DevTools is open.
3. Clear the Network list. Perform one action only (for example, open Form 6, save a draft, submit a test application, track a test record).
4. For each request record: timestamp, method, URL, status, content type, request headers (redacted), query parameters (redacted), request body schema with sample values replaced, response schema with personal data removed, initiator and timing.
5. Save a HAR **with sensitive data removed**. Never share a HAR with cookies, bearer tokens, OTPs, passwords, EPIC numbers, Aadhaar, phone numbers, addresses or real applicant records.
6. Repeat for each distinct interaction and role. Export a screenshot of the resulting UI state and attach it to the same test-case ID.
7. Compare the request against the UI: required/optional fields, validation errors, server-generated ID, status transition and notifications.

## Suggested API inventory schema for ECIWeb research

```yaml
id: voters.form6.submit
source_system: citizen-service-portal
screen: new-voter-registration
role: citizen
method: POST
url: /api/v1/voter-applications
content_type: application/json
request_schema:
  fields:
    - name: application_type
      type: string
      required: true
      example: FORM_6
    - name: applicant_details
      type: object
      required: true
    - name: documents
      type: array
      required: false
response_schema:
  fields:
    - name: application_id
      type: string
    - name: status
      type: string
    - name: submitted_at
      type: datetime
observed_in_network: false
notes: Proposed ECIWeb contract; not an ECI endpoint.
```

**Important:** the example above is an ECIWeb design sketch, not a live ECI API contract.
