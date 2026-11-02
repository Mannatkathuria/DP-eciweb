# Threat model

Method: STRIDE over the main assets. Status: ✅ mitigated in code · 🟡 partly · ⛔ needs something outside the project.

## Assets

The electoral roll; applications and their documents; who has voted (the register); poll status, turnout and incidents; counting records and results; assignments (who holds authority where); the audit trail; station packages on devices.

## Actors

Anonymous internet users; voters; officials acting beyond their jurisdiction; a compromised official account; a lost or stolen polling-station device; candidates and agents; an insider with database access.

## Threats

| # | Threat | STRIDE | Mitigation | Status |
| --- | --- | --- | --- | --- |
| T1 | Someone registers voters in bulk or adds names without verification | Tampering | No automatic registration. Form 6 needs a BLO field report and an ERO/AERO decision with step-up. The duplicate guard stops repeated submissions. | ✅ |
| T2 | An official acts outside their area | Elevation | Jurisdiction check in every handler. Station context comes from the caller's assignment. Validity windows and election scoping apply. | ✅ |
| T3 | A stolen session approves applications | Spoofing | Step-up code for every approval. Suspension takes effect immediately. | 🟡 (session is 8 h and stored in `localStorage`; S4) |
| T4 | Sign-in codes intercepted or unavailable | Spoofing / DoS | Codes are short-lived and rate-limited. | ⛔ no SMS gateway; codes in process memory (S3) |
| T5 | Cross-site request forgery with the session cookie | Tampering | Anti-forgery header required for cookie-only sessions; CORS allow-list. | ✅ |
| T6 | Personal data leaked through public pages or live events | Disclosure | Minimised public views. Events carry counts only. Opaque QR codes. | ✅ |
| T7 | A lost device exposes the roll of its part | Disclosure | Only one part per device. The package is encrypted to the device, expires after poll day, and the device can be revoked. | 🟡 (key stored on the same device) |
| T8 | A forged or altered station package | Tampering | Ed25519 signature and ciphertext hash checked before saving. | ✅ |
| T9 | Offline records replayed or duplicated | Tampering | Idempotency key per record; repeats get the first answer. One vote per elector per election, enforced server-side. | ✅ |
| T10 | Offline records overwrite the register | Tampering | Conflicts are stored for the presiding officer; nothing is merged automatically. | ✅ |
| T11 | Fake heartbeats make a station look online | Spoofing | A heartbeat needs a session from the station's polling party and the device secret. | ✅ |
| T12 | An unofficial result is shown as official | Tampering / repudiation | Results come only from a registered source. Mock data is labelled everywhere. No vote figures are entered in counting. | ✅ |
| T13 | Counting staff allocation or VVPAT draw manipulated | Tampering | Random seed recorded and the draw is re-derivable. The draw happens once and its witnesses are recorded. | ✅ |
| T14 | Audit records edited by someone with database access | Tampering / repudiation | Hash per event and an event counter, checked by the integrity endpoint. | 🟡 (the hashes are not chained or anchored externally, so a full rewrite by a database administrator is possible) |
| T15 | Brute force on sign-in or public lookups | DoS | Rate limits per IP. | 🟡 (limits are per instance) |
| T16 | Live feed shows another area's events | Disclosure | Each event is filtered against the socket's assignments, which are reloaded every minute. | ✅ |
| T17 | Training actions change live records | Tampering | Scenarios and modules write only to training keys. The training mode label appears on every response. | ✅ |
| T18 | An AI assistant makes a statutory decision | Elevation | The procedure library only retrieves sourced, versioned text. Gemini review is advisory. Every decision requires the authorised official. | ✅ |
| T19 | Malicious file upload | Tampering | Magic-byte and size checks; documents are never served as HTML. | ✅ |
| T20 | Denial of service during poll day | DoS | Offline mode keeps stations working. Screens fall back from sockets to polling. | 🟡 (no CDN or WAF configured in the prototype) |

## Open items

S3 (OTP delivery), S4 (session lifetime and storage), T7 (device key storage), T14 (external anchoring of the audit hash chain), T15 (shared rate limits). These are tracked in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).
