import "dotenv/config";
import crypto from "crypto";
import { connectRedis, redis } from "./config/redis.js";
import { getElectorByEpic, saveElector } from "./repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "./repositories/user.repository.js";
import { getVerification, saveVerification } from "./repositories/verification.repository.js";
import { getRegistration, saveRegistration } from "./repositories/registration.repository.js";
import { getChangeRequest, saveChangeRequest } from "./repositories/changeRequest.repository.js";
import { hashPassword } from "./services/blo.service.js";
import { EPIC_PATTERN } from "./controllers/auth.controller.js";
import { ROLES, DEMO_JURISDICTION, jurisdictionFor } from "./config/roles.js";
import { listAssignmentsForUser, saveAssignment } from "./repositories/assignment.repository.js";
import { validateJurisdiction } from "./services/authority.service.js";
import { getDataSource, saveDataSource } from "./repositories/integration.repository.js";
import { ingest } from "./services/ingestion.service.js";
import { getElection, listStations, saveElection, saveNomination, saveStation } from "./repositories/election.repository.js";
import { todayIST } from "./services/election.service.js";

const electors = [
    ["ABC1234567","Mannat Kathuria","2006-11-23","Male","Punjab","Muktsar","Faridkot","42","Power House, Malout"],
    ["DEF7654321","Ananya Verma","1998-09-22","Female","Punjab","Ludhiana","Ludhiana South","18","Government Girls Senior Secondary School, Ludhiana"],
    ["GHI2468135","Rohan Mehta","2003-01-08","Male","Haryana","Gurugram","Gurugram","27","Government Model Senior Secondary School, Gurugram"],
    ["JKL9753186","Meera Kapoor","1995-12-03","Female","Delhi","South Delhi","Greater Kailash","11","Government Co-Educational Senior Secondary School, Delhi"],
    ["MNO1357924","Kabir Singh","2000-06-19","Male","Himachal Pradesh","Shimla","Shimla","33","Government Senior Secondary School, Shimla"],
    // Synthetic electors of part 18, Ludhiana South, for the poll-day demo (invented people).
    ...[["Aman Dhillon","1984-02-11","Male"],["Baljit Kaur","1979-07-30","Female"],["Charanjit Singh","1962-12-05","Male"],["Deepika Malhotra","1993-03-18","Female"],
        ["Ekam Grewal","2001-09-09","Male"],["Farah Khan","1988-05-22","Female"],["Gagandeep Sidhu","1975-01-14","Male"],["Harpreet Bains","1999-11-02","Female"],
        ["Inderjit Chahal","1958-08-27","Male"],["Jasleen Mann","2004-04-04","Female"],["Kuldeep Rana","1990-10-19","Male"],["Lakshmi Iyer","1969-06-08","Female"]]
        .map(([name, dob, gender], i) => [`LDS${String(1001 + i).padStart(7, "0")}`, name, dob, gender, "Punjab", "Ludhiana", "Ludhiana South", "18", "Government Girls Senior Secondary School, Ludhiana"])
];

const makeElector = ([epic,name,dob,gender,state,district,assemblyConstituency,partNumber,pollingStation]) => ({
    _id: crypto.randomUUID(), epic, name, dateOfBirth: new Date(dob).toISOString(),
    age: new Date().getFullYear() - new Date(dob).getFullYear(), gender, state, district,
    assemblyConstituency, partNumber, pollingStation, photoUrl: null, isActive: true,
    hasVoted: false, votedAt: null, votedBooth: null,
    seededAt: new Date().toISOString()
});

// Seeds a demo record only if it does not exist yet, so the seed never undoes real changes.
// Returns true when the record was created.
const seedOnce = async (get, record, save) => {
    if (await get(record._id)) return false;
    await save(record);
    return true;
};

const ensureStaff = async (epicValue, name, role) => {
    const epic = String(epicValue).trim().toUpperCase();
    if (!EPIC_PATTERN.test(epic)) {
        throw new Error(`Invalid ${role} EPIC "${epicValue}". Use three letters followed by seven digits.`);
    }
    if (await getUserByEpic(epic)) return;
    await saveUser({
        _id: crypto.randomUUID(), epic, name, role, createdAt: new Date().toISOString()
    });
    console.log(`Created ${role} account: ${epic}`);
};

const ensureDemoVoter = async () => {
    const epic = "ABC1234567";
    const existing = await getUserByEpic(epic);
    if (existing) return existing;

    const user = {
        _id: crypto.randomUUID(),
        epic,
        name: "Mannat Kathuria",
        role: "voter",
        verified: true,
        approvedBy: "BLO-PB-000001",
        createdAt: new Date().toISOString(),
        demoAccount: true
    };
    await saveUser(user);
    console.log(`Created approved demo voter: ${epic}`);
    return user;
};

const ensureEci = async () => {
    const epic = "ECI1234567";
    if (await getUserByEpic(epic)) return;

    await saveUser({
        _id: crypto.randomUUID(),
        epic,
        name: "ECI Official",
        role: "eci",
        approvedBy: "ECI-HQ",
        createdAt: new Date().toISOString(),
        demoAccount: true
    });
    console.log(`Created ECI account: ${epic}`);
};

// One demo account per sign-in role, so every portal can be tried. Roles that already have a
// dedicated seeder (voter, eci, blo) are skipped. Sign in with the EPIC and read the OTP in this
// server's terminal.
const ensureRoleAccounts = async () => {
    for (const role of ROLES) {
        if (!role.demoEpic || ["voter", "eci", "blo"].includes(role.id)) continue;
        if (await getUserByEpic(role.demoEpic)) continue;
        await saveUser({
            _id: crypto.randomUUID(), epic: role.demoEpic, name: `Demo ${role.label.toLowerCase()}`,
            role: role.id, designation: role.label, jurisdiction: jurisdictionFor(role.id),
            demoAccount: true, createdAt: new Date().toISOString()
        });
        console.log(`Created ${role.label} demo account: ${role.demoEpic}`);
    }
};

const ensureDemoBlo = async () => {
    const bloId = "BLO-PB-000001";
    // Never reset an existing account (its password may have been changed since).
    if (await getUserByEpic(bloId)) return;
    const passwordHash = await hashPassword("Password123");
    const bloUser = {
        _id: crypto.randomUUID(),
        epic: bloId,
        bloId,
        name: "Gurpreet Singh",
        role: "blo",
        mobile: "9876543210",
        state: "PB",
        passwordHash,
        mustChangePassword: false,
        createdAt: new Date().toISOString()
    };
    await saveUser(bloUser);
    await redis().set(`user:${bloId}`, JSON.stringify(bloUser));
    console.log(`Created demo BLO account: ${bloId} (Password: Password123)`);
};

// Every seeded staff account below national level gets one active assignment in the demo
// jurisdiction (Ludhiana South, Punjab), so the permission and jurisdiction checks have
// something to check against. Accounts that already hold an assignment are left alone.
const DEMO_BOOTH = { partNumber: "18" };
// The station team is assigned to an election that polls today, so poll day can be demonstrated.
const DEMO_POLL_ELECTION = { _id: "demo-poll-day", name: "Demo poll-day election, Ludhiana South" };
const POLL_DAY_ROLES = ["presiding_officer", "polling_officer", "polling_agent", "micro_observer"];
const ensureDemoAssignments = async () => {
    const accounts = [
        ...ROLES.filter((role) => role.demoEpic && role.scope.length).map((role) => [role.demoEpic, role.id]),
        ["BLO-PB-000001", "blo"],
        [process.env.ADMIN_EPIC || "ADM0000001", "blo"]
    ];
    for (const [epic, roleId] of accounts) {
        const user = await getUserByEpic(epic);
        if (!user || (await listAssignmentsForUser(user._id)).length) continue;
        const role = ROLES.find((r) => r.id === roleId);
        const wanted = Object.fromEntries(role.scope.filter((f) => f !== "election").map((f) => [f, DEMO_JURISDICTION[f]]));
        const jurisdiction = validateJurisdiction(roleId, {
            state: DEMO_JURISDICTION.state,
            ...(wanted.constituency || wanted.pollingStation
                ? { district: DEMO_JURISDICTION.district, constituency: DEMO_JURISDICTION.constituency } : {}),
            ...wanted,
            ...(wanted.pollingStation ? DEMO_BOOTH : {})
        });
        await saveAssignment({
            _id: crypto.randomUUID(), userId: user._id, epic: user.epic, role: roleId,
            election: role.scope.includes("election") ? (POLL_DAY_ROLES.includes(roleId) ? DEMO_POLL_ELECTION.name : DEMO_JURISDICTION.election) : null,
            jurisdiction, status: "active", grantedBy: "SEED", grantedAt: new Date().toISOString(),
            revokedBy: null, revokedAt: null, revokeReason: null, demo: true
        });
        console.log(`Assigned ${epic} as ${role.label} for ${Object.values(jurisdiction).join(", ")}`);
    }
};

const seedVerificationCases = async () => {
    const now = new Date();

    // 1. Need Review Case
    const case1 = {
        _id: "case-rev-001",
        inquiryId: "inq_rev_001",
        epic: "DEF7654321",
        status: "review_required",
        identity: {
            method: "persona",
            status: "review_required",
            checkedAt: new Date(now.getTime() - 3600000).toISOString()
        },
        aiReview: {
            sanityCheckPassed: false,
            riskLevel: "MEDIUM",
            confidenceScore: 78,
            documentTypeDetected: "Aadhaar Card",
            shortAiReview: "Extracted DOB indicates 1998-09-25 while electoral record has 1998-09-22 (3-day discrepancy). Name and address match.",
            anomalies: ["Minor 3-day Date of Birth discrepancy between document and electoral roll."],
            recommendation: "BLO manual inspection of physical document recommended.",
            source: "Google Gemini AI"
        },
        reasons: ["Minor 3-day Date of Birth discrepancy"],
        startedAt: new Date(now.getTime() - 3600000).toISOString(),
        createdAt: new Date(now.getTime() - 3600000).toISOString()
    };
    await seedOnce(getVerification, case1, saveVerification);

    // 2. Verified Case
    const case2 = {
        _id: "case-ver-002",
        inquiryId: "inq_ver_002",
        epic: "ABC1234567",
        status: "verified",
        identity: {
            method: "persona",
            status: "verified",
            checkedAt: new Date(now.getTime() - 7200000).toISOString()
        },
        aiReview: {
            sanityCheckPassed: true,
            riskLevel: "LOW",
            confidenceScore: 98,
            documentTypeDetected: "Aadhaar Card",
            shortAiReview: "All document fields match voter record 'Mannat Kathuria'. Face liveness verified with high confidence. Approved for voting.",
            anomalies: [],
            recommendation: "Approve - All sanity and biometric checks verified.",
            source: "Google Gemini AI"
        },
        startedAt: new Date(now.getTime() - 7200000).toISOString(),
        createdAt: new Date(now.getTime() - 7200000).toISOString(),
        completedAt: new Date(now.getTime() - 7100000).toISOString()
    };
    await seedOnce(getVerification, case2, saveVerification);

    // 3. In Progress Case
    const case3 = {
        _id: "case-prog-003",
        inquiryId: "inq_prog_003",
        epic: "GHI2468135",
        status: "in_progress",
        identity: {
            method: "persona",
            status: "in_progress",
            checkedAt: new Date(now.getTime() - 600000).toISOString()
        },
        aiReview: {
            sanityCheckPassed: true,
            riskLevel: "LOW",
            confidenceScore: 90,
            documentTypeDetected: "Passport",
            shortAiReview: "Document upload received. Awaiting selfie face verification step.",
            anomalies: [],
            recommendation: "Awaiting applicant completion.",
            source: "Google Gemini AI"
        },
        startedAt: new Date(now.getTime() - 600000).toISOString(),
        createdAt: new Date(now.getTime() - 600000).toISOString()
    };
    await seedOnce(getVerification, case3, saveVerification);

    console.log("Seeded demo verification cases (review_required, verified, in_progress).");
};

const seedChangeRequests = async () => {
    const changeReq = {
        _id: "demo-change-001",
        epic: "ABC1234567",
        currentRecord: {
            name: "Mannat Kathuria",
            dateOfBirth: "2006-11-23T00:00:00.000Z",
            gender: "Male",
            state: "Punjab",
            district: "Muktsar",
            assemblyConstituency: "Faridkot",
            address: "Power House, Malout",
            pinCode: "152026",
            partNumber: "42",
            pollingStation: "Power House, Malout"
        },
        requestedChanges: {
            address: "House 124, Green Avenue, Malout",
            pinCode: "152026"
        },
        documentProof: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        aiReview: {
            sanityCheckPassed: true,
            riskLevel: "LOW",
            confidenceScore: 96,
            documentTypeDetected: "Electricity / Utility Bill",
            shortAiReview: "Address correction verified. Attached utility bill confirms residential address 'House 124, Green Avenue, Malout'. Safe to approve.",
            anomalies: [],
            recommendation: "Approve - Residential proof authenticated."
        },
        status: "pending",
        submittedAt: new Date().toISOString()
    };
    if (await seedOnce(getChangeRequest, changeReq, saveChangeRequest)) console.log("Seeded demo change request (Form 8).");

    // A second request inside the demo jurisdiction (Ludhiana South, part 18), so the demo BLO
    // and ERO have a Form 8 request to verify and decide.
    const ludhianaReq = {
        ...changeReq,
        _id: "demo-change-002",
        epic: "DEF7654321",
        currentRecord: {
            name: "Ananya Verma", dateOfBirth: "1998-09-22T00:00:00.000Z", gender: "Female",
            state: "Punjab", district: "Ludhiana", assemblyConstituency: "Ludhiana South",
            address: "—", pinCode: "—", partNumber: "18",
            pollingStation: "Government Girls Senior Secondary School, Ludhiana"
        },
        requestedChanges: { address: "12 Dugri Road, Ludhiana", pinCode: "141013" },
        aiReview: { ...changeReq.aiReview, shortAiReview: "Address correction. Attached utility bill shows '12 Dugri Road, Ludhiana'." },
        submittedAt: new Date().toISOString()
    };
    if (await seedOnce(getChangeRequest, ludhianaReq, saveChangeRequest)) console.log("Seeded demo change request in Ludhiana South (Form 8).");
};

const seedRegistrationRequest = async () => {
    const regReq = {
        // Fixed id, so running the seed again does not queue another copy of this application.
        _id: "00000000-0000-4000-8000-000000000006",
        name: "Simran Kaur",
        dateOfBirth: "2005-04-15T00:00:00.000Z",
        gender: "Female",
        state: "Punjab",
        district: "Ludhiana",
        assemblyConstituency: "Ludhiana South",
        address: "78 Model Town, Ludhiana",
        pinCode: "141002",
        referenceImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        aiReview: {
            sanityCheckPassed: true,
            riskLevel: "LOW",
            confidenceScore: 95,
            documentTypeDetected: "Aadhaar Card",
            shortAiReview: "New voter application verified. Applicant is 21 years old and qualifies for registration in Ludhiana South.",
            anomalies: [],
            recommendation: "Assign Part Number & Polling Station to approve."
        },
        status: "pending",
        submittedAt: new Date().toISOString()
    };
    if (!(await seedOnce(getRegistration, regReq, saveRegistration))) return;
    console.log("Seeded demo new registration request (Form 6).");
};

// New-voter pipeline demo: one synthetic data source and one import into Ludhiana South, so the
// demo BLO has registration assistance tasks. Synthetic people only, never real records.
const seedNewVoterPipeline = async () => {
    const sourceId = "synthetic-demo-feed";
    if (await getDataSource(sourceId)) return;
    const tx = redis().multi();
    saveDataSource({
        _id: sourceId, name: "Synthetic demo feed", type: "synthetic",
        purpose: "Prototype demonstration of the new-voter pipeline with invented people",
        legalBasis: null, agreementReference: null, containsRealPersonalData: false, status: "active",
        registeredBy: "SEED", registeredAt: new Date().toISOString()
    }, tx);
    await tx.exec();
    const ago = (years, days) => {
        const t = new Date(); t.setUTCFullYear(t.getUTCFullYear() - years); t.setUTCDate(t.getUTCDate() - days);
        return t.toISOString().slice(0, 10);
    };
    const area = { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South" };
    const eci = await getUserByEpic("ECI1234567");
    const run = await ingest({ sourceId, actor: eci, records: [
        { sourceReference: "SYN-0001", name: "Harleen Gill", dateOfBirth: ago(18, 120), gender: "Female", ...area, partNumber: "18" },
        { sourceReference: "SYN-0002", name: "Arjun Bedi", dateOfBirth: ago(17, 60), gender: "Male", ...area, partNumber: "18" },
        { sourceReference: "SYN-0003", name: "Navya Sood", dateOfBirth: ago(15, 0), gender: "Female", ...area, partNumber: "18" }
    ] });
    console.log(`Seeded synthetic new-voter feed: ${run.counts.tasksCreated} BLO tasks, ${run.counts.notYetEligible} not yet eligible.`);
};

// Phase 2 demo: an election with nominations open, a bye-election in its scrutiny period (with
// synthetic nominations for the Returning Officer), and approved polling stations in Ludhiana South.
const dayOffset = (days) => { const d = new Date(`${todayIST()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const seedElections = async () => {
    const at = new Date().toISOString();
    const elections = [
        { _id: "demo-general-election", name: DEMO_JURISDICTION.election, type: "general_assembly", states: ["Punjab"],
            schedule: { notificationDate: dayOffset(-3), lastDateOfNominations: dayOffset(4), scrutinyDate: dayOffset(5), lastDateOfWithdrawal: dayOffset(7), pollDate: dayOffset(28), countingDate: dayOffset(31) } },
        { _id: "demo-bye-election", name: "Demo bye-election, Ludhiana South", type: "bye_election", states: ["Punjab"],
            schedule: { notificationDate: dayOffset(-10), lastDateOfNominations: dayOffset(-3), scrutinyDate: dayOffset(-1), lastDateOfWithdrawal: dayOffset(2), pollDate: dayOffset(20), countingDate: dayOffset(23) } },
        { ...DEMO_POLL_ELECTION, type: "bye_election", states: ["Punjab"],
            schedule: { notificationDate: dayOffset(-30), lastDateOfNominations: dayOffset(-23), scrutinyDate: dayOffset(-22), lastDateOfWithdrawal: dayOffset(-20), pollDate: dayOffset(0), countingDate: dayOffset(3) } }
    ];
    for (const e of elections) {
        if (await getElection(e._id)) continue;
        const tx = redis().multi();
        saveElection({ ...e, createdBy: "SEED", createdAt: at, scheduleHistory: [], demo: true }, tx);
        if (e._id === "demo-bye-election") {
            const area = { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South" };
            [["Gurpreet Sandhu", "Punjab Progress Party", "Tractor", 52, 0, 41000000, 3000000, "Graduate"],
             ["Simran Arora", "Independent", "Kite", 38, 1, 8500000, 0, "Post graduate"],
             ["Balwinder Kaur", "National Unity Party", "Lamp", 61, 0, 125000000, 20000000, "Class 12"]]
                .forEach(([name, party, symbol, age, criminalCases, assets, liabilities, education], i) => saveNomination({
                    _id: `demo-nomination-${i + 1}`, electionId: e._id, userId: null, epic: null, name, dateOfBirth: `${new Date().getUTCFullYear() - age}-01-15`, age,
                    party, independent: party === "Independent", symbol, affidavit: { criminalCases, assets, liabilities, education },
                    ...area, status: "filed", filedAt: at, scrutiny: null, withdrawnAt: null, demo: true
                }, tx));
        }
        await tx.exec();
        console.log(`Seeded demo election: ${e.name}.`);
    }
};

const seedPollingStations = async () => {
    if ((await listStations()).length) return;
    const at = new Date().toISOString();
    const area = { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South" };
    const all = { ramp: true, wheelchair: true, drinkingWater: true, toilet: true, shade: true, signage: true };
    const rows = [
        ["18", DEMO_JURISDICTION.pollingStation, "Civil Lines, near Bharat Nagar Chowk, Ludhiana 141001", { lat: 30.9051, lng: 75.8406 }, all, "ACTIVE"],
        ["19", "Arya College Primary Wing, Ludhiana", "Arya College Road, Civil Lines, Ludhiana 141001", { lat: 30.9097, lng: 75.8463 }, { ...all, shade: false }, "ACTIVE"],
        ["20", "Community Centre, Dugri Phase 1, Ludhiana", "Block A, Dugri Phase 1, Ludhiana 141013", { lat: 30.8739, lng: 75.8418 }, { ...all, wheelchair: false }, "ACTIVE"],
        ["21", "Government Primary School, Shimlapuri, Ludhiana", "Street 4, Shimlapuri, Ludhiana 141003", null, { ...all, ramp: false, wheelchair: false }, "PROPOSED"]
    ];
    const tx = redis().multi();
    for (const [partNumber, name, address, location, accessibility, status] of rows) {
        const details = { name, address, location, accessibility };
        saveStation({
            _id: crypto.randomUUID(), stationCode: `PS-PUNJAB-LUDHIANA-SOUTH-${partNumber}`, ...area, partNumber, ...details, status,
            pendingChange: status === "PROPOSED" ? { type: "create", proposed: details, reason: "New part after delimitation of Shimlapuri", by: "DEO1000001", at } : null,
            history: status === "ACTIVE" ? [{ type: "create", from: null, to: details, reason: "Demo data", proposedBy: "DEO1000001", approvedBy: "SEED", at, version: 1 }] : [],
            relocationNotice: null,
            source: status === "ACTIVE" ? { authority: "Demo data (synthetic), shown as approved", version: 1, verifiedAt: at, approvedBy: "SEED" } : null,
            createdBy: "SEED", createdAt: at, demo: true
        }, tx);
    }
    await tx.exec();
    console.log("Seeded demo polling stations in Ludhiana South (3 approved, 1 awaiting ECI approval).");
};

await connectRedis();

// Existing roll records are left alone: they may have been corrected (Form 8) or marked as voted.
for (const row of electors) {
    if (!(await getElectorByEpic(row[0]))) await saveElector(makeElector(row));
}
await ensureStaff(process.env.ADMIN_EPIC || "ADM0000001", "Administrator", "admin");
await ensureStaff(process.env.ECI_EPIC || "ECI0000001", "ECI Official", "eci");
await ensureDemoVoter();
await ensureEci();
await ensureDemoBlo();
await ensureRoleAccounts();
await ensureDemoAssignments();
await seedVerificationCases();
await seedChangeRequests();
await seedRegistrationRequest();
await seedNewVoterPipeline();
await seedElections();
await seedPollingStations();

console.log("Redis seed complete with sample data for all voter, blo, and eci tabs.");
await redis().quit();
