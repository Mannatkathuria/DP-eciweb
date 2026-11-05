// Voter Mitra: the citizen services of the Election Commission, as the assistant explains them.
// Each entry says what the service is for, the steps, the form, the documents and where to start.
// The text is a plain-language summary written for this platform; the Commission's own forms,
// guidelines and the voters' portal (voters.eci.gov.in) are authoritative. The assistant matches a
// question to these entries by keywords: it never invents a procedure, and it says so when it
// cannot find one.

const OFFICIAL = "ECI guidelines for the forms (voters.eci.gov.in) and the Registration of Electors Rules, 1960";

export const SERVICES = [
    {
        id: "register", title: "Register as a new voter", form: "Form 6", group: "Register",
        keywords: ["नाम जोड़", "नया मतदाता", "पंजीकरण", "naam jodna", "register", "registration", "new voter", "enrol", "enroll", "add my name", "first time", "turned 18", "18 years", "voter id apply", "naam jod", "naya voter", "include my name", "inclusion"],
        summary: "Form 6 is the application to include your name in the electoral roll of the constituency where you ordinarily live. You must be an Indian citizen and 18 years old on a qualifying date (1 January, 1 April, 1 July or 1 October).",
        simple: "Fill Form 6 to get your name on the voter list where you live. You must be 18 or older.",
        steps: ["Fill in Form 6 with your details and a recent photograph.", "Attach one proof of age and one proof of address.", "A booth level officer (BLO) may visit to check your details.", "The ERO decides. If approved, your name is added and your EPIC is sent to you."],
        documents: ["Proof of age: birth certificate, school certificate (Class 10/12), passport, PAN, driving licence or Aadhaar", "Proof of address: Aadhaar, passport, bank or post office passbook, utility bill (water, electricity, gas, telephone) of the last year, rent agreement or ration card", "A recent passport-size photograph"],
        action: { to: "/register", label: "Start Form 6" }, track: true, source: OFFICIAL, library: "faq-how-to-register-1"
    },
    {
        id: "overseas", title: "Register as an overseas elector", form: "Form 6A", group: "Register",
        keywords: ["overseas", "nri", "abroad", "living outside india", "foreign", "passport holder abroad", "non resident"],
        summary: "Indian citizens living abroad who have not taken another citizenship register in the constituency of the address in their Indian passport, using Form 6A.",
        simple: "Living abroad with an Indian passport? Use Form 6A to register at your passport address in India.",
        steps: ["Fill in Form 6A with your passport details.", "Attach copies of the passport pages with your photo, address and visa.", "The ERO checks the details and decides."],
        documents: ["Self-attested copies of the relevant passport pages, including the valid visa"],
        action: { to: "/voters/forms/form-6a", label: "Start Form 6A" }, track: true, source: OFFICIAL
    },
    {
        id: "aadhaar", title: "Give your Aadhaar number for your entry", form: "Form 6B", group: "Register",
        keywords: ["aadhaar", "aadhar", "link aadhaar", "6b", "authenticate"],
        summary: "Form 6B lets an elector give their Aadhaar number voluntarily so that their entry can be authenticated. Not giving it is not a ground to delete an entry.",
        simple: "You can give your Aadhaar number with Form 6B. It is your choice.",
        steps: ["Fill in Form 6B with your EPIC number and Aadhaar number.", "The ERO records it against your entry."],
        documents: ["Your Aadhaar number (or one of the alternative documents listed in the form)"],
        action: { to: "/voters/forms/form-6b", label: "Start Form 6B" }, track: true, source: OFFICIAL
    },
    {
        id: "remove_deceased", title: "Remove the name of a person who has died", form: "Form 7", group: "Remove",
        keywords: ["मृत्यु", "निधन", "गुज़र", "मर गए", "died last", "died", "dead", "death", "passed away", "deceased", "expired", "late father", "late mother", "remove name of", "delete name of", "mrit", "maut", "father passed", "mother passed"],
        summary: "Any elector of the same constituency may apply in Form 7 to delete the entry of a person who has died. A family member usually applies. The BLO checks, and the ERO decides after the facts are verified.",
        simple: "If someone in your family has died, fill Form 7 to remove their name. A death certificate helps.",
        steps: ["Find the person's entry (EPIC number or part and serial number) with the roll search.", "Fill in Form 7: choose 'death' as the reason and give their details.", "Attach a copy of the death certificate if you have it.", "The BLO verifies; the ERO orders the deletion. You can track it with the reference number."],
        documents: ["Copy of the death certificate (recommended)", "The EPIC number or part and serial number of the entry"],
        action: { to: "/voters/forms/form-7", label: "Start Form 7" }, also: { to: "/electoral-roll", label: "Find the entry first" }, track: true, source: OFFICIAL
    },
    {
        id: "duplicate", title: "Report a duplicate or wrong entry", form: "Form 7", group: "Remove",
        keywords: ["duplicate", "twice", "two entries", "two places", "registered twice", "double entry", "same person", "fake entry", "wrong entry", "not living here", "shifted away", "object", "objection"],
        summary: "If a name is in the roll twice, or someone no longer lives at the address, any elector of the constituency can object in Form 7. The person is given notice and heard before the ERO decides. You can also delete your own old entry this way.",
        simple: "Name appears twice, or someone moved away? Use Form 7. The person gets a notice before anything is removed.",
        steps: ["Find the entry with the roll search and note its EPIC or part and serial number.", "Fill in Form 7 with the reason (duplicate, shifted, not ordinarily resident).", "The BLO checks; the person is given notice; the ERO hears and decides."],
        documents: ["The EPIC number or part and serial number of the entry", "Your own EPIC number (you must be an elector of the constituency)"],
        action: { to: "/voters/forms/form-7", label: "Start Form 7" }, also: { to: "/electoral-roll", label: "Find the entry" }, track: true, source: OFFICIAL
    },
    {
        id: "correct", title: "Correct a mistake in your entry", form: "Form 8", group: "Change",
        keywords: ["naam galat", "galat", "गलत", "सुधार", "correct", "correction", "wrong name", "spelling", "mistake", "wrong age", "wrong date of birth", "wrong gender", "wrong photo", "change photo", "relative name wrong", "edit details", "update details", "sudhar"],
        summary: "Form 8 corrects particulars in your entry: name, relative's name, date of birth, gender, photograph, address details or mobile number.",
        simple: "Something wrong in your entry? Use Form 8 to fix it. Attach proof of the correct detail.",
        steps: ["Fill in Form 8 and tick 'correction of entries'.", "Give the correct particulars and attach proof.", "The BLO may verify; the ERO decides and the entry is corrected."],
        documents: ["Proof of the correct particular (for example a birth certificate for the date of birth, or a document with the correct spelling)"],
        action: { to: "/voters/forms/form-8", label: "Start Form 8" }, track: true, source: OFFICIAL
    },
    {
        id: "shift", title: "You moved house", form: "Form 8", group: "Change",
        keywords: ["पता बदल", "ghar badal", "moved", "shift", "shifted", "new address", "change address", "relocated", "new house", "different constituency", "transfer", "migrat"],
        summary: "If you have moved, apply in Form 8 for shifting of residence, addressed to the ERO of your new constituency (or the same constituency if you moved within it). Your old entry is removed when the new one is made.",
        simple: "Moved house? Use Form 8 (shifting). Choose your new constituency.",
        steps: ["Fill in Form 8, tick 'shifting of residence' and choose the constituency you moved to.", "Attach proof of your new address.", "The BLO of the new area may visit; the ERO decides."],
        documents: ["Proof of the new address (Aadhaar, utility bill, bank passbook, rent agreement, etc.)"],
        action: { to: "/voters/forms/form-8", label: "Start Form 8" }, track: true, source: OFFICIAL
    },
    {
        id: "replace_epic", title: "Replace a lost or damaged EPIC", form: "Form 8", group: "Change",
        keywords: ["कार्ड खो", "lost", "lost my", "lost epic", "lost voter id", "lost card", "lost my voter card", "lost my card", "card stolen", "stolen", "damaged", "torn", "replace", "replacement", "duplicate card", "new card", "reprint", "card kho"],
        summary: "Apply in Form 8 for a replacement EPIC without any correction. You can also download the e-EPIC from the voters' portal once your entry has a mobile number.",
        simple: "Lost your voter card? Ask for a new one with Form 8.",
        steps: ["Fill in Form 8 and tick 'issue of replacement EPIC'.", "Give the reason (lost, destroyed or mutilated).", "The ERO approves and the new card is delivered, usually by the BLO or post."],
        documents: ["An FIR or report is not needed for a lost card; give the reason in the form"],
        action: { to: "/voters/forms/form-8", label: "Start Form 8" }, track: true, source: OFFICIAL
    },
    {
        id: "pwd", title: "Mark yourself as a person with disability", form: "Form 8", group: "Change",
        keywords: ["disability", "disabled", "pwd", "wheelchair", "blind", "divyang", "handicap"],
        summary: "Electors with disabilities can be marked in the roll (Form 8) so that the polling station is ready for them: ramp, wheelchair, priority entry, and a companion if needed.",
        simple: "Use Form 8 to tell the election office about a disability. Help will be ready at your polling station.",
        steps: ["Fill in Form 8 and tick 'marking as person with disability'.", "Give the type of disability; a certificate is optional.", "The polling station is prepared for you."],
        documents: ["Disability certificate (optional)"],
        action: { to: "/voters/forms/form-8", label: "Start Form 8" }, track: true, source: OFFICIAL
    },
    {
        id: "service_voter", title: "Register as a service voter", form: "Forms 2, 2A and 3", group: "Register",
        keywords: ["army", "armed forces", "military", "soldier", "service voter", "navy", "air force", "bsf", "crpf", "itbp", "posted outside"],
        summary: "Members of the armed forces and of armed police forces serving outside their State register as service voters in Form 2 (armed forces), 2A (armed police) or 3 (government service abroad). Their Record Officer verifies the details. Service voters get an electronically transmitted postal ballot.",
        simple: "In the forces? Register with Form 2. You will get a postal ballot.",
        steps: ["Fill in the form for your service.", "Your Record Officer verifies your service particulars.", "The ERO enrols you; at elections a postal ballot is sent to you electronically."],
        documents: ["Service number and unit details (checked by the Record Officer)"],
        action: { to: "/voters/forms/form-2", label: "Start Form 2" }, also: { to: "/postal-ballot", label: "Postal ballot" }, track: true, source: OFFICIAL
    },
    {
        id: "find", title: "Check your name and polling station", form: null, group: "Find",
        keywords: ["मतदान केंद्र", "नाम खोज", "नाम है", "check my name", "am i registered", "search", "find my name", "voter list", "electoral roll", "polling station", "polling booth", "where do i vote", "where to vote", "booth", "serial number", "part number", "naam check", "matdan kendra"],
        summary: "Search the roll by EPIC number, by your name and details, or by part and serial number. The result shows your particulars and your polling station; then use the checklist to make sure everything is right before the election.",
        simple: "Search the voter list to see your name and where you vote.",
        steps: ["Search by EPIC, by name, or by part and serial number.", "Check each particular with the checklist.", "If something is wrong, the result tells you which form fixes it."],
        documents: [], action: { to: "/electoral-roll", label: "Search the roll" }, also: { to: "/map", label: "Polling stations on the map" }, source: "Electoral roll on this platform"
    },
    {
        id: "track", title: "Track an application", form: null, group: "Find",
        keywords: ["track", "status", "reference", "application status", "where is my application", "pending", "approved", "rejected", "kab tak"],
        summary: "Every application gets a reference number. Enter it on the tracking page to see each step: received, field verification, decision.",
        simple: "Use your reference number to see where your application is.",
        steps: ["Open the tracking page.", "Enter the reference number from your receipt.", "See the timeline; if it was rejected, the reasons and how to appeal are shown."],
        documents: ["The reference number"], action: { to: "/check-request", label: "Track an application" }, source: "This platform"
    },
    {
        id: "epic", title: "What is an EPIC?", form: null, group: "Learn",
        keywords: ["what is epic", "epic", "voter id", "voter card", "e-epic", "eepic", "electors photo identity"],
        summary: "The EPIC (Elector's Photo Identity Card) is the identity card the Commission issues to every elector. Its number identifies your entry. You can vote without the card if your name is on the roll and you show one of the other identity documents the Commission allows.",
        simple: "EPIC is your voter ID card. You can still vote with another allowed ID if your name is on the list.",
        steps: ["Your EPIC number is printed on the card and in the roll.", "Lost it? Apply for a replacement in Form 8."],
        documents: [], action: { to: "/electoral-roll", label: "Find your EPIC number" }, source: OFFICIAL
    },
    {
        id: "voting_day", title: "On polling day", form: null, group: "Learn",
        keywords: ["polling day", "voting day", "what to bring", "id proof", "documents for voting", "how to vote", "evm", "vvpat", "timing", "queue", "ink"],
        summary: "Go to the polling station shown in the roll search. Take your EPIC or one of the other identity documents allowed by the Commission (such as Aadhaar, passport, driving licence, PAN card). The polling officer finds your entry, marks your finger with ink, and you vote on the EVM; the VVPAT shows your choice for seven seconds.",
        simple: "Take your voter ID or another allowed ID to your polling station. Press the button for your candidate; check the VVPAT slip.",
        steps: ["Check your polling station in the roll search.", "Carry your EPIC or an allowed alternative identity document.", "Elders and electors with disabilities get priority; ask for a wheelchair or companion if needed."],
        documents: ["EPIC, or an alternative such as Aadhaar, passport, driving licence, PAN card, MGNREGA job card or a bank passbook with photo"],
        action: { to: "/electoral-roll", label: "Find my polling station" }, source: "ECI instructions for identification of electors", library: "faq-evm-2"
    },
    {
        id: "grievance", title: "Complain about an election service", form: null, group: "Help",
        keywords: ["शिकायत", "complaint", "complain", "grievance", "problem", "not received", "no response", "blo not coming", "shikayat", "issue with", "bad service"],
        summary: "The grievance service takes complaints about registration, EPIC, polling stations, EVMs, expenditure or any election service. You get a reference number; the response and time taken are shown when you track it. You can reopen it once if you are not satisfied.",
        simple: "Have a problem with an election service? File a grievance and track it.",
        steps: ["File the grievance with a short description and your mobile number.", "It goes to the right office (ERO/RO, DEO, CEO or the Commission).", "Track it with the reference number; reopen it once within 7 days if needed."],
        documents: ["Up to two supporting documents (optional)"], action: { to: "/grievance", label: "File a grievance" }, source: "National Grievance Services Portal (NGSP)"
    },
    {
        id: "cvigil", title: "Report a Model Code of Conduct violation", form: null, group: "Help",
        keywords: ["violation", "mcc", "code of conduct", "cash", "distribut", "bribing", "cash distribution", "money distribution", "liquor", "bribe", "gift", "freebies", "poster", "loudspeaker", "cvigil", "paise baant"],
        summary: "cVIGIL takes live reports of Model Code of Conduct and expenditure violations with a photo or video and the location. A flying squad is sent and the Returning Officer decides, within 100 minutes as the target.",
        simple: "See money or liquor being given out? Report it with a photo on cVIGIL.",
        steps: ["Take a photo or short video of what is happening.", "Report it with the place; you can stay anonymous.", "Follow it with the reference number."],
        documents: ["A photo or video taken on the spot"], action: { to: "/report-violation", label: "Report a violation" }, source: "cVIGIL standard operating procedure", library: "cvigil-sop"
    },
    {
        id: "postal_ballot", title: "Postal ballot for service voters", form: null, group: "Help",
        keywords: ["postal ballot", "etpbs", "ballot by post", "vote by post"],
        summary: "Service voters receive their ballot electronically. The Record Officer gives the PIN; the voter prints the ballot with Forms 13A to 13C, marks it on paper and posts it back free by Speed Post.",
        simple: "Service voters: open your ballot with the PIN, print it, mark it, post it.",
        steps: ["Get the ballot id and PIN from your Record Officer.", "Open, print and mark the ballot; fill in Form 13A.", "Post it before counting begins and track it."],
        documents: ["Ballot id and PIN"], action: { to: "/postal-ballot", label: "Open my postal ballot" }, source: "ETPBS instructions", library: "postal-ballot-service-voters"
    },
    {
        id: "appeal", title: "Appeal against an ERO's decision", form: null, group: "Help",
        keywords: ["appeal", "rejected", "ero rejected", "decision wrong", "deleted wrongly", "not satisfied with decision"],
        summary: "You can appeal against the ERO's order on your application or objection: first to the District Election Officer within 15 days, then to the Chief Electoral Officer within 30 days of the DEO's order (RP Act 1950, s. 24).",
        simple: "Application rejected? You can appeal to the DEO within 15 days.",
        steps: ["Note the reference number and the ERO's order.", "File the first appeal to the DEO with your reasons.", "If needed, file a second appeal to the CEO."],
        documents: ["The ERO's order or the reference number"], action: { to: "/appeal", label: "File an appeal" }, source: "Representation of the People Act 1950, s. 24"
    },
    {
        id: "nomination", title: "Contest an election (nomination)", form: "Form 2A / 2B", group: "Candidates",
        keywords: ["contest", "candidate", "nomination", "stand for election", "affidavit", "security deposit", "symbol", "form 26", "chunav ladna"],
        summary: "A candidate files nomination papers with the Returning Officer during the nomination period, with the Form 26 affidavit (criminal antecedents, assets, liabilities, education) and the security deposit: ₹10,000 for an Assembly seat, ₹25,000 for the Lok Sabha, half for SC/ST candidates. Up to four nomination papers can be filed.",
        simple: "To contest, file your nomination and affidavit with the Returning Officer and pay the deposit.",
        steps: ["Prepare the nomination paper and the Form 26 affidavit.", "File them with the RO between 11 a.m. and 3 p.m. in the nomination period, with the deposit.", "The RO scrutinises nominations; withdraw by the last date if you wish; symbols are then allotted."],
        documents: ["Form 26 affidavit", "Security deposit receipt", "Certified extract of the roll if you are registered elsewhere", "Caste certificate for a reserved seat"],
        action: { to: "/candidates", label: "Candidates and nominations" }, source: "RP Act 1951, ss. 33-36; Handbook for Candidates", library: "handbook-candidate"
    },
    {
        id: "who_blo", title: "What does a BLO do?", form: null, group: "Learn",
        keywords: ["blo", "booth level officer", "who is blo", "blo role"],
        summary: "The Booth Level Officer is a government official for one polling station area. The BLO visits homes to verify applications, keeps the roll of the part up to date, reports deaths and shifts, and helps electors fill forms. The BLO reports; the ERO decides.",
        simple: "The BLO is the election official for your area. They check details and help with forms.",
        steps: [], documents: [], action: { to: "/electoral-roll", label: "Find your part" }, source: "ECI Handbook for BLOs", library: "handbook-blo"
    },
    {
        id: "who_ero", title: "What do the ERO and AERO do?", form: null, group: "Learn",
        keywords: ["ero", "aero", "electoral registration officer", "assistant electoral registration", "who decides my application"],
        summary: "The Electoral Registration Officer prepares and maintains the roll of an assembly constituency and decides every Form 6, 6A, 7 and 8 by an order with reasons. The Assistant ERO helps and may decide when authorised.",
        simple: "The ERO keeps the voter list of your constituency and approves or rejects applications.",
        steps: [], documents: [], action: { to: "/check-request", label: "Track an application" }, source: "Representation of the People Act 1950, ss. 13B-13C", library: "handbook-ero"
    },
    {
        id: "who_ro", title: "What does the Returning Officer do?", form: null, group: "Learn",
        keywords: ["returning officer", "ro", "who conducts election", "rio"],
        summary: "The Returning Officer conducts the election in a constituency: receives and scrutinises nominations, allots symbols, arranges polling, counts the votes and declares the result.",
        simple: "The Returning Officer runs the election in your constituency and declares the result.",
        steps: [], documents: [], action: { to: "/candidates", label: "Candidates" }, source: "Representation of the People Act 1951, s. 21", library: "handbook-returning-officer"
    }
];

export const GROUPS = ["Register", "Change", "Remove", "Find", "Help", "Candidates", "Learn"];
