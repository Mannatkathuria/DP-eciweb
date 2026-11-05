// Demo data for the modules added from the ECI systems inventory: the reference library, ePlan,
// EVMs (EMS 2.0), grievances (NGSP), seizures (ESMS), party filings (IEMS), service-voter postal
// ballots (ETPBMS), the Index Card, roll-quality flags (PSE/DSE, deaths), BLO facility surveys,
// the BLO register, EPIC deliveries, observer profiles and flying-squad positions.
//
// Everything is synthetic. It goes into whichever store is active (MongoDB if MONGODB_URI is set,
// Redis otherwise) and is written once per store (key demo:modules-seeded:<store>).
import crypto from "crypto";
import { redis } from "./config/redis.js";
import { getElection, getStation, listStations, saveStation } from "./repositories/election.repository.js";
import { listElectors, saveElector } from "./repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "./repositories/user.repository.js";
import { docStore, docStoreBackend } from "./services/docStore.service.js";
import { store } from "./services/workflow.service.js";
import { ensureLibrary } from "./controllers/library.controller.js";
import { CALENDAR } from "./controllers/eplan.controller.js";
import { buildCard } from "./controllers/indexCard.controller.js";
import { AMF, EMF } from "./controllers/field.controller.js";

let seed = 5112026;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const day = (offset) => { const d = new Date(Date.now() + 330 * 60000); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const actor = (epic, role, name = null) => ({ epic, role, name: name ?? `Demo ${role.replace(/_/g, " ")}` });
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const LS = { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South" };

export const seedModulesDemo = async () => {
    const guard = `demo:modules-seeded:${docStoreBackend()}`;
    if (await redis().get(guard)) return;
    const at = now();
    await ensureLibrary();

    // ---- The party treasurer's account carries the party ----
    const ptr = await getUserByEpic("PTR1000001");
    if (ptr && !ptr.party) await saveUser({ ...ptr, party: "Punjab Progress Party", name: "Demo treasurer, Punjab Progress Party" });

    // ---- ePlan ----
    const vacancies = docStore("eplan_vacancies"), holidays = docStore("eplan_holidays"), acts = docStore("eplan_activities"), messages = docStore("eplan_messages");
    const vac = [
        { seat: { state: "Punjab", house: "assembly", constituency: "Ludhiana West", district: "Ludhiana" }, member: "Demo member A", reason: "death", occurredOn: day(-40) },
        { seat: { state: "Himachal Pradesh", house: "assembly", constituency: "SHIMLA RURAL", district: "SHIMLA" }, member: "Demo member B", reason: "resignation", occurredOn: day(-95) },
        { seat: { state: "NCT OF Delhi", house: "assembly", constituency: "DELHI CANTT", district: "New Delhi" }, member: "Demo member C", reason: "disqualification", occurredOn: day(-150) },
        { seat: { state: "Punjab", house: "lok_sabha", constituency: "Jalandhar", district: "Jalandhar" }, member: "Demo member D", reason: "death", occurredOn: day(-20), termEndsOn: day(250) }
    ].map((v) => {
        const due = new Date(`${v.occurredOn}T00:00:00Z`); due.setUTCMonth(due.getUTCMonth() + 6);
        const exempt = v.termEndsOn && v.termEndsOn <= day(Math.round((Date.parse(v.occurredOn) - Date.now()) / 86400000) + 365);
        return { _id: id(), ...v, termEndsOn: v.termEndsOn ?? null, dueBy: due.toISOString().slice(0, 10), exemption: exempt ? "Less than one year of the term remains (s. 151A proviso (a)): no bye-election needed." : null,
            status: exempt ? "exempt" : "open", planId: null, createdAt: ago(60 * 24 * 10), createdBy: "ECI1234567", demo: "modules" };
    });
    const plan = { _id: id(), kind: "plan", planKind: "bye_election", name: "Bye-election, Ludhiana West (planned)", states: ["Punjab"], vacancyIds: [vac[0]._id], pollDate: day(45), status: "planning", electionId: null,
        warnings: [], createdAt: ago(60 * 24 * 7), createdBy: "ECI1234567", demo: "modules" };
    vac[0] = { ...vac[0], status: "planned", planId: plan._id };
    const hol = [["ALL", "2026-11-08", "Diwali"], ["ALL", "2027-01-26", "Republic Day"], ["Punjab", "2026-11-24", "Guru Nanak Jayanti"], ["Himachal Pradesh", "2026-12-25", "Christmas"], ["Punjab", day(45 - 21), "Local fair (demo)"]]
        .map(([state, date, name]) => ({ _id: id(), state, date, name, createdAt: at, createdBy: "SEED", demo: "modules" }));
    const planActs = CALENDAR.map(([key, title, offset, area]) => {
        const dueOn = day(45 + offset);
        const status = dueOn < day(-3) ? (rnd() < 0.8 ? "done" : "in_progress") : dueOn < day(0) ? pick(["done", "pending"]) : "pending";
        return { _id: id(), kind: "activity", planId: plan._id, key, title, area, dueOn, states: ["Punjab"], status, doneOn: status === "done" ? dueOn : null, note: null, createdAt: plan.createdAt, clashes: hol.filter((h) => h.date === dueOn).map((h) => h.name), demo: "modules" };
    });
    plan.warnings = planActs.filter((a) => a.clashes.length).map((a) => `${a.title} falls on ${a.clashes.join(", ")}.`);
    await vacancies.insertMany(vac);
    await holidays.insertMany(hol);
    await acts.insertMany([plan, ...planActs]);
    await messages.insertMany([
        { _id: id(), channel: "email", states: ["Punjab"], subject: "Bye-election calendar, Ludhiana West", text: "The planning calendar is attached. Please confirm the roll and EVM dates.", automatic: false, delivery: "simulated", createdAt: ago(60 * 24 * 6), createdBy: "ECI1234567", demo: "modules" },
        { _id: id(), channel: "sms", states: ["Himachal Pradesh"], subject: "Vacancy, SHIMLA RURAL", text: "Bye-election due within six months. Send the preparedness report.", automatic: false, delivery: "simulated", createdAt: ago(60 * 24 * 3), createdBy: "ECI1234567", demo: "modules" }
    ]);

    // ---- EVMs: Ludhiana district inventory, FLC, first randomisation; second for Ludhiana South ----
    const stations = (await listStations()).filter((s) => s.status === "ACTIVE");
    const lud = stations.filter((s) => s.state === "Punjab" && s.district === "Ludhiana");
    const acs = [...new Set(lud.map((s) => s.constituency))];
    const units = docStore("evm_units"), draws = docStore("evm_randomisations");
    const reserve = { BU: 0.25, CU: 0.25, VVPAT: 0.35 };
    const evmDocs = [];
    const firstAlloc = [], secondAlloc = [];
    for (const type of ["BU", "CU", "VVPAT"]) {
        const need = acs.reduce((n, ac) => n + Math.ceil(lud.filter((s) => s.constituency === ac).length * (1 + reserve[type])), 0);
        const total = need + 12;
        const list = Array.from({ length: total }, (_, i) => ({ _id: id(), serial: `${type}${i % 3 ? "B" : "E"}${String(100000 + i).padStart(7, "0")}`, unitType: type, manufacturer: i % 3 ? "BEL" : "ECIL", model: "M3",
            location: { state: "Punjab", district: "Ludhiana", constituency: null, warehouse: "Ludhiana district EVM warehouse, Gill Road" }, status: "received", flc: null, allocation: null, history: [{ step: "received", by: "SEED", at: ago(60 * 24 * 40) }], createdAt: ago(60 * 24 * 40), demo: "modules" }));
        // FLC: all but a few pass; three are still waiting.
        list.forEach((u, i) => {
            if (i >= total - 3) return;
            const bad = i % 61 === 7;
            u.status = bad ? "flc_rejected" : "flc_ok";
            u.flc = { result: bad ? "rejected" : "ok", defect: bad ? "Display fault" : null, engineer: `${u.manufacturer} engineers`, by: "DNO1000001", at: ago(60 * 24 * 30) };
            u.history.push({ step: u.status, by: "DNO1000001", at: u.flc.at });
        });
        const pool = shuffle(list.filter((u) => u.status === "flc_ok"));
        let k = 0;
        for (const ac of acs) {
            const acStations = lud.filter((s) => s.constituency === ac).sort((a, b) => Number(a.partNumber) - Number(b.partNumber));
            const n = Math.ceil(acStations.length * (1 + reserve[type]));
            const mine = pool.slice(k, k + n); k += n;
            mine.forEach((u, i) => {
                u.status = "allotted_ac"; u.location.constituency = ac; u.allocation = { electionId: "demo-poll-day", constituency: ac, firstRandomisationAt: ago(60 * 24 * 20) };
                u.history.push({ step: "allotted_ac", by: "DEO1000001", at: ago(60 * 24 * 20) });
                firstAlloc.push({ serial: u.serial, unitType: type, constituency: ac });
                if (ac === "Ludhiana South") {
                    const s = acStations[i];
                    if (s) { u.status = "commissioned"; u.allocation = { ...u.allocation, stationId: s._id, partNumber: s.partNumber, stationName: s.name, secondRandomisationAt: ago(60 * 24 * 8) }; u.commissioning = { candidates: 3, nota: true, ballotUnitsPerStation: 1, mockPollVotes: type === "CU" ? 1000 : null, at: ago(60 * 24 * 5), by: "ROF1000001" }; }
                    else { u.status = "reserve"; u.allocation = { ...u.allocation, stationId: null, reserve: true, secondRandomisationAt: ago(60 * 24 * 8) }; }
                    u.history.push({ step: u.status, by: "ROF1000001", at: ago(60 * 24 * 8) });
                    secondAlloc.push({ serial: u.serial, unitType: type, stationId: s?._id ?? null, partNumber: s?.partNumber ?? null, reserve: !s });
                }
            });
        }
        evmDocs.push(...list);
    }
    await units.insertMany(evmDocs);
    await draws.insertMany([
        { _id: id(), round: 1, electionId: "demo-poll-day", electionName: "Demo poll-day election, Ludhiana South", jurisdiction: { state: "Punjab", district: "Ludhiana" }, witnesses: ["S. Gill, Punjab Progress Party", "R. Mehta, National Unity Party"],
            allocations: firstAlloc, summary: acs.map((ac) => ({ constituency: ac, stations: lud.filter((s) => s.constituency === ac).length, BU: firstAlloc.filter((x) => x.constituency === ac && x.unitType === "BU").length,
                CU: firstAlloc.filter((x) => x.constituency === ac && x.unitType === "CU").length, VVPAT: firstAlloc.filter((x) => x.constituency === ac && x.unitType === "VVPAT").length })),
            by: actor("DEO1000001", "deo"), createdAt: ago(60 * 24 * 20), demo: "modules" },
        { _id: id(), round: 2, electionId: "demo-poll-day", electionName: "Demo poll-day election, Ludhiana South", jurisdiction: LS, witnesses: ["S. Gill, Punjab Progress Party"], allocations: secondAlloc,
            stations: lud.filter((s) => s.constituency === "Ludhiana South").length, reserve: secondAlloc.filter((x) => x.reserve).length, by: actor("ROF1000001", "ro"), createdAt: ago(60 * 24 * 8), demo: "modules" }
    ]);

    // ---- Grievances (NGSP) ----
    const grievances = docStore("grievances");
    const G = [
        ["electoral_registration", "elector", "Name missing from the roll", "My name was on the roll last year but is missing from the draft roll this year. I live at the same address.", LS, "resolved", "Your name was deleted by mistake during the summary revision; it has been restored by the ERO's order and appears in the supplement."],
        ["polling_booth", "elector", "No ramp at polling station", "The polling station at the community centre in Dugri has steps and no ramp. My father uses a wheelchair.", LS, "in_progress", null],
        ["epic", "elector", "EPIC not received", "I applied in Form 6 four months ago and my application is approved, but I have not received my EPIC.", LS, "open", null],
        ["evm", "political_party", "EVM storage strong room CCTV", "The CCTV display outside the strong room at Government College was switched off for two hours on Sunday.", { state: "Punjab", district: "Ludhiana" }, "resolved", "The display was off during a power cut; the cameras kept recording on UPS. The footage was shown to the party's representative."],
        ["expenditure", "candidate", "Rival's rally expenditure not shown", "A rally of another candidate with 40 vehicles is not shown in the shadow register.", LS, "open", null],
        ["malpractice", "citizen", "Workers threatening voters", "Workers of a party are telling people in our colony they will lose their ration cards if they do not vote for them.", { state: "Punjab", district: "Amritsar", constituency: "Amritsar East" }, "referred_cvigil", "This is a Model Code of Conduct matter and has been sent to the district control room; a flying squad has been asked to visit the colony."],
        ["other", "media", "Accreditation for counting day", "Our reporters have not received counting-day passes.", { state: "Punjab" }, "resolved", "Passes are issued by the DEO's media cell; your list has been forwarded and passes will be ready two days before counting."],
        ["electoral_registration", "election_official", "BLO honorarium not paid", "BLOs of part 12 to 18 have not been paid the honorarium for the special summary revision.", { state: "Punjab", district: "Ludhiana" }, "in_progress", null],
        ["polling_booth", "elector", "Polling station too far", "The new polling station is 4 km from our village; the old school was much closer.", { state: "Himachal Pradesh", district: "SHIMLA", constituency: "SHIMLA RURAL" }, "open", null],
        ["electoral_registration", "elector", "Wrong photo on EPIC", "My EPIC shows another person's photograph.", { state: "NCT OF Delhi", district: "New Delhi", constituency: "NEW DELHI" }, "resolved", "Apply in Form 8 for a replacement EPIC with a corrected photograph; the BLO will help you. No fee is charged."],
        ["other", "citizen", "Voter helpline not answering", "I called 1950 several times in the evening and nobody answered.", {}, "open", null],
        ["malpractice", "political_party", "Liquor being stored", "Liquor cartons are being stored in a farmhouse on the canal road.", { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana West" }, "resolved", "The flying squad and excise team raided the farmhouse; 120 cartons were seized (ESMS entry made)."]
    ];
    const LEVEL = (a) => (a.constituency ? "constituency" : a.district ? "district" : a.state ? "state" : "national");
    await grievances.insertMany(G.map(([category, stakeholder, subject, description, area, status, response], i) => {
        const created = ago(60 * (6 + i * 19));
        const cat = category === "epic" ? "electoral_registration" : category;
        return { _id: id(), referenceId: `GRV-${created.slice(0, 10).replace(/-/g, "")}-${String(10001 + i * 37).slice(-5)}`, stakeholder, category: cat, subject, description,
            complainant: { name: `Demo complainant ${i + 1}`, mobile: `98765${String(43210 + i).padStart(5, "0")}`, email: null, epic: null }, jurisdiction: area,
            route: { level: LEVEL(area), office: LEVEL(area) === "constituency" ? (cat === "electoral_registration" ? "ero" : "ro") : LEVEL(area) === "district" ? "deo" : LEVEL(area) === "state" ? "ceo" : "eci" },
            documents: [], status, reopened: false, acknowledgement: { channels: ["sms"], delivery: "simulated", at: created },
            response: response ? { text: response, at: ago(60 * (6 + i * 19) - 60 * int(2, 40)), by: actor(LEVEL(area) === "constituency" ? "ROF1000001" : "DEO1000001", LEVEL(area) === "constituency" ? "ro" : "deo") } : null,
            timeline: [{ step: "filed", at: created }, ...(response ? [{ step: status, at: ago(60 * (6 + i * 19) - 60 * 3) }] : status === "in_progress" ? [{ step: "in_progress", at: ago(60 * (3 + i * 19)) }] : [])],
            createdAt: created, demo: "modules" };
    }));

    // ---- Seizures (ESMS): direct entries plus those already in cVIGIL field reports ----
    const seizures = docStore("seizures");
    const areas = [LS, { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana West" }, { state: "Punjab", district: "Ludhiana", constituency: "Gill" }, { state: "Punjab", district: "Amritsar", constituency: "Amritsar East" },
        { state: "Punjab", district: "Jalandhar", constituency: "Jalandhar Central" }, { state: "Punjab", district: "Patiala", constituency: "Patiala" }];
    const S = [["police", "cash", 1850000, "rupees", 1850000, "Cash in a car without documents at a naka"], ["excise", "liquor", 120, "litres", 72000, "Illicit liquor in a farmhouse"], ["ncb", "drugs", 1.4, "kg", 2100000, "Heroin seized at the bus stand"],
        ["sst", "cash", 640000, "rupees", 640000, "Cash with a trader; documents to be produced"], ["income_tax", "cash", 4200000, "rupees", 4200000, "Unaccounted cash in a warehouse"], ["police", "freebies", 300, "pieces", 150000, "Sarees and blankets in a tempo"],
        ["customs", "precious_metals", 820, "grams", 5200000, "Gold biscuits on a passenger"], ["excise", "liquor", 480, "litres", 288000, "Liquor cartons in a truck"], ["gst", "freebies", 1200, "pieces", 360000, "Wall clocks with party symbol"], ["police", "drugs", 3.2, "kg", 160000, "Poppy husk"],
        ["fst", "cash", 275000, "rupees", 275000, "Cash being distributed in a colony"], ["rpf", "liquor", 60, "litres", 36000, "Liquor in a train parcel"]];
    const direct = [];
    for (let i = 0; i < 24; i += 1) {
        const [agency, kind, quantity, unit, value, description] = S[i % S.length];
        const a = areas[i % areas.length];
        direct.push({ _id: id(), agency, kind, quantity: Math.round(quantity * (0.6 + rnd()) * 100) / 100, unit, value: Math.round(value * (0.6 + rnd())), description, place: `${pick(["Naka", "Toll plaza", "Bus stand", "Grain market", "Canal road", "Railway station"])}, ${a.constituency}`,
            documentRef: `${agency.toUpperCase()}/${a.district.slice(0, 3).toUpperCase()}/${2026}/${String(100 + i)}`, interceptedOn: day(-int(0, 20)), jurisdiction: a, vehicle: rnd() < 0.5 ? `PB${int(10, 91)}${pick(["AB", "CD", "XY"])}${int(1000, 9999)}` : null,
            personsDetained: int(0, 3), linkedComplaint: null, source: "direct", status: i % 9 === 4 ? "released" : "seized", release: i % 9 === 4 ? { order: "DGC/LDH/12", reason: "Bank withdrawal slip produced.", by: actor("DEO1000001", "deo"), at: ago(60 * 24) } : undefined,
            by: actor(agency === "fst" ? "FST1000001" : "ENF1000001", agency === "fst" ? "flying_squad" : "enforcement_officer"), createdAt: ago(60 * 24 * int(0, 20)), demo: "modules" });
    }
    for (const c of await store("mcc-complaint").list()) {
        (c.seizures ?? []).forEach((s, i) => direct.push({ _id: id(), agency: "fst", kind: s.kind, quantity: s.kind === "cash" ? s.value : null, unit: s.kind === "cash" ? "rupees" : "pieces", value: s.value, description: s.description ?? `From cVIGIL complaint ${c.referenceId}`,
            place: c.place ?? null, documentRef: `${c.referenceId}-${i + 1}`, interceptedOn: String(s.at ?? c.receivedAt).slice(0, 10), jurisdiction: c.jurisdiction, linkedComplaint: c.referenceId, source: "cvigil", status: "seized", by: actor("FST1000001", "flying_squad"), createdAt: s.at ?? c.receivedAt, demo: "modules" }));
    }
    await seizures.insertMany(direct);

    // ---- Party filings (IEMS) ----
    const filings = docStore("party_filings");
    const PARTIES = ["Punjab Progress Party", "National Unity Party", "Jan Seva Morcha", "Kisan Ekta Dal"];
    const PANS = ["AAACP1234K", "AAACN5678L", "AAAJS2468M", "AAAKE1357N", "ABCPD1234E", "BCDPE2345F", "CDEPF3456G", "DEFPG4567H"];
    const fdocs = [];
    PARTIES.forEach((party, pi) => {
        const rows = Array.from({ length: 4 + pi }, (_, i) => ({ name: `Demo donor ${pi + 1}-${i + 1}`, pan: PANS[(pi + i) % PANS.length], address: pick(["Ludhiana", "Amritsar", "Delhi", "Chandigarh"]), amount: 21000 + int(1, 40) * 5000, mode: pick(["cheque", "bank_transfer", "upi"]), date: `2025-${String(int(4, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}` }));
        if (pi < 3) fdocs.push({ _id: id(), party, filingType: "contribution_24a", period: "2025-26", dueOn: "2026-09-30", filedOn: pi === 2 ? "2026-10-12" : `2026-09-${String(10 + pi * 5).padStart(2, "0")}`, late: pi === 2,
            contributions: rows, count: rows.length, total: rows.reduce((n, r) => n + r.amount, 0), nil: false, acknowledgement: `ACK/24A/2025-26/D${pi}A${pi}B`, esign: { method: "aadhaar_esign", reference: `ESIGN-DEMO${pi}`, simulated: true, at },
            revision: 1, status: "filed", scrutiny: pi === 0 ? { outcome: "in_order", remarks: null, by: actor("ECI1234567", "eci"), at } : null, by: actor("PTR1000001", "party_treasurer"), createdAt: ago(60 * 24 * (40 - pi * 5)), demo: "modules" });
        if (pi < 2) fdocs.push({ _id: id(), party, filingType: "audit_accounts", period: "2025-26", dueOn: "2026-10-31", filedOn: "2026-10-28", late: false, auditor: `${pick(["Rao", "Mehta", "Bedi"])} & Associates, Chartered Accountants`,
            income: 18000000 + pi * 9000000, expenditure: 14000000 + pi * 6000000, auditReportDate: "2026-10-15", acknowledgement: `ACK/AUD/2025-26/D${pi}C${pi}D`, esign: { method: "aadhaar_esign", reference: `ESIGN-DEMOA${pi}`, simulated: true, at },
            revision: 1, status: "filed", scrutiny: null, by: actor("PTR1000001", "party_treasurer"), createdAt: ago(60 * 24 * 8), demo: "modules" });
    });
    fdocs.push({ _id: id(), party: PARTIES[0], filingType: "election_expenditure", period: "demo-past-election", dueOn: day(48), filedOn: day(-2), late: false, electionName: "Demo past bye-election, Ludhiana South",
        heads: { publicity: 2400000, travel: 850000, candidates: 1500000, others: 300000 }, total: 5050000, acknowledgement: "ACK/EXP/demo-past-election/D9E9F9", esign: { method: "aadhaar_esign", reference: "ESIGN-DEMOE", simulated: true, at },
        revision: 1, status: "filed", scrutiny: null, by: actor("PTR1000001", "party_treasurer"), createdAt: ago(60 * 24 * 2), demo: "modules" });
    await filings.insertMany(fdocs);

    // ---- Service voters and ETPB ballots for the demo bye-election (Ludhiana South) ----
    const electors = await listElectors();
    let svs = electors.filter((e) => e.electorCategory === "service_voter" && e.state === "Punjab" && e.assemblyConstituency === "Ludhiana South" && e.isActive !== false);
    if (svs.length < 6) {
        const tx = redis().multi();
        for (let i = svs.length; i < 6; i += 1) {
            const e = { _id: id(), epic: `SVD${String(4000000 + i).padStart(7, "0")}`, name: `${pick(["Naik", "Havildar", "Subedar", "Sepoy", "Lance Naik"])} ${pick(["Gurmeet", "Balraj", "Kuldeep", "Harpal", "Jaswant", "Tarsem"])} Singh`,
                relativeName: "Demo father", relationType: "father", gender: "male", dateOfBirth: `19${int(75, 99)}-0${int(1, 9)}-1${int(0, 9)}T00:00:00.000Z`, state: "Punjab", district: "Ludhiana", assemblyConstituency: "Ludhiana South",
                partNumber: String(int(1, 6)), serialNumber: 900 + i, electorCategory: "service_voter", serviceNumber: `JC-${int(100000, 999999)}`, unit: pick(["3 Sikh LI", "17 Punjab", "14 Mech Inf"]), isActive: true, registeredAt: at, approvedBy: "SEED", demo: "modules" };
            await saveElector(e, tx);
        }
        await tx.exec();
        svs = (await listElectors()).filter((e) => e.electorCategory === "service_voter" && e.assemblyConstituency === "Ludhiana South" && e.isActive !== false);
    }
    const list = await (await import("./repositories/election.repository.js")).getContestingList("demo-poll-day", "punjab|ludhiana south")
        ?? await (await import("./repositories/election.repository.js")).getContestingList("demo-past-election", "punjab|ludhiana south");
    const poll = await getElection("demo-poll-day");
    if (list && poll) {
        const ballots = docStore("etpb_ballots");
        const flow = ["counted", "received", "in_post", "in_post", "downloaded", "transmitted", "transmitted", "rejected"];
        const pinTx = redis().multi();
        const bdocs = svs.map((v, i) => {
            const status = flow[i % flow.length];
            const ballotId = crypto.randomBytes(6).toString("hex").toUpperCase();
            const pin = String(100000 + i * 7919).slice(-6);
            if (["transmitted", "downloaded"].includes(status)) pinTx.set(`etpb:pin:${ballotId}`, pin, { EX: 60 * 86400 });
            const steps = ["generated", "transmitted", "downloaded", "in_post", "received", status === "rejected" ? "rejected" : "counted"];
            const upto = status === "rejected" ? 6 : steps.indexOf(status) + 1;
            return { _id: id(), ballotId, electionId: poll._id, electionName: poll.name, elector: v.epic, name: v.name, serviceNumber: v.serviceNumber ?? null, jurisdiction: LS, partNumber: v.partNumber,
                candidates: list.candidates.map((c) => ({ serial: c.serial, name: c.name, party: c.party, symbol: c.symbol ?? null })), forms: ["13A", "13B", "13C"],
                pinHash: crypto.createHash("sha256").update(`${ballotId}:${pin}`).digest("hex"), pinCollected: !["transmitted"].includes(status), status,
                post: ["in_post", "received", "counted", "rejected"].includes(status) ? { article: `EK${String(100000000 + i * 12345).slice(-9)}IN`, postedOn: day(-6 + i % 3), tracking: [{ at: ago(60 * 24 * 6), event: "Booked at the post office" }, ...(["received", "counted", "rejected"].includes(status) ? [{ at: ago(60 * 24 * 2), event: "Delivered to the Returning Officer" }] : [])] } : null,
                counting: status === "counted" ? { form13AValid: true, reason: null, at: ago(60) } : status === "rejected" ? { form13AValid: false, reason: "Form 13A not attested", at: ago(50) } : null,
                envelopeIntact: true, timeline: steps.slice(0, upto).map((s, k) => ({ status: s, at: ago(60 * 24 * (12 - k * 2)), by: "SEED" })), createdAt: ago(60 * 24 * 12), demo: "modules" };
        });
        await pinTx.exec();
        await ballots.insertMany(bdocs);
    }

    // ---- Index Card for the completed demo bye-election, submitted to the CEO ----
    const past = await getElection("demo-past-election");
    if (past) {
        const cards = docStore("index_cards");
        if (!(await cards.findOne({ electionId: past._id, "jurisdiction.constituency": "Ludhiana South" }))) {
            const card = await buildCard(past, LS, actor("ROF1000001", "ro"));
            card.candidates.forEach((c, i) => { c.gender = i === 1 ? "female" : "male"; });
            card.status = "submitted"; card.submittedAt = ago(60 * 24 * 20);
            card.history.push({ step: "submitted", by: actor("ROF1000001", "ro"), at: card.submittedAt });
            await cards.put(card);
        }
    }

    // ---- Roll quality: DSE pairs, a PSE pair and deaths, at different stages ----
    const flags = docStore("roll_flags");
    const ls = electors.filter((e) => e.assemblyConstituency === "Ludhiana South" && e.isActive !== false && e.electorCategory !== "service_voter").slice(0, 400);
    const tx = redis().multi();
    const dupes = [];
    for (let i = 0; i < 4 && i < ls.length; i += 1) {
        const src = ls[i * 37 % ls.length];
        const twin = { ...src, _id: id(), epic: `DUP${String(7000000 + i).padStart(7, "0")}`, name: src.name.replace(/ee/g, "i").replace(/Singh/, "singh "), partNumber: String((Number(src.partNumber) % 6) + 1), serialNumber: 950 + i, demo: "modules" };
        await saveElector(twin, tx);
        dupes.push([src, twin]);
    }
    const pse = ls.slice(-2).map((e) => ({ ...e, photoHash: "demo-shared-photo-1" }));
    for (const e of pse) await saveElector(e, tx);
    await tx.exec();
    const entry = (e) => ({ epic: e.epic, name: e.name, relativeName: e.relativeName ?? null, gender: e.gender ?? null, dateOfBirth: String(e.dateOfBirth ?? "").slice(0, 10) || null, state: e.state, district: e.district, constituency: e.assemblyConstituency, partNumber: e.partNumber, serialNumber: e.serialNumber ?? null, houseNumber: e.houseNumber ?? null, isActive: true });
    const fp = (type, epics) => crypto.createHash("sha256").update(`${type}:${[...epics].sort().join(",")}`).digest("hex").slice(0, 40);
    const stages = ["open", "field_check", "notice_delivered", "decided"];
    const fdocs2 = dupes.map(([a, b], i) => ({ _id: id(), type: "dse", fingerprint: fp("dse", [a.epic, b.epic]), entries: [entry(a), entry(b)], jurisdiction: LS, crossConstituency: false, status: stages[i],
        reasons: ["Same name (folded spelling), relative's name, date of birth and gender"],
        fieldCheck: i >= 1 ? { askedBy: actor("ERO1000001", "ero"), at: ago(60 * 24 * 5), note: "Check both addresses" } : undefined,
        fieldReport: i >= 2 ? { finding: "same_person", note: "Lives at the first address; the second entry is old.", by: actor("BLO-PB-000001", "blo"), at: ago(60 * 24 * 4) } : undefined,
        notice: i >= 2 ? { number: `N/LUD/${100200 + i}`, epic: b.epic, hearingOn: day(-1), issuedAt: ago(60 * 24 * 3), issuedBy: actor("ERO1000001", "ero"), text: `You are asked to appear to show why the entry ${b.epic} should not be deleted.`, delivered: { mode: "in_person", on: day(-2), by: actor("BLO-PB-000001", "blo") } } : undefined,
        decision: i === 3 ? { outcome: "keep_all", deleted: null, reason: "Heard both; they are cousins with similar names and the same father's name, born the same year.", by: actor("ERO1000001", "ero"), at: ago(60 * 10) } : undefined,
        timeline: [{ step: "flagged", at: ago(60 * 24 * 6), by: actor("ERO1000001", "ero") }], createdAt: ago(60 * 24 * 6), demo: "modules" }));
    if (pse.length === 2) fdocs2.push({ _id: id(), type: "pse", fingerprint: fp("pse", pse.map((e) => e.epic)), entries: pse.map(entry), jurisdiction: LS, crossConstituency: false, status: "open", reasons: ["Same photograph fingerprint"],
        timeline: [{ step: "flagged", at: ago(60 * 24 * 2), by: actor("ERO1000001", "ero") }], createdAt: ago(60 * 24 * 2), demo: "modules" });
    for (const e of ls.slice(-5, -3)) fdocs2.push({ _id: id(), type: "death", fingerprint: fp("death", [e.epic]), entries: [entry(e)], jurisdiction: LS, status: "field_reported",
        certificate: { registrationNumber: `D/LDH/2026/${int(1000, 9999)}`, dateOfDeath: day(-int(20, 200)), issuedBy: "Municipal Corporation, Ludhiana", hasCopy: false }, certificateCopy: null,
        fieldReport: { finding: "dead", note: "Family confirmed; certificate seen.", by: actor("BLO-PB-000001", "blo"), at: ago(60 * 24) }, timeline: [{ step: "death_reported", at: ago(60 * 24), by: actor("BLO-PB-000001", "blo") }], createdAt: ago(60 * 24), demo: "modules" });
    await flags.insertMany(fdocs2);

    // ---- BLO App: facility surveys, register, EPIC delivery ----
    const surveys = docStore("station_surveys"), register = docStore("blo_register"), deliveries = docStore("epic_deliveries");
    const surveyed = lud.slice(0, 22);
    const sdocs = [];
    const stTx = redis().multi();
    for (const s of surveyed) {
        const amf = Object.fromEntries(Object.keys(AMF).map((k) => [k, rnd() > 0.12]));
        const emf = Object.fromEntries(Object.keys(EMF).map((k) => [k, rnd() > 0.15]));
        const missing = [...Object.entries(amf).filter(([, v]) => !v).map(([k]) => AMF[k]), ...Object.entries(emf).filter(([, v]) => !v).map(([k]) => EMF[k])];
        const amfScore = Math.round((Object.values(amf).filter(Boolean).length / Object.keys(AMF).length) * 100);
        const off = rnd() < 0.1;
        const gps = s.location ? { lat: +(s.location.lat + (off ? 0.004 : 0.0003)).toFixed(6), lng: +(s.location.lng + 0.0002).toFixed(6), accuracyM: int(4, 15) } : null;
        const distances = { bus_stand: +(rnd() * 3).toFixed(1), police_station: +(0.5 + rnd() * 4).toFixed(1), fire_station: +(1 + rnd() * 8).toFixed(1), hospital: +(0.3 + rnd() * 5).toFixed(1), fuel_pump: +(0.2 + rnd() * 3).toFixed(1), parking: +(rnd() * 0.5).toFixed(1) };
        const doc = { _id: id(), stationId: s._id, stationName: s.name, partNumber: s.partNumber, jurisdiction: { state: s.state, district: s.district, constituency: s.constituency }, amf, emf, amfScore, missing, gps,
            gpsOffsetM: off ? 450 : 35, gpsFlag: off ? "GPS position is 450 m from the recorded location; the DEO should check it." : null, distances, photo: null, remarks: missing.length ? "Asked the school to arrange the missing items before the poll." : null,
            by: actor(s.constituency === "Ludhiana South" ? "BLO-PB-000001" : "SCO1000001", s.constituency === "Ludhiana South" ? "blo" : "sector_officer"), createdAt: ago(60 * 24 * int(1, 15)), demo: "modules" };
        sdocs.push(doc);
        const fresh = await getStation(s._id);
        if (fresh) saveStation({ ...fresh, facilitySurvey: { surveyId: doc._id, at: doc.createdAt, amfScore, missing, distances, gpsFlag: doc.gpsFlag, hasPhoto: false, by: doc.by.epic } }, stTx);
    }
    await stTx.exec();
    await surveys.insertMany(sdocs);
    const FIND = ["present", "present", "present", "present", "shifted", "dead", "not_found", "new_eligible", "duplicate"];
    await register.insertMany(ls.slice(0, 60).map((e, i) => ({ _id: id(), epic: e.epic, name: e.name, partNumber: e.partNumber, serialNumber: e.serialNumber ?? null, jurisdiction: LS, houseNumber: e.houseNumber ?? String(i + 1),
        nationalHouseNumber: `NHN-PB-LDH-${String(200000 + i * 13)}`, finding: FIND[i % FIND.length], note: FIND[i % FIND.length] === "present" ? null : "Recorded during house-to-house verification.", document: null, mobileSeen: null,
        visitedOn: day(-int(1, 25)), by: actor("BLO-PB-000001", "blo"), createdAt: ago(60 * 24 * int(1, 25)), demo: "modules" })));
    await deliveries.insertMany(ls.slice(60, 75).map((e, i) => ({ _id: id(), epic: e.epic, name: e.name, jurisdiction: LS, kind: i % 4 ? "new" : "replacement", receivedBy: i % 3 ? "self" : "family_member", deliveredOn: day(-int(1, 30)), note: null,
        by: actor("BLO-PB-000001", "blo"), createdAt: ago(60 * 24 * int(1, 30)), demo: "modules" })));

    // ---- Observers: profiles; flying squads: positions ----
    const profiles = docStore("observer_profiles");
    await profiles.insertMany([["GOB1000001", "General observer", "IAS", "2009", "9810011001", "Circuit House, Ludhiana, Room 4"], ["POB1000001", "Police observer", "IPS", "2011", "9810011002", "Circuit House, Ludhiana, Room 6"],
        ["EOB1000001", "Expenditure observer", "IRS", "2012", "9810011003", "PWD Rest House, Ludhiana"]].map(([epic, name, service, batch, localContact, localAddress]) => ({
        _id: epic, epic, name: `Demo ${name.toLowerCase()}`, role: name.toLowerCase().replace(/ /g, "_"), service, batch, localContact, localAddress, email: null, bank: { account: "50100123456789", ifsc: "HDFC0001234", bankName: "HDFC Bank" }, publishContact: true, createdAt: at, updatedAt: at, demo: "modules" })));
    const sq = redis().multi();
    [["FST1000001", 30.8792, 75.8401, "PB10GH4521"], ["FST1000002", 30.9012, 75.8655, "PB10JK7788"]].forEach(([epic, lat, lng, vehicle]) => {
        sq.set(`squad:location:${epic}`, JSON.stringify({ epic, lat, lng, accuracyM: 12, jurisdiction: LS, vehicle, at: now() }), { EX: 12 * 3600 }).sAdd("squad:locations", epic);
    });
    await sq.exec();

    await redis().set(guard, at);
    console.log(`Seeded module demo data (${docStoreBackend()}): library, ePlan, ${evmDocs.length} EVM units, ${G.length} grievances, ${direct.length} seizures, ${fdocs.length} party filings, ETPB ballots, an index card, ${fdocs2.length} roll-quality flags, ${sdocs.length} station surveys, BLO register, observers.`);
};
