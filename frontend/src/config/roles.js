// Every sign-in role, grouped the way the Election Commission's structure is grouped. The ids match
// backend/src/config/roles.js (the backend decides who may sign in where; this file decides what
// people see). Role ids are application identifiers, not official ECI login names.

export const GROUPS = [
  { id: "citizen", label: "Voters and political participants", blurb: "Citizens, candidates and the people who act for them." },
  { id: "roll", label: "Electoral roll", blurb: "Officers who prepare, revise and verify the roll." },
  { id: "conduct", label: "Election conduct", blurb: "Officers who run nominations, polling arrangements and counting." },
  { id: "polling", label: "Polling and counting", blurb: "Teams who work at a polling station or counting table." },
  { id: "district", label: "District administration", blurb: "District-level election coordination." },
  { id: "state", label: "State administration", blurb: "State and Union Territory election offices." },
  { id: "national", label: "National administration", blurb: "The Commission and its secretariat." },
  { id: "observer", label: "Independent oversight", blurb: "Observers report independently and do not edit the records they observe." }
];

const role = (id, label, group, blurb, extra = {}) => ({ id, label, group, blurb, ...extra });

export const ROLES = [
  role("voter", "Voter", "citizen", "Check your details, track applications and complete identity verification."),
  role("candidate", "Candidate", "citizen", "Contesting the election. File nominations and apply for campaign permissions."),
  role("election_agent", "Election agent", "citizen", "Represents a candidate in election-related matters."),
  role("polling_agent", "Polling agent", "citizen", "Observes polling at an assigned station on behalf of a candidate."),
  role("counting_agent", "Counting agent", "citizen", "Observes counting on behalf of a candidate. Not a government official."),
  role("bla", "Booth level agent (party)", "citizen", "Appointed by a political party for roll work. Not the same as a booth level officer."),

  role("ero", "Electoral registration officer", "roll", "Prepares, revises and maintains the electoral roll for a constituency."),
  role("aero", "Assistant electoral registration officer", "roll", "Assists the electoral registration officer."),
  role("blo_supervisor", "BLO supervisor", "roll", "Supervises and coordinates booth level officers."),
  role("blo", "Booth level officer", "roll", "Field-level roll work: verifies applicants in the field and recommends a decision to the ERO. Appointed by the government.", { mode: "blo" }),

  role("ro", "Returning officer", "conduct", "Legally responsible for conducting the election: nomination, scrutiny, polling arrangements and counting."),
  role("aro", "Assistant returning officer", "conduct", "Assists the returning officer with assigned election duties."),
  role("sector_officer", "Sector officer", "conduct", "Supervises polling station locations, arrangements and logistics in a sector."),
  role("sector_police_officer", "Sector police officer", "conduct", "Coordinates the police and security side of a sector."),

  role("presiding_officer", "Presiding officer", "polling", "In charge of the polling station and conducts polling by procedure."),
  role("polling_officer", "Polling officer", "polling", "Voter identification, the voter register or EVM duties, as assigned."),
  role("counting_supervisor", "Counting supervisor", "polling", "Supervises an assigned counting table."),
  role("counting_assistant", "Counting assistant", "polling", "Assists with counting and recording at a table."),

  role("deo", "District election officer", "district", "Overall in charge of election activity in the district."),
  role("deputy_deo", "Deputy district election officer", "district", "Assists the district election officer."),
  role("district_nodal_officer", "District nodal officer", "district", "Heads one operational function, such as training, transport or EVM management."),
  role("district_police_officer", "District police officer", "district", "Coordinates election security in the district."),

  role("ceo", "Chief electoral officer", "state", "Supervises election work across the State or Union Territory."),
  role("state_nodal_officer", "State nodal officer", "state", "Coordinates one election function across the state."),
  role("state_police_nodal", "State police nodal officer", "state", "Coordinates police and security arrangements for the state."),

  role("eci", "ECI administrator", "national", "Manages national configuration, role assignments and verification review."),
  role("cec", "Chief election commissioner", "national", "Heads the Election Commission."),
  role("election_commissioner", "Election commissioner", "national", "Member of the Election Commission."),

  role("general_observer", "General observer", "observer", "Monitors the overall election process and fairness."),
  role("police_observer", "Police observer", "observer", "Monitors law and order and the deployment of security forces."),
  role("expenditure_observer", "Expenditure observer", "observer", "Monitors candidate election expenditure."),
  role("counting_observer", "Counting observer", "observer", "Oversees counting arrangements and activity."),
  role("micro_observer", "Micro observer", "observer", "Observes designated polling stations or counting tables and reports to the observer.")
];

// Demo identifiers shown on sign-in pages (the prototype's convention). Mirrors the seeded accounts.
export const DEMO_IDS = {
  voter: "ABC1234567", candidate: "CAN1000001", election_agent: "EAG1000001", polling_agent: "PAG1000001",
  counting_agent: "CAG1000001", bla: "BLA1000001", ero: "ERO1000001", aero: "AER1000001", blo_supervisor: "BLS1000001",
  blo: "BLO-PB-000001", ro: "ROF1000001", aro: "ARO1000001", sector_officer: "SCO1000001", sector_police_officer: "SPO1000001",
  presiding_officer: "PRO1000001", polling_officer: "POL1000001", counting_supervisor: "CSU1000001", counting_assistant: "CAS1000001",
  deo: "DEO1000001", deputy_deo: "DDO1000001", district_nodal_officer: "DNO1000001", district_police_officer: "DPO1000001",
  ceo: "CEO1000001", state_nodal_officer: "SNO1000001", state_police_nodal: "SPN1000001", eci: "ECI1234567", cec: "CEC1000001",
  election_commissioner: "ELC1000001", general_observer: "GOB1000001", police_observer: "POB1000001",
  expenditure_observer: "EOB1000001", counting_observer: "COB1000001", micro_observer: "MOB1000001"
};

export const roleById = (id) => ROLES.find((r) => r.id === id);
export const rolesInGroup = (groupId) => ROLES.filter((r) => r.group === groupId);

/** Where a signed-in account lands. Voters, BLOs and the ECI administrator keep their existing sections. */
export const homeFor = (roleId) => {
  if (roleId === "voter") return "/dashboard";
  if (roleId === "blo" || roleId === "admin") return "/admin";
  if (roleId === "eci") return "/eci/dashboard";
  if (roleId === "ero" || roleId === "aero") return "/ero";
  return "/workspace";
};

/** Sign-in page for a role. */
export const signInPath = (roleId) => `/signin/${roleId}`;
