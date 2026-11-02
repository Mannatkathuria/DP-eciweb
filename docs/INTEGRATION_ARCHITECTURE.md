# Integration architecture

ECIWEB talks to the outside world only through registered, audited adapters. No adapter scrapes a website, bypasses authentication or invents responses. The status of each source is in [EXTERNAL_DATA_SOURCES.md](EXTERNAL_DATA_SOURCES.md); every real ECI or government source is **BLOCKED** for lack of authorised access.

## Patterns

| Pattern | Used for | Where |
| --- | --- | --- |
| **Source registry** | Every inbound data source: legal basis, agreement reference, authorised fields, owner, status (active, suspended). Creating or suspending needs step-up and is audited. | `/integrations/sources`, `controllers/integration.controller.js` |
| **Ingestion run with provenance** | Batch imports. Each run records the source, time, counts and rejected rows. Each record keeps its source reference. Imports land in a holding area (prospects), never directly in the roll. | `services/ingestion.service.js` |
| **Result source with append-only entries** | Counting and result data. Types: `official_feed` (none authorised) and `mock` (labelled everywhere). Corrections are new entries with reasons. Publication status is tracked. | `/results/sources`, `controllers/result.controller.js` |
| **Signed webhook** | Persona identity verification. HMAC signature checked; refused when no secret is configured. | `routes/persona.routes.js` |
| **Optional service with fallback** | Gemini document review: a local rule engine runs when no key is set; the AI result is advisory only. | `services/gemini.service.js` |
| **Outbox events** | Internal fan-out to live screens; the same pattern can feed an external message bus. | `services/events.service.js` |

## Adding an authorised integration

1. Obtain the agreement and the interface specification. Record the legal basis, for example the Representation of the People Act, 1950 and the Digital Personal Data Protection Act, 2023.
2. Register the source with the authorised fields only.
3. Write an adapter that:
   - maps the source fields to ECIWEB's records;
   - records provenance on every record;
   - refuses fields that are not authorised.
4. Keep credentials in environment variables or a secrets manager, never in the repository.
5. Test against the real interface in a non-production environment. Only then change the status from BLOCKED.

## Directive items that are BLOCKED

| Item | Reason |
| --- | --- |
| ERONET roll exchange | No agreement or credentials |
| ENCORE nominations, counting and turnout feeds | No authorised API |
| Results website feed | No authorised API; ECIWEB must not scrape it |
| Aadhaar or UIDAI authentication | Needs a UIDAI licence as an authentication user agency |
| SMS gateway for OTP | Needs a DLT-registered sender and a gateway contract |
| Birth, school or other registries for prospective electors | Each needs its own legal basis and agreement |
