# Role and permission matrix

Generated from `backend/src/config/roles.js` on 3 November 2026. The backend enforces these permissions on every route (`authorize(...)`), and each handler then checks that one of the caller's active assignments covers the record. A permission alone never grants access outside the assigned jurisdiction. Research behind the roles: [ROLE_AND_AUTHORITY_RESEARCH.md](ROLE_AND_AUTHORITY_RESEARCH.md).

## Roles

| Role id | Label | Group | Level | Jurisdiction scope | Permissions |
| --- | --- | --- | --- | --- | --- |
| `voter` | Voter | Citizens and political participants | 0 | — | `roll:view-own` `application:submit` `application:track` `verification:own` |
| `candidate` | Candidate | Citizens and political participants | 0 | election, constituency | `nomination:submit` `agent:appoint` `permission:apply` `expenditure:report` |
| `election_agent` | Election agent | Citizens and political participants | 0 | election, constituency | `nomination:assist` `agent:appoint` `permission:apply` `expenditure:report` |
| `polling_agent` | Polling agent | Citizens and political participants | 0 | election, pollingStation | `polling:observe` `polling:object` |
| `counting_agent` | Counting agent | Citizens and political participants | 0 | election, constituency | `counting:observe` `counting:object` |
| `bla` | Booth level agent (party) | Citizens and political participants | 0 | constituency, pollingStation | `roll:view-part` `roll:claims-objections` |
| `ero` | Electoral registration officer | Electoral roll | 4 | constituency | `roll:manage` `roll:publish` `application:decide` `blo:assign` `audit:read` |
| `aero` | Assistant electoral registration officer | Electoral roll | 4 | constituency | `roll:manage` `application:decide` `audit:read` |
| `blo_supervisor` | BLO supervisor | Electoral roll | 5 | constituency | `blo:supervise` `roll:view-part` `verification:field-report` `audit:read` |
| `blo` | Booth level officer | Electoral roll | 5 | constituency, pollingStation | `application:review` `verification:field-report` `roll:view-part` |
| `ro` | Returning officer | Election conduct | 4 | election, constituency | `nomination:scrutinise` `scrutiny:delegate` `candidates:publish` `polling:arrange` `counting:supervise` `result:declare` `station:view` `control:view` `incident:manage` |
| `aro` | Assistant returning officer | Election conduct | 4 | election, constituency | `nomination:scrutinise` `polling:arrange` `counting:assist` `station:view` `control:view` `incident:manage` |
| `sector_officer` | Sector officer | Election conduct | 5 | election, constituency | `polling:inspect` `logistics:track` `station:view` `control:view` `incident:report` `incident:manage` |
| `sector_police_officer` | Sector police officer | Election conduct | 5 | election, constituency | `security:coordinate` `logistics:track` |
| `presiding_officer` | Presiding officer | Polling and counting | 6 | election, pollingStation | `polling:conduct` `polling:report` `station:view` `incident:report` |
| `polling_officer` | Polling officer | Polling and counting | 6 | election, pollingStation | `polling:identify-voter` `polling:mark-register` `polling:operate-evm` |
| `counting_supervisor` | Counting supervisor | Polling and counting | 6 | election, constituency | `counting:supervise-table` |
| `counting_assistant` | Counting assistant | Polling and counting | 6 | election, constituency | `counting:record` |
| `deo` | District election officer | District administration | 3 | election, district | `district:manage` `staff:assign` `nodal:coordinate` `observer:view` `audit:read` `station:propose` `control:view` `incident:manage` |
| `deputy_deo` | Deputy district election officer | District administration | 3 | election, district | `district:manage` `nodal:coordinate` `station:view` `control:view` |
| `district_nodal_officer` | District nodal officer | District administration | 3 | election, district | `nodal:function-manage` |
| `district_police_officer` | District police officer | District administration | 3 | election, district | `security:coordinate` `security:plan` |
| `ceo` | Chief electoral officer | State administration | 2 | state | `state:manage` `staff:assign` `nodal:coordinate` `report:state` `audit:read` `station:view` `control:view` `incident:manage` |
| `state_nodal_officer` | State nodal officer | State administration | 2 | state | `nodal:function-manage` |
| `state_police_nodal` | State police nodal officer | State administration | 2 | state | `security:coordinate` `security:plan` |
| `eci` | ECI administrator | National administration | 1 | — | `national:manage` `role:assign` `blo:assign` `verification:review` `audit:read` `integration:manage` `election:manage` `station:approve` `control:view` |
| `cec` | Chief election commissioner | National administration | 1 | — | `national:view` `report:national` `audit:read` `control:view` |
| `election_commissioner` | Election commissioner | National administration | 1 | — | `national:view` `report:national` `audit:read` `control:view` |
| `general_observer` | General observer | Independent oversight | 0 | election, constituency | `observer:report` `record:read` `audit:read` `control:view` |
| `police_observer` | Police observer | Independent oversight | 0 | election, constituency | `observer:report` `record:read` |
| `expenditure_observer` | Expenditure observer | Independent oversight | 0 | election, constituency | `observer:report` `expenditure:read` |
| `counting_observer` | Counting observer | Independent oversight | 0 | election, constituency | `observer:report` `counting:read` |
| `micro_observer` | Micro observer | Independent oversight | 0 | election, pollingStation | `observer:report` `incident:report` |

## Permissions and the roles that hold them

| Permission | Roles |
| --- | --- |
| `agent:appoint` | candidate, election_agent |
| `application:decide` | ero, aero |
| `application:review` | blo |
| `application:submit` | voter |
| `application:track` | voter |
| `audit:read` | ero, aero, blo_supervisor, deo, ceo, eci, cec, election_commissioner, general_observer |
| `blo:assign` | ero, eci |
| `blo:supervise` | blo_supervisor |
| `candidates:publish` | ro |
| `control:view` | ro, aro, sector_officer, deo, deputy_deo, ceo, eci, cec, election_commissioner, general_observer |
| `counting:assist` | aro |
| `counting:object` | counting_agent |
| `counting:observe` | counting_agent |
| `counting:read` | counting_observer |
| `counting:record` | counting_assistant |
| `counting:supervise` | ro |
| `counting:supervise-table` | counting_supervisor |
| `district:manage` | deo, deputy_deo |
| `election:manage` | eci |
| `expenditure:read` | expenditure_observer |
| `expenditure:report` | candidate, election_agent |
| `incident:manage` | ro, aro, sector_officer, deo, ceo |
| `incident:report` | sector_officer, presiding_officer, micro_observer |
| `integration:manage` | eci |
| `logistics:track` | sector_officer, sector_police_officer |
| `national:manage` | eci |
| `national:view` | cec, election_commissioner |
| `nodal:coordinate` | deo, deputy_deo, ceo |
| `nodal:function-manage` | district_nodal_officer, state_nodal_officer |
| `nomination:assist` | election_agent |
| `nomination:scrutinise` | ro, aro |
| `nomination:submit` | candidate |
| `observer:report` | general_observer, police_observer, expenditure_observer, counting_observer, micro_observer |
| `observer:view` | deo |
| `permission:apply` | candidate, election_agent |
| `polling:arrange` | ro, aro |
| `polling:conduct` | presiding_officer |
| `polling:identify-voter` | polling_officer |
| `polling:inspect` | sector_officer |
| `polling:mark-register` | polling_officer |
| `polling:object` | polling_agent |
| `polling:observe` | polling_agent |
| `polling:operate-evm` | polling_officer |
| `polling:report` | presiding_officer |
| `record:read` | general_observer, police_observer |
| `report:national` | cec, election_commissioner |
| `report:state` | ceo |
| `result:declare` | ro |
| `role:assign` | eci |
| `roll:claims-objections` | bla |
| `roll:manage` | ero, aero |
| `roll:publish` | ero |
| `roll:view-own` | voter |
| `roll:view-part` | bla, blo_supervisor, blo |
| `scrutiny:delegate` | ro |
| `security:coordinate` | sector_police_officer, district_police_officer, state_police_nodal |
| `security:plan` | district_police_officer, state_police_nodal |
| `staff:assign` | deo, ceo |
| `state:manage` | ceo |
| `station:approve` | eci |
| `station:propose` | deo |
| `station:view` | ro, aro, sector_officer, presiding_officer, deputy_deo, ceo |
| `verification:field-report` | blo_supervisor, blo |
| `verification:own` | voter |
| `verification:review` | eci |

## Rules that are not visible in the matrix

- **Jurisdiction.** Assignments name a State, district, assembly constituency, polling station (with part) or, for RO and observer roles, a parliamentary constituency, and may name an election. `covers()` in `services/authority.service.js` decides whether an assignment covers a record.
- **Time window.** An assignment may carry `validFrom` and `validUntil`; outside the window it gives no access.
- **Suspension.** A suspended account has no effective assignments and cannot sign in or open a live connection.
- **Step-up.** Approvals and other sensitive actions need a fresh one-time code (see [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md)).
- **Scrutiny by an ARO** only under an active written delegation from the RO for that constituency and election.
- **Agents** are appointed by a candidate or the election agent, one polling agent per station and up to the configured number of counting agents.
- **Presiding officer only:** opening and closing the poll, deciding doubts, challenges and offline conflicts, tendered votes.
- **Returning Officer only:** counting plan, staff randomisation, completing rounds, deciding counting discrepancies, the VVPAT draw.
- **No automatic voter registration.** A voter account exists only after an ERO/AERO approves a Form 6 that a BLO verified in the field.
