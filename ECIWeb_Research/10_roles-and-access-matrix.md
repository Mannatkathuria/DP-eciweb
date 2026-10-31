# Roles and access matrix

This table reflects roles explicitly mentioned in ECI public descriptions plus practical role separation needed for ECIWeb. It does not claim to reproduce internal government role permissions.

| Role | Publicly described / proposed responsibilities | Evidence / caution |
|---|---|---|
| Citizen / elector | Submit voter forms, track applications, complain / suggest, download e-EPIC, search electoral roll, request BLO call, submit cVIGIL complaint | Public services documented on Voters Portal / ECI cVIGIL pages |
| Candidate | Candidate profile, nomination, affidavit, security deposit, slot preference, permission requests, track/download approvals | ECI candidate nomination + Suvidha pages |
| Political party / representative | Nomination / permission submission, profile, track requests and download decisions | ECI Suvidha / nomination descriptions |
| BLO | Field verification of forms, house-to-house verification, polling-station information, elector assistance | ECI ERONET / BLO descriptions; no BLO app HTML captured |
| AERO | Review / assist electoral-roll applications; take permitted steps in assigned jurisdiction | ECI ERONET description; precise permission matrix not published in reviewed source |
| ERO | Electoral-roll decision support / application processing; nomination and permission processes may involve distinct roles | ECI ERONET / ENCORE descriptions; do not merge ERO and RO permissions |
| RO | Candidate nomination digitization / scrutiny, permission decisions / review, counting roles and final decisions | ECI candidate scrutiny / cVIGIL / counting descriptions |
| ARO | Election operational support; voter-turnout entries; counting data roles in parliamentary election flow | ECI turnout / counting descriptions |
| ROPC | Counting module role named in ECI counting description for parliamentary elections | Exact expansion and permission matrix should be confirmed from official documentation |
| DEO / District Control Centre | cVIGIL complaint intake and assignment to field units; district monitoring | ECI cVIGIL portal description |
| CEO | State-level oversight, turnout monitoring, cVIGIL monitoring, electoral data and state election information | ECI pages / CEO Himachal public site |
| Departmental nodal officer | Review / consent for permission requests routed via ENCORE; use Nodal App | ECI election permissions description |
| Flying Squad / Field Unit | Reach cVIGIL incident location, investigate, submit field report | ECI cVIGIL description |
| Observer | Manage profile / deployment details, read ECI notices, submit arrival/daily/post-poll reports | ECI Observer Portal description |
| ECI Statistical Division | Verify constituency Index Card data after CEO verification | ECI Index Card page |
| System administrator | Manage users / reference data / configuration / audit (proposal) | [Inferred / proposal], not established by the public pages |

## Permission design recommendations

- Enforce **role + jurisdiction + election + module** in authorization checks.
- A BLO assigned to one polling part should not see or modify all state records.
- Candidate / party users see only their own profiles, submissions and decisions.
- Nodal officers see requests assigned to their department/category and should not see unrelated voter records.
- Observer access should be scoped to assigned deployment and report functions.
- RO/ARO and CEO/DEO actions should be audited with actor, role, constituency, election ID, timestamp, old state, new state, reason and source IP/device metadata as allowed by policy.
- Platform administrators should not automatically receive operational decision rights. Separate technical administration from statutory decision-making.

## Role / permission tests to add

1. Candidate cannot read another candidate’s private draft or upload.
2. BLO cannot alter ERO final decision.
3. Nodal officer cannot approve a permission category not assigned to them.
4. DEO / DCC can assign complaint only within configured district / election jurisdiction.
5. RO final decision is available only for authorized constituency / case.
6. Observer sees only allocated constituency / assignment / report data.
7. Every cross-jurisdiction access attempt is denied and audited.
