# Citizen Service Portal (`voters.eci.gov.in`) audit

**Sources:** supplied Citizen Service Portal HTML snapshot; official portal search-indexed page content; official forms / roll / grievance pages.

## Home page and shell

The supplied HTML title is `Citizen Service Portal`. It includes:

- ECINET and ECI identity/logo references.
- Hindi / citizen portal title content.
- ECINET mobile app download prompts and QR-code areas.
- Language selector (`select[name="translang"]`).
- `Login` and `Sign-Up` buttons.
- Forms section and service-card area.
- SIR 2026 section.
- Election information/results cards, About ECI and Contact Us.
- Contact details shown in public page content: 1950 toll-free, complaints@eci.gov.in, Nirvachan Sadan address.

## Public services found in the current indexed page

| Service | Displayed purpose / known behavior | Destination / detail status |
|---|---|---|
| Download Electoral Roll | Download electoral roll PDF and draft roll for states under SIR | `/download-eroll` is publicly indexed; page shows State, Year of Revision and `Download Selected PDFs` |
| Register Complaint / Share Suggestion | NGSP grievance registration and suggestions | `/home/ngsp/` indexed; includes Register Complaint, Track Status, Share Suggestion and Voter Mitra chatbot |
| Track Application Status | Track form/application status | Home-card feature; click destination not in static snapshot |
| Book a Call with BLO | Book a call request with BLO | Home-card feature; click destination not in static snapshot |
| Submit Appeal | Appeal workflow | Home-card feature; exact subroute / fields not observed |
| Track Appeal | Track appeals, including individual appeals under adjudication | Home-card feature; exact subroute / fields not observed |
| E-EPIC Download | Get digital version of EPIC | Home-card feature; interaction not captured |
| Search Your Name in Voter List | Search voter entry and learn polling details / MP / MLA | Linked search service; exact interaction is on Electoral Search |
| FAQs | Frequently asked questions | Visible in indexed page; full FAQ inventory not captured |
| Elections | Current, future and past election / candidate information | `View Information` button; destination not in supplied static HTML |
| Election results | Current or past results and statistical report | `View Results` / `View Report` buttons; results portal linked at `results.eci.gov.in` |

## Forms and SIR 2026 block [HTML — supplied]

### SIR 2026 actions

- `Search Your Name in Last SIR`
- `Submit Document Against Notice issued`
- Current portal index also displays `Fill Enumeration Form` in the SIR section.

The HTML snapshot does not expose those buttons' click destinations. A public route to search last SIR is present in the ECI homepage snapshot as `https://voters.eci.gov.in/searchInSIR/S2UA4DPDF-JK4QWODSE`; treat that opaque path as an observed example, not a stable route template.

### New Voter Registration — Form 6

Portal description: fill Form 6 if the applicant is 18 or will turn 18 in the qualifying period. Actions in snapshot:

- Fill Form 6
- Fill Declaration Form
- Download statutory Form 6
- Guidelines
- Download Declaration Form for Pre-Draft Forms

### New Voter Registration (NRI) — Form 6A

Portal description: Form 6A is for an Indian citizen who has not acquired citizenship of another country. Actions:

- Fill Form 6A
- Download statutory Form 6A
- Guidelines

### Deletion — Form 7

Portal description: fill Form 7 to request deletion of a name from the existing electoral roll. Actions:

- Fill Form 7
- Fill Form 7 Overseas
- Download statutory Form 7
- Guidelines

### Correction / shifting / replacement / PwD marking — Form 8

Official ECI homepage and Form dashboard describe Form 8 as covering shifting, correction, replacement of EPIC and marking PwD. Supplied page controls:

- Fill Form 8
- Fill Form 8 Overseas (Self Correction Only)
- Download statutory Form 8
- Guidelines
- Fill Declaration Form
- Download Declaration Form for Pre-Draft Forms

### Additional service-voter forms visible in supplied HTML

- Form M — described for migrant electors of Kashmir who want to cast a vote at a special polling station of Delhi, Jammu and Udhampur.
- Form 12C — described for migrant electors of Kashmir who want to vote through postal ballot.
- Download controls for both forms.

The complete statutory eligibility, required documents and adjudication rules must be based on the current ECI form instructions and applicable law, not inferred from these labels.

## Forms dashboard route

The official indexed Forms Dashboard exposes Form 6, Form 6A, Form 7 and Form 8, then an assistant asking `Do you have an EPIC/Voter ID Card Number?` with Yes/No buttons. It presents choices including Aadhaar number submission, shifting between / within Assembly Constituencies, correction of particulars, EPIC replacement, PwD marking, and deletion/objection. This is extra public evidence beyond the supplied home snapshot. See [Forms dashboard](https://voters.eci.gov.in/home/forms).

## NGSP / grievance dashboard

The NGSP page is indexed with:

- `Register Complaint`
- `Track Status`
- `Share Suggestion`
- Voter Mitra chatbot assistance to register or track complaints.
- Frequently asked questions.

Do not assume the exact complaint form schema or status values from this summary; record them from a live authorized flow.

## HTML structure / asset observations

- **17 anchors**, **27 buttons**, and **one select** were found in the supplied HTML.
- **No HTML `<form>` element** was present in the captured markup.
- Script references include Angular runtime files (`/angular/main.js`, `/angular/polyfills.js`, `/angular/runtime.js`, `/angular/scripts.js`) and a React-style bundle (`/static/js/main.27e3f4f8.js`).
- Legacy jQuery and CDAC/GIST transliteration / typing libraries are also referenced, consistent with support for Indian-language input.
- Stylesheet references include Bootstrap, Font Awesome, GIST font / keyboard styling and a main app stylesheet.

The framework names above are inferred from asset naming; they do not reveal original components or API contracts.

## Important unknowns

- Route/action after Login and Sign-Up.
- OTP method, challenge and session lifecycle.
- Exact form field schemas, validation, attachment rules, draft/save behavior and submit confirmation.
- Status codes / status transition names for applications and appeals.
- BLO callback scheduling fields, availability rules and notification method.
- e-EPIC identity verification and download eligibility checks.
- All private API endpoints and payload schemas.
