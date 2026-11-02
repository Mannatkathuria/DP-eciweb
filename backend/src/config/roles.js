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
        ["nomination:submit", "permission:apply", "expenditure:report"]),
    r("election_agent", "Election agent", "citizen", 0, ["election", "constituency"], "EAG1000001",
        ["nomination:assist", "permission:apply", "expenditure:report"]),
    r("polling_agent", "Polling agent", "citizen", 0, ["election", "pollingStation"], "PAG1000001",
        ["polling:observe", "polling:object"]),
    r("counting_agent", "Counting agent", "citizen", 0, ["election", "constituency"], "CAG1000001",
        ["counting:observe", "counting:object"]),
    r("bla", "Booth level agent (party)", "citizen", 0, ["constituency", "pollingStation"], "BLA1000001",
        ["roll:view-part", "roll:claims-objections"]),

    // Electoral roll
    r("ero", "Electoral registration officer", "roll", 4, ["constituency"], "ERO1000001",
        ["roll:manage", "roll:publish", "application:decide", "blo:assign", "audit:read"]),
    r("aero", "Assistant electoral registration officer", "roll", 4, ["constituency"], "AER1000001",
        ["roll:manage", "application:decide", "audit:read"]),
    r("blo_supervisor", "BLO supervisor", "roll", 5, ["constituency"], "BLS1000001",
        ["blo:supervise", "roll:view-part", "verification:field-report", "audit:read"]),
    r("blo", "Booth level officer", "roll", 5, ["constituency", "pollingStation"], null,
        ["application:review", "verification:field-report", "roll:view-part"]),

    // Election conduct
    r("ro", "Returning officer", "conduct", 4, ["election", "constituency"], "ROF1000001",
        ["nomination:scrutinise", "polling:arrange", "counting:supervise", "result:declare"]),
    r("aro", "Assistant returning officer", "conduct", 4, ["election", "constituency"], "ARO1000001",
        ["nomination:scrutinise", "polling:arrange", "counting:assist"]),
    r("sector_officer", "Sector officer", "conduct", 5, ["election", "constituency"], "SCO1000001",
        ["polling:inspect", "logistics:track"]),
    r("sector_police_officer", "Sector police officer", "conduct", 5, ["election", "constituency"], "SPO1000001",
        ["security:coordinate", "logistics:track"]),

    // Polling and counting
    r("presiding_officer", "Presiding officer", "polling", 6, ["election", "pollingStation"], "PRO1000001",
        ["polling:conduct", "polling:report"]),
    r("polling_officer", "Polling officer", "polling", 6, ["election", "pollingStation"], "POL1000001",
        ["polling:identify-voter", "polling:mark-register", "polling:operate-evm"]),
    r("counting_supervisor", "Counting supervisor", "polling", 6, ["election", "constituency"], "CSU1000001",
        ["counting:supervise-table"]),
    r("counting_assistant", "Counting assistant", "polling", 6, ["election", "constituency"], "CAS1000001",
        ["counting:record"]),

    // District administration
    r("deo", "District election officer", "district", 3, ["election", "district"], "DEO1000001",
        ["district:manage", "staff:assign", "nodal:coordinate", "observer:view", "audit:read"]),
    r("deputy_deo", "Deputy district election officer", "district", 3, ["election", "district"], "DDO1000001",
        ["district:manage", "nodal:coordinate"]),
    r("district_nodal_officer", "District nodal officer", "district", 3, ["election", "district"], "DNO1000001",
        ["nodal:function-manage"]),
    r("district_police_officer", "District police officer", "district", 3, ["election", "district"], "DPO1000001",
        ["security:coordinate", "security:plan"]),

    // State administration
    r("ceo", "Chief electoral officer", "state", 2, ["state"], "CEO1000001",
        ["state:manage", "staff:assign", "nodal:coordinate", "report:state", "audit:read"]),
    r("state_nodal_officer", "State nodal officer", "state", 2, ["state"], "SNO1000001",
        ["nodal:function-manage"]),
    r("state_police_nodal", "State police nodal officer", "state", 2, ["state"], "SPN1000001",
        ["security:coordinate", "security:plan"]),

    // National administration
    r("eci", "ECI administrator", "national", 1, [], "ECI1234567",
        ["national:manage", "role:assign", "blo:assign", "verification:review", "audit:read", "integration:manage"]),
    r("cec", "Chief election commissioner", "national", 1, [], "CEC1000001",
        ["national:view", "report:national", "audit:read"]),
    r("election_commissioner", "Election commissioner", "national", 1, [], "ELC1000001",
        ["national:view", "report:national", "audit:read"]),

    // Independent oversight: observers get an independent reporting permission, never write access
    // to the records of the officers they observe.
    r("general_observer", "General observer", "observer", 0, ["election", "constituency"], "GOB1000001",
        ["observer:report", "record:read", "audit:read"]),
    r("police_observer", "Police observer", "observer", 0, ["election", "constituency"], "POB1000001",
        ["observer:report", "record:read"]),
    r("expenditure_observer", "Expenditure observer", "observer", 0, ["election", "constituency"], "EOB1000001",
        ["observer:report", "expenditure:read"]),
    r("counting_observer", "Counting observer", "observer", 0, ["election", "constituency"], "COB1000001",
        ["observer:report", "counting:read"]),
    r("micro_observer", "Micro observer", "observer", 0, ["election", "pollingStation"], "MOB1000001",
        ["observer:report"])
];

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
