# External data sources

Every external source goes through the **data source registry** (`/api/v1/integrations/sources`) and, for results, the **result source registry** (`/api/v1/results/sources`). A real source cannot be activated without a legal basis and an agreement reference. Creating or suspending a source needs a step-up confirmation and is audited.

Status key: **BLOCKED** = the adapter and a mock exist, but no authorised access, credential or agreement is available. **SYNTHETIC** = invented data, labelled as such.

| Source | Data | Adapter in ECIWEB | Status | What is missing |
| --- | --- | --- | --- | --- |
| ERONET / roll data from the ERO | Electors, roll revisions | Ingestion run interface (`ingestion.service.js`) | **BLOCKED** | Written agreement with ECI or the CEO; legal basis under RPA 1950 and the DPDP Act; data specification; credentials |
| Births, school enrolment, other registries for prospective electors | Name, date of birth, address of people about to turn 18 | Data source registry and ingestion runs with provenance | **SYNTHETIC** (seeded feed); real sources **BLOCKED** | Legal basis for each registry, purpose limitation, consent and retention rules, agreement |
| ENCORE nominations and contesting list | Nominations, scrutiny results, Form 7A | None beyond ECIWEB's own nomination records | **BLOCKED** | Agreement and interface specification |
| ENCORE / results portal counting data | Round-wise and final results | `official_feed` result source type (append-only entries, corrections with reasons, publication status) | **BLOCKED** | Authorised feed, credentials, data format; the `mock` type is used meanwhile and labelled on every view |
| ENCORE turnout | Two-hourly turnout per constituency | Turnout is computed from ECIWEB's own poll-day register and labelled approximate | **BLOCKED** for the official figure | Feed agreement |
| Polling station master list | Stations, parts, locations | Station import (up to 500 per call, DEO proposes, ECI approves) | **SYNTHETIC** seeds; real import possible from an authorised file | Authorised file from the CEO/DEO |
| Constituency boundaries and lists | States, districts, ACs, PCs | Static dataset in `backend/src/data/` from ECI's published list (see [CONSTITUENCY_DATA.md](CONSTITUENCY_DATA.md)) | Published data, static | A managed update process; boundary geometry for geographic search |
| Persona (identity verification) | Inquiry status | `persona.routes.js`, signed webhook | Works with a sandbox key; **demo mode** labels results "simulated" | Production contract and key |
| SMS gateway (OTP delivery) | OTP messages | None; codes are printed to the log | **BLOCKED** | DLT-registered sender and gateway contract; see S3 in [PROJECT_AUDIT.md](PROJECT_AUDIT.md) |
| Google Gemini (document review) | AI review text | `gemini.service.js`, rule engine fallback | Optional; works with a key | Data-protection review before sending applicant documents to an outside service |

## Rules for adding a source

1. Register it with the legal basis, agreement reference, authorised fields and contact.
2. Build or reuse an adapter that records provenance (source, run, time, counts, rejections) on every record.
3. Test it against the authorised source, not a copy. Until then its status stays BLOCKED.
4. Never scrape, bypass authentication, or fabricate responses.
