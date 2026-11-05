// One dashboard ("desk") per sign-in role. Each desk lists:
//   basis    the law or instruction the role's authority comes from
//   mission  what the role is for, in one or two sentences
//   tabs     the work panels on the desk (keys of PANELS in pages/RoleDesk.jsx), in order
//   screens  the role's dedicated work screens elsewhere on the site
//   cannot   what the role must not do just because of its login (separation of duties)
// What a role may do is decided by the backend (backend/src/config/roles.js); a panel the role
// may not use simply gets a 403 and says so. Nothing here grants anything.

const s = (to, label, note) => ({ to, label, note });
const CONTROL = s("/control-room", "Control room", "Stations, alerts and incidents in your jurisdiction");
const TRAINING = s("/training", "Training", "Practice modules for your role");
const RESULTS = s("/results", "Results and counting", "Read-only, from the registered result source");
const LIBRARY = s("/library", "Library", "Handbooks, the compendium of instructions, FAQ and training material");

export const DESKS = {
    candidate: {
        basis: "RP Act 1951, ss. 33-40, 77-78; Conduct of Elections Rules, 1961",
        mission: "You are contesting in your constituency. File your nomination, appoint your agents, apply for campaign permissions and keep the register of election expenditure.",
        tabs: [["permApply", "Campaign permissions"], ["expRegister", "Expenditure register"]],
        screens: [s("/candidate", "Nomination and agents", "File, track or withdraw your nomination; appoint election, polling and counting agents"), s("/candidates", "Know your candidate", "The published list of contesting candidates"), s("/report-violation", "Report a violation", "Model Code of Conduct complaints")],
        cannot: ["Appoint government officers or polling staff", "Edit the electoral roll", "Command polling or counting staff", "Change counting or result data"]
    },
    election_agent: {
        basis: "RP Act 1951, s. 40; Conduct of Elections Rules, 1961, rule 12",
        mission: "You act for one candidate in the matters the appointment covers: permissions, expenditure accounts, notices and appointing polling and counting agents.",
        tabs: [["assisted", "Candidate's nomination"], ["permApply", "Campaign permissions"], ["expRegister", "Expenditure register"]],
        screens: [s("/agent", "Agents", "Appoint and revoke polling and counting agents for your candidate"), s("/candidates", "Know your candidate")],
        cannot: ["Exercise the powers of the ERO, RO or DEO", "See voters' personal data beyond what the law publishes", "Appoint the election agent (only the candidate does)"]
    },
    polling_agent: {
        basis: "RP Act 1951, s. 46; Conduct of Elections Rules, 1961, rules 13 and 36",
        mission: "You watch the poll at one polling station for your candidate. You may challenge an elector's identity through the presiding officer.",
        tabs: [],
        screens: [s("/poll-day", "Poll day at your station", "Station status and your challenges")],
        cannot: ["Mark the register or operate the voting machine", "Direct polling officers", "See other stations"]
    },
    counting_agent: {
        basis: "RP Act 1951, s. 47; Conduct of Elections Rules, 1961, rules 52 and 63",
        mission: "You watch the count for your candidate and may raise a discrepancy or, in writing, ask for a recount (Rule 63). The Returning Officer decides.",
        tabs: [],
        screens: [s("/counting", "Counting", "Rounds, tables, discrepancies and recount requests"), RESULTS],
        cannot: ["Change any count", "Declare the result", "See other constituencies' counting records"]
    },
    bla: {
        basis: "ECI instructions on booth level agents of recognised political parties",
        mission: "Your party appointed you for one part of the roll. Check the entries, point out errors, deaths, shifts and duplicates through Form 7 or the BLO. You do not decide anything.",
        tabs: [["rollPart", "Roll of your part"], ["issues", "Polling-station problems"]],
        screens: [s("/objection", "Form 7 objections", "File up to 10 a day for your part, and follow them"), s("/electoral-roll", "Electoral roll search")],
        cannot: ["Add, delete or correct an entry yourself", "Act as a BLO (a government officer)", "See applicants' documents or contact details"]
    },
    party_treasurer: {
        basis: "RP Act 1951, s. 29C; Income Tax Act, s. 13A; ECI transparency guidelines",
        mission: "You file your party's statutory returns: contributions over ₹20,000 (Form 24A), the audited annual accounts and the statement of election expenditure.",
        tabs: [["partyFilings", "Filings"]],
        screens: [s("/candidates", "Candidates and parties"), LIBRARY],
        cannot: ["Accept cash contributions over ₹2,000", "File for another party", "See other parties' filings"]
    },

    ero: {
        basis: "RP Act 1950, ss. 13B, 22, 23; Registration of Electors Rules, 1960",
        mission: "You prepare, revise and publish the roll of your constituency and decide every claim and objection with a reasoned order.",
        tabs: [["summaryRoll", "Overview"], ["formsDecide", "Forms 2-8"], ["rollQuality", "Duplicates (PSE/DSE) and deaths"], ["appeals", "Appeal orders"], ["bloTeam", "BLOs"], ["fieldSurveyRead", "Station facilities"], ["grievances", "Grievances"], ["issues", "Polling-station problems"], ["audit", "Audit trail"], ["workload", "Workload"]],
        screens: [s("/ero", "Form 6, Form 8 and Form 7 decisions", "Applications, new-voter tasks and roll versions"), s("/electoral-roll", "Electoral roll search"), TRAINING, LIBRARY],
        cannot: ["Change records outside your constituency", "Skip the notice and hearing steps", "Act on an expired appointment"]
    },
    aero: {
        basis: "RP Act 1950, s. 13C",
        mission: "You perform the ERO functions delegated to you, under the ERO's control, for the same constituency.",
        tabs: [["summaryRoll", "Overview"], ["formsDecide", "Forms 2-8"], ["rollQuality", "Duplicates (PSE/DSE) and deaths"], ["appeals", "Appeal orders"], ["grievances", "Grievances"], ["audit", "Audit trail"], ["workload", "Workload"]],
        screens: [s("/ero", "Application decisions", "Form 6, Form 8 and Form 7"), TRAINING, LIBRARY],
        cannot: ["Act outside your delegation", "Override the ERO or the Commission", "Publish the roll (the ERO does)"]
    },
    blo_supervisor: {
        basis: "ECI Manual on Electoral Rolls, 2023 (field supervision)",
        mission: "You allocate and check the field work of the BLOs in your area and send back incomplete reports. The ERO decides applications.",
        tabs: [["bloTeam", "Team and tasks"], ["formsField", "Field verification"], ["summaryRoll", "Overview"], ["rollQuality", "Duplicates and deaths"], ["bloRegister", "House-to-house register"], ["rollPart", "Roll"], ["audit", "Audit trail"], ["workload", "Workload"]],
        screens: [TRAINING],
        cannot: ["Decide claims, objections or deletions", "Change the roll"]
    },
    blo: {
        basis: "RP Act 1950, s. 13B(2); ECI Manual on Electoral Rolls, 2023",
        mission: "You verify applicants in the field, report what you found and recommend. Your report is evidence for the ERO, not a decision.",
        tabs: [["formsField", "Forms 2-8 field verification"], ["rollQuality", "Duplicates, deaths and notices"], ["bloRegister", "House-to-house register and EPICs"], ["fieldSurvey", "Polling-station facilities"], ["rollPart", "Roll of your part"], ["issues", "Polling-station problems"]],
        screens: [s("/admin", "BLO workbench", "Form 6 and Form 8 verification, new-voter tasks, review cases"), s("/poll-day", "Voter assistance booth", "Poll day: help electors find their serial number"), TRAINING, LIBRARY],
        cannot: ["Approve or reject an application", "Delete an entry from the roll"]
    },
    record_officer: {
        basis: "RP Act 1950, s. 20(3); Registration of Electors Rules, 1960, rr. 17-18 (service voters)",
        mission: "You are the Record Officer of a service. You check the service particulars of service voters applying in Forms 2, 2A and 3, and pass each electronically transmitted postal ballot's PIN to the voter by a separate channel.",
        tabs: [["recordOfficer", "Service voters and PINs"]],
        screens: [s("/voters/forms/form-2", "File Form 2 for a service voter"), s("/postal-ballot", "What service voters see", "Open, print and post the ballot"), LIBRARY],
        cannot: ["Decide an application (the ERO does)", "See a ballot's contents or how anyone voted", "Generate ballots (the RO does)"]
    },

    ro: {
        basis: "RP Act 1951, ss. 21, 33-36, 64, 66; Conduct of Elections Rules, 1961",
        mission: "You conduct the election in your constituency: nominations and scrutiny, the list of contesting candidates, polling arrangements, campaign permissions, counting and the declaration.",
        tabs: [["summary", "Overview"], ["encore", "Deposits, paper nominations and symbols"], ["complaints", "MCC complaints"], ["permStaff", "Campaign permissions"], ["evm", "EVMs: 2nd randomisation"], ["etpb", "Postal ballots (service voters)"], ["indexCard", "Index Card"],
            ["stationReports", "Station reports"], ["seizures", "Seizures"], ["grievances", "Grievances"], ["directions", "Commission directions"], ["issues", "Polling-station problems"]],
        screens: [s("/ro", "Scrutiny and candidates", "Nominations, scrutiny, the list of contesting candidates, polling parties"), s("/counting", "Counting", "Plan, randomisation, rounds, discrepancies, VVPAT draw"), CONTROL, RESULTS, TRAINING, LIBRARY],
        cannot: ["Change the electoral roll", "Change the polling-station list (the DEO with the Commission's approval does)", "Bypass the counting rules"]
    },
    aro: {
        basis: "RP Act 1951, s. 22",
        mission: "You assist the Returning Officer and perform the functions delegated to you. You scrutinise nominations only when the RO is unavoidably prevented and has delegated it.",
        tabs: [["summary", "Overview"], ["complaints", "MCC complaints"], ["permStaff", "Campaign permissions"], ["evm", "EVMs"], ["stationReports", "Station reports"], ["grievances", "Grievances"], ["issues", "Polling-station problems"]],
        screens: [s("/ro", "Scrutiny and candidates", "Scrutiny when delegated; polling parties"), CONTROL, TRAINING, LIBRARY],
        cannot: ["Scrutinise without the RO's delegation", "Declare the result"]
    },
    sector_officer: {
        basis: "ECI Handbook for Sector Officers, 2023",
        mission: "You look after a group of polling stations: their readiness, the movement of polling parties and machines, and problems on poll day, reporting to the RO and DEO.",
        tabs: [["logistics", "Polling logistics"], ["fieldSurvey", "Station facilities (AMF/EMF)"], ["evm", "EVMs"], ["issues", "Polling-station problems"], ["directions", "Directions"]],
        screens: [CONTROL, TRAINING, LIBRARY],
        cannot: ["Create or move polling stations", "Appoint polling staff", "Change the roll or results"]
    },
    flying_squad: {
        basis: "DEO's order under ECI instructions on expenditure and MCC monitoring",
        mission: "You are a flying squad or static surveillance team. Reach the spot of a reported violation fast, act under the law, seize cash, liquor or freebies with a panchnama, and report.",
        tabs: [["complaints", "Assigned reports"], ["squads", "My position"], ["seizures", "Seizure register"]],
        screens: [s("/report-violation", "Public reporting page", "What citizens see when they report")],
        cannot: ["Dispose of a complaint (the RO does)", "Act outside your constituency", "Treat a seizure as a finding against a candidate"]
    },
    enforcement_officer: {
        basis: "ECI instructions on election expenditure monitoring (multi-agency coordination)",
        mission: "You belong to an enforcement agency (police, excise, income tax, NCB, customs, DRI, GST, RPF). Enter every interception and seizure in the district into the seizure register the same day.",
        tabs: [["seizures", "Seizure register"]],
        screens: [LIBRARY],
        cannot: ["Release seized cash (the district committee does)", "Enter the same seizure twice", "Treat a seizure as a finding against a candidate"]
    },
    sector_police_officer: {
        basis: "Police deployment order; RP Act 1951, s. 28A (election duty)",
        mission: "You coordinate police and security in the sector: routes, escorts, law and order, and police remarks on campaign events.",
        tabs: [["security", "Security"], ["permStaff", "Police remarks on permissions"], ["logistics", "Polling logistics"]],
        screens: [],
        cannot: ["Change any election record", "Direct civil election staff beyond your authority"]
    },

    presiding_officer: {
        basis: "RP Act 1951, s. 26; Conduct of Elections Rules, 1961, Part IV",
        mission: "You are in charge of your polling station on poll day and conduct the poll by procedure.",
        tabs: [["stationRecords", "Machine log and PO report"], ["directions", "Directions"]],
        screens: [s("/poll-day/presiding-officer", "Presiding officer's assistant", "Checklists, procedures, register, cases"), s("/poll-day", "Poll day at your station", "Mock poll, opening, marking, queue, close"), TRAINING],
        cannot: ["Change roll entries", "Move the station", "Declare a result"]
    },
    polling_officer: {
        basis: "RP Act 1951, s. 26",
        mission: "You identify electors against the roll, mark the register and operate the machines as the presiding officer assigns.",
        tabs: [["stationRecords", "Machine log"]],
        screens: [s("/poll-day", "Poll day at your station", "Search the part, guided marking"), TRAINING],
        cannot: ["Change the roll or your station"]
    },
    counting_supervisor: {
        basis: "Conduct of Elections Rules, 1961, rule 53",
        mission: "You supervise your counting table and record its figures for each round.",
        tabs: [],
        screens: [s("/counting", "Counting", "Your table and rounds"), TRAINING],
        cannot: ["Declare the result", "Change other tables' figures"]
    },
    counting_assistant: {
        basis: "Conduct of Elections Rules, 1961, rule 53",
        mission: "You assist with counting and recording at your table.",
        tabs: [],
        screens: [s("/counting", "Counting", "Your table and rounds"), TRAINING],
        cannot: ["Approve figures", "Direct the Returning Officer"]
    },

    deo: {
        basis: "RP Act 1950, s. 13AA; RP Act 1951, ss. 20A, 25, 26",
        mission: "You run the election machinery of the district: polling stations (with the Commission's prior approval), polling staff, nodal officers and district reports to the CEO.",
        tabs: [["summary", "District report"], ["stationsDeo", "Polling-station changes"], ["fieldSurveyRead", "Station facilities"], ["issuesClose", "Station problems"], ["evm", "EVMs: warehouse, FLC, 1st randomisation"], ["complaints", "MCC control room"], ["squads", "Flying squads"], ["seizures", "Seizures"],
            ["grievances", "Grievances"], ["appeals", "Roll appeals"], ["nodal", "Nodal officers"], ["stationReports", "Station reports"], ["observerRead", "Observer reports"], ["directions", "Directions"], ["permStaff", "Permissions"], ["audit", "Audit trail"], ["workload", "Workload"]],
        screens: [s("/deo", "Polling stations and staff", "Propose stations and relocations; appoint election staff"), CONTROL, TRAINING, LIBRARY],
        cannot: ["Make a polling-station change without the Commission's prior approval", "Redraw constituency boundaries", "Decide roll applications (the ERO does)"]
    },
    deputy_deo: {
        basis: "Assignment order (delegated district functions)",
        mission: "You assist the DEO with the district functions delegated to you.",
        tabs: [["summary", "District report"], ["complaints", "MCC control room"], ["seizures", "Seizures"], ["grievances", "Grievances"], ["nodal", "Nodal officers"], ["permStaff", "Permissions"]],
        screens: [CONTROL],
        cannot: ["Exercise every DEO power just because of the title", "Propose polling stations or appoint polling staff unless delegated"]
    },
    district_nodal_officer: {
        basis: "DEO's designation order for one subject",
        mission: "You head one election function in the district, such as EVMs, training or transport, and report on it.",
        tabs: [["nodal", "Your subject"], ["evm", "EVMs (if your subject)"], ["seizures", "Seizures (expenditure)"], ["logistics", "Polling logistics"]],
        screens: [TRAINING, LIBRARY],
        cannot: ["Act on another subject", "Override the ERO, RO, DEO or the Commission"]
    },
    district_police_officer: {
        basis: "State police order; RP Act 1951, s. 28A (election duty)",
        mission: "You plan election security in the district: vulnerability of polling stations, force deployment and law and order.",
        tabs: [["security", "Security plan"], ["seizures", "Police seizures"], ["permStaff", "Police remarks on permissions"], ["directions", "Directions"]],
        screens: [],
        cannot: ["Change the polling-station list, roll or results", "Command the ERO or RO as election officers"]
    },

    ceo: {
        basis: "RP Act 1950, s. 13A; RP Act 1951, s. 20",
        mission: "You supervise roll and election work across the State, forward district proposals to the Commission and carry out its directions.",
        tabs: [["summary", "State report"], ["eplan", "Election planning"], ["stationsCeo", "Station proposals to forward"], ["indexCard", "Index Cards to examine"], ["appeals", "Second appeals"], ["evm", "EVMs"], ["seizures", "Seizures"], ["grievances", "Grievances"],
            ["stationReports", "Station reports"], ["nodal", "State nodal officers"], ["directions", "Directions"], ["audit", "Audit trail"], ["workload", "Workload"]],
        screens: [CONTROL, s("/states", "State election offices"), LIBRARY],
        cannot: ["Replace the Commission's prior approval with your own", "Decide matters reserved to the ERO or RO"]
    },
    state_nodal_officer: {
        basis: "CEO's designation order for one subject",
        mission: "You coordinate one election function across the State and report on it.",
        tabs: [["nodal", "Your subject"]],
        screens: [TRAINING],
        cannot: ["Exercise CEO or DEO powers", "Act on another subject"]
    },
    state_police_nodal: {
        basis: "State Home Department / police order, with ECI coordination",
        mission: "You coordinate police and security arrangements for the State.",
        tabs: [["security", "Security across the State"], ["directions", "Directions"]],
        screens: [],
        cannot: ["Decide roll, polling-station or result matters"]
    },

    eci: {
        basis: "Platform administration (a technical role, not a statutory office)",
        mission: "You manage the platform's national configuration, role assignments, data sources and verification review, and record the Commission's decisions with their order references.",
        tabs: [["summary", "National picture"], ["eplan", "Election planning"], ["stationsEci", "Polling-station approvals"], ["indexCard", "Index Cards to finalise"], ["partyCompliance", "Party filings"], ["observerReview", "Observer reports"],
            ["seizures", "Seizures"], ["grievances", "Grievances"], ["evm", "EVMs"], ["library", "Library"], ["dataStores", "Data stores"], ["audit", "Audit trail"], ["workload", "Workload"]],
        screens: [s("/eci/dashboard", "Administration", "Accounts, roles, assignments and verification cases"), s("/eci/elections", "Elections", "Announce elections and revise schedules"), s("/eci/integrations", "Data sources", "Approved sources for the new-voter pipeline, audit integrity"), s("/eci/voting-verification", "Voting verification"), CONTROL],
        cannot: ["Create a Commission order without the Commission's decision", "Reverse a declared result"]
    },
    cec: {
        basis: "Constitution, Article 324; CEC and Other ECs Act, 2023",
        mission: "You head the Commission. Review the national picture and observers' reports, and issue directions to field officers.",
        tabs: [["summary", "National picture"], ["observerReview", "Observer reports"], ["directionsIssue", "Directions"], ["eplan", "Election planning"], ["seizures", "Seizures"], ["partyCompliance", "Party filings"], ["evm", "EVMs"], ["audit", "Audit trail"]],
        screens: [CONTROL, RESULTS],
        cannot: ["Bypass the Commission's own procedure", "Contradict the Acts and Rules"]
    },
    election_commissioner: {
        basis: "Constitution, Article 324; CEC and Other ECs Act, 2023",
        mission: "You are a member of the Commission. Review the national picture and observers' reports, and issue directions within the Commission's allocation of business.",
        tabs: [["summary", "National picture"], ["observerReview", "Observer reports"], ["directionsIssue", "Directions"], ["eplan", "Election planning"], ["seizures", "Seizures"], ["partyCompliance", "Party filings"], ["evm", "EVMs"], ["audit", "Audit trail"]],
        screens: [CONTROL, RESULTS],
        cannot: ["Act alone outside the Commission's allocation of business"]
    },

    general_observer: {
        basis: "RP Act 1951, s. 20B; ECI Handbook for Observers, 2024",
        mission: "You are the Commission's eyes and ears in your constituency. Watch every stage, read the records, and report to the Commission.",
        tabs: [["observerPortal", "My portal"], ["observerFile", "Reports to the Commission"], ["summary", "Constituency picture"], ["complaints", "MCC complaints"], ["squads", "Flying squads"], ["evm", "EVMs"], ["stationReports", "Station reports"], ["formsRead", "Roll applications"], ["permStaff", "Permissions"], ["directions", "Directions"], ["audit", "Audit trail"]],
        screens: [CONTROL, s("/counting", "Counting"), RESULTS],
        cannot: ["Edit the records you observe", "Command district staff", "Share confidential reports"]
    },
    police_observer: {
        basis: "ECI observer instructions",
        mission: "You watch the police and security arrangements and report to the Commission.",
        tabs: [["observerPortal", "My portal"], ["observerFile", "Reports to the Commission"], ["security", "Security arrangements"], ["complaints", "MCC complaints"], ["squads", "Flying squads"], ["seizures", "Seizures"], ["permStaff", "Permissions"]],
        screens: [],
        cannot: ["Command the police", "Edit any record"]
    },
    expenditure_observer: {
        basis: "ECI instructions on expenditure monitoring",
        mission: "You watch candidates' election expenditure: read their registers, keep the shadow observation register and report discrepancies.",
        tabs: [["observerPortal", "My portal"], ["expObserve", "Candidates' registers"], ["seizures", "Seizure register"], ["complaints", "Complaints"], ["squads", "Flying squads"], ["observerFile", "Reports to the Commission"]],
        screens: [],
        cannot: ["Make a final finding of a violation", "Edit a candidate's register"]
    },
    counting_observer: {
        basis: "ECI observer instructions on counting",
        mission: "You watch the counting arrangements and process and report to the Commission. The Returning Officer remains in charge of the count.",
        tabs: [["observerPortal", "My portal"], ["observerFile", "Reports to the Commission"], ["stationReports", "Station reports"]],
        screens: [s("/counting", "Counting", "Read the plan and rounds; report discrepancies"), RESULTS],
        cannot: ["Edit counting tables", "Declare a result"]
    },
    micro_observer: {
        basis: "ECI observer instructions on micro observers",
        mission: "You watch the poll at a critical polling station and report to the general observer and the Commission.",
        tabs: [["observerPortal", "My portal"], ["observerFile", "Reports"]],
        screens: [s("/poll-day", "Your polling station", "Station status; report an incident"), TRAINING],
        cannot: ["Take over the presiding officer's duties"]
    }
};
