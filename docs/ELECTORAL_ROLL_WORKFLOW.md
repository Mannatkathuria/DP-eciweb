# Electoral roll workflow

The roll changes only through applications decided by the Electoral Registration Officer (ERO) or an Assistant ERO (AERO) of the constituency, after a Booth Level Officer (BLO) has verified them in the field. ECIWEB never adds, moves or removes an elector by itself.

Legal basis (summarised; see [ROLE_AND_AUTHORITY_RESEARCH.md](ROLE_AND_AUTHORITY_RESEARCH.md)): Representation of the People Act, 1950 (sections 13A–13B on the ERO and AERO, 14 qualifying dates, 22–23 corrections and inclusions) and the Registration of Electors Rules, 1960 (Forms 6 and 8).

## Form 6: new elector

```text
applicant ──submit──► pending ──BLO field report──► field_verified ──ERO/AERO──► approved  (elector created, EPIC allocated, serial number given)
                         ▲   │                           │   │                └──► rejected (reason shown to the applicant)
                         │   └── ERO/AERO: ask for information ─► information_required ── applicant answers ─┘ (back to the step it came from)
                         └────── ERO/AERO: send back to the BLO (re-verification; earlier report kept) ◄──┘
```

| Step | Who | Endpoint | Rules |
| --- | --- | --- | --- |
| Submit | Applicant (public) | `POST /auth/register` | Full Form 6 fields and documents; Aadhaar stored encrypted when a key is configured, otherwise only the last four digits; duplicate guard on name, date of birth, PIN and address; automatic document sanity review (rule engine, Gemini optional) is advisory only. |
| Track | Applicant | `GET /auth/register/:id` | Reference ID; timeline of steps without officers' names or internal notes. |
| Field verification | BLO of that part | `POST /admin/registrations/:id/field-verification` | Visit result, recommendation, booth assignment. |
| Ask for information | ERO/AERO | `POST /admin/registrations/:id/request-information` | Note shown to the applicant; status `information_required`. |
| Answer | Applicant | `POST /auth/register/:id/information` | Must give the date of birth on the application. |
| Re-verify | ERO/AERO | `POST /admin/registrations/:id/request-reverification` | Back to `pending`; the earlier report is kept under `previousVerifications`. |
| Approve / reject | ERO/AERO, step-up | `POST /admin/registrations/:id/approve` · `/reject` | Approval creates the elector with an EPIC claimed atomically and the next serial number in the part; rejection needs a reason. Uploaded documents are deleted after the decision. |

## Form 8: corrections, shifting, replacement EPIC, marking as a person with disability

A signed-in voter files a request (`POST /changes`). It belongs to the area the elector will be in **after** the change, so a shift of residence is verified by the BLO and decided by the ERO of the new constituency. The steps, follow-up states and endpoints mirror Form 6 under `/admin/changes/:id/...` and `/changes/:id/information`. A shift to another part gets a new serial number in that part.

## Roll versions

The ERO (`roll:publish`, step-up) publishes a version of the roll of a constituency (`POST /roll-versions`). Each version stores counts, a summary of changes since the previous version, its own SHA-256 hash and the previous version's hash, so a gap or alteration in the chain is visible. Publishing emits `ELECTORAL_ROLL_UPDATED`.

## Who sees what

- Public roll search returns name, relative, part and station, never the address or date of birth.
- A voter sees their own record and requests.
- BLOs see applications in their part; ERO/AERO in their constituency; DEO and CEO read within their district or State.

## Screens

Voter: `/register`, `/check-request`, `/dashboard`. BLO: `/admin`. ERO/AERO: `/ero`. Roll search: `/electoral-roll`.
