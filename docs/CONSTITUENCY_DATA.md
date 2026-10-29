# Assembly Constituency data (Form 6)

The State/UT → District → Assembly Constituency dropdowns on the Form 6 page, and the backend
checks behind them, use the Election Commission of India's own master lists. All 36 States/UTs are
covered: 787 districts, **4,123 assembly constituencies** (every Legislative Assembly at its full
statutory strength), plus the Parliamentary Constituency used by each of the 5 UTs without an
assembly (6 seats, because Dadra & Nagar Haveli and Daman & Diu has two).

Retrieved 29 October 2026.

## Sources

| Source | What it gave | Where it is kept |
| --- | --- | --- |
| ECI Voters' Services Portal lookup service, `https://gateway-voters.eci.gov.in/api/v1/common/` (`states/`, `districts/{stateCd}`, `acs/{districtCd}`), used by [electoralsearch.eci.gov.in](https://electoralsearch.eci.gov.in/) | Primary list: every State/UT, district and constituency with its official number, the district ECI files it under, and its Parliamentary Constituency number and name. 824 requests, no errors. | `backend/src/data/sources/eci-constituencies-live.json` |
| The same portal's application bundle, `https://electoralsearch.eci.gov.in/static/js/main.aac590f9.js` | Cross-check, plus each seat's reservation category (GEN / SC / ST), which the lookup service does not return | `backend/src/data/sources/eci-portal-bundle.json` |

Both are ECI publications. No Wikipedia, third-party or GitHub data was used. The previous dataset
(Local Government Directory, via a GitHub mirror) is no longer used.

### Source inventory, by State/UT

Every State/UT comes from the same ECI service: `https://gateway-voters.eci.gov.in/api/v1/common/districts/<code>`
for its districts, then `.../acs/<district code>` for each district's constituencies.
"Official seat count" compares the number of seats with the statutory strength of that Legislative Assembly.

| State / UT | ECI code | Seats | Districts | Official seat count matches | Source (ECI lookup service) |
| --- | --- | --- | --- | --- | --- |
| Andaman & Nicobar Islands | U01 | 1 | 3 | Parliamentary constituency (no assembly) | `districts/U01` then `acs/{districtCd}` |
| Andhra Pradesh | S01 | 175 | 28 | Yes | `districts/S01` then `acs/{districtCd}` |
| Arunachal Pradesh | S02 | 60 | 26 | Yes | `districts/S02` then `acs/{districtCd}` |
| Assam | S03 | 126 | 35 | Yes | `districts/S03` then `acs/{districtCd}` |
| Bihar | S04 | 243 | 38 | Yes | `districts/S04` then `acs/{districtCd}` |
| Chandigarh | U02 | 1 | 1 | Parliamentary constituency (no assembly) | `districts/U02` then `acs/{districtCd}` |
| Chhattisgarh | S26 | 90 | 33 | Yes | `districts/S26` then `acs/{districtCd}` |
| Dadra & Nagar Haveli and Daman & Diu | U03 | 2 | 3 | Parliamentary constituency (no assembly) | `districts/U03` then `acs/{districtCd}` |
| Goa | S05 | 40 | 3 | Yes | `districts/S05` then `acs/{districtCd}` |
| Gujarat | S06 | 182 | 34 | Yes | `districts/S06` then `acs/{districtCd}` |
| Haryana | S07 | 90 | 22 | Yes | `districts/S07` then `acs/{districtCd}` |
| Himachal Pradesh | S08 | 68 | 12 | Yes | `districts/S08` then `acs/{districtCd}` |
| Jammu and Kashmir | U08 | 90 | 20 | Yes | `districts/U08` then `acs/{districtCd}` |
| Jharkhand | S27 | 81 | 24 | Yes | `districts/S27` then `acs/{districtCd}` |
| Karnataka | S10 | 224 | 34 | Yes | `districts/S10` then `acs/{districtCd}` |
| Kerala | S11 | 140 | 14 | Yes | `districts/S11` then `acs/{districtCd}` |
| Ladakh | U09 | 1 | 2 | Parliamentary constituency (no assembly) | `districts/U09` then `acs/{districtCd}` |
| Lakshadweep | U06 | 1 | 1 | Parliamentary constituency (no assembly) | `districts/U06` then `acs/{districtCd}` |
| Madhya Pradesh | S12 | 230 | 55 | Yes | `districts/S12` then `acs/{districtCd}` |
| Maharashtra | S13 | 288 | 36 | Yes | `districts/S13` then `acs/{districtCd}` |
| Manipur | S14 | 60 | 16 | Yes | `districts/S14` then `acs/{districtCd}` |
| Meghalaya | S15 | 60 | 12 | Yes | `districts/S15` then `acs/{districtCd}` |
| Mizoram | S16 | 40 | 11 | Yes | `districts/S16` then `acs/{districtCd}` |
| Nagaland | S17 | 60 | 17 | Yes | `districts/S17` then `acs/{districtCd}` |
| NCT OF Delhi | U05 | 70 | 13 | Yes | `districts/U05` then `acs/{districtCd}` |
| Odisha | S18 | 147 | 31 | Yes | `districts/S18` then `acs/{districtCd}` |
| Puducherry | U07 | 30 | 2 | Yes | `districts/U07` then `acs/{districtCd}` |
| Punjab | S19 | 117 | 23 | Yes | `districts/S19` then `acs/{districtCd}` |
| Rajasthan | S20 | 200 | 41 | Yes | `districts/S20` then `acs/{districtCd}` |
| Sikkim | S21 | 32 | 6 | Yes | `districts/S21` then `acs/{districtCd}` |
| Tamil Nadu | S22 | 234 | 38 | Yes | `districts/S22` then `acs/{districtCd}` |
| Telangana | S29 | 119 | 33 | Yes | `districts/S29` then `acs/{districtCd}` |
| Tripura | S23 | 60 | 8 | Yes | `districts/S23` then `acs/{districtCd}` |
| Uttar Pradesh | S24 | 403 | 75 | Yes | `districts/S24` then `acs/{districtCd}` |
| Uttarakhand | S28 | 70 | 13 | Yes | `districts/S28` then `acs/{districtCd}` |
| West Bengal | S25 | 294 | 24 | Yes | `districts/S25` then `acs/{districtCd}` |

## Checks made

- **Totals:** every one of the 31 Legislative Assemblies matches its statutory strength. The national total is 4,123. Numbers in each State/UT run 1…N with no gaps or duplicates (tested in `backend/tests/registration.test.js`).
- **Live list vs. bundle:** no name or number differs. The bundle lacks Arunachal Pradesh seats 51–60 (Tirap, Longding and Changlang districts), which the live service has. The live list is used.
- **Spellings:** constituency and district names are kept exactly as ECI writes them, including capital letters and "(SC)"/"(ST)" suffixes where ECI adds them (for example "18 – DHARAMSHALA", "62 – Dadri"). One State name differs between the two ECI lists ("Chattisgarh" in the service, "Chhattisgarh" in the bundle); the bundle's spelling is used.
- **Same names:** some constituencies share a name within a State (for example Gujarat has 2 – Mandvi in Kachchh and 157 – Mandvi in Surat). They are told apart by number; the identifier is `<ECI state code>-<number>`, for example `S06-2` and `S06-157`.
- **Against the previous Local Government Directory data:** 3,554 of 3,822 comparable names are spelled identically. The rest are spelling variants. LGD was also missing Delhi, Jammu & Kashmir and Assam, and was several seats short in other States.

## How the three fields connect

- **State/UT → District:** the districts are ECI's electoral districts for that State/UT (787). Their names can differ from administrative district names, for example Delhi has "West", "South East".
- **District → Constituency:** each constituency appears under the district ECI files it under.
- **Districts with no seat:** ECI lists no seat under four districts: Andaman & Nicobar Islands / NICOBAR and NORTH AND MIDDLE ANDAMAN, Dadra & Nagar Haveli and Daman & Diu / DIU, Ladakh / KARGIL. For these the form offers the whole State/UT list and says so (`acScope: "state"`). Nothing is inferred from names.
- **UTs without an assembly:** Andaman & Nicobar Islands, Chandigarh, Dadra & Nagar Haveli and Daman & Diu, Ladakh and Lakshadweep. Form 6 asks for the Parliamentary Constituency there, so the field is labelled "Parliamentary constituency" and offers ECI's entry.

## Dataset and code

- `backend/src/data/geography.json`: generated, never edited by hand. Per State: `name`, `code` (ECI state code), `type`, `constituencyType` (`assembly` / `parliamentary`), `totalConstituencies`, `districts[]`. Per district: `name`, `code` (ECI district code), `acScope`, `acs[]` (`id`, `no`, `name`, `category`, `pcNo`, `pcName`) and `constituencies[]` (the names only, kept for Form 8 and the older request format). `pcName` is ECI's own value; for some States it is in the local script (for example कांगड़ा).
- `backend/src/data/geography.js`: `resolveConstituency()` checks an identifier against the chosen State/UT and district and returns ECI's number and name. `validateGeography()` is the name-based check, kept for Form 8 and older requests.
- `GET /api/v1/auth/geography`: same endpoint, same shape, with the new fields added. It is about 550 KB uncompressed and the browser caches it for a day.

### What is stored for a Form 6 application

The page sends `address.assemblyConstituencyId`, for example `U05-31`. It never sends the label.
The server rejects an identifier that is missing, made up, from another State/UT or not offered for the chosen district. It then stores:

- `form6.address.constituency = { id, no, name, type, category, pcNo, pcName }`
- `form6.address.stateCode`, `form6.address.districtCode`
- the existing flat field `assemblyConstituency` = ECI's name, so the BLO list, approval and the electoral-roll record work unchanged

Older applications keep their saved names and still load.

## Updating the data

1. In a browser, open https://electoralsearch.eci.gov.in/.
2. In the browser console, paste and run `backend/scripts/eci-export-console.js`. It calls `states/`, then `districts/<state>`, then `acs/<district>`, and downloads `eci-constituencies-live.json`. It takes a few minutes. Keep the existing `eci-portal-bundle.json` for the cross-check and seat categories unless you also refresh it.
3. Replace the two files in `backend/src/data/sources/`. From `backend`, run:
   ```
   node scripts/build-geography-eci.js src/data/sources/eci-constituencies-live.json src/data/sources/eci-portal-bundle.json
   ```
   It prints the totals, the districts with no seat, and the cross-check result.
4. Run the tests (`npm test` with `TEST_REDIS_URL` set) and restart the backend.

No database migration is needed. Redis stores each application as a JSON document.

## Limitations

- The lists come from ECI's public lookup service and the portal's own bundle, not from a signed publication. I didn't compare them seat by seat against each State's CEO website or the Delimitation Orders.
- Ten Arunachal Pradesh seats (51–60) come only from the live service; the bundle doesn't have them. Their reservation category is therefore empty.
- District names are ECI's electoral districts. They may not match the administrative district a person knows (for example Delhi's 13 districts).
- The Electoral Roll search page (`ElectoralRoll.jsx`) has its own fixed list of 4 States whose names are not taken from this dataset. "Delhi" there will not match new records saved as "NCT OF Delhi". That page was not changed.
- Seeded demo voters (`seed.js`) still use the old names (for example "Muktsar"), so their Form 8 corrections must re-pick the district, as before.
