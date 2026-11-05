// Single catalogue of every sign-in role the platform knows about.
//
// Identity and role are separate: a person is one user record, and the role (plus the
// jurisdiction it applies to) decides what they may do. Role ids are lowercase and double as the
// `portal` value the sign-in pages send, so "ero" signs in at /signin/ero.
//
// Three ids are kept from the original prototype so existing routes and tests keep working:
//   voter, blo (BLO ID + password + mobile OTP) and eci (ECI administrator).
// These ids are application identifiers, not official ECI login names.

export const ROLE_GROUPS = {
    citizen: "Citizens and political participants",
    roll: "Electoral roll",
    conduct: "Election conduct",
    polling: "Polling and counting",
    district: "District administration",
    state: "State administration",
    national: "National administration",
    observer: "Independent oversight"
};

// level: where the role sits (1 national ... 6 polling and counting; 0 outside the administration)
// scope: the jurisdiction fields an assignment for this role must carry
// demoEpic: seeded demo account (EPIC-format identifier; OTP is printed in the backend terminal)
const r = (id, label, group, level, scope, demoEpic, permissions) =>
    ({ id, label, group, level, scope, demoEpic, permissions });

export const ROLES = [
    // Citizens and political participants
    r("voter", "Voter", "citizen", 0, [], "ABC1234567",
        ["roll:view-own", "application:submit", "application:track", "verification:own"]),
    r("candidate", "Candidate", "citizen", 0, ["election", "constituency"], "CAN1000001",
        ["nomination:submit", "agent:appoint", "permission:apply", "expenditure:report"]),
    r("election_agent", "Election agent", "citizen", 0, ["election", "constituency"], "EAG1000001",
        ["nomination:assist", "agent:appoint", "permission:apply", "expenditure:report"]),
    r("polling_agent", "Polling agent", "citizen", 0, ["election", "pollingStation"], "PAG1000001",
        ["polling:observe", "polling:object"]),
    r("counting_agent", "Counting agent", "citizen", 0, ["election", "constituency"], "CAG1000001",
        ["counting:observe", "counting:object"]),
    r("bla", "Booth level agent (party)", "citizen", 0, ["constituency", "pollingStation"], "BLA1000001",
        ["roll:view-part", "roll:claims-objections"]),
    // A registered party's treasurer files the party's statutory returns (IEMS).
    r("party_treasurer", "Political party treasurer", "citizen", 0, [], "PTR1000001",
        ["party:file"]),

    // Electoral roll
    r("ero", "Electoral registration officer", "roll", 4, ["constituency"], "ERO1000001",
        ["roll:manage", "roll:publish", "application:decide", "blo:assign", "audit:read", "grievance:handle"]),
    r("aero", "Assistant electoral registration officer", "roll", 4, ["constituency"], "AER1000001",
        ["roll:manage", "application:decide", "audit:read", "grievance:handle"]),
    r("blo_supervisor", "BLO supervisor", "roll", 5, ["constituency"], "BLS1000001",
        ["blo:supervise", "roll:view-part", "verification:field-report", "audit:read"]),
    r("blo", "Booth level officer", "roll", 5, ["constituency", "pollingStation"], null,
        ["application:review", "verification:field-report", "roll:view-part", "station:survey"]),
    // Record Officer of a service (Armed Forces record office, State armed police unit, Ministry
    // for staff abroad): verifies service voters' particulars and passes on postal-ballot PINs.
    r("record_officer", "Record officer (service voters)", "roll", 5, ["state"], "REC1000001",
        ["service:record", "application:submit"]),

    // Election conduct
    r("ro", "Returning officer", "conduct", 4, ["election", "constituency"], "ROF1000001",
        ["nomination:scrutinise", "scrutiny:delegate", "candidates:publish", "polling:arrange", "counting:supervise", "result:declare", "station:view", "control:view", "incident:manage", "permission:decide", "complaint:dispatch", "complaint:dispose", "index:prepare", "etpb:manage", "evm:allocate", "grievance:handle"]),
    r("aro", "Assistant returning officer", "conduct", 4, ["election", "constituency"], "ARO1000001",
        ["nomination:scrutinise", "polling:arrange", "counting:assist", "station:view", "control:view", "incident:manage", "permission:decide", "complaint:dispatch", "complaint:dispose", "evm:view", "grievance:handle"]),
    r("sector_officer", "Sector officer", "conduct", 5, ["election", "constituency"], "SCO1000001",
        ["polling:inspect", "logistics:track", "station:view", "control:view", "incident:report", "incident:manage", "station:survey", "evm:view"]),
    r("sector_police_officer", "Sector police officer", "conduct", 5, ["election", "constituency"], "SPO1000001",
        ["security:coordinate", "logistics:track"]),
    // Expenditure and MCC monitoring teams (flying squads and static surveillance teams), appointed
    // by the DEO under ECI instructions. They act on complaints and record seizures; they decide nothing.
    r("flying_squad", "Flying squad / surveillance team", "conduct", 5, ["election", "constituency"], "FST1000001",
        ["complaint:investigate", "seizure:record"]),
    // Officers of the enforcement agencies (excise, income tax, NCB, customs, police) who enter
    // interceptions and seizures in the Election Seizure Management System.
    r("enforcement_officer", "Enforcement agency officer (ESMS)", "conduct", 5, ["election", "district"], "ENF1000001",
        ["seizure:record"]),

    // Polling and counting
    r("presiding_officer", "Presiding officer", "polling", 6, ["election", "pollingStation"], "PRO1000001",
        ["polling:conduct", "polling:report", "station:view", "incident:report"]),
    r("polling_officer", "Polling officer", "polling", 6, ["election", "pollingStation"], "POL1000001",
        ["polling:identify-voter", "polling:mark-register", "polling:operate-evm"]),
    r("counting_supervisor", "Counting supervisor", "polling", 6, ["election", "constituency"], "CSU1000001",
        ["counting:supervise-table"]),
    r("counting_assistant", "Counting assistant", "polling", 6, ["election", "constituency"], "CAS1000001",
        ["counting:record"]),

    // District administration
    r("deo", "District election officer", "district", 3, ["election", "district"], "DEO1000001",
        ["district:manage", "staff:assign", "nodal:coordinate", "observer:view", "audit:read", "station:propose", "control:view", "incident:manage", "complaint:dispatch", "appeal:decide-first", "evm:manage", "evm:randomise-first", "grievance:handle", "seizure:release", "seizure:read"]),
    r("deputy_deo", "Deputy district election officer", "district", 3, ["election", "district"], "DDO1000001",
        ["district:manage", "nodal:coordinate", "station:view", "control:view", "complaint:dispatch", "grievance:handle", "seizure:read"]),
    r("district_nodal_officer", "District nodal officer", "district", 3, ["election", "district"], "DNO1000001",
        ["nodal:function-manage", "evm:manage", "seizure:read"]),
    r("district_police_officer", "District police officer", "district", 3, ["election", "district"], "DPO1000001",
        ["security:coordinate", "security:plan", "seizure:record"]),

    // State administration
    r("ceo", "Chief electoral officer", "state", 2, ["state"], "CEO1000001",
        ["state:manage", "staff:assign", "nodal:coordinate", "report:state", "audit:read", "station:view", "control:view", "incident:manage", "appeal:decide-second", "plan:state", "index:examine", "evm:view", "grievance:handle", "seizure:read"]),
    r("state_nodal_officer", "State nodal officer", "state", 2, ["state"], "SNO1000001",
        ["nodal:function-manage"]),
    r("state_police_nodal", "State police nodal officer", "state", 2, ["state"], "SPN1000001",
        ["security:coordinate", "security:plan"]),

    // National administration
    r("eci", "ECI administrator", "national", 1, [], "ECI1234567",
        ["national:manage", "role:assign", "blo:assign", "verification:review", "audit:read", "integration:manage", "election:manage", "station:approve", "control:view",
            "library:manage", "plan:manage", "index:finalise", "party:review", "evm:view", "grievance:handle", "seizure:read"]),
    r("cec", "Chief election commissioner", "national", 1, [], "CEC1000001",
        ["national:view", "report:national", "audit:read", "control:view", "direction:issue", "evm:view", "seizure:read"]),
    r("election_commissioner", "Election commissioner", "national", 1, [], "ELC1000001",
        ["national:view", "report:national", "audit:read", "control:view", "direction:issue", "evm:view", "seizure:read"]),

    // Independent oversight: observers get an independent reporting permission, never write access
    // to the records of the officers they observe.
    r("general_observer", "General observer", "observer", 0, ["election", "constituency"], "GOB1000001",
        ["observer:report", "record:read", "audit:read", "control:view", "evm:view"]),
    r("police_observer", "Police observer", "observer", 0, ["election", "constituency"], "POB1000001",
        ["observer:report", "record:read", "seizure:read"]),
    r("expenditure_observer", "Expenditure observer", "observer", 0, ["election", "constituency"], "EOB1000001",
        ["observer:report", "expenditure:read", "seizure:read"]),
    r("counting_observer", "Counting observer", "observer", 0, ["election", "constituency"], "COB1000001",
        ["observer:report", "counting:read"]),
    r("micro_observer", "Micro observer", "observer", 0, ["election", "pollingStation"], "MOB1000001",
        ["observer:report", "incident:report"])
];

// Subjects a nodal officer can be assigned to (the assignment's `function`). A nodal officer acts
// only inside the subject named in their assignment order.
export const NODAL_FUNCTIONS = {
    evm: "EVM and VVPAT management",
    training: "Training of polling personnel",
    transport: "Transport and vehicle management",
    material: "Election material",
    expenditure: "Expenditure monitoring",
    mcc: "Model Code of Conduct",
    media: "Media certification and monitoring (MCMC)",
    sveep: "Voter education (SVEEP)",
    postal_ballot: "Postal ballots",
    accessibility: "Accessibility and assured minimum facilities",
    it: "IT, webcasting and communication",
    law_and_order: "Law and order coordination",
    manpower: "Manpower management",
    complaints: "Complaints and voter helpline"
};
export const NODAL_ROLES = ["district_nodal_officer", "state_nodal_officer"];

export const ROLE_BY_ID = Object.fromEntries(ROLES.map((role) => [role.id, role]));
export const isKnownRole = (id) => Object.hasOwn(ROLE_BY_ID, id);

/**
 * The permissions a stored account role carries. The legacy "admin" account type from the
 * original prototype signs in through the BLO portal and is treated exactly like a BLO.
 * An unknown role has no permissions at all.
 */
export const permissionsFor = (roleId) =>
    ROLE_BY_ID[roleId === "admin" ? "blo" : roleId]?.permissions ?? [];

/**
 * Which stored account roles may use which portal's sign-in page. Each portal admits its own role;
 * the BLO portal also admits the legacy "admin" account type that the prototype already had.
 */
export const portalRoles = (portal) => {
    if (!isKnownRole(portal)) return null;
    return portal === "blo" ? ["blo", "admin"] : [portal];
};

// Demonstration jurisdiction for seeded accounts (matches the existing seeded demo data).
export const DEMO_JURISDICTION = {
    state: "Punjab",
    district: "Ludhiana",
    constituency: "Ludhiana South",
    pollingStation: "Government Girls Senior Secondary School, Ludhiana",
    election: "Demo general election"
};

export const jurisdictionFor = (role) =>
    Object.fromEntries((ROLE_BY_ID[role]?.scope ?? []).map((field) => [field, DEMO_JURISDICTION[field]]));
