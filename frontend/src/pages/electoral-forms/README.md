# Additional ECI electoral application pages

This folder contains matching React application pages for:

- **Form 2** — service-voter application for a member of the Armed Forces.
- **Form 2A** — service-voter application for a member of a State Armed Police Force serving outside that State.
- **Form 3** — service-voter application for a person employed under the Government of India in a post outside India.
- **Form 6A** — inclusion of an overseas elector in the Indian electoral roll.
- **Form 6B** — voluntary Aadhaar information for electoral-roll authentication, or one of the prescribed alternative documents when the elector does not have Aadhaar.
- **Form 7** — objection to a proposed inclusion, deletion of another elector's existing entry, or self-deletion.
- **Form 8** — shifting of residence, correction of up to four particulars, replacement EPIC, or PwD marking.

The Form 2A implemented here is the **service-voter Form 2A**. ECI also uses the number “Form 2A” for a separate Lok Sabha nomination paper; that is not the form in this voter-services package.

## Install in the React project

Copy this folder to:

```text
src/pages/electoral-forms/
```

The components expect the existing Axios instance at `src/api/axios.js` (the same client used by your current Form 6 page) and reuse the `.f6-*`, `.portal-*`, `.crumb-line` and `.eyebrow` styles already present in your Form 6 stylesheet.

Add routes to the file where your existing React Router routes are declared:

```jsx
import ElectoralFormsIndex from "./pages/electoral-forms/ElectoralFormsIndex";
import Form2 from "./pages/electoral-forms/Form2";
import Form2A from "./pages/electoral-forms/Form2A";
import Form3 from "./pages/electoral-forms/Form3";
import Form6A from "./pages/electoral-forms/Form6A";
import Form6B from "./pages/electoral-forms/Form6B";
import Form7 from "./pages/electoral-forms/Form7";
import Form8 from "./pages/electoral-forms/Form8";

// Inside <Routes>:
<Route path="/voters/forms" element={<ElectoralFormsIndex />} />
<Route path="/voters/forms/form-2" element={<Form2 />} />
<Route path="/voters/forms/form-2a" element={<Form2A />} />
<Route path="/voters/forms/form-3" element={<Form3 />} />
<Route path="/voters/forms/form-6a" element={<Form6A />} />
<Route path="/voters/forms/form-6b" element={<Form6B />} />
<Route path="/voters/forms/form-7" element={<Form7 />} />
<Route path="/voters/forms/form-8" element={<Form8 />} />
```

Add a link from the voter services dashboard to `/voters/forms`.

## Backend contract — required before live submission

The pages submit to the following endpoints through the existing Axios client:

```text
POST /api/v1/elector-forms/form-2
POST /api/v1/elector-forms/form-2a
POST /api/v1/elector-forms/form-3
POST /api/v1/elector-forms/form-6a
POST /api/v1/elector-forms/form-6b
POST /api/v1/elector-forms/form-7
POST /api/v1/elector-forms/form-8
```

The request body is:

```json
{
  "formCode": "FORM_6A",
  "application": { "...": "controlled field values" },
  "documents": {
    "photo": {
      "dataUrl": "data:image/jpeg;base64,...",
      "fileName": "photo.jpg",
      "mimeType": "image/jpeg"
    }
  }
}
```

`documents` contains only files selected by the applicant. Each document is sent as a data URL so this matches the shape already used by your Form 6 implementation. The server must decode, validate and store these files safely; do not trust client MIME types or client-side field validation.

**These endpoints are not present in the code you supplied.** Add the Express router, server-side schemas, persistence models, file-size/type checks, authentication/authorization and application-status workflow before enabling production submissions. Do not route these to `/auth/register`; that endpoint is specifically used by the current Form 6 registration flow.

For Forms 2, 2A and 3, the real-world process includes verification by the relevant Record Office / Commandant / Head of Office before forwarding to the Electoral Registration Officer. The backend should model that approval/forwarding step rather than treating the form as a direct ordinary-elector application.

## Form-specific safeguards and source alignment

- **Form 6B:** Aadhaar is not presented as a condition for keeping an elector's name in the roll. The page offers the eleven alternative documents printed in ECI's Form 6B when the elector does not have an Aadhaar number. An elector who does not wish to submit Aadhaar need not be pressured to do so. The page's checkbox is an application confirmation, not a UIDAI authentication or an electronic signature.
- **Form 7:** The page captures the addressee constituency type, number and name as well as the applicant's own elector details. The three request types and reason lists are kept separate. Self-deletion does not offer the death / under-age / absent reasons that appear for deletion of another person's name or objection to a proposed inclusion. Death-certificate upload appears only for the death reason; the page captures the official Yes / No response.
- **Form 7 accessibility:** The explanatory text preserves the official instruction about signature / left-thumb impression, including the specified legal-guardian case. The current prototype does not capture or verify a physical signature or thumb impression.
- **Privacy:** Treat Aadhaar and EPIC values as sensitive data. The client-side masking on review is not encryption. The backend must use TLS, strict access control, careful retention rules, encryption at rest where appropriate, and must never log raw Aadhaar values or document data URLs.

Official ECI references used for these page fields:

- [Form 6B – official PDF](https://voters.eci.gov.in/formspdf/Form_6B_English.pdf)
- [Form 7 – official PDF](https://voters.eci.gov.in/formspdf/Form_7_English.pdf)
- [ECI explanation: Aadhaar submission is voluntary](https://www.eci.gov.in/mythvsreality/details)

## Implementation notes

- All form inputs are controlled React state; no application data is written to `localStorage`.
- The user can move between stages and review the entered values before submission.
- Aadhaar and passport numbers are masked on the review screen.
- Service-voter personal/service sections vary by form number; they are not treated as identical copies.
- Form 8's correction selector enforces the official maximum of four corrections in one request.
- Conditional fields are shown only for the selected request type / declaration.
- File upload limits are enforced in the browser for usability only. The backend must independently enforce limits and inspect file contents.
