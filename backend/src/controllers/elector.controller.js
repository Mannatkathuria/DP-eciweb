import { findElector } from "../repositories/elector.repository.js";

export const searchElector = async (req, res) => {
    try {
        const { method, epic, name, state, district, assemblyConstituency } = req.body;
        if (method === "mobile") return res.status(501).json({ success: false, message: "Mobile-number lookup is not currently available." });
        if (method === "epic" && !epic) return res.status(400).json({ success: false, message: "EPIC number is required." });
        if (method === "details" && (!name || !state)) return res.status(400).json({ success: false, message: "Name and State/UT are required." });

        const elector = await findElector({ method, epic, name, state, district, assemblyConstituency });
        if (!elector || elector.isActive === false) return res.status(404).json({ success: false, message: "No matching electoral record was found." });
        return res.json({ success: true, message: "Electoral record found.", data: elector });
    } catch (error) {
        console.error("Elector search error:", error);
        return res.status(500).json({ success: false, message: "Unable to search electoral records." });
    }
};
