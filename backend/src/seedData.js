// A larger body of synthetic demo data, so district, State and national dashboards, the map and
// every role desk have something real to show. Everything here is invented. It is written once
// (key "demo:bulk-seeded"); delete that key and the "demo-bulk" records to write it again.
//
// What it adds:
//   - approved polling stations with map locations in 4 Punjab districts, Shimla and New Delhi,
//     plus station proposals waiting at each stage of the s. 25 workflow
//   - about 1,500 electors on those parts, with serial numbers, a few service voters, overseas
//     electors and PwD electors
//   - electoral forms at every stage, MCC complaints at every stage, campaign permissions,
//     expenditure registers for three candidates, observer reports, Commission directions,
//     roll appeals, poll-day incidents, logistics steps, nodal reports and tasks, security
//     assessments, deployments and situation reports
//   - extra officials for other districts and States (DEO Amritsar, DEO Shimla, CEO Himachal,
//     ERO Amritsar East), each with an assignment
import crypto from "crypto";
import { redis } from "./config/redis.js";
import { saveStation, listStations } from "./repositories/election.repository.js";
import { saveElector } from "./repositories/elector.repository.js";
import { saveUser, getUserByEpic } from "./repositories/user.repository.js";
import { saveAssignment } from "./repositories/assignment.repository.js";
import { saveIncident } from "./repositories/poll.repository.js";
import { store } from "./services/workflow.service.js";

// Deterministic pseudo-random numbers, so the demo looks the same on every machine.
let seed = 20261105;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const day = (offset) => { const d = new Date(Date.now() + 330 * 60000); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

const FIRST_M = ["Aman", "Gurpreet", "Harjit", "Rajesh", "Sukhdev", "Vikram", "Manpreet", "Arjun", "Rohit", "Karan", "Jaspal", "Navdeep", "Sanjay", "Deepak", "Inderjit", "Mohit"];
const FIRST_F = ["Simran", "Harpreet", "Kiran", "Neha", "Priya", "Jasleen", "Anita", "Sunita", "Ravneet", "Pooja", "Kamaljit", "Meena", "Gurleen", "Rekha", "Navjot", "Shalini"];
const LAST = ["Singh", "Kaur", "Sharma", "Verma", "Gill", "Sandhu", "Arora", "Grewal", "Bansal", "Kapoor", "Dhillon", "Sidhu", "Malhotra", "Thakur", "Chauhan", "Negi"];
const PLACES = ["Government Senior Secondary School", "Government Primary School", "Community Centre", "Panchayat Ghar", "Gurudwara Sahib Hall", "Municipal Corporation Office", "Government Girls School", "DAV Public School", "Khalsa College Hall", "Anganwadi Centre"];
const LOCALITIES = { Ludhiana: ["Model Town", "Sarabha Nagar", "Haibowal", "Civil Lines", "Dugri", "Pakhowal Road", "Shimlapuri", "BRS Nagar", "Jamalpur", "Giaspura"],
    Amritsar: ["Ranjit Avenue", "Lawrence Road", "Putlighar", "Chheharta", "Majitha Road", "Sultanwind"], Jalandhar: ["Model Town", "Basti Sheikh", "Rama Mandi", "Adarsh Nagar", "Cantt Road"],
    Patiala: ["Tripuri", "Urban Estate", "Sanauri Adda", "Model Town"], SHIMLA: ["Sanjauli", "Lakkar Bazar", "Chotta Shimla", "Totu", "Dhalli"], "New Delhi": ["Gole Market", "Lodhi Colony", "Kidwai Nagar", "Sarojini Nagar"] };

// District centres (approximate) for station locations on the map.
const AREAS = [
    { state: "Punjab", district: "Ludhiana", centre: [30.9010, 75.8573], acs: ["Ludhiana South", "Ludhiana North", "Ludhiana West", "Ludhiana East", "Atam Nagar", "Ludhiana Central", "Gill", "Dakha"] },
    { state: "Punjab", district: "Amritsar", centre: [31.6340, 74.8723], acs: ["Amritsar East", "Amritsar West", "Amritsar Central", "Amritsar North"] },
    { state: "Punjab", district: "Jalandhar", centre: [31.3260, 75.5762], acs: ["Jalandhar Central", "Jalandhar West", "Jalandhar North"] },
    { state: "Punjab", district: "Patiala", centre: [30.3398, 76.3869], acs: ["Patiala", "Patiala Rural"] },
    { state: "Himachal Pradesh", district: "SHIMLA", centre: [31.1048, 77.1734], acs: ["SHIMLA", "KASUMPTI", "SHIMLA RURAL"] },
    { state: "NCT OF Delhi", district: "New Delhi", centre: [28.6139, 77.2090], acs: ["NEW DELHI", "DELHI CANTT"] }
];
const ALL_FACILITIES = { ramp: true, wheelchair: true, drinkingWater: true, toilet: true, shade: true, signage: true };

export const seedBulkDemo = async () => {
    if (await redis().get("demo:bulk-seeded")) return;
    const at = now();
    const existing = await listStations();
    const tx = redis().multi();
    const stations = [];
    const electorsByStation = new Map();
    let epicNo = 5000000;

    // ---- Polling stations and electors ----
    for (const area of AREAS) {
        for (const [acIndex, ac] of area.acs.entries()) {
            const parts = area.district === "Ludhiana" && ac === "Ludhiana South" ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4];
            for (const p of parts) {
                const partNumber = String(p);
                if (existing.some((s) => s.state === area.state && s.constituency === ac && s.partNumber === partNumber)) continue;
                const locality = pick(LOCALITIES[area.district]);
                const name = `${pick(PLACES)}, ${locality}`;
                const location = { lat: +(area.centre[0] + (rnd() - 0.5) * 0.09 + acIndex * 0.004).toFixed(5), lng: +(area.centre[1] + (rnd() - 0.5) * 0.11).toFixed(5) };
                const accessibility = { ...ALL_FACILITIES, ramp: rnd() > 0.15, wheelchair: rnd() > 0.25, shade: rnd() > 0.2 };
                const address = `${locality}, ${area.district === "SHIMLA" ? "Shimla" : area.district} ${area.state === "Punjab" ? "1410" + int(10, 99) : area.state === "Himachal Pradesh" ? "1710" + int(10, 99) : "1100" + int(10, 99)}`;
                const details = { name, address, location, accessibility };
                const station = {
                    _id: id(), stationCode: `PS-${area.state}-${ac}-${partNumber}`.toUpperCase().replace(/[^A-Z0-9-]+/g, "-"), state: area.state, district: area.district, constituency: ac, partNumber,
                    ...details, status: "ACTIVE", pendingChange: null, relocationNotice: null,
                    history: [{ type: "create", from: null, to: details, reason: "Demo data", proposedBy: "SEED", approvedBy: "SEED", eciReference: "ECI/DEMO/PS", at, version: 1 }],
                    source: { authority: "Demo data (synthetic), shown as approved", version: 1, verifiedAt: at, approvedBy: "SEED", eciReference: "ECI/DEMO/PS" },
                    createdBy: "SEED", createdAt: at, demo: "bulk"
                };
                saveStation(station, tx);
                stations.push(station);
                // Electors of the part (fewer outside Punjab to keep the demo light).
                const count = area.state === "Punjab" ? int(18, 30) : int(10, 16);
                const list = [];
                for (let n = 1; n <= count; n += 1) {
                    const female = rnd() > 0.52;
                    const first = female ? pick(FIRST_F) : pick(FIRST_M);
                    const last = pick(LAST);
                    const age = int(18, 86);
                    const dob = `${new Date().getUTCFullYear() - age}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`;
                    const epic = `DMB${String(epicNo++).padStart(7, "0")}`;
                    const e = {
                        _id: id(), epic, name: `${first} ${last}`, dateOfBirth: new Date(dob).toISOString(), age, gender: female ? "Female" : "Male",
                        state: area.state, district: area.district, assemblyConstituency: ac, address: `House ${int(1, 999)}, ${locality}`, pinCode: null,
                        partNumber, pollingStation: name, serialNumber: n, relativeName: `${pick(FIRST_M)} ${last}`, relationType: female && rnd() > 0.5 ? "Husband" : "Father",
                        houseNumber: String(int(1, 999)), photoUrl: null, isActive: true, registeredAt: at, approvedBy: "SEED", demo: "bulk",
                        ...(rnd() < 0.03 ? { electorCategory: "service_voter" } : rnd() < 0.02 ? { electorCategory: "overseas_elector" } : {}),
                        ...(rnd() < 0.04 ? { pwd: { categories: ["locomotor"], percent: "60" } } : {})
                    };
                    saveElector(e, tx);
                    list.push(e);
                }
                tx.set(`part-serial:${area.state.toLowerCase()}:${ac.toLowerCase()}:${partNumber}`, String(count));
                electorsByStation.set(station._id, list);
            }
        }
    }

    // Station proposals at each stage of the s. 25 workflow.
    const stage = (who, role, stageName, note = null) => ({ stage: stageName, by: who, role, at, note });
    const proposals = [
        ["Punjab", "Amritsar", "Amritsar East", "9", "Government Primary School, Chheharta", "DISTRICT_REVIEW", [stage("DEO1000002", "deo", "DISTRICT_REVIEW")], null],
        ["Punjab", "Ludhiana", "Ludhiana North", "9", "Community Hall, Haibowal Kalan", "STAKEHOLDER_CONSULTATION", [stage("DEO1000001", "deo", "DISTRICT_REVIEW"), stage("DEO1000001", "deo", "STAKEHOLDER_CONSULTATION", "Parties agreed")],
            { parties: "All recognised parties", meetingDate: day(-3), outcome: "Parties agreed", objections: null, by: "DEO1000001", at }],
        ["Punjab", "Jalandhar", "Jalandhar Central", "9", "Municipal School, Rama Mandi", "SENT_TO_CEO", [stage("SEED", "deo", "DISTRICT_REVIEW"), stage("SEED", "deo", "STAKEHOLDER_CONSULTATION", "No objection"), stage("SEED", "deo", "SENT_TO_CEO")],
            { parties: "All recognised parties", meetingDate: day(-5), outcome: "No objection", objections: null, by: "SEED", at }],
        ["Himachal Pradesh", "SHIMLA", "SHIMLA", "9", "Government School, Sanjauli Chowk", "SENT_TO_CEO", [stage("DEO1000003", "deo", "DISTRICT_REVIEW"), stage("DEO1000003", "deo", "STAKEHOLDER_CONSULTATION", "One party asked for a ramp"), stage("DEO1000003", "deo", "SENT_TO_CEO")],
            { parties: "All recognised parties", meetingDate: day(-4), outcome: "Agreed, subject to a ramp", objections: "Ramp needed", by: "DEO1000003", at }]
    ];
    for (const [state, district, constituency, partNumber, name, st, steps, consultation] of proposals) {
        const area = AREAS.find((a) => a.district === district);
        const details = { name, address: `${name.split(", ")[1] ?? district}, ${district}`, location: { lat: +(area.centre[0] + 0.02).toFixed(5), lng: +(area.centre[1] - 0.02).toFixed(5) }, accessibility: { ...ALL_FACILITIES, ramp: false } };
        saveStation({ _id: id(), stationCode: `PS-${state}-${constituency}-${partNumber}`.toUpperCase().replace(/[^A-Z0-9-]+/g, "-"), state, district, constituency, partNumber, ...details, status: "PROPOSED",
            pendingChange: { type: "create", proposed: details, reason: "Part split: more than 1,500 electors", by: steps[0].by, at, stage: st, steps, consultation },
            history: [], relocationNotice: null, source: null, createdBy: "SEED", createdAt: at, demo: "bulk" }, tx);
    }

    // ---- Extra officials in other districts and States ----
    const officials = [
        ["DEO1000002", "deo", "Demo DEO, Amritsar", { state: "Punjab", district: "Amritsar" }],
        ["ERO1000002", "ero", "Demo ERO, Amritsar East", { state: "Punjab", district: "Amritsar", constituency: "Amritsar East" }],
        ["DEO1000003", "deo", "Demo DEO, Shimla", { state: "Himachal Pradesh", district: "SHIMLA" }],
        ["CEO1000002", "ceo", "Demo CEO, Himachal Pradesh", { state: "Himachal Pradesh" }],
        ["FST1000002", "flying_squad", "Demo flying squad 2, Ludhiana South", { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South" }]
    ];
    for (const [epic, role, name, jurisdiction] of officials) {
        if (await getUserByEpic(epic)) continue;
        const user = { _id: id(), epic, role, name, createdAt: at, demo: true };
        saveUser(user, tx);
        saveAssignment({ _id: id(), userId: user._id, epic, role, election: ["deo", "flying_squad"].includes(role) ? "Demo general election" : null, jurisdiction, status: "active",
            validFrom: null, validUntil: null, grantedBy: "SEED", grantedAt: at, demo: true }, tx);
    }
    await tx.exec();

    // ---- Workflows at every stage ----
    const t2 = redis().multi();
    const LS = { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South" };
    const lsStations = stations.filter((s) => s.constituency === "Ludhiana South");
    const lsElectors = lsStations.flatMap((s) => electorsByStation.get(s._id) ?? []);
    const actor = (epic, role, name = null) => ({ epic, role, name });

    // Electoral forms 2-8.
    const forms = store("eform");
    const formRows = [
        ["FORM_6A", "form-6a", "inclusion", "overseas_elector", "submitted", { firstName: "RAVINDER", lastName: "BAINS", dateOfBirth: "1988-03-14", gender: "male", truthConfirmed: true }],
        ["FORM_2", "form-2", "inclusion", "service_voter", "field_verified", { fullName: "SUBEDAR KULDEEP SINGH", dateOfBirth: "1982-07-02", gender: "male", citizenDeclaration: true, armedForce: "Army" }],
        ["FORM_8", "form-8", "change", null, "submitted", { applicantName: lsElectors[3]?.name, epicNumber: lsElectors[3]?.epic, applicationType: "correction", correctionFields: ["name"], correctedName: `${lsElectors[3]?.name} Rai`, truthConfirmed: true }],
        ["FORM_8", "form-8", "change", null, "field_verified", { applicantName: lsElectors[5]?.name, epicNumber: lsElectors[5]?.epic, applicationType: "pwd", disabilityCategories: ["visual"], disabilityPercent: "70", truthConfirmed: true }],
        ["FORM_7", "form-7", "deletion", null, "submitted", { applicantName: lsElectors[1]?.name, applicantEpic: lsElectors[1]?.epic, applicationType: "delete-existing", reason: "death", personEpic: lsElectors[9]?.epic, declarationConfirmed: true }],
        ["FORM_6B", "form-6b", "authentication", null, "approved", { electorName: lsElectors[7]?.name, epicNumber: lsElectors[7]?.epic, aadhaarOption: "no-aadhaar", alternativeDocumentType: "Passport", informationConfirmed: true }],
        ["FORM_6A", "form-6a", "inclusion", "overseas_elector", "rejected", { firstName: "NIKHIL", lastName: "ARORA", dateOfBirth: "1995-11-20", gender: "male", truthConfirmed: true }]
    ];
    for (const [i, [code, route, kind, category, status, fields]] of formRows.entries()) {
        const ref = `EF${new Date().getUTCFullYear()}DEMO${String(i + 1).padStart(6, "0")}`;
        const subjEpic = fields.epicNumber ?? fields.applicantEpic ?? null;
        const timeline = [{ step: "submitted", at: ago(60 * 24 * (8 - i)) }];
        if (["field_verified", "approved", "rejected"].includes(status)) timeline.push({ step: "field_verified", at: ago(60 * 24 * (6 - i / 2)) });
        if (["approved", "rejected"].includes(status)) timeline.push({ step: status, at: ago(60 * 24 * 2) });
        const app = {
            _id: `demo-bulk-eform-${i + 1}`, referenceId: ref, formCode: code, route, title: { FORM_2: "Form 2: service voter (Armed Forces)", FORM_6A: "Form 6A: overseas elector", FORM_6B: "Form 6B: Aadhaar or alternative document for authentication", FORM_7: "Form 7: objection or deletion", FORM_8: "Form 8: shifting, correction, replacement EPIC or PwD marking" }[code],
            kind, category, jurisdiction: LS, subject: { name: fields.firstName ? `${fields.firstName} ${fields.lastName}` : fields.fullName ?? fields.applicantName ?? fields.electorName, epic: subjEpic, targetEpic: fields.personEpic ?? null, targetName: null },
            fields, aadhaar: null, documents: [], fingerprint: `demo-${i}`, status, submittedBy: null, channel: "online", submittedAt: timeline[0].at, timeline,
            fieldReport: status === "submitted" ? null : { recommendation: status === "rejected" ? "reject" : "approve", note: status === "rejected" ? "Not found at the address in India on two visits" : null, method: "home_visit", booth: kind === "inclusion" ? { partNumber: "2", pollingStation: lsStations[1]?.name ?? "Demo station" } : null, contacted: true, by: actor("BLO1000001", "blo"), at: timeline[1]?.at },
            decision: ["approved", "rejected"].includes(status) ? { outcome: status, reason: status === "rejected" ? "The applicant is not ordinarily resident at the address given; field report and hearing." : "Passport seen.", by: actor("ERO1000001", "ero"), at: timeline.at(-1).at, booth: null, epic: null, effect: null } : null,
            demo: "bulk"
        };
        forms.save(app, t2);
        t2.set(`eform:ref:${ref}`, app._id);
    }

    // MCC complaints (cVIGIL) at every stage.
    const complaints = store("mcc-complaint");
    const cRows = [
        ["cash", "received", 22, "Envelopes being handed out outside the ration depot", "Near ration depot, Shimlapuri"],
        ["loudspeaker", "received", 8, "Loudspeaker on a vehicle after 10 pm", "BRS Nagar main road"],
        ["liquor", "assigned", 47, "Cartons of liquor unloaded at a closed shop", "Giaspura, Street 6"],
        ["defacement", "field_reported", 85, "Party posters on the school boundary wall", "Government school, Dugri"],
        ["cash", "disposed", 300, "Cash distributed at a community lunch", "Jamalpur gurudwara road"],
        ["hate_speech", "disposed", 900, "Communal remarks at a street meeting", "Haibowal chowk"],
        ["paid_news", "dropped", 1500, "Same news item in three papers", "Online"],
        ["government_misuse", "assigned", 30, "Government jeep used for a rally", "Civil Lines"]
    ];
    const seizures = [];
    for (const [i, [category, status, minutesAgo, description, place]] of cRows.entries()) {
        const receivedAt = ago(minutesAgo);
        const timeline = [{ step: "received", at: receivedAt }];
        if (["assigned", "field_reported", "disposed"].includes(status)) timeline.push({ step: "assigned", at: ago(minutesAgo - 4), by: "DEO1000001" });
        if (["field_reported", "disposed"].includes(status)) timeline.push({ step: "field_reported", at: ago(Math.max(1, minutesAgo - 45)), by: "FST1000001" });
        if (status === "disposed") timeline.push({ step: "disposed", at: ago(Math.max(1, minutesAgo - 80)), by: "ROF1000001" });
        if (status === "dropped") timeline.push({ step: "dropped", at: ago(minutesAgo - 10), by: "ROF1000001" });
        const seized = category === "cash" && status === "disposed" ? [{ kind: "cash", value: 285000, description: "Cash in envelopes", at: ago(minutesAgo - 45) }] : category === "liquor" && status !== "assigned" ? [{ kind: "liquor", value: 64000, description: "48 cartons", at: ago(10) }] : [];
        seizures.push(...seized);
        complaints.save({
            _id: `demo-bulk-complaint-${i + 1}`, referenceId: `CV${new Date().getUTCFullYear()}DEMO${i + 1}`, jurisdiction: LS, category, description, place,
            location: { lat: +(30.90 + (rnd() - 0.5) * 0.05).toFixed(5), lng: +(75.85 + (rnd() - 0.5) * 0.05).toFixed(5) }, hasPhoto: false, anonymous: i % 3 === 0,
            complainant: i % 3 === 0 ? null : { mobile: "98765" + String(10000 + i), epic: null, name: null }, status, receivedAt,
            assignedTo: ["assigned", "field_reported", "disposed"].includes(status) ? { epic: i % 2 ? "FST1000002" : "FST1000001", at: ago(minutesAgo - 4), by: "DEO1000001" } : null,
            fieldReport: ["field_reported", "disposed"].includes(status) ? { found: category !== "hate_speech", actions: category === "defacement" ? "Posters found on the wall; photographs taken; the municipal team was asked to remove them." : category === "hate_speech" ? "Meeting had ended when the squad arrived; video from two bystanders collected for the RO." : "Reached the spot, questioned those present, seized the items and prepared a panchnama.", reachedAt: null, by: actor("FST1000001", "flying_squad"), at: ago(Math.max(1, minutesAgo - 45)) } : null,
            seizures: seized,
            disposal: status === "disposed" ? { outcome: category === "cash" ? "referred_police" : "notice_issued", note: category === "cash" ? "FIR registered at Division 6 police station; cash deposited in the treasury." : "Notice issued to the candidate's election agent under the MCC; reply in 48 hours.", by: actor("ROF1000001", "ro"), at: ago(Math.max(1, minutesAgo - 80)) } : null,
            droppedAt: status === "dropped" ? ago(minutesAgo - 10) : null, dropReason: status === "dropped" ? "Paid news referrals go to the MCMC, not the flying squad. Forwarded." : undefined,
            timeline, demo: "bulk"
        }, t2);
        t2.set(`mcc-complaint:ref:CV${new Date().getUTCFullYear()}DEMO${i + 1}`, `demo-bulk-complaint-${i + 1}`);
    }

    // Campaign permissions in several states.
    const permissions = store("campaign-permission");
    const candidates = [["demo-nomination-1", "Gurpreet Sandhu", "Punjab Progress Party"], ["demo-nomination-2", "Simran Arora", "Independent"], ["demo-nomination-3", "Balwinder Kaur", "National Unity Party"]];
    const pRows = [["rally", "with_ro", "no_objection"], ["vehicle", "granted", null], ["procession", "refused", "objection"], ["loudspeaker", "granted", null], ["public_meeting", "applied", null], ["party_office", "with_ro", null]];
    for (const [i, [type, status, police]] of pRows.entries()) {
        const [nominationId, name, party] = candidates[i % 3];
        permissions.save({
            _id: `demo-bulk-permission-${i + 1}`, electionId: "demo-bye-election", electionName: "Demo bye-election, Ludhiana South", jurisdiction: LS, candidate: { name, party, nominationId, epic: null },
            type, date: day(2 + i), from: "10:00", to: "13:00", venue: `${pick(LOCALITIES.Ludhiana)}, Ludhiana`, purpose: type === "vehicle" ? "Two campaign vehicles, PB10 series" : "Meeting with residents",
            expectedCrowd: ["rally", "procession", "public_meeting"].includes(type) ? int(300, 4000) : null, vehicleNumbers: type === "vehicle" ? "PB10AB1234, PB10CD5678" : null, status,
            appliedBy: actor("EAG1000001", "election_agent", "Demo election agent"), appliedAs: "election_agent", appliedAt: ago(60 * 24 * (6 - i)),
            police: police ? { remark: police, note: police === "objection" ? "Route passes a sensitive area during market hours." : null, by: actor("SPO1000001", "sector_police_officer"), at: ago(60 * 24 * (5 - i)) } : null,
            decision: status === "granted" ? { decision: "grant", reason: null, conditions: "No loudspeaker after 10 pm; route as approved.", by: actor("ROF1000001", "ro"), at: ago(60 * 12), permitNumber: `PRM-DEMO${i}` }
                : status === "refused" ? { decision: "refuse", reason: "Police objection on the route; offered an alternative ground.", conditions: null, by: actor("ROF1000001", "ro"), at: ago(60 * 12), permitNumber: null } : null,
            history: [{ step: "applied", at: ago(60 * 24 * (6 - i)), by: "EAG1000001" }], demo: "bulk"
        }, t2);
    }

    // Expenditure registers for the bye-election candidates.
    const expenditure = store("expenditure");
    const heads = ["public_meeting", "campaign_material", "media_advertisement", "vehicles", "workers", "social_media", "office"];
    let n = 0;
    for (const [nominationId, name, party] of candidates) {
        for (let k = 0; k < 9; k += 1) {
            const amount = int(5, 260) * 1000;
            const mode = pick(["bank_transfer", "cheque", "upi", "cash"]);
            n += 1;
            expenditure.save({ _id: `demo-bulk-expenditure-${n}`, electionId: "demo-bye-election", jurisdiction: LS, candidate: { name, party, nominationId, epic: null }, candidateKey: nominationId,
                date: day(-k), category: pick(heads), amount, mode, payee: `${pick(["Sharma", "Gill", "City", "Punjab"])} ${pick(["Traders", "Printers", "Tent House", "Media", "Travels"])}`,
                description: "Demo entry", voucherRef: rnd() > 0.15 ? `V-${1000 + n}` : null, enteredBy: actor("EAG1000001", "election_agent"), enteredAt: ago(60 * 24 * k), corrects: null, supersededBy: null, correctionReason: null,
                observerNotes: n === 4 ? [{ kind: "discrepancy", text: "Rally on the 2nd had about 40 vehicles; only 6 are entered.", by: actor("EOB1000001", "expenditure_observer"), at: ago(300) }] : [],
                flags: [...(mode === "cash" && amount > 10000 ? ["cash_above_10000"] : []), ...(rnd() > 0.85 ? ["no_voucher"] : [])], demo: "bulk" }, t2);
        }
    }
    store("expenditure-shadow").save({ _id: "demo-bulk-shadow-1", electionId: "demo-bye-election", jurisdiction: LS, candidateKey: "demo-nomination-1", candidateName: "Gurpreet Sandhu", date: day(-2),
        event: "Road show with about 40 vehicles, a DJ truck and an LED wall", estimatedAmount: 420000, observedBy: actor("EOB1000001", "expenditure_observer"), observedAt: ago(400), demo: "bulk" }, t2);

    // Observer reports and Commission directions.
    const reports = store("observer-report");
    const directions = store("direction");
    reports.save({ _id: "demo-bulk-report-1", kind: "micro", electionId: "demo-poll-day", election: "Demo poll-day election, Ludhiana South", jurisdiction: LS, pollingStation: lsStations[0]?.name ?? null,
        topic: "poll_day", severity: "serious", title: "Polling agent of one candidate stopped at the gate", facts: "At 09:40 the polling agent of the National Unity Party was kept out for 25 minutes by persons outside the 100-metre limit. The presiding officer intervened.",
        recommendation: "Deploy the sector mobile party at this station.", reportTo: ["general_observer", "commission"], confidential: true, status: "submitted", filedBy: actor("MOB1000001", "micro_observer"), filedAt: ago(200), review: [], directionIds: [], demo: "bulk" }, t2);
    reports.save({ _id: "demo-bulk-report-2", kind: "expenditure", electionId: "demo-bye-election", election: "Demo bye-election, Ludhiana South", jurisdiction: LS, pollingStation: null,
        topic: "expenditure", severity: "concern", title: "Under-reporting of vehicle hire", facts: "The shadow register shows ₹4.2 lakh for the road show on the 2nd; the candidate's register shows ₹38,000 for vehicles in the whole week.",
        recommendation: "Issue a notice to the candidate to reconcile the register.", reportTo: ["commission"], confidential: true, status: "direction_issued", filedBy: actor("EOB1000001", "expenditure_observer"), filedAt: ago(1440),
        review: [{ action: "acknowledge", note: "Seen.", by: actor("CEC1000001", "cec"), at: ago(1300) }], directionIds: ["demo-bulk-direction-1"], demo: "bulk" }, t2);
    directions.save({ _id: "demo-bulk-direction-1", reference: "ECI/DIR/2026/40123", subject: { type: "observer_report", id: "demo-bulk-report-2" }, jurisdiction: LS, addressedTo: "ro", legalBasis: "expenditure",
        instruction: "Issue a notice to the candidate to reconcile the expenditure register with the shadow register within 48 hours and report.", dueDate: day(2), status: "issued",
        issuedBy: actor("CEC1000001", "cec"), issuedAt: ago(1200), compliance: [], closedAt: null, demo: "bulk" }, t2);
    directions.save({ _id: "demo-bulk-direction-2", reference: "ECI/DIR/2026/40124", subject: { type: "general", id: null }, jurisdiction: { state: "Punjab", district: "Ludhiana" }, addressedTo: "deo", legalBasis: "administrative",
        instruction: "Ensure webcasting at all critical polling stations in the district and report the coverage.", dueDate: day(3), status: "complied",
        issuedBy: actor("ELC1000001", "election_commissioner"), issuedAt: ago(3000), compliance: [{ note: "Webcasting arranged at all 6 critical stations; test run done.", evidence: "DEO/LDH/2026/WC-12", by: actor("DEO1000001", "deo"), at: ago(600) }], closedAt: null, demo: "bulk" }, t2);

    // Roll appeals.
    const appeals = store("roll-appeal");
    appeals.save({ _id: "demo-bulk-appeal-1", referenceId: `AP${new Date().getUTCFullYear()}DEMO1`, order: { kind: "eform", id: "demo-bulk-eform-7", reference: `EF${new Date().getUTCFullYear()}DEMO000007`, title: "Form 6A: overseas elector", status: "rejected", decidedAt: ago(2880), reason: "Not ordinarily resident", jurisdiction: LS, applicant: "NIKHIL ARORA" },
        jurisdiction: LS, appellant: { name: "NIKHIL ARORA", mobile: "9876500001", epic: null }, grounds: "I am temporarily abroad for study and my family home is at the address given. The BLO visited while the house was locked.",
        status: "first_appeal", filedAt: ago(1000), first: null, second: null, implementation: null, timeline: [{ step: "first_appeal", at: ago(1000) }], demo: "bulk" }, t2);
    t2.set(`roll-appeal:ref:AP${new Date().getUTCFullYear()}DEMO1`, "demo-bulk-appeal-1");

    // Poll-day incidents on the demo poll-day election.
    const incidentRows = [["evm_malfunction", "high", "Control unit showed an error after 212 votes; replaced from the sector reserve.", "acknowledged"], ["law_and_order", "medium", "Crowd gathered near the 100-metre line; dispersed by police.", "resolved"], ["power", "low", "Power cut for 20 minutes; inverter used.", "reported"], ["accessibility", "medium", "Ramp too steep for wheelchairs; volunteers helping.", "reported"]];
    for (const [i, [type, severity, description, status]] of incidentRows.entries()) {
        const s = lsStations[i % lsStations.length];
        if (!s) break;
        const t = ago(180 - i * 30);
        saveIncident({ _id: `demo-bulk-incident-${i + 1}`, electionId: "demo-poll-day", stationId: s._id, stationCode: s.stationCode, stationName: s.name, state: s.state, district: s.district, constituency: s.constituency, partNumber: s.partNumber,
            type, severity, description, status, reportedBy: { epic: "PRO1000001", role: "presiding_officer" }, reportedAt: t,
            timeline: [{ action: "reported", by: "PRO1000001", at: t, note: description }, ...(status !== "reported" ? [{ action: "acknowledged", by: "SCO1000001", at: ago(150 - i * 30) }] : []), ...(status === "resolved" ? [{ action: "resolved", by: "SCO1000001", at: ago(100), note: "Situation normal." }] : [])],
            escalationLevel: ["high", "critical"].includes(severity) ? 1 : 0, demo: "bulk" }, t2);
    }

    // Logistics for the demo poll-day election.
    const logistics = store("logistics");
    const steps = ["party_dispatched", "party_reached", "station_set_up", "mock_poll_done"];
    for (const [i, s] of lsStations.entries()) {
        for (let k = 0; k < Math.min(steps.length, 1 + (i % 4)); k += 1) {
            logistics.save({ _id: `demo-bulk-log-${i}-${k}`, electionId: "demo-poll-day", stationId: s._id, stationName: s.name, partNumber: s.partNumber, jurisdiction: LS, step: steps[k],
                note: null, sealNumbers: null, vehicle: k === 0 ? `PB10GV${1000 + i}` : null, by: actor("SCO1000001", "sector_officer"), at: ago(900 - k * 120) }, t2);
        }
    }

    // Security: assessments, deployments, situation reports.
    const assessments = store("security-assessment");
    for (const [i, s] of stations.filter((x) => x.district === "Ludhiana").slice(0, 14).entries()) {
        const category = i % 5 === 0 ? "critical" : i % 3 === 0 ? "sensitive" : "normal";
        assessments.save({ _id: `demo-bulk-assess-${i}`, stationId: s._id, stationName: s.name, partNumber: s.partNumber, jurisdiction: { state: s.state, district: s.district, constituency: s.constituency }, category,
            reasons: category === "normal" ? [] : [pick(["past_violence", "intimidation", "turnout_anomaly", "communal"])], note: null,
            measures: { capf: category === "critical" ? 8 : category === "sensitive" ? 4 : 0, statePolice: 2, homeGuards: 2, microObserver: category === "critical", webcasting: category !== "normal" },
            by: actor("DPO1000001", "district_police_officer"), at: ago(5000), supersededBy: null, previous: null, demo: "bulk" }, t2);
    }
    const deployments = store("security-deployment");
    [["A coy, 45 Bn CRPF", "capf", "static", 96, "deployed"], ["Sector mobile parties 1-6", "district_police", "sector_mobile", 36, "deployed"], ["QRT Ludhiana South", "state_armed", "qrt", 24, "planned"], ["Strong room guard, Government College", "capf", "strong_room", 30, "planned"]]
        .forEach(([unit, forceType, duty, strength, status], i) => deployments.save({ _id: `demo-bulk-dep-${i}`, jurisdiction: i < 3 ? LS : { state: "Punjab", district: "Ludhiana" }, electionId: "demo-poll-day", unit, forceType, duty, strength,
            from: day(-1), to: day(2), stations: [], inCharge: pick(["Insp. R. Singh", "DSP K. Sandhu", "AC M. Rao"]), status, by: actor("DPO1000001", "district_police_officer"), at: ago(4000), updates: [], demo: "bulk" }, t2));
    const sitreps = store("security-sitrep");
    [["law_and_order", "normal", "Dugri", "All quiet; sector mobile parties on patrol."], ["route", "alert", "Ferozepur Road", "Road works; polling party routes 3 and 5 diverted via Pakhowal Road."], ["seizure", "incident", "Giaspura", "48 cartons of liquor seized by the flying squad; FIR registered."], ["strong_room", "normal", "Government College", "Strong room sealed; CCTV working; two-tier guard in place."]]
        .forEach(([kind, status, location, details], i) => sitreps.save({ _id: `demo-bulk-sitrep-${i}`, jurisdiction: LS, electionId: "demo-poll-day", kind, status, location, details, by: actor("SPO1000001", "sector_police_officer"), at: ago(60 * (8 - i)), demo: "bulk" }, t2));

    // Nodal reports and tasks.
    const nodalReports = store("nodal-report");
    [["evm", 80, "on_track", "FLC complete for 412 of 515 control units; randomisation planned."], ["training", 65, "at_risk", "Second training of polling parties: 20% absent; repeat session on Saturday."],
     ["transport", 50, "on_track", "180 of 360 vehicles requisitioned."], ["mcc", 100, "on_track", "All flying squads and static teams deployed; cVIGIL monitored 24x7."], ["sveep", 70, "on_track", "Voter awareness drives in 40 colleges."]]
        .forEach(([fn, progress, status, summary], i) => nodalReports.save({ _id: `demo-bulk-nodal-${i}`, function: fn, functionLabel: fn, jurisdiction: { state: "Punjab", district: "Ludhiana" }, progressPercent: progress, status, summary,
            issues: status === "at_risk" ? "Need the DEO's order on absentee staff." : null, metrics: {}, by: actor("DNO1000001", "district_nodal_officer"), at: ago(200 + i * 300), demo: "bulk" }, t2));
    const nodalTasks = store("nodal-task");
    [["transport", "Requisition 40 buses for polling parties of Ludhiana South and West", "in_progress"], ["training", "Hands-on EVM training for all presiding officers", "open"], ["accessibility", "Ramps at the 9 stations flagged by sector officers", "open"]]
        .forEach(([fn, title, status], i) => nodalTasks.save({ _id: `demo-bulk-task-${i}`, function: fn, jurisdiction: { state: "Punjab", district: "Ludhiana" }, title, details: null, dueDate: day(4 + i), status,
            createdBy: actor("DEO1000001", "deo"), createdAt: ago(3000), updates: status === "in_progress" ? [{ status, note: "22 of 40 confirmed", by: actor("DNO1000001", "district_nodal_officer"), at: ago(800) }] : [], demo: "bulk" }, t2));

    // Station problems reported from the field.
    const issues = store("station-issue");
    const s0 = lsStations[2], s1 = stations.find((x) => x.constituency === "Ludhiana North");
    if (s0) issues.save({ _id: "demo-bulk-issue-1", stationId: s0._id, stationName: s0.name, partNumber: s0.partNumber, state: s0.state, district: s0.district, constituency: s0.constituency, kind: "inaccessible", details: "The only entrance has four steps and no ramp.", reportedBy: { epic: "SCO1000001", role: "sector_officer" }, at: ago(2000), status: "open", resolution: null, demo: "bulk" }, t2);
    if (s1) issues.save({ _id: "demo-bulk-issue-2", stationId: s1._id, stationName: s1.name, partNumber: s1.partNumber, state: s1.state, district: s1.district, constituency: s1.constituency, kind: "overcrowded", details: "1,640 electors on the part; the queue reached the road last time.", reportedBy: { epic: "BLA1000001", role: "bla" }, at: ago(4000), status: "open", resolution: null, demo: "bulk" }, t2);

    t2.set("demo:bulk-seeded", at);
    await t2.exec();
    console.log(`Seeded bulk demo data: ${stations.length} polling stations with locations, ${[...electorsByStation.values()].reduce((a, l) => a + l.length, 0)} electors, ${formRows.length} forms, ${cRows.length} MCC complaints, permissions, expenditure, reports, directions, appeals, incidents, logistics, security and nodal records.`);
};
