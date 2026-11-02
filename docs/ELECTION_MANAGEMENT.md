# Election management

## Elections

The ECI administrator announces an election with its States and schedule (`POST /elections`): notification, last date of nominations, scrutiny, last date of withdrawal, poll, counting. The stage is derived from the date in IST (`services/election.service.js`): announced → nominations_open → nominations_closed → scrutiny_and_withdrawal → campaign → poll_day → awaiting_counting → counting_day → completed. Schedule changes are kept in the election's history.

## Nominations and scrutiny

| Step | Who | Rule |
| --- | --- | --- |
| File | candidate (`nomination:submit`) | while nominations are open |
| Scrutinise | Returning Officer | on the scrutiny date |
| Delegate scrutiny | RO → a named ARO, step-up, with a reason | an ARO may scrutinise only under an active delegation for that constituency and election (RPA 1951, section 24); the decision records the capacity |
| Withdraw | candidate | until the last date of withdrawal |
| Publish the list of contesting candidates | RO, step-up | after withdrawal |

Endpoints: `POST /nominations`, `GET /nominations/mine`, `POST /nominations/:id/withdraw`, `GET /nominations` (RO), `POST /nominations/:id/scrutiny`, `/nominations/scrutiny-delegation` (GET, POST, `/revoke`), `POST /nominations/contesting`.

## Agents

A candidate or their election agent appoints agents (`POST /agents`): one election agent, one polling agent per polling station, and up to `MAX_COUNTING_AGENTS` counting agents (default 15). Appointments are assignments with the candidate's name and party, revocable with a reason. The RO sees the agents in the constituency.

## Staff assignments

Assignments are granted by officials with `role:assign`, `staff:assign`, `blo:assign` or `polling:arrange`, only inside their own jurisdiction, optionally limited to one election and to a validity window (`validFrom`, `validUntil`, interpreted in IST). Granting and revoking need step-up. An ECI administrator can suspend and reinstate an account (`/users/:epic/suspend`, `/reinstate`), which removes all its access at once.

Screens: ECI `/eci/elections` and `/eci/dashboard` (account suspension); staff assignments inside the DEO desk `/deo` and RO desk `/ro`; candidate `/candidate`; agents `/agent`.
