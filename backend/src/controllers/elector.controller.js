import jwt from "jsonwebtoken";
import { getElectorByEpic, listElectors } from "../repositories/elector.repository.js";
import { listStations } from "../repositories/election.repository.js";
import { listRollVersions, rollAreaKey } from "../repositories/rollVersion.repository.js";
import { nameKey } from "../utils/nameKey.js";

// What anyone may see from a public electoral-roll search: the particulars printed on the roll.
// Whether someone has voted is not shown: that is not public information.
const PUBLIC_FIELDS = [
    "epic", "name", "relativeName", "relationType", "dateOfBirth", "age", "gender", "state", "district", "assemblyConstituency",
    "partNumber", "serialNumber", "pollingStation", "isActive"
];
// Shown only to the signed-in voter looking at their own record (used to pre-fill Form 8).
const OWNER_FIELDS = ["address", "pinCode"];
const MAX_MATCHES = 20;

const pick = (record, fields) => Object.fromEntries(fields.filter((f) => f in record).map((f) => [f, record[f]]));

// The search is public, so a session is optional: returns the signed-in user's EPIC, or null.
const signedInEpic = (req) => {
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return null;
    try {
        return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)?.epic || null;
    } catch {
        return null;
    }
};

const ageOf = (dob) => { if (!dob) return null; const d = new Date(dob); const n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a -= 1; return a; };
const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** The polling station of an entry's part, and where the particulars come from. */
const contextOf = async (e) => {
    const station = (await listStations()).find((s) => s.status === "ACTIVE" && same(s.state, e.state) && same(s.constituency, e.assemblyConstituency) && String(s.partNumber) === String(e.partNumber))
        ?? (e.pollingStation ? (await listStations()).find((s) => s.status === "ACTIVE" && same(s.name, e.pollingStation) && same(s.constituency, e.assemblyConstituency)) : null);
    const versions = await listRollVersions(rollAreaKey({ state: e.state, constituency: e.assemblyConstituency }));
    const latest = versions.at(-1);
    return {
        station: station ? { _id: station._id, name: station.name, address: station.address ?? null, partNumber: station.partNumber, location: station.location ?? null, accessibility: station.accessibility ?? null } : null,
        source: latest ? { label: `Electoral roll of ${e.assemblyConstituency}, version ${latest.version ?? versions.length}`, publishedAt: latest.publishedAt ?? latest.createdAt ?? null }
            : { label: `Electoral roll of ${e.assemblyConstituency} (continuous updation)`, publishedAt: e.updatedAt ?? e.approvedAt ?? e.registeredAt ?? null }
    };
};

export const searchElector = async (req, res) => {
    try {
        const { method, epic, name, state, district, assemblyConstituency, partNumber, serialNumber, relativeName, gender, age } = req.body ?? {};
        if (method === "mobile") return res.status(501).json({ success: false, message: "Mobile-number lookup is not currently available." });
        if (method === "epic" && !epic) return res.status(400).json({ success: false, message: "EPIC number is required." });
        if (method === "details" && (!name || !state)) return res.status(400).json({ success: false, message: "Name and State/UT are required." });
        if (method === "part" && (!state || !assemblyConstituency || !partNumber || !serialNumber)) return res.status(400).json({ success: false, message: "State/UT, constituency, part number and serial number are required." });
        if (!["epic", "details", "part"].includes(method)) return res.status(400).json({ success: false, message: "method must be epic, details or part." });

        let matches;
        if (method === "epic") {
            const e = await getElectorByEpic(String(epic).trim().toUpperCase());
            matches = e && e.isActive !== false ? [e] : [];
        } else {
            const all = (await listElectors()).filter((e) => e.isActive !== false && same(e.state, state) && (!assemblyConstituency || same(e.assemblyConstituency, assemblyConstituency)));
            if (method === "part") {
                matches = all.filter((e) => String(e.partNumber) === String(partNumber).trim() && String(e.serialNumber) === String(serialNumber).trim());
            } else {
                // Names are matched loosely (spelling variants, extra spaces); the filters narrow it down.
                const key = nameKey(name);
                const ageN = Number(age);
                matches = all.filter((e) => (!district || same(e.district, district)) && (same(e.name, name) || (key && (nameKey(e.name) ?? "").includes(key)))
                    && (!relativeName || (nameKey(e.relativeName) ?? "").includes(nameKey(relativeName) ?? ""))
                    && (!gender || same(e.gender, gender)) && (!age || Math.abs((ageOf(e.dateOfBirth) ?? e.age ?? -99) - ageN) <= 2))
                    .sort((a, b) => Number(!same(a.name, name)) - Number(!same(b.name, name))).slice(0, MAX_MATCHES);
            }
        }
        if (!matches.length) return res.status(404).json({ success: false, message: "No matching electoral record was found." });
        const me = signedInEpic(req);
        const shape = async (e) => ({ ...pick(e, PUBLIC_FIELDS), age: ageOf(e.dateOfBirth) ?? e.age ?? null, ...(me === e.epic ? pick(e, OWNER_FIELDS) : {}), ...(await contextOf(e)) });
        const items = await Promise.all(matches.map(shape));
        return res.json({ success: true, message: items.length > 1 ? `${items.length} matching entries found.` : "Electoral record found.", data: items[0], items });
    } catch (error) {
        console.error("Elector search error:", error);
        return res.status(500).json({ success: false, message: "Unable to search electoral records." });
    }
};
