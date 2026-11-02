# Data protection

Applicable law in India: the Digital Personal Data Protection Act, 2023 (DPDP Act), together with the election laws that require certain roll data to be published (Representation of the People Act, 1950; Registration of Electors Rules, 1960). ECIWEB holds **synthetic data only**; this document describes how real data would be handled.

## Principles applied in the code

| Principle | How |
| --- | --- |
| Purpose limitation | Each record type is used only for its workflow. Prospects from data sources are used only for a BLO to make contact; they never become electors without a Form 6. |
| Data minimisation | The public roll search returns no address or date of birth. The public candidate list has no EPIC or date of birth. Station packages carry no dates of birth, addresses or contact details. Live events carry counts, not names. VAB QR codes hold an opaque reference. The national ECI elector listing shows age, not date of birth. |
| Aadhaar | Optional on Form 6. Encrypted with AES-256-GCM when `AADHAAR_ENCRYPTION_KEY` is set; otherwise only the last four digits are kept. It is never shown in full after submission. |
| Storage limitation | Form 6 documents are deleted after the decision. VAB slips, OTP and step-up codes, sync results, idempotency keys and training runs expire. |
| Accuracy | Applicants answer information requests themselves; corrections go through Form 8. |
| Security | See [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md). |
| Accountability | Every access-relevant change is audited with a hash. Decisions record who, in what role, and why. |

## Who sees personal data

| Data | Seen by |
| --- | --- |
| A Form 6 or Form 8 with documents | BLO of the part, ERO/AERO of the constituency, supervisors within their jurisdiction |
| An elector's full record | The elector; officials whose jurisdiction covers the part |
| The part's electors on poll day | The station's polling party (in the package and in search) |
| Who voted | The station's register, visible to the presiding officer. Never in events, the control room or public pages. |

## Rights of the data principal

A voter can see their own record and requests, correct their details (Form 8), and answer information requests. Deletion of a roll entry follows the statutory process (Form 7, not implemented; see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)), not an application-level delete.

## Before using real data

- A data protection impact assessment.
- A lawful basis for each source and purpose.
- A retention schedule per record type.
- Breach notification procedures under the DPDP Act.
- A review of the optional Gemini document check: it sends applicant documents to an outside service and must be off or approved.
- Moving secrets to a managed secrets store.
