// Collections where MongoDB is the system of record. Each entry lists its indexes; the Redis
// fallback (no MONGODB_URI) keeps the same documents under `mdoc:<collection>:<id>`.
// What lives here: data that is written once and then queried, searched or reported on, and that
// never needs a multi-key Redis transaction with another workflow (see docs/DATA_STORES.md).
const area = (prefix = "jurisdiction") => [{ [`${prefix}.state`]: 1, [`${prefix}.district`]: 1, [`${prefix}.constituency`]: 1 }, { name: "area" }];
const created = [{ createdAt: -1 }, { name: "created" }];

export const DOC_STORE_INDEXES = {
    // Handbooks, compendium of instructions, eBooks, FAQ and training material
    library_items: [[{ type: 1, slug: 1 }, { name: "type_slug", unique: true }], [{ type: 1, category: 1 }, { name: "type_category" }],
        [{ title: "text", summary: "text", body: "text", tags: "text", "chapters.title": "text", "chapters.pages": "text" }, { name: "text", default_language: "none" }]],
    // Election planning (ePlan)
    eplan_vacancies: [area("seat"), [{ status: 1, dueBy: 1 }, { name: "status_due" }]],
    eplan_holidays: [[{ state: 1, date: 1 }, { name: "state_date" }]],
    eplan_activities: [[{ planId: 1, dueOn: 1 }, { name: "plan_due" }], [{ status: 1, dueOn: 1 }, { name: "status_due" }], [{ state: 1 }, { name: "state" }]],
    eplan_messages: [created, [{ state: 1 }, { name: "state" }]],
    // EVM Management System (EMS 2.0)
    evm_units: [[{ serial: 1 }, { name: "serial", unique: true }], [{ unitType: 1, status: 1 }, { name: "type_status" }], area("location"), [{ "allocation.stationId": 1 }, { name: "station" }]],
    evm_randomisations: [created, area()],
    // National Grievance Services Portal
    grievances: [[{ referenceId: 1 }, { name: "ref", unique: true }], [{ status: 1, createdAt: -1 }, { name: "status_created" }], area(), [{ "complainant.mobile": 1 }, { name: "mobile" }]],
    // Election Seizure Management System
    seizures: [[{ agency: 1, documentRef: 1 }, { name: "agency_document", unique: true }], [{ kind: 1 }, { name: "kind" }], area(), created],
    // Integrated Election Expenditure Monitoring: political-party filings
    party_filings: [[{ party: 1, filingType: 1, period: 1 }, { name: "party_type_period" }], [{ acknowledgement: 1 }, { name: "ack", unique: true }], created],
    // Service voters and electronically transmitted postal ballots (ETPBMS)
    etpb_ballots: [[{ ballotId: 1 }, { name: "ballot", unique: true }], [{ electionId: 1, elector: 1 }, { name: "election_elector", unique: true }], area(), [{ status: 1 }, { name: "status" }]],
    // Online Index Card
    index_cards: [[{ electionId: 1, "jurisdiction.state": 1, "jurisdiction.constituency": 1 }, { name: "election_area", unique: true }], [{ status: 1 }, { name: "status" }]],
    // ERONET roll quality: photo- and demographically similar entries, deaths reported, notices and hearings
    roll_flags: [[{ fingerprint: 1 }, { name: "fingerprint", unique: true }], area(), [{ status: 1, type: 1 }, { name: "status_type" }]],
    // BLO App: polling-station facility surveys (AMF/EMF), house-to-house register, EPIC delivery
    station_surveys: [[{ stationId: 1, createdAt: -1 }, { name: "station_created" }], area()],
    blo_register: [[{ epic: 1, createdAt: -1 }, { name: "epic_created" }], area(), [{ finding: 1 }, { name: "finding" }]],
    epic_deliveries: [[{ epic: 1 }, { name: "epic" }], area()],
    // Observer portal: profile and deployment
    observer_profiles: [[{ epic: 1 }, { name: "epic", unique: true }]]
};

export const DOC_STORES = Object.keys(DOC_STORE_INDEXES);
