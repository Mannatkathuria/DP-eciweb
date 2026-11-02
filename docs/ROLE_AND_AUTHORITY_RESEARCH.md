# Role and authority research

**Purpose.** Every permission in `backend/src/config/roles.js` must trace to a source, or be marked as needing confirmation by ECI or legal counsel. This document is that trace. It distinguishes five kinds of authority:

- **S, statutory:** given directly by an Act or statutory Rules.
- **D, delegated:** exercised on behalf of another officer, under a provision that allows delegation.
- **A, administrative supervision:** oversight given by the statute or by ECI instructions, without deciding individual cases.
- **O, operational:** a task done under instructions (fieldwork, data entry, logistics), with no decision power of its own.
- **T, technical administration:** running the platform. It confers **no** electoral authority.

**Sources and their weight.** Section numbers are from the Representation of the People Act, 1950 (RPA 1950), the Representation of the People Act, 1951 (RPA 1951), the Registration of Electors Rules, 1960 (RER) and the Conduct of Elections Rules, 1961 (CER), as commonly cited in ECI handbooks. These were **not** re-checked against the current official texts while writing, because this environment has no access to the India Code text. Every row marked "confirm" must be checked against the current Act, Rules and ECI handbook before production use. Where ECI instructions (handbooks, circulars) rather than statute are the basis, the row says so.

## 1. Constitutional and national level

| Role | Authority | Kind | Basis | Platform permissions | Confirm |
| --- | --- | --- | --- | --- | --- |
| Election Commission (CEC and Election Commissioners) | Superintendence, direction and control of rolls and elections | S | Constitution Art. 324 | Read-only national views and reports (`national:view`, `report:national`, `audit:read`, `control:view`). Commission decisions are made by the Commission, not by a single account; the platform does not model multi-member decisions yet. | Model of Commission decisions (quorum, majority, Art. 324(2)–(5)) needs ECI input |
| ECI administrator | Runs the platform for ECI | T | Not statutory | Manage elections and schedules on ECI's instruction, approve polling stations on ECI's behalf, assign roles, manage integrations, read audit. **No** roll decisions, scrutiny, result declaration, or personal records beyond what an assignment needs. | Whether station approval should sit with a Commission officer rather than a technical role |

## 2. Electoral roll

| Role | Authority | Kind | Basis | Platform permissions | Confirm |
| --- | --- | --- | --- | --- | --- |
| Chief Electoral Officer (CEO) | Supervises preparation and revision of rolls and conduct of elections in the State, subject to ECI | A | RPA 1950 s.13A; RPA 1951 s.20 (via s.13A) | State-level reports, control room, audit, staff appointment within the State | Scope of "staff:assign" for the CEO |
| District Election Officer (DEO) | Coordinates and supervises roll work in the district, subject to the CEO | A | RPA 1950 s.13AA | District management, polling-station proposals (see RPA 1951 s.25), staff appointment, audit | — |
| Electoral Registration Officer (ERO) | Prepares and revises the roll; decides claims and objections; corrects entries | S | RPA 1950 s.13B, ss.22–23; RER Part II (Forms 6, 7, 8) | Decide Form 6 and Form 8, publish roll versions, assign BLOs, read audit | — |
| Assistant ERO (AERO) | Assists the ERO and may perform the ERO's functions, subject to the ERO's control | D | RPA 1950 s.13C | Decide Form 6 and Form 8 within the constituency; cannot publish the roll or assign BLOs | Whether AERO decisions need an ERO delegation record per constituency (currently implied by assignment) |
| Booth Level Officer (BLO) | Fieldwork: house-to-house verification, receiving forms, reporting to the ERO | O | Appointed under RPA 1950 s.13B(2) as described in ECI BLO handbooks | Review and field-verify applications in their part, recommend; never decide | Exact appointing authority (DEO or ERO) per current ECI instructions |
| BLO supervisor | Supervises a group of BLOs | A (by instruction) | ECI instructions | See BLO assignments, training progress, audit; field reports | Source document for the supervisor role |
| Booth level agent (BLA) | Appointed by a recognised political party per part; assists in roll revision; may file claims and objections in bulk within limits | none over records | ECI instructions on BLAs | Read the draft roll of their part; no write access | Current limits on BLA submissions |

## 3. Election conduct

| Role | Authority | Kind | Basis | Platform permissions | Confirm |
| --- | --- | --- | --- | --- | --- |
| Returning Officer (RO) | Does all acts for the effective conduct of the election in the constituency | S | RPA 1951 s.21, s.24; nominations s.33, scrutiny s.36, list of contesting candidates s.38, declaration s.66 | Scrutinise, publish the contesting list, delegate scrutiny when prevented, arrange polling parties, supervise counting, declare (as a recorded status from the official source) | — |
| Assistant Returning Officer (ARO) | Assists the RO and may perform the RO's functions under the RO's control; **may not scrutinise nominations unless the RO is unavoidably prevented** | D | RPA 1951 s.22(1)–(2) and proviso | Polling arrangements, incidents, counting assistance; scrutiny only under a recorded RO delegation (implemented) | — |
| Sector officer | Supervises a group of polling stations on behalf of the RO; logistics and reporting | O | ECI Handbook for Sector Officers (instructions) | Operational view, visits, incidents | — |
| Sector police officer | Police coordination for a sector | O | Police deployment instructions | Security coordination fields only | Which records police roles may see |

## 4. Polling and counting

| Role | Authority | Kind | Basis | Platform permissions | Confirm |
| --- | --- | --- | --- | --- | --- |
| Presiding officer (PO) | Keeps order at the polling station, ensures a fair poll, decides challenges and tendered votes | S | RPA 1951 s.26 (appointment by DEO), s.27; CER r.36 (challenge), r.42/49P (tendered vote), r.49N (companion) | Poll status, decisions on cases, incidents, register | — |
| Polling officer | Performs functions the PO assigns; identifies electors, marks the register, applies ink | D | RPA 1951 s.26(3); CER r.37 (ink), r.49K/49L | Identify, mark register; separate duties of polling officers 1–3 are not split yet | Whether to split polling officer 1/2/3 duties as separate permissions |
| Counting supervisor | Supervises a counting table | O | ECI counting instructions | Validate table entries (operational record only) | Current counting handbook |
| Counting assistant | Assists at a counting table | O | ECI counting instructions | Record table entries (operational record only) | — |

## 5. District and State administration

| Role | Authority | Kind | Basis | Platform permissions | Confirm |
| --- | --- | --- | --- | --- | --- |
| Deputy DEO | Assists the DEO | D (by order) | DEO's order | District views; no station proposals or appointments unless delegated | Per-person delegation records are not modelled |
| District nodal officer | Leads one function (for example EVM, training, MCC) | O | ECI instructions | Function-specific | List of nodal functions |
| District police officer, State police nodal officer | Security planning and coordination | O | Police deployment instructions | Security fields only | — |
| State nodal officer | Function lead at State level | O | ECI instructions | Function-specific | — |

## 6. Political participants

| Role | Authority | Kind | Basis | Platform permissions | Confirm |
| --- | --- | --- | --- | --- | --- |
| Candidate | Files nomination, appoints agents, withdraws | S (as a right) | RPA 1951 s.33 (nomination), s.37 (withdrawal), s.40, s.46, s.47 (agents) | File and track a nomination, appoint and revoke agents | — |
| Election agent | Acts for the candidate; may appoint polling and counting agents | S (through candidate) | RPA 1951 s.40; CER r.12 (Form 8 under CER, not the RER Form 8) | Appoint polling and counting agents for their candidate | — |
| Polling agent | Observes the poll at one station; may challenge identity | S (through candidate) | RPA 1951 s.46; CER r.13, r.36 | View their station, raise identity challenges | — |
| Counting agent | Observes counting | S (through candidate) | RPA 1951 s.47; CER r.52 | View counting information, record discrepancies | — |

## 7. Independent oversight

| Role | Authority | Kind | Basis | Platform permissions | Confirm |
| --- | --- | --- | --- | --- | --- |
| General observer | Watches the conduct of the election; may direct the RO to stop counting or not to declare the result if there is serious irregularity, reporting to ECI | S | RPA 1951 s.20B | Read records and control room, file observer reports, record a s.20B direction | Exact s.20B wording and procedure |
| Expenditure observer | Watches candidates' election expenditure | A | ECI instructions; RPA 1951 ss.77–78 | Expenditure records, reports | — |
| Police observer | Watches law and order arrangements | A | ECI instructions | Security records, reports | — |
| Counting observer | Observes counting (the general observer in many elections) | A | ECI counting instructions | Counting records, reports | Whether this is a separate appointment in current practice |
| Micro observer | Reports on a polling station to the general observer | O | ECI instructions | Their station only; reports go to the general observer | — |

## 8. Rules the platform enforces because of this research

1. Only the ERO or AERO decides a Form 6 or Form 8; the BLO only recommends (RPA 1950 ss.13B, 13C, 22, 23).
2. Only the RO publishes the list of contesting candidates (RPA 1951 s.38).
3. The ARO scrutinises only after the RO records being unavoidably prevented and names them (RPA 1951 s.22(2) proviso).
4. The DEO proposes polling stations and ECI approves them (RPA 1951 s.25).
5. Only the candidate appoints an election agent; polling and counting agents may be appointed by the candidate or their election agent (RPA 1951 ss.40, 46, 47).
6. Results are never computed into an official result by the platform; only the RO declares (RPA 1951 s.66). The platform records a declaration status received from the official source.
7. The technical administrator cannot take electoral decisions (no statutory basis).

Anything outside these rules that is enforced today, such as which officials see which dashboard, is policy, not law, and can be changed in `roles.js` without a legal question.
