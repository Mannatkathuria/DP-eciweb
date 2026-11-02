# API documentation

Base URL: `/api/v1`. All bodies are JSON. Responses have the shape `{ "success": true, "data": ... }` or, on error, `{ "success": false, "statusCode": 4xx, "message": "...", "errors": [] }`.

## Authentication

- **Session:** `Authorization: Bearer <token>`, or the `accessToken` httpOnly cookie. With the cookie only, state-changing requests must send `X-Requested-With: XMLHttpRequest` (CSRF guard).
- **Permission:** the route lists the permissions that admit a caller (any one of them). Permissions come from the caller's role in `backend/src/config/roles.js`; see [ROLE_PERMISSION_MATRIX.md](ROLE_PERMISSION_MATRIX.md).
- **Jurisdiction:** every protected handler also checks that one of the caller's active assignments covers the record (state, district, constituency, polling station, election). This is not visible in the table because it happens inside the handler.
- **Step-up:** routes marked "yes" also need `X-Step-Up: <token>` from `POST /auth/step-up/request` then `POST /auth/step-up/verify` (valid 10 minutes, bound to the account). Without it the answer is `401` with `errors[0].code = "STEP_UP_REQUIRED"`.

## Error codes

| Status | Meaning |
| --- | --- |
| 400 | Invalid input; the message names the field. |
| 401 | No or invalid session, or step-up required. |
| 403 | Permission or jurisdiction refused, or missing anti-forgery header. |
| 404 | Not found, or not visible to the caller. |
| 409 | The record is in a state where this action is not allowed (for example already decided), or it is locked by another request. |
| 413 | Body too large. |
| 429 | Rate limit. |
| 503 | A dependency (Persona, an integration) is not configured. |

## Endpoints

Generated from the route files on 3 November 2026 (161 endpoints). Request and response fields for each module are described in the module documents: [ELECTORAL_ROLL_WORKFLOW.md](ELECTORAL_ROLL_WORKFLOW.md), [NEW_ELECTOR_PIPELINE.md](NEW_ELECTOR_PIPELINE.md), [ELECTION_MANAGEMENT.md](ELECTION_MANAGEMENT.md), [POLLING_STATION_MANAGEMENT.md](POLLING_STATION_MANAGEMENT.md), [POLL_DAY_OPERATIONS.md](POLL_DAY_OPERATIONS.md), [CONTROL_ROOM.md](CONTROL_ROOM.md), [COUNTING_AND_RESULTS.md](COUNTING_AND_RESULTS.md).

| Method | Path | Route file → handler | Auth | Permission (any of) | Step-up | Rate limit |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/electors/search` | elector → `searchElector` | public | — |  |  |
| POST | `/api/v1/verification/identity` | verification → `submitIdentity` | public | — |  |  |
| POST | `/api/v1/verification/:id/challenge` | verification → `issueChallenge` | public | — |  |  |
| POST | `/api/v1/verification/:id/face` | verification → `submitFace` | public | — |  |  |
| POST | `/api/v1/verification/otp/send` | verification → `sendDemoOtp` | public | — |  | otpLimiter |
| POST | `/api/v1/verification/otp/verify` | verification → `verifyDemoOtp` | public | — |  | otpLimiter |
| POST | `/api/v1/auth/login` | auth → `login` | public | — |  | loginLimiter |
| POST | `/api/v1/auth/register` | auth → `submitRegistration` | public | — |  | registerLimiter |
| GET | `/api/v1/auth/register/:id` | auth → `getRegistrationStatus` | public | — |  |  |
| POST | `/api/v1/auth/register/:id/information` | auth → `respondToInformationRequest("registration", applicantCheck)` | public | — |  | registerLimiter |
| GET | `/api/v1/auth/geography` | auth → `getGeography` | public | — |  |  |
| GET | `/api/v1/auth/roles` | auth → `getRoles` | public | — |  |  |
| POST | `/api/v1/auth/logout` | auth → `logout` | public | — |  |  |
| GET | `/api/v1/auth/me` | auth → `me` | session | — |  |  |
| POST | `/api/v1/auth/step-up/request` | auth → `requestStepUp` | session | — |  | loginLimiter |
| POST | `/api/v1/auth/step-up/verify` | auth → `verifyStepUp` | session | — |  | loginLimiter |
| POST | `/api/v1/auth/blo/login` | auth → `bloLogin` | public | — |  | bloLimiter |
| POST | `/api/v1/auth/blo/verify` | auth → `bloVerifyOtp` | public | — |  | bloLimiter |
| POST | `/api/v1/auth/blo/resend` | auth → `bloResendOtp` | public | — |  | bloLimiter |
| POST | `/api/v1/auth/blo/password` | auth → `changeBloPassword` | session | — |  |  |
| POST | `/api/v1/auth/blo/forgot` | auth → `bloForgotPassword` | public | — |  | bloResetLimiter |
| POST | `/api/v1/auth/blo/forgot/resend` | auth → `bloResendResetOtp` | public | — |  | bloResetLimiter |
| POST | `/api/v1/auth/blo/reset` | auth → `bloResetPassword` | public | — |  | bloResetLimiter |
| GET | `/api/v1/admin/verifications` | admin → `listVerifications` | session | role:  |  |  |
| PATCH | `/api/v1/admin/verifications/:id/resolve` | admin → `resolveVerification` | session | role:  |  |  |
| GET | `/api/v1/admin/stats` | admin → `getStats` | session | role:  |  |  |
| GET | `/api/v1/admin/registrations` | admin → `listRegistrationRequests` | session | CAN_SEE_APPLICATIONS |  |  |
| GET | `/api/v1/admin/registrations/:id/documents/:category` | admin → `getRegistrationDocumentFile` | session | CAN_SEE_APPLICATIONS |  |  |
| POST | `/api/v1/admin/registrations/:id/field-verification` | admin → `submitFieldVerification` | session | verification:field-report |  |  |
| POST | `/api/v1/admin/registrations/:id/approve` | admin → `approveRegistration` | session | application:decide | yes |  |
| POST | `/api/v1/admin/registrations/:id/reject` | admin → `rejectRegistration` | session | application:decide | yes |  |
| POST | `/api/v1/admin/registrations/:id/request-information` | admin → `requestInformation("registration")` | session | application:decide |  |  |
| POST | `/api/v1/admin/registrations/:id/request-reverification` | admin → `requestReverification("registration")` | session | application:decide |  |  |
| GET | `/api/v1/admin/changes` | admin → `listAllChangeRequests` | session | CAN_SEE_APPLICATIONS |  |  |
| POST | `/api/v1/admin/changes/:id/field-verification` | admin → `submitChangeFieldVerification` | session | verification:field-report |  |  |
| POST | `/api/v1/admin/changes/:id/approve` | admin → `approveChangeRequest` | session | application:decide | yes |  |
| POST | `/api/v1/admin/changes/:id/reject` | admin → `rejectChangeRequest` | session | application:decide | yes |  |
| POST | `/api/v1/admin/changes/:id/request-information` | admin → `requestInformation("change_request")` | session | application:decide |  |  |
| POST | `/api/v1/admin/changes/:id/request-reverification` | admin → `requestReverification("change_request")` | session | application:decide |  |  |
| POST | `/api/v1/voting-verification/start` | votingVerification → `startVotingVerification` | session | role: eci |  |  |
| POST | `/api/v1/voting-verification/:id/persona/start` | votingVerification → `startVotingPersona` | session | role: eci |  |  |
| POST | `/api/v1/voting-verification/:id/persona/sync` | votingVerification → `syncVotingPersona` | session | role: eci |  |  |
| GET | `/api/v1/voting-verification/:id/reference-photo` | votingVerification → `getVotingReferencePhoto` | session | role: eci |  |  |
| POST | `/api/v1/voting-verification/:id/document` | votingVerification → `submitVotingDocument` | session | role: eci |  |  |
| POST | `/api/v1/voting-verification/:id/face/challenge` | votingVerification → `issueVotingChallenge` | session | role: eci |  |  |
| POST | `/api/v1/voting-verification/:id/face` | votingVerification → `submitVotingFace` | session | role: eci |  |  |
| POST | `/api/v1/voting-verification/:id/fingerprint` | votingVerification → `verifyFingerprint` | session | role: eci |  |  |
| POST | `/api/v1/persona/start` | persona → `async (req, res) => {
  try {
    await connectRedis(` | session | — |  |  |
| GET | `/api/v1/persona/status` | persona → `async (req, res) => {
  try {
    await connectRedis(` | session | — |  |  |
| POST | `/api/v1/persona/sync` | persona → `async (req, res) => {
  try {
    await connectRedis(` | session | — |  |  |
| POST | `/api/v1/persona/complete-verification` | persona → `async (req, res) => {
  try {
    await connectRedis(` | session | — |  |  |
| GET | `/api/v1/notifications` | notification → `getUserNotifications` | public | — |  |  |
| POST | `/api/v1/changes` | changeRequest → `submitChangeRequest` | session | role: voter |  |  |
| GET | `/api/v1/changes/my` | changeRequest → `getMyChangeRequests` | session | role: voter |  |  |
| POST | `/api/v1/changes/:id/information` | changeRequest → `respondToInformationRequest("change_request", ownRequest)` | session | role: voter |  |  |
| GET | `/api/v1/eci/blo-list` | eci → `listBloOfficers` | session | role:assign |  |  |
| POST | `/api/v1/eci/blo/assign` | eci → `assignBloRole` | session | role:assign |  |  |
| POST | `/api/v1/eci/blo/remove` | eci → `removeBloRole` | session | role:assign |  |  |
| GET | `/api/v1/eci/voters` | eci → `searchEciVoters` | session | role:assign |  |  |
| GET | `/api/v1/assignments/me` | assignment → `listMyAssignments` | session | — |  |  |
| GET | `/api/v1/assignments` | assignment → `listAssignments` | session | role:assign, blo:assign, staff:assign, polling:arrange, audit:read |  |  |
| POST | `/api/v1/assignments` | assignment → `grantAssignment` | session | role:assign, blo:assign, staff:assign, polling:arrange | yes |  |
| POST | `/api/v1/assignments/:id/revoke` | assignment → `revokeAssignment` | session | role:assign, blo:assign, staff:assign, polling:arrange | yes |  |
| GET | `/api/v1/audit` | audit → `listRecentAudit` | session | audit:read |  |  |
| GET | `/api/v1/audit/integrity` | audit → `checkAuditIntegrity` | session | audit:read, national:manage |  |  |
| GET | `/api/v1/audit/:type/:id` | audit → `getResourceHistory` | session | audit:read |  |  |
| GET | `/api/v1/integrations/sources` | integration → `listSources` | session | integration:manage |  |  |
| POST | `/api/v1/integrations/sources` | integration → `createSource` | session | integration:manage | yes |  |
| POST | `/api/v1/integrations/sources/:id/suspend` | integration → `suspendSource` | session | integration:manage | yes |  |
| POST | `/api/v1/integrations/sources/:id/runs` | integration → `runIngestion` | session | integration:manage |  |  |
| GET | `/api/v1/integrations/runs` | integration → `listRuns` | session | integration:manage |  |  |
| POST | `/api/v1/integrations/rescreen` | integration → `rescreen` | session | integration:manage |  |  |
| GET | `/api/v1/registration-tasks` | registrationTask → `listRegistrationTasks` | session | verification:field-report, application:decide, blo:supervise, blo:assign |  |  |
| POST | `/api/v1/registration-tasks/:id/outcome` | registrationTask → `recordTaskOutcome` | session | verification:field-report |  |  |
| POST | `/api/v1/registration-tasks/:id/assign` | registrationTask → `assignTask` | session | blo:assign, blo:supervise |  |  |
| POST | `/api/v1/roll-versions` | rollVersion → `publishRollVersion` | session | roll:publish | yes |  |
| GET | `/api/v1/roll-versions` | rollVersion → `listVersions` | session | roll:publish, roll:manage, audit:read |  |  |
| GET | `/api/v1/roll-versions/:id` | rollVersion → `getVersion` | session | roll:publish, roll:manage, audit:read |  |  |
| GET | `/api/v1/elections` | election → `listAllElections` | public | — |  |  |
| POST | `/api/v1/elections` | election → `createElection` | public | — |  |  |
| POST | `/api/v1/elections/:id/schedule` | election → `reviseSchedule` | public | — |  |  |
| GET | `/api/v1/polling-stations` | pollingStation → `listStationsForStaff` | session | station:view, station:propose, station:approve |  |  |
| POST | `/api/v1/polling-stations` | pollingStation → `proposeStation` | session | station:propose |  |  |
| POST | `/api/v1/polling-stations/import` | pollingStation → `importStations` | session | station:propose |  |  |
| POST | `/api/v1/polling-stations/:id/relocation` | pollingStation → `proposeRelocation` | session | station:propose |  |  |
| POST | `/api/v1/polling-stations/:id/approve` | pollingStation → `approveStationChange` | session | station:approve | yes |  |
| POST | `/api/v1/polling-stations/:id/reject` | pollingStation → `rejectStationChange` | session | station:approve | yes |  |
| POST | `/api/v1/nominations` | nomination → `fileNomination` | session | nomination:submit |  |  |
| GET | `/api/v1/nominations/mine` | nomination → `myNominations` | session | nomination:submit |  |  |
| POST | `/api/v1/nominations/:id/withdraw` | nomination → `withdraw` | session | nomination:submit |  |  |
| GET | `/api/v1/nominations` | nomination → `listNominationsForRo` | session | nomination:scrutinise |  |  |
| POST | `/api/v1/nominations/:id/scrutiny` | nomination → `scrutinise` | session | nomination:scrutinise |  |  |
| GET | `/api/v1/nominations/scrutiny-delegation` | nomination → `getDelegation` | session | nomination:scrutinise |  |  |
| POST | `/api/v1/nominations/scrutiny-delegation` | nomination → `delegateScrutiny` | session | scrutiny:delegate | yes |  |
| POST | `/api/v1/nominations/scrutiny-delegation/revoke` | nomination → `revokeScrutinyDelegation` | session | scrutiny:delegate | yes |  |
| POST | `/api/v1/nominations/contesting` | nomination → `publishContesting` | session | candidates:publish | yes |  |
| GET | `/api/v1/public/elections` | public → `listAllElections` | public | — |  |  |
| GET | `/api/v1/public/stations` | public → `searchPublicStations` | public | — |  |  |
| GET | `/api/v1/public/stations/epic/:epic` | public → `lookupStationByEpic` | public | — |  |  |
| GET | `/api/v1/public/stations/:id/queue` | public → `publicQueue` | public | — |  |  |
| GET | `/api/v1/public/candidates` | public → `publicCandidates` | public | — |  |  |
| GET | `/api/v1/public/results` | public → `publicResults` | public | — |  |  |
| GET | `/api/v1/public/turnout` | public → `publicTurnout` | public | — |  |  |
| GET | `/api/v1/poll-day/station` | pollDay → `getStation` | session | STATION_TEAM, roll:view-part |  |  |
| GET | `/api/v1/poll-day/electors` | pollDay → `searchElectors` | session | polling:conduct, polling:identify-voter, polling:mark-register, roll:view-part |  |  |
| POST | `/api/v1/poll-day/electors/:epic/mark` | pollDay → `markVoter` | session | polling:mark-register, polling:conduct |  |  |
| POST | `/api/v1/poll-day/poll/status` | pollDay → `setPollStatus` | session | polling:conduct |  |  |
| POST | `/api/v1/poll-day/queue` | pollDay → `reportQueue` | session | polling:conduct, polling:identify-voter |  |  |
| GET | `/api/v1/poll-day/cases` | pollDay → `listCases` | session | STATION_TEAM |  |  |
| POST | `/api/v1/poll-day/cases` | pollDay → `raiseCase` | session | polling:conduct, polling:identify-voter, polling:mark-register, polling:object |  |  |
| POST | `/api/v1/poll-day/cases/:id/resolve` | pollDay → `resolveCase` | session | polling:conduct |  |  |
| POST | `/api/v1/poll-day/vab-slips/:epic` | pollDay → `issueVabSlip` | session | roll:view-part |  |  |
| GET | `/api/v1/poll-day/vab-slips/:slipId` | pollDay → `lookupVabSlip` | session | polling:identify-voter, polling:mark-register, polling:conduct |  |  |
| GET | `/api/v1/poll-day/register` | pollDay → `getRegister` | session | polling:conduct |  |  |
| GET | `/api/v1/poll-day/procedures` | pollDay → `getProcedures` | session | STATION_TEAM |  |  |
| GET | `/api/v1/poll-day/assistant` | pollDay → `getAssistant` | session | polling:conduct |  |  |
| POST | `/api/v1/poll-day/checklists/:kind` | pollDay → `tickChecklist` | session | polling:conduct |  |  |
| GET | `/api/v1/poll-day/package/public-key` | pollDay → `publicKey` | session | STATION_TEAM |  |  |
| GET | `/api/v1/poll-day/package` | pollDay → `downloadPackage` | session | polling:conduct, polling:identify-voter, polling:mark-register |  |  |
| POST | `/api/v1/poll-day/sync` | pollDay → `sync` | session | polling:conduct, polling:mark-register |  |  |
| GET | `/api/v1/poll-day/sync-conflicts` | pollDay → `listConflicts` | session | polling:conduct |  |  |
| POST | `/api/v1/poll-day/sync-conflicts/:id/resolve` | pollDay → `resolveConflict` | session | polling:conduct |  |  |
| GET | `/api/v1/control-room` | controlRoom → `overview` | session | control:view |  |  |
| POST | `/api/v1/control-room/incidents` | controlRoom → `reportIncident` | session | incident:report |  |  |
| POST | `/api/v1/control-room/incidents/:id` | controlRoom → `updateIncident` | session | incident:manage |  |  |
| POST | `/api/v1/control-room/stations/:stationId/visits` | controlRoom → `recordVisit` | session | polling:inspect |  |  |
| GET | `/api/v1/results/sources` | result → `listSources` | session | integration:manage |  |  |
| POST | `/api/v1/results/sources` | result → `registerResultSource` | session | integration:manage | yes |  |
| POST | `/api/v1/results/sources/:sourceId/entries` | result → `receiveEntry` | session | integration:manage |  |  |
| POST | `/api/v1/results/sources/:sourceId/publication` | result → `receivePublication` | session | integration:manage |  |  |
| POST | `/api/v1/results/sources/:sourceId/mock` | result → `generateMock` | session | integration:manage |  |  |
| GET | `/api/v1/training/modules` | training → `myModules` | session | — |  |  |
| POST | `/api/v1/training/modules/:id/attempts` | training → `attempt` | session | — |  |  |
| GET | `/api/v1/training/scenarios` | training → `listScenarios` | session | — |  |  |
| POST | `/api/v1/training/scenarios/:id/start` | training → `startScenario` | session | — |  |  |
| POST | `/api/v1/training/runs/:runId/submit` | training → `submitScenario` | session | — |  |  |
| GET | `/api/v1/training/report` | training → `scenarioReport` | session | — |  |  |
| GET | `/api/v1/training/team` | training → `teamProgress` | session | blo:assign, blo:supervise, staff:assign, polling:arrange |  |  |
| GET | `/api/v1/agents/mine` | agent → `myAgents` | session | agent:appoint |  |  |
| POST | `/api/v1/agents` | agent → `appointAgent` | session | agent:appoint |  |  |
| POST | `/api/v1/agents/:id/revoke` | agent → `revokeAgent` | session | agent:appoint |  |  |
| GET | `/api/v1/agents` | agent → `agentsInConstituency` | session | nomination:scrutinise |  |  |
| GET | `/api/v1/users/:epic` | user → `getUserStatus` | session | role:assign |  |  |
| POST | `/api/v1/users/:epic/suspend` | user → `suspendUser` | session | role:assign | yes |  |
| POST | `/api/v1/users/:epic/reinstate` | user → `reinstateUser` | session | role:assign | yes |  |
| GET | `/api/v1/events` | events → `listEvents` | session | control:view, polling:conduct, polling:identify-voter, polling:mark-register, incident:manage, application:decide, roll:view-part |  |  |
| GET | `/api/v1/devices/mine` | device → `listMyStationDevices` | session | — |  |  |
| POST | `/api/v1/devices/register` | device → `registerDevice` | session | — |  |  |
| POST | `/api/v1/devices/heartbeat` | device → `heartbeat` | session | — |  |  |
| POST | `/api/v1/devices/:id/revoke` | device → `revokeDevice` | session | polling:conduct, incident:manage |  |  |
| GET | `/api/v1/counting/:electionId` | counting → `getCounting` | session | COUNTING |  |  |
| GET | `/api/v1/counting/:electionId/staff` | counting → `staffPool` | session | counting:supervise, result:declare |  |  |
| POST | `/api/v1/counting/:electionId/plan` | counting → `savePlan` | session | counting:supervise, result:declare |  |  |
| POST | `/api/v1/counting/:electionId/randomise` | counting → `randomise` | session | counting:supervise, result:declare |  |  |
| POST | `/api/v1/counting/:electionId/vvpat-draw` | counting → `vvpatDraw` | session | counting:supervise, result:declare |  |  |
| POST | `/api/v1/counting/:electionId/rounds/:round/tables/:table` | counting → `recordTable` | session | counting:supervise, result:declare, counting:supervise-table |  |  |
| POST | `/api/v1/counting/:electionId/rounds/:round/complete` | counting → `completeRound` | session | counting:supervise, result:declare |  |  |
| POST | `/api/v1/counting/:electionId/discrepancies` | counting → `reportDiscrepancy` | session | counting:object, counting:supervise-table, observer:report |  |  |
| POST | `/api/v1/counting/:electionId/discrepancies/:id/decide` | counting → `decideDiscrepancy` | session | counting:supervise, result:declare |  |  |
| POST | `/api/v1/counting/:electionId/observer-reports` | counting → `observerReport` | session | observer:report |  |  |
| GET | `/api/v1/health` | app.js → `inline` | public | — |  |  |

## Device headers

Polling-station device routes (`/devices/heartbeat`, `/poll-day/package`, `/poll-day/sync`) also need `X-Device-Id` and `X-Device-Token` from `POST /devices/register`. The token is shown once; the server keeps only its SHA-256 hash. See [OFFLINE_ARCHITECTURE.md](OFFLINE_ARCHITECTURE.md).

## Live events

`GET /events?since=<ms or ISO>&types=A,B&limit=` returns operational events visible to the caller's assignments, oldest first. On a long-running server the same events arrive over Socket.IO (`path /socket.io`, handshake `auth.token` = session token; event name `event`, acknowledge with `ack`). See [CONTROL_ROOM.md](CONTROL_ROOM.md).
