# ECIWEB documentation

ECIWEB is a prototype election-management system modelled on the work of the Election Commission of India (ECI): electoral rolls, new-elector registration, polling stations, elections and nominations, poll-day operations (online and offline), a control room, counting operations and results publication, with role-based authority throughout.

**It is a prototype.** It holds synthetic data only, is not connected to any ECI system, and has no legal standing. Nothing it shows is an official record or result. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Start here

| If you want to… | Read |
| --- | --- |
| Run it locally | [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md), [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) |
| Understand how it is built | [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), [API_DOCUMENTATION.md](API_DOCUMENTATION.md) |
| Know who may do what | [ROLE_AND_AUTHORITY_RESEARCH.md](ROLE_AND_AUTHORITY_RESEARCH.md), [ROLE_PERMISSION_MATRIX.md](ROLE_PERMISSION_MATRIX.md) |
| See what was audited and what was found | [PROJECT_AUDIT.md](PROJECT_AUDIT.md) |
| Know what is not done or not possible | [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md), [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) |

## All documents

**Research and audit**
- [PROJECT_AUDIT.md](PROJECT_AUDIT.md): module status, API and database inventory, security findings
- [ECI_SYSTEM_RESEARCH.md](ECI_SYSTEM_RESEARCH.md): how the real process works and which ECI systems exist
- [ROLE_AND_AUTHORITY_RESEARCH.md](ROLE_AND_AUTHORITY_RESEARCH.md): statutory roles and where their authority comes from
- [EXTERNAL_DATA_SOURCES.md](EXTERNAL_DATA_SOURCES.md): which outside data sources exist and their status (all BLOCKED or SYNTHETIC)
- [CONSTITUENCY_DATA.md](CONSTITUENCY_DATA.md): where the State, district and constituency lists come from

**Design**
- [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
- [ROLE_PERMISSION_MATRIX.md](ROLE_PERMISSION_MATRIX.md)
- [INTEGRATION_ARCHITECTURE.md](INTEGRATION_ARCHITECTURE.md)
- [OFFLINE_ARCHITECTURE.md](OFFLINE_ARCHITECTURE.md)

**Workflows**
- [ELECTORAL_ROLL_WORKFLOW.md](ELECTORAL_ROLL_WORKFLOW.md): Form 6 and Form 8, roll versions
- [NEW_ELECTOR_PIPELINE.md](NEW_ELECTOR_PIPELINE.md): finding people who are not yet registered
- [POLLING_STATION_MANAGEMENT.md](POLLING_STATION_MANAGEMENT.md)
- [ELECTION_MANAGEMENT.md](ELECTION_MANAGEMENT.md): schedules, nominations, scrutiny, agents
- [POLL_DAY_OPERATIONS.md](POLL_DAY_OPERATIONS.md)
- [CONTROL_ROOM.md](CONTROL_ROOM.md)
- [COUNTING_AND_RESULTS.md](COUNTING_AND_RESULTS.md)

**Security and operations**
- [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md)
- [DATA_PROTECTION.md](DATA_PROTECTION.md)
- [THREAT_MODEL.md](THREAT_MODEL.md)
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)
- [TESTING_GUIDE.md](TESTING_GUIDE.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

**Project**
- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)
- [CHANGELOG.md](CHANGELOG.md)
- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)

## Ground rules the code enforces

1. **No automatic voter registration.** A person is added to the roll only when an ERO or AERO approves a Form 6 that a BLO verified in the field.
2. **Jurisdiction-scoped access.** Every protected action is checked on the server against the caller's active assignments (State, district, constituency, polling station, election, validity window).
3. **No unofficial counting authority.** ECIWEB holds no vote figures of its own. Results are shown only from a registered source and labelled with it; the mock source says "MOCK DATA" everywhere.
4. **Nothing is silently overwritten or deleted.** Decisions are recorded with reasons, every change is audited with a hash, offline conflicts go to the presiding officer.
5. **Synthetic data only.** Nothing is scraped. Integrations without authorised access are marked BLOCKED.
