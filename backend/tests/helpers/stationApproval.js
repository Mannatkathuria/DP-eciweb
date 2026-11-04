import crypto from "crypto";
import jwt from "jsonwebtoken";

// Takes a drafted polling station through the RP Act 1951, s. 25 stages, each by its own
// authority: the DEO records the party consultation and forwards it, the CEO forwards it to the
// Commission, the Commission gives prior approval with its order reference, and the DEO publishes.
// Returns the publication response ({ status, body }).
const ceos = new Map();
const ceoFor = async (state) => {
    if (ceos.has(state)) return ceos.get(state);
    const { saveUser } = await import("../../src/repositories/user.repository.js");
    const user = { _id: crypto.randomUUID(), epic: `CEO${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`, role: "ceo", name: `CEO ${state}`, jurisdiction: { state } };
    await saveUser(user);
    const token = jwt.sign({ _id: user._id, epic: user.epic, role: "ceo" }, process.env.ACCESS_TOKEN_SECRET);
    ceos.set(state, token);
    return token;
};

export const forwardToCommission = async (call, id, deoToken, state = "Punjab") => {
    const steps = [
        await call("POST", `/polling-stations/${id}/consultation`, { parties: "All recognised parties", meetingDate: "2026-01-15", outcome: "No objection" }, deoToken),
        await call("POST", `/polling-stations/${id}/forward`, {}, deoToken),
        await call("POST", `/polling-stations/${id}/ceo-forward`, { remarks: "Scrutinised and recommended" }, await ceoFor(state))
    ];
    for (const r of steps) if (r.status !== 200) throw new Error(`station stage failed: ${r.status} ${JSON.stringify(r.body)}`);
    return steps.at(-1);
};

export const publishStation = async (call, id, deoToken, eciToken, state = "Punjab") => {
    await forwardToCommission(call, id, deoToken, state);
    const approved = await call("POST", `/polling-stations/${id}/approve`, { eciReference: "ECI/464/PS/2026" }, eciToken);
    if (approved.status !== 200) return approved;
    return call("POST", `/polling-stations/${id}/publish`, {}, deoToken);
};
