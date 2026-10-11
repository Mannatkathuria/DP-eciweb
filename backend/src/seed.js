import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { connectRedis, redis } from "./config/redis.js";
import { saveElector } from "./repositories/elector.repository.js";
import { getUserByUsername, saveUser } from "./repositories/user.repository.js";

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

const ensureUser = async (username, password, role) => {
    if (await getUserByUsername(username)) return;
    await saveUser({
        _id: crypto.randomUUID(), username, passwordHash: await bcrypt.hash(password, 12),
        role, createdAt: new Date().toISOString()
    });
    console.log(`Created ${role} account: ${username}`);
};

await connectRedis();

for (const row of electors) await saveElector(makeElector(row));
await ensureUser((process.env.ADMIN_USERNAME || "admin").toLowerCase(), process.env.ADMIN_PASSWORD || "ChangeMe@123", "admin");
await ensureUser((process.env.BLO_USERNAME || "blo").toLowerCase(), process.env.BLO_PASSWORD || "ChangeMe@123", "blo");
await ensureUser((process.env.ECI_USERNAME || "eci").toLowerCase(), process.env.ECI_PASSWORD || "ChangeMe@123", "eci");

console.log("Redis seed complete.");
await redis().quit();
