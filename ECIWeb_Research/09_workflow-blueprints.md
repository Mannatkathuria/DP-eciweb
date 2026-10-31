# Workflow blueprints for ECIWeb

These diagrams combine **published ECI workflow descriptions** with **proposed ECIWeb engineering flows**. They are not a legal process manual.

## 1. Voter registration / correction

```mermaid
flowchart TD
  A[Citizen opens Citizen Services] --> B{Service needed?}
  B -->|New elector| F6[Form 6]
  B -->|Overseas elector| F6A[Form 6A]
  B -->|Deletion / objection| F7[Form 7]
  B -->|Shift / correction / replacement / PwD| F8[Form 8]
  F6 --> S[Authenticate / complete form / upload documents]
  F6A --> S
  F7 --> S
  F8 --> S
  S --> SUB[Submit application]
  SUB --> R[Application reference / confirmation]
  R --> BLO[BLO field verification where required]
  BLO --> ERO[ERO / AERO review and decision]
  ERO -->|Approved| U[Update electoral roll / EPIC workflow]
  ERO -->|Rejected / clarification| N[Notify applicant / next prescribed step]
  R --> T[Track application status]
```

**Evidence:** Forms 6/6A/7/8 and ERONET registration → field verification → ERO processing are published by ECI. The exact number/order of screens, identity checks and status codes are **not** captured.

## 2. Candidate nomination

```mermaid
flowchart TD
  A[Candidate / party signs in to Suvidha] --> B[Create / update profile]
  B --> C[Complete nomination form]
  C --> D[Upload affidavit / e-affidavit]
  D --> E[Security deposit]
  E --> F[Choose preferred physical verification slot]
  F --> G[Submit / track]
  G --> H[RO receives online nomination in ENCORE]
  H --> I[Scrutiny]
  I --> J{Accepted?}
  J -->|Yes| K[Withdrawal window / symbol allotment]
  J -->|No| L[Rejected status / recorded decision]
  K --> M[Final contesting candidates list / Form 7A]
```

**Evidence:** ECI says online nomination starts with Suvidha and includes profile, affidavit, security deposit, slot preference and multiple nominations; ENCORE scrutiny marks accepted/rejected, handles withdrawals, symbols and Form 7A.

## 3. Campaign permission request

```mermaid
flowchart TD
  A[Candidate / party] --> B[Suvidha online request]
  A --> C[Physical request to election office]
  C --> D[Staff digitizes request]
  B --> E[ENCORE permission workflow]
  D --> E
  E --> F[Assign concerned department / nodal officer]
  F --> G[Consent / review]
  G --> H{Decision}
  H -->|Approved| I[Permission issued / downloadable]
  H -->|Returned / rejected| J[Reason and next step]
  I --> K[Candidate tracks status]
  J --> K
```

## 4. cVIGIL complaint handling

```mermaid
flowchart TD
  A[Citizen selects violation type] --> B[Live photo/video + location]
  B --> C[Submit and receive tracking ID]
  C --> D[District Control Centre]
  D --> E[Assign nearest field unit / FST]
  E --> F[Field unit navigates and investigates]
  F --> G[Upload field report]
  G --> H[RO reviews evidence and report]
  H --> I{Final decision}
  I --> J[Drop]
  I --> K[Dispose]
  I --> L[Escalate]
  J --> M[Update citizen]
  K --> M
  L --> M
```

## 5. Poll-day turnout and results

```mermaid
flowchart TD
  A[RO / ARO enters turnout at configured time slot] --> B[Slot validation]
  B --> C[Publish estimated percentage]
  C --> D[CEO dashboard identifies missing entries]
  D --> E[End-of-poll polling-station data]
  E --> F[Multi-level verification]
  F --> G[Pre-counting phase]
  G --> H[Counting day: EVM + postal votes]
  H --> I[Round-wise tabulation]
  I --> J[Result declaration]
  J --> K[RO completes Index Card]
  K --> L[CEO verification]
  L --> M[ECI Statistical Division verification]
```

## Shared design rules for ECIWeb

- Every case / application must have a stable ID and immutable audit events.
- A user must be able to see the current status and next responsible actor without seeing restricted internal notes.
- Every transition must be guarded by role, jurisdiction, election context, deadline and data validation.
- Uploads must be virus-scanned, access-controlled, checksummed, and retained under an explicit retention policy.
- Time-based workflows need timezone-safe timestamps, deadline calculators, overdue alerts and escalation logs.
- Avoid a single generic `status` field for every workflow. Use module-specific state machines with common audit-event infrastructure.
