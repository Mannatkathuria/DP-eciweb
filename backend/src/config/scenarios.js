// Training scenarios: step-by-step poll-day, roll and counting situations with synthetic people
// and places. Nothing in a scenario reads or writes a live record; attempts are stored under
// training keys only. Each option carries feedback and, where one applies, the procedure-library
// entry (config/procedures.js) that explains it.

export const SCENARIO_PASS = 0.8;

const s = (id, title, roles, minutes, situation, steps) => ({ id, title, roles, minutes, situation, steps });
const step = (prompt, options) => ({ prompt, options: options.map(([text, correct, feedback, ref]) => ({ text, correct, feedback, ref: ref ?? null })) });

export const SCENARIOS = [
    s("elector-not-found", "Elector not found in the part", ["polling_officer", "presiding_officer", "blo"], 4,
        "A woman shows an EPIC card for 'Rekha Devi' (synthetic). The first polling officer cannot find her in the marked copy of the roll of this part.", [
        step("What do you do first?", [
            ["Search again by relative's name, house number and serial number, allowing for spelling differences", true, "Right. Names are often spelled differently; search by the other fields before deciding she is not on this part."],
            ["Let her vote because she has a valid EPIC", false, "No. An EPIC alone does not entitle a person to vote at this station: the name must be on this part's roll.", "identify-elector"],
            ["Send her away", false, "Not yet. Check properly and help her find the right station."]
        ]),
        step("She is not on this part. What next?", [
            ["Direct her to the voter assistance booth or helpline 1950 to find her polling station", true, "Right. The booth can look up her part and station and print a locator slip."],
            ["Add her name to the marked copy", false, "Never. Nobody at the polling station can add a name to the roll."],
            ["Record a tendered vote", false, "No. A tendered vote is only for an elector whose vote someone else has already cast.", "tendered-vote"]
        ])
    ]),
    s("similar-names", "Two electors with nearly the same name", ["polling_officer", "presiding_officer"], 3,
        "The search for 'Gurpreet Kaur' shows two entries: serial 211 (wife of Harjit Singh, house 14) and serial 486 (daughter of Balwant Singh, house 102).", [
        step("How do you decide which entry is hers?", [
            ["Check the relative's name, house number, age and the photograph against her and her document", true, "Right. Match on more than the name before marking anyone."],
            ["Mark the first entry", false, "No. Marking the wrong entry means the other elector may be wrongly refused later."],
            ["Ask the polling agents which one she is", false, "Agents may object, but the identification is the polling officer's job.", "identify-elector"]
        ])
    ]),
    s("identity-challenge", "A polling agent challenges an elector", ["presiding_officer", "polling_officer", "polling_agent"], 4,
        "A polling agent says the man at the table is not 'Arvind Kumar', serial 77, and offers to pay the challenge fee.", [
        step("Who decides the challenge?", [
            ["The presiding officer, after a summary inquiry", true, "Right. The presiding officer holds the inquiry and records the result in Form 14.", "challenged-vote"],
            ["The polling officer at the table", false, "No. Only the presiding officer decides a challenge.", "challenged-vote"],
            ["The majority of agents present", false, "No. Agents can challenge; they do not decide."]
        ]),
        step("The inquiry shows he is Arvind Kumar. What happens?", [
            ["He votes; the challenge is recorded as not established", true, "Right. The challenged person votes when the challenge fails.", "challenged-vote"],
            ["He casts a tendered vote", false, "No. Tendered votes are for a different situation.", "tendered-vote"],
            ["He waits until the poll closes", false, "No. Once the challenge fails he votes normally."]
        ])
    ]),
    s("verification-discrepancy", "Field verification does not match the application", ["blo", "ero"], 5,
        "A Form 6 applicant (synthetic) gives house 21, Ward 4. At the address the BLO finds the house locked and neighbours say the family moved two months ago.", [
        step("What should the BLO record?", [
            ["What was found, factually, with the date and time, and recommend that the ERO ask for more information", true, "Right. The BLO reports facts; the ERO decides."],
            ["Reject the application", false, "No. The BLO verifies; the decision is the ERO's (or AERO's)."],
            ["Mark it verified because the neighbours know the family", false, "No. The applicant must be ordinarily resident at the address claimed."]
        ]),
        step("As ERO, what is the next step?", [
            ["Ask the applicant for information or send it back for re-verification, recording why", true, "Right. ECIWEB keeps the application open in 'information required' until the applicant answers."],
            ["Approve it to avoid delay", false, "No. Approving without resolving the doubt puts a wrong entry on the roll."],
            ["Delete the application", false, "No. Applications are decided, never deleted."]
        ])
    ]),
    s("connectivity-failure", "The connection drops during the poll", ["presiding_officer", "polling_officer"], 3,
        "At 11:20 the tablet shows 'offline'. Twelve electors are waiting.", [
        step("What do you do?", [
            ["Continue from the downloaded station package; marks are saved on the device and sent when the connection returns", true, "Right. The station package and the outbox are for exactly this."],
            ["Stop the poll until the connection returns", false, "No. The poll is never stopped because of the app; the paper marked copy and register are the legal record."],
            ["Mark voters on a personal phone instead", false, "No. Use only the registered device or the paper records."]
        ]),
        step("The connection returns and one record shows 'Conflict'. Who resolves it?", [
            ["The presiding officer, after checking with the officers involved", true, "Right. ECIWEB never overwrites the register; the presiding officer records a decision."],
            ["The device resolves it automatically", false, "No. Conflicts are never resolved silently."],
            ["The control room deletes it", false, "No. Nothing is deleted."]
        ])
    ]),
    s("package-failure", "The station package fails its check", ["presiding_officer", "polling_officer"], 3,
        "On the evening before the poll, the device says 'The package signature is not valid. It was not saved.'", [
        step("What do you do?", [
            ["Do not use the package; download it again and, if it fails again, report to the sector officer", true, "Right. A failed signature means the package may have been altered or corrupted."],
            ["Use the old package from last week", false, "No. Only a package issued for this poll and this device is valid."],
            ["Turn off the signature check", false, "There is no such option, and there should not be."]
        ])
    ]),
    s("equipment-incident", "The ballot unit stops responding", ["presiding_officer", "sector_officer"], 3,
        "At 14:05 the ballot unit does not respond when an elector presses a button.", [
        step("What do you do first?", [
            ["Stop voting at that machine, report the incident in ECIWEB and call the sector officer for a replacement", true, "Right. The sector officer carries reserve machines; the incident is escalated automatically if serious."],
            ["Open the machine to look inside", false, "Never. Machines are only handled as the Commission's instructions say."],
            ["Ask the elector to come back tomorrow", false, "No. The elector should be able to vote once the machine is replaced."]
        ])
    ]),
    s("queue-escalation", "The queue is not moving", ["presiding_officer", "sector_officer", "deo"], 3,
        "At 16:30 the station reports 180 waiting. The measured pace is 1.2 voters a minute. The poll closes at 18:00.", [
        step("What does the estimate tell you?", [
            ["About 150 minutes of waiting: people in the queue at closing time will still be voting after 18:00", true, "Right. 180 / 1.2 = 150 minutes. Plan for slips at the closing hour.", "close-poll"],
            ["Everyone will vote before 18:00", false, "No. 180 people at 1.2 a minute is about 150 minutes."],
            ["The estimate is turnout data", false, "No. Queue estimates are guidance, not official turnout."]
        ]),
        step("At 18:00, 60 people are still in the queue. What happens?", [
            ["They get numbered slips from the last person backwards and all vote", true, "Right. Everyone in the queue at closing time votes.", "close-poll"],
            ["The poll closes and they go home", false, "No. Electors in the queue at the closing hour vote."],
            ["Only those with slips from the morning vote", false, "No. Slips are given at the closing hour."]
        ])
    ]),
    s("counting-discrepancy", "Seal number does not match", ["counting_supervisor", "counting_assistant", "counting_agent", "ro", "counting_observer"], 4,
        "At table 4 in round 3, a counting agent says the green paper seal number on the control unit differs from the one in Form 17C.", [
        step("What should happen?", [
            ["The agent reports the discrepancy; the RO decides it, with a recorded reason, before the round is completed", true, "Right. ECIWEB will not let the round close while the report is open."],
            ["The supervisor ignores it if the result looks normal", false, "No. Every discrepancy is recorded and decided."],
            ["The agent records the vote figures in ECIWEB", false, "No. ECIWEB holds no vote figures; the count is the RO's."]
        ])
    ]),
    s("missing-documents", "An applicant's document is missing", ["blo", "ero", "aero"], 3,
        "A Form 8 request to shift residence arrives without proof of the new address.", [
        step("What is the right action?", [
            ["Ask the applicant for the missing proof, saying exactly what is needed", true, "Right. 'Information required' keeps the request open with a clear note to the applicant."],
            ["Reject it at once", false, "Rejection is possible, but asking for the missing document first is fairer and usually quicker."],
            ["Approve it and ask for the proof later", false, "No. The roll must not change without the supporting proof."]
        ])
    ]),
    s("control-room-offline", "Several stations go offline", ["sector_officer", "deo", "ro", "ceo"], 3,
        "The control room shows three stations in one sector as 'Offline' for 15 minutes; one shows 40 records waiting to sync.", [
        step("What do you do?", [
            ["Phone the presiding officers, confirm the poll continues on paper and the device, and have the sector officer visit if needed", true, "Right. Offline means no recent heartbeat, not that the poll stopped."],
            ["Treat the stations' turnout as zero", false, "No. The turnout figure is stale, not zero; records will sync."],
            ["Order the stations to stop the poll", false, "No. Connectivity does not affect the legal poll."]
        ])
    ])
];

export const scenariosFor = (role) => SCENARIOS.filter((x) => x.roles.includes(role) || role === "admin" || role === "eci");
