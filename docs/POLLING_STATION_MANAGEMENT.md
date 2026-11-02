# Polling station management

Polling stations are proposed by the District Election Officer and approved by the Commission (Representation of the People Act, 1951, section 25). In ECIWEB the proposer can never approve their own proposal.

| Step | Who | Endpoint |
| --- | --- | --- |
| Propose a new station | DEO (`station:propose`) for their district | `POST /polling-stations` |
| Import a list of stations (up to 500 rows; each valid row becomes a proposal, invalid rows are reported) | DEO | `POST /polling-stations/import` |
| Propose a relocation | DEO | `POST /polling-stations/:id/relocation` |
| Approve or reject | ECI administrator, step-up, not the proposer | `POST /polling-stations/:id/approve` · `/reject` |
| List for officials | within jurisdiction | `GET /polling-stations` |
| Public search | anyone | `GET /public/stations?state=&district=&constituency=`, `GET /public/stations/epic/:epic` |
| Queue on poll day | anyone | `GET /public/stations/:id/queue` |

Each station keeps `stationCode`, part number, address, optional location, accessibility facilities (ramp, wheelchair, drinking water, toilet, shade, signage), a version history with who proposed and approved each change, and a relocation notice shown publicly when a station moves.

Assignments to a station (presiding officer, polling officers, micro observer, BLO, polling agents) must name an approved station once a constituency has any.

Screens: DEO `/deo`, ECI `/eci/elections`, public `/booths`.

Not done: map view and geographic search; importing from an official ECI list (the import takes a file the DEO supplies; no authorised feed exists).
