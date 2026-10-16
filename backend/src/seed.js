import "dotenv/config";
import crypto from "crypto";
import { connectRedis, redis } from "./config/redis.js";
import { saveElector } from "./repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "./repositories/user.repository.js";
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
    seededAt: new Date().toISOString()
});

// Staff sign in with an EPIC number + OTP, exactly like voters. No passwords.
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

    if (await getUserByEpic(epic)) return;

    await saveUser({
        _id: crypto.randomUUID(),
        epic,
        name: "Mannat Kathuria",
        role: "voter",
        approvedBy: process.env.BLO_EPIC || "BLO0000001",
        createdAt: new Date().toISOString(),
        demoAccount: true
    });

    console.log(`Created approved demo voter: ${epic}`);
};

const ensureBlo = async () => {
    const epic = "BLO1234567";

    if (await getUserByEpic(epic)) return;

    await saveUser({
        _id: crypto.randomUUID(),
        epic,
        name: "BLO",
        role: "blo",
        approvedBy: process.env.BLO_EPIC || "BLO0000001",
        createdAt: new Date().toISOString(),
        demoAccount: true
    });

    console.log(`Created approved demo voter: ${epic}`);
};

const ensureEci = async () => {
    const epic = "ECI1234567";

    if (await getUserByEpic(epic)) return;

    await saveUser({
        _id: crypto.randomUUID(),
        epic,
        name: "ECI",
        role: "eci",
        approvedBy: process.env.BLO_EPIC || "BLO0000001",
        createdAt: new Date().toISOString(),
        demoAccount: true
    });

    console.log(`Created approved demo voter: ${epic}`);
};


await connectRedis();

// Demo electoral-roll records only. They have no sign-in account: a BLO must register a voter first.
for (const row of electors) await saveElector(makeElector(row));
await ensureStaff(process.env.ADMIN_EPIC || "ADM0000001", "Administrator", "admin");
await ensureStaff(process.env.BLO_EPIC || "BLO0000001", "Booth Level Officer", "blo");
await ensureStaff(process.env.ECI_EPIC || "ECI0000001", "ECI Official", "eci");
await ensureDemoVoter();
await ensureBlo();
await ensureEci();

console.log("Redis seed complete.");
await redis().quit();
