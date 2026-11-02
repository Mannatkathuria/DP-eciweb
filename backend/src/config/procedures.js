// Versioned procedure library for the presiding officer assistant.
//
// Every entry names its source and the version it was written against. The text is a plain-
// language paraphrase for quick reference on poll day; it is NOT the official text and it makes
// no decision. The presiding officer decides, under the Conduct of Elections Rules, 1961 and the
// Commission's current instructions. Before a live election an authorised official must check
// each entry against the current ECI Handbook for Presiding Officers and replace this library
// with a reviewed version (see docs/POLL_DAY_OPERATIONS.md). Until then every entry carries
// reviewStatus "unreviewed".

export const LIBRARY_VERSION = "2026.11-draft.1";
export const SOURCES = {
    cer1961: { title: "Conduct of Elections Rules, 1961 (as amended)", publisher: "Ministry of Law and Justice, Government of India", url: "https://www.indiacode.nic.in/" },
    rpa1951: { title: "Representation of the People Act, 1951 (as amended)", publisher: "Ministry of Law and Justice, Government of India", url: "https://www.indiacode.nic.in/" },
    poHandbook: { title: "Handbook for Presiding Officers (current edition)", publisher: "Election Commission of India", url: "https://www.eci.gov.in/", note: "Not loaded: the current edition must be obtained from the Commission and the entries below checked against it." }
};

const entry = (id, title, tags, steps, sources, extra = {}) => ({ id, title, tags, steps, sources, version: LIBRARY_VERSION, reviewStatus: "unreviewed", ...extra });

export const PROCEDURES = [
    entry("identify-elector", "Identifying an elector", ["identity", "epic", "documents", "first polling officer"], [
        "The first polling officer finds the elector in the marked copy of the roll and reads out the name and serial number.",
        "The elector shows the EPIC or one of the alternative photo documents the Commission has notified for this election.",
        "If the identity is in doubt, do not mark the elector: raise an identity doubt for the presiding officer to decide."
    ], [{ source: "cer1961", ref: "Rule 35 (identification of electors)" }, { source: "poHandbook", ref: "Chapter on the polling process" }]),
    entry("indelible-ink", "Indelible ink and the register of voters", ["ink", "form 17a", "second polling officer"], [
        "The second polling officer checks the left forefinger for an ink mark before applying ink.",
        "An elector who refuses to have the finger inspected or inked is not allowed to vote.",
        "The elector's entry is made in the register of voters (Form 17A) and the elector signs or puts a thumb impression."
    ], [{ source: "cer1961", ref: "Rule 37 (safeguards against impersonation) and Rule 49K / 49L (register of voters, Form 17A)" }]),
    entry("challenged-vote", "When a polling agent challenges an elector's identity", ["challenge", "agent", "form 14"], [
        "The agent pays the challenge fee to the presiding officer, who gives a receipt.",
        "The presiding officer holds a summary inquiry and records the outcome in the list of challenged votes (Form 14).",
        "If the challenge is not established the elector votes; if it is established the person is not allowed to vote and may be handed to the police.",
        "The decision is the presiding officer's alone. ECIWEB only records it."
    ], [{ source: "cer1961", ref: "Rule 36 (challenge of identity)" }]),
    entry("tendered-vote", "Tendered vote: someone has already voted in this name", ["tendered", "already voted", "form 17b"], [
        "When a person says they are the elector and someone has already voted in that name, the presiding officer verifies identity by questioning.",
        "If satisfied, the person casts a tendered vote on a tendered ballot paper (not on the voting machine).",
        "The entry goes in the list of tendered votes (Form 17B)."
    ], [{ source: "cer1961", ref: "Rule 49P (tendered votes)" }]),
    entry("companion", "Blind or infirm elector with a companion", ["companion", "blind", "infirm", "assistance", "form 14a"], [
        "The presiding officer may allow a companion of at least 18 years to go into the voting compartment with the elector.",
        "The companion declares that they will keep the vote secret and have not acted as a companion for anyone else at any station that day.",
        "Record the case in the list of blind and infirm voters (Form 14A)."
    ], [{ source: "cer1961", ref: "Rule 49N (recording of votes of blind or infirm electors)" }]),
    entry("vvpat-complaint", "An elector says the VVPAT slip did not match", ["vvpat", "complaint", "test vote"], [
        "Take a written declaration from the elector after warning them of the consequence of a false declaration.",
        "Allow a test vote in the presence of the elector and the polling agents.",
        "If the allegation is found true, stop the poll and report to the Returning Officer at once; if false, record it as prescribed."
    ], [{ source: "cer1961", ref: "Rule 49MA (procedure in case of complaint about particulars printed on paper slip)" }]),
    entry("mock-poll", "Before the poll: mock poll and machine checks", ["mock poll", "readiness", "evm", "vvpat"], [
        "Hold the mock poll in front of the polling agents present, at the time the Commission has fixed.",
        "Clear the result and the VVPAT slips as instructed, seal them, and complete the mock poll certificate.",
        "Do not open the poll before the mock poll is completed and recorded."
    ], [{ source: "poHandbook", ref: "Chapter on mock poll" }]),
    entry("close-poll", "Closing the poll", ["closing", "form 17c", "close"], [
        "At the closing hour, electors already in the queue are allowed to vote; issue slips starting from the last person in the line.",
        "Press the close button only after the last elector has voted.",
        "Prepare the account of votes recorded (Form 17C) and give attested copies to the polling agents present."
    ], [{ source: "cer1961", ref: "Rule 49S (closing of poll) and Rule 49V (account of votes recorded, Form 17C)" }]),
    entry("adjournment", "Riot, open violence or a natural calamity", ["adjournment", "violence", "law and order", "stop poll"], [
        "The presiding officer may adjourn the poll at the station if it is obstructed by riot or open violence or by a natural calamity.",
        "Report to the Returning Officer immediately. The Returning Officer reports to the Commission."
    ], [{ source: "rpa1951", ref: "Section 57 (adjournment of poll in emergencies)" }]),
    entry("secrecy", "Secrecy of voting", ["secrecy", "photography", "mobile phones"], [
        "Every officer and agent at the station must maintain the secrecy of voting.",
        "Do not allow anyone to see how an elector votes or to photograph inside the voting compartment."
    ], [{ source: "rpa1951", ref: "Section 128 (maintenance of secrecy of voting)" }, { source: "cer1961", ref: "Rule 39 (maintenance of secrecy of voting by electors)" }])
];

// Checklists the presiding officer ticks on the screen. Items are kept short; each points to the
// library entry that explains it.
export const CHECKLISTS = {
    readiness: { title: "Station readiness (before the mock poll)", items: [
        ["staff_present", "All members of the polling party are present"],
        ["layout", "Voting compartment placed so that secrecy is kept; queue lines for men, women, and senior citizens and electors with disabilities"],
        ["signage", "Signage, the list of contesting candidates and the voter facilitation poster are displayed"],
        ["accessibility", "Ramp, wheelchair, drinking water, shade and toilet are available, or the gap is reported"],
        ["marked_copy", "Marked copy of the roll and the register of voters (Form 17A) are at hand", "indelible-ink"],
        ["agents_admitted", "Polling agents' appointment letters checked and agents admitted"]
    ] },
    equipment: { title: "Equipment", items: [
        ["evm_received", "Ballot unit, control unit and VVPAT received; numbers match the papers"],
        ["ink", "Indelible ink bottles received and sealed"],
        ["forms", "Statutory forms and covers received (Forms 14, 14A, 17A, 17B, 17C)"],
        ["seals", "Seals, tags and the presiding officer's seal received"],
        ["device", "ECIWEB device registered and the station package downloaded"]
    ] },
    closing: { title: "Closing", items: [
        ["queue_slips", "Slips given to everyone in the queue at the closing hour", "close-poll"],
        ["last_voter", "Last elector has voted; close button pressed"],
        ["form17c", "Account of votes recorded (Form 17C) prepared; copies given to agents", "close-poll"],
        ["sealed", "Machines and statutory covers sealed"],
        ["synced", "All offline records on ECIWEB devices sent (nothing waiting to sync)"],
        ["diary", "Presiding officer's diary completed"]
    ] }
};

const norm = (v) => String(v ?? "").toLowerCase();
/** Keyword search over titles, tags and steps. Returns entries with their sources; never an answer of its own. */
export const searchProcedures = (q) => {
    const words = norm(q).split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return PROCEDURES;
    return PROCEDURES.map((p) => {
        const hay = { title: norm(p.title), tags: norm(p.tags.join(" ")), steps: norm(p.steps.join(" ")) };
        const score = words.reduce((n, w) => n + (hay.title.includes(w) ? 3 : 0) + (hay.tags.includes(w) ? 2 : 0) + (hay.steps.includes(w) ? 1 : 0), 0);
        return { p, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.p);
};
