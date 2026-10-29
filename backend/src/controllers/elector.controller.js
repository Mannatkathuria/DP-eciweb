import jwt from "jsonwebtoken";
import { findElector } from "../repositories/elector.repository.js";

// What anyone may see from a public electoral-roll search (the fields the search page shows).
const PUBLIC_FIELDS = [
    "epic", "name", "dateOfBirth", "age", "gender", "state", "district", "assemblyConstituency",
    "partNumber", "pollingStation", "isActive", "hasVoted", "votedAt"
];
// Shown only to the signed-in voter looking at their own record (used to pre-fill Form 8).
const OWNER_FIELDS = ["address", "pinCode"];

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

export const searchElector = async (req, res) => {
    try {
        const { method, epic, name, state, district, assemblyConstituency } = req.body;
        if (method === "mobile") return res.status(501).json({ success: false, message: "Mobile-number lookup is not currently available." });
        if (method === "epic" && !epic) return res.status(400).json({ success: false, message: "EPIC number is required." });
        if (method === "details" && (!name || !state)) return res.status(400).json({ success: false, message: "Name and State/UT are required." });

        const elector = await findElector({ method, epic, name, state, district, assemblyConstituency });
        if (!elector || elector.isActive === false) return res.status(404).json({ success: false, message: "No matching electoral record was found." });

        const isOwnRecord = signedInEpic(req) === elector.epic;
        const data = { ...pick(elector, PUBLIC_FIELDS), ...(isOwnRecord ? pick(elector, OWNER_FIELDS) : {}) };
        return res.json({ success: true, message: "Electoral record found.", data });
    } catch (error) {
        console.error("Elector search error:", error);
        return res.status(500).json({ success: false, message: "Unable to search electoral records." });
    }
};
