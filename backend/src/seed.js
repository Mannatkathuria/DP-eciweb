import "dotenv/config";
import crypto from "crypto";
import { connectRedis, redis } from "./config/redis.js";
import { saveElector } from "./repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "./repositories/user.repository.js";
import { saveVerification } from "./repositories/verification.repository.js";
import { saveRegistration } from "./repositories/registration.repository.js";
import { saveChangeRequest } from "./repositories/changeRequest.repository.js";
import { hashPassword } from "./services/blo.service.js";
import { EPIC_PATTERN } from "./controllers/auth.controller.js";

const electors = [
    ["ABC1234567","Mannat Kathuria","2006-11-23","Male","Punjab","Muktsar","Faridkot","42","Power House, Malout"],
    ["DEF7654321","Ananya Verma","1998-09-22","Female","Punjab","Ludhiana","Ludhiana South","18","Government Girls Senior Secondary School, Ludhiana"],
    ["GHI2468135","Rohan Mehta","2003-01-08","Male","Haryana","Gurugram","Gurugram","27","Government Model Senior Secondary School, Gurugram"],
    ["JKL9753186","Meera Kapoor","1995-12-03","Female","Delhi","South Delhi","Greater Kailash","11","Government Co-Educational Senior Secondary School, Delhi"],
    ["MNO1357924","Kabir Singh","2000-06-19","Male","Himachal Pradesh","Shimla","Shimla","33","Government Senior Secondary School, Shimla"]
];

const makeElector = ([epic,name,dob,gender,state,district,assemblyConstituency,partNumber,pollingStation]) => ({
    _id: crypto.randomUUID(), epic, name, dateOfBirth: new Date(dob).toISOString(),
    age: new Date().getFullYear() - new Date(dob).getFullYear(), gender, state, district,
    assemblyConstituency, partNumber, pollingStation, photoUrl: null, isActive: true,
    hasVoted: false, votedAt: null, votedBooth: null,
    seededAt: new Date().toISOString()
});

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

const ensureDemoBlo = async () => {
    const bloId = "BLO-PB-000001";
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
    await saveVerification(case1);

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
    await saveVerification(case2);

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
    await saveVerification(case3);

    console.log("Seeded demo verification cases (review_required, verified, in_progress).");
};

const seedChangeRequests = async () => {
    const changeReq = {
        _id: crypto.randomUUID(),
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
    await saveChangeRequest(changeReq);
    console.log("Seeded demo change request (Form 8).");
};

const seedRegistrationRequest = async () => {
    const regReq = {
        _id: crypto.randomUUID(),
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
    await saveRegistration(regReq);
    console.log("Seeded demo new registration request (Form 6).");
};

await connectRedis();

for (const row of electors) await saveElector(makeElector(row));
await ensureStaff(process.env.ADMIN_EPIC || "ADM0000001", "Administrator", "admin");
await ensureStaff(process.env.ECI_EPIC || "ECI0000001", "ECI Official", "eci");
await ensureDemoVoter();
await ensureEci();
await ensureDemoBlo();
await seedVerificationCases();
await seedChangeRequests();
await seedRegistrationRequest();

console.log("Redis seed complete with sample data for all voter, blo, and eci tabs.");
await redis().quit();
