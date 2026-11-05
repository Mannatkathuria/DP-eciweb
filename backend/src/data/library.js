// Seed content for the reference library: handbooks and manuals, the compendium of instructions,
// eBooks, the FAQ and training material. These are short summaries written for this platform,
// pointing to the official ECI publication each one corresponds to; they are not copies of ECI
// text. The Commission's own documents are authoritative.

const h = (slug, title, audience, summary, chapters, extra = {}) => ({ type: "handbook", slug, title, audience, summary, chapters, ...extra });
const ch = (title, ...pages) => ({ title, pages });

export const HANDBOOKS = [
    h("handbook-returning-officer", "Handbook for Returning Officers", ["ro", "aro"], "The RO's duties from the notification to the declaration: nominations, scrutiny, withdrawal, symbols, polling arrangements, counting and the return of election.", [
        ch("Before the notification", "Get the constituency file ready: the electoral roll as finally published, the list of polling stations approved by the Commission, the strong room and counting centre.", "Check the appointment orders of AROs, sector officers and the counting staff pool. Every officer must be in the platform with a valid assignment."),
        ch("Nominations and scrutiny", "Receive nominations (Form 2B for the Assembly, 2A for the Lok Sabha) only between 11 a.m. and 3 p.m. on working days within the nomination period. Each nomination must come with the Form 26 affidavit and the security deposit.", "On the date of scrutiny, examine every nomination in the presence of the candidates and their agents. Record a reasoned order for each rejection (RP Act 1951, s. 36)."),
        ch("Withdrawal, symbols and Form 7A", "After the last date of withdrawal, allot symbols: reserved symbols to candidates of recognised parties, free symbols to the others in the order of their preference.", "Prepare the list of contesting candidates in Form 7A: recognised national and State parties first, then registered unrecognised parties, then independents, each group in alphabetical order."),
        ch("Counting and declaration", "Counting starts with postal ballots at 8 a.m.; EVM counting starts 30 minutes later. Record each round on the counting sheet and let the agents see it.", "Declare the result in Form 21C or 21D, and complete the return of election (Form 21E). Fill in the Index Card within 72 hours.")
    ]),
    h("handbook-presiding-officer", "Handbook for Presiding Officers", ["presiding_officer", "polling_officer"], "Running a polling station on poll day: setting up, the mock poll, identifying electors, the register (Form 17A), closing the poll and Form 17C.", [
        ch("The day before the poll", "Collect the polling material from the dispatch centre and check it against the list. Check the EVM and VVPAT serial numbers against the second randomisation list.", "Reach the polling station, set it up so the voting compartment cannot be seen into, and check the assured minimum facilities."),
        ch("Mock poll and opening", "Start the mock poll 90 minutes before the poll with at least 50 votes, in the presence of the polling agents. Show the result and clear the control unit; remove and seal the mock-poll slips.", "Fill in the mock poll certificate. Start the poll at the notified time."),
        ch("Identifying electors", "The first polling officer finds the elector's entry in the marked copy of the roll and checks the identity document. The second marks the finger with indelible ink and takes the signature or thumb impression in the register (Form 17A).", "If an agent challenges an elector's identity (rule 36), hold a summary inquiry after the challenge fee is paid."),
        ch("Closing the poll", "Electors in the queue at closing time are given numbered slips and allowed to vote. Press the Close button only after the last of them has voted.", "Prepare the account of votes recorded (Form 17C Part I) and give copies to the polling agents.")
    ]),
    h("handbook-sector-officer", "Handbook for Sector Officers", ["sector_officer"], "Looking after a group of polling stations: readiness, movement of polling parties and machines, poll-day problems and reporting.", [
        ch("Before the poll", "Visit every station in your sector. Check the assured minimum facilities, access for electors with disabilities and the mobile network.", "Map vulnerable hamlets and the persons who could intimidate electors, and give the list to the RO and police."),
        ch("Poll day", "Carry reserve EVMs and VVPATs. Replace a machine only under the procedure, recording the serial numbers of both.", "Report the mock poll, the start of the poll and two-hourly turnout from each station.")
    ]),
    h("handbook-ero", "Manual on Electoral Rolls (for EROs and AEROs)", ["ero", "aero", "blo_supervisor"], "Preparing and revising the roll: claims and objections, notices and hearings, deletions, the final publication and the continuous updation.", [
        ch("Claims and objections", "Every Form 6, 6A, 7 and 8 is decided by a reasoned order. A deletion (Form 7) needs notice to the person objected to and a hearing.", "Use the field report of the BLO as evidence, not as a decision."),
        ch("Photo-similar and demographically similar entries", "PSE and DSE flags show entries that may belong to the same person. They are not proof. Issue a notice, hold a hearing, and keep both entries if they are different people.", "Record every outcome so the flag is not raised again for the same pair."),
        ch("Final publication", "Publish the roll after disposing of all claims and objections. Give copies to the recognised political parties.")
    ]),
    h("handbook-blo", "Handbook for Booth Level Officers", ["blo"], "House-to-house verification, field reports on applications, the BLO register, polling-station facility surveys and EPIC delivery.", [
        ch("House-to-house verification", "Visit every house in your part. Record who lives there, who has shifted, who has died and who is newly eligible.", "Do not delete anyone yourself. Report what you found; the ERO decides."),
        ch("Polling-station facilities", "Survey the assured minimum facilities (ramp, drinking water, toilet, electricity, shade, furniture, signage) and record the GPS location and a photograph.", "Note the distance to the nearest bus stand, police station, hospital, fire station, fuel pump and parking.")
    ]),
    h("handbook-observer", "Handbook for Observers", ["general_observer", "police_observer", "expenditure_observer", "counting_observer", "micro_observer"], "The observer's role: arrival, meeting the district officers, watching every stage, daily reports, the poll-day and counting reports, and the final report.", [
        ch("Arrival", "Report your arrival to the Commission and the CEO on the day you reach the constituency. Your contact details are published so that the public can reach you.", "Meet the DEO, RO, SP and the expenditure monitoring teams."),
        ch("Reporting", "File a report every day during the campaign, a report on poll day, and a final report after counting. Flag anything serious at once.", "Your reports go to the Commission and are confidential.")
    ]),
    h("handbook-candidate", "Handbook for Candidates", ["candidate", "election_agent"], "Filing a nomination, the affidavit, the security deposit, agents, the Model Code of Conduct, expenditure accounts and counting.", [
        ch("Nomination", "File your nomination with the RO within the nomination period, with the Form 26 affidavit (criminal antecedents, assets, liabilities, education) and the security deposit: ₹10,000 for the Assembly and ₹25,000 for the Lok Sabha (half for SC/ST candidates).", "You may file up to four nomination papers for the same constituency."),
        ch("Expenditure", "Keep a day-to-day account of election expenditure from the date of nomination, open a separate bank account, and file the account within 30 days of the result (RP Act 1951, s. 78).")
    ])
];

const c = (slug, title, category, issuedOn, reference, summary, body) => ({ type: "compendium", slug, title, category, issuedOn, reference, summary, body });
export const COMPENDIUM = [
    c("mcc-consolidated", "Model Code of Conduct: consolidated instructions", "Model Code of Conduct", "2024-03-02", "ECI/MCC/2024", "What candidates, parties and governments may not do once an election is announced.", "The MCC applies from the announcement of the election until its completion. Ministers may not combine official visits with campaigning, announce new schemes, or use government transport for campaigning. Complaints are taken through cVIGIL and acted on within 100 minutes."),
    c("polling-station-rationalisation", "Rationalisation of polling stations", "Polling stations", "2023-06-14", "ECI/PS/2023", "Limits on electors per station, distances, and the prior approval of the Commission.", "A polling station should have not more than 1,500 electors (1,200 under current instructions for new stations) and no elector should travel more than 2 km. Every change needs the Commission's prior approval under s. 25 of the RP Act 1951."),
    c("cvigil-sop", "cVIGIL standard operating procedure", "Complaints", "2024-01-15", "ECI/cVIGIL/SOP", "How the District Control Room, flying squads and the RO handle cVIGIL complaints.", "The DCC screens the report within 5 minutes, sends a flying squad within 15, the squad reaches and acts within 30, and the RO disposes within 50: 100 minutes in all."),
    c("expenditure-monitoring", "Instructions on election expenditure monitoring", "Expenditure", "2024-02-20", "ECI/EEM/2024", "Flying squads, static surveillance teams, video teams, the shadow register and the candidate's account.", "Every seizure is recorded with a panchnama and reported in the Election Seizure Management System the same day. Cash over ₹50,000 without documents may be seized."),
    c("postal-ballot-service-voters", "Postal ballots for service voters (ETPBS)", "Postal ballots", "2023-11-10", "ECI/PB/ETPBS", "Electronically transmitted postal ballots: generation, transmission, return and counting.", "The ballot is sent electronically as a password-protected file; the PIN goes separately to the Record Officer. The marked ballot is returned by post, free of charge by Speed Post, and is counted only if it arrives before the counting of postal ballots starts."),
    c("evm-management", "EVM and VVPAT management", "EVM/VVPAT", "2024-01-05", "ECI/EVM/2024", "First-level checking, the two randomisations, commissioning and storage.", "First randomisation allots machines from the district warehouse to constituencies; second randomisation allots them to polling stations. Both are done through EMS in the presence of party representatives."),
    c("index-card", "Online Index Card", "Statistics", "2022-09-01", "ECI/Stat/IC", "The statistical report on every constituency, filled in by the RO within 72 hours of the declaration.", "The Index Card records the schedule, the electors, the votes polled, the candidates and their votes. The CEO checks it; the Commission finalises and publishes it.")
];

const e = (slug, title, category, summary, chapters, extra = {}) => ({ type: "ebook", slug, title, category, summary, chapters, ...extra });
export const EBOOKS = [
    e("leap-of-faith", "Leap of Faith: India's first general elections", "History", "How India organised its first general election in 1951-52 with 173 million electors.", [
        ch("A republic votes", "The first general election ran from October 1951 to February 1952. Most electors could not read, so each candidate had a separate ballot box with the party symbol on it.", "About 224,000 polling stations were set up."),
        ch("The machinery", "Sukumar Sen, the first Chief Election Commissioner, built the election machinery from scratch: rolls, stations, staff and boxes.", "Indelible ink was first used in 1962.")
    ]),
    e("electoral-statistics-atlas", "Atlas of electoral statistics", "Statistics", "Electors, turnout and gender ratio across States, with notes on how each figure is computed.", [
        ch("Electors", "The elector gender ratio is the number of women electors per 1,000 men electors.", "The elector-population ratio compares the roll with the census projection of the adult population."),
        ch("Turnout", "Turnout is votes polled divided by electors, including postal ballots.")
    ]),
    e("evm-journey", "The journey of the EVM", "EVM/VVPAT", "From paper ballots to EVMs and VVPATs: the safeguards at each stage.", [
        ch("Standalone machines", "An EVM is not connected to any network. The control unit records votes; the ballot unit shows the candidates; the VVPAT prints a slip visible for seven seconds."),
        ch("Safeguards", "First-level checking, two randomisations, mock polls, sealing, the strong room and the VVPAT slip count at five random stations per constituency.")
    ])
];

const TRAINING = [
    ["it-applications", "IT applications", "The ECI applications used by election officers and how each fits the workflow."],
    ["poll-process", "Poll process", "Procedures before, during and after the poll."],
    ["counting-of-votes", "Counting of votes", "The counting hall, rounds, postal ballots, VVPAT slip count and the result."],
    ["nomination", "Nomination", "Receiving, scrutinising and finalising nominations."],
    ["paid-news", "Paid news", "Identifying paid news and the procedure for notices."],
    ["mcmc", "MCMC", "The Media Certification and Monitoring Committee: pre-certification of advertisements."],
    ["vulnerability-mapping", "Vulnerability mapping", "Finding hamlets and electors at risk of intimidation and planning for them."],
    ["evm-vvpat", "EVM/VVPAT", "Handling, preparation, the mock poll, clearing data and sealing."],
    ["mcc", "Model Code of Conduct", "What the MCC forbids and how violations are handled."],
    ["symbol-allotment", "Symbol allotment", "Reserved and free symbols and the order of allotment."]
];
export const TRAINING_MATERIAL = TRAINING.map(([slug, title, summary]) => ({
    type: "training", slug: `training-${slug}`, title, category: title, summary,
    chapters: [ch("Overview", summary, "Practise this topic in the training simulator after reading."), ch("Checklist", "Read the handbook chapter for your role.", "Complete the module quiz with at least 80%.")],
    media: [{ kind: "video", title: `${title} (Hindi)`, language: "hi" }, { kind: "video", title: `${title} (English)`, language: "en" }]
}));

// FAQ: the categories of the ECI FAQ portal, with a few questions each.
const q = (question, answer) => ({ question, answer });
const FAQ = {
    "Elections": [q("Who conducts elections in India?", "The Election Commission of India conducts elections to Parliament, State legislatures and the offices of President and Vice-President (Constitution, Art. 324). State Election Commissions conduct local body elections."), q("How often are general elections held?", "Every five years, unless the House is dissolved earlier.")],
    "EVM": [q("Can an EVM be hacked?", "EVMs are standalone machines with no wired or wireless connection. They are checked, randomised twice and mock-polled in front of party representatives."), q("What is a VVPAT?", "The Voter Verifiable Paper Audit Trail prints a slip with the serial number, name and symbol of the candidate you voted for; it is visible for seven seconds and then falls into a sealed box."), q("How many VVPAT slips are counted?", "Slips of five randomly selected polling stations in each assembly constituency (or segment) are counted and matched with the EVM count.")],
    "Political parties": [q("How is a party registered?", "Under s. 29A of the RP Act 1951, by applying to the Commission within 30 days of formation."), q("What is a recognised party?", "A party that meets the conditions of the Symbols Order, 1968 is recognised as a national or State party and gets a reserved symbol.")],
    "Model Code of Conduct": [q("When does the MCC start?", "From the announcement of the election schedule until the completion of the election."), q("How do I report a violation?", "Use cVIGIL (Report a violation) with a photo or video; it is acted on within 100 minutes.")],
    "Conduct of Elections": [q("What is a polling station?", "A place where electors of a part of the roll vote. Every change to the list needs the Commission's prior approval.")],
    "Voters/Electors": [q("Who can register as a voter?", "An Indian citizen aged 18 or more on the qualifying date, ordinarily resident in the constituency."), q("Can I vote without an EPIC?", "Yes, if your name is on the roll, with any of the alternative identity documents allowed by the Commission.")],
    "Council of States": [q("How are members of the Rajya Sabha elected?", "By the elected members of the State legislative assemblies by proportional representation through the single transferable vote.")],
    "Presidential Election": [q("Who elects the President?", "An electoral college of the elected members of both Houses of Parliament and of the State legislative assemblies (Art. 54).")],
    "RO/DEO FAQs": [q("When can the RO reject a nomination?", "Only on the grounds in s. 36 of the RP Act 1951, after hearing the candidate, with a reasoned order."), q("Who approves a new polling station?", "The Commission, on the DEO's proposal through the CEO (RP Act 1951, s. 25).")],
    "Election Machinery": [q("Who is the DEO?", "The District Election Officer, usually the District Collector, who coordinates election work in the district under the CEO.")],
    "Parliament": [q("How many seats does the Lok Sabha have?", "543 elected seats.")],
    "Delimitation": [q("Who redraws constituency boundaries?", "The Delimitation Commission, under the Delimitation Act; its orders cannot be questioned in court.")],
    "Contesting Elections": [q("What is the minimum age to contest?", "25 for the Lok Sabha and State assemblies; 30 for the Rajya Sabha and legislative councils."), q("What is the security deposit?", "₹25,000 for the Lok Sabha and ₹10,000 for an assembly; half for SC/ST candidates.")],
    "Counting and Declaration": [q("When are postal ballots counted?", "First, from 8 a.m.; EVM counting starts after 30 minutes.")],
    "How to Register": [q("Which form do I use?", "Form 6 to register, Form 6A if you live abroad, Form 7 to object to or delete an entry, Form 8 to correct an entry or shift residence."), q("How do I track my application?", "Use the reference number on the Track application page.")]
};
export const FAQS = Object.entries(FAQ).flatMap(([category, items]) => items.map((item, i) => ({
    type: "faq", slug: `faq-${category.toLowerCase().replace(/[^a-z]+/g, "-")}-${i + 1}`, category, title: item.question, summary: item.answer, body: item.answer
})));

export const FAQ_CATEGORIES = Object.keys(FAQ);
export const LIBRARY_TYPES = { handbook: "Handbooks and manuals", compendium: "Compendium of instructions", ebook: "eBooks", faq: "FAQ", training: "Training material" };
export const ALL_LIBRARY_ITEMS = [...HANDBOOKS, ...COMPENDIUM, ...EBOOKS, ...TRAINING_MATERIAL, ...FAQS];
