// Election expenditure (RP Act 1951, ss. 77-78; Conduct of Elections Rules, 1961, rules 86-90).
//
//   Candidate / election agent  keeps the day-to-day register of expenditure: one entry per
//                               payment, never edited; a correction is a new entry that
//                               supersedes the old one, with a reason.
//   Expenditure observer        reads the registers of their constituency, keeps a shadow
//                               observation register of events they saw, and notes
//                               discrepancies. A note is an observation, not a finding.
//
// Totals are shown against the ceiling for the election type. A payment above ₹10,000 in cash is
// flagged, since such payments are to be made by cheque or bank transfer under ECI instructions.
import { transaction } from "../config/redis.js";
import { getElection } from "../repositories/election.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { campaignContext } from "../services/candidate.service.js";
import { actorOf, amountOf, areaOf, asRecord, assertScope, clean, dateOf, inScope, newId, nowIso, oneOf, page, requireText, store } from "../services/workflow.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const CATEGORIES = {
    public_meeting: "Public meetings, rallies and processions", campaign_material: "Campaign material (posters, banners, pamphlets)",
    media_advertisement: "Advertisements in print and electronic media", social_media: "Social media and internet campaigning",
    vehicles: "Vehicles and fuel", workers: "Campaign workers and agents", star_campaigner: "Star campaigners' travel (candidate's share)",
    office: "Election office and staff", other: "Other"
};
const MODES = ["cash", "cheque", "bank_transfer", "upi", "in_kind"];
const CASH_LIMIT = 10000;
const ceilingFor = (election) => Number(process.env[election?.type === "general_parliament" ? "EXPENDITURE_CEILING_PC" : "EXPENDITURE_CEILING_AC"])
    || (election?.type === "general_parliament" ? 9500000 : 4000000);

const entries = store("expenditure");
const shadow = store("expenditure-shadow");
const candidateKey = (c) => c.nominationId || c.epic || c.name;

const flagsFor = (e) => [
    ...(e.mode === "cash" && e.amount > CASH_LIMIT ? ["cash_above_10000"] : []),
    ...(!e.voucherRef ? ["no_voucher"] : [])
];

const summarise = (list, election) => {
    const live = list.filter((e) => !e.supersededBy);
    const total = live.reduce((n, e) => n + e.amount, 0);
    const byCategory = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, live.filter((e) => e.category === k).reduce((n, e) => n + e.amount, 0)]));
    const ceiling = ceilingFor(election);
    return { total, byCategory, ceiling, percentOfCeiling: ceiling ? Math.round((total / ceiling) * 1000) / 10 : null, entries: live.length, flagged: live.filter((e) => e.flags.length).length };
};

/** Candidate or election agent: add a register entry. */
export const addEntry = asyncHandler(async (req, res) => {
    const ctx = await campaignContext(req);
    const body = req.body ?? {};
    const entry = {
        _id: newId(), electionId: ctx.electionId, jurisdiction: ctx.area, candidate: ctx.candidate, candidateKey: candidateKey(ctx.candidate),
        date: dateOf(body.date), category: oneOf(body.category, CATEGORIES, "category"), amount: amountOf(body.amount),
        mode: oneOf(body.mode, MODES, "mode"), payee: requireText(body.payee, "Paid to", { min: 2, max: 150 }),
        description: requireText(body.description, "Description", { min: 3, max: 400 }), voucherRef: clean(body.voucherRef, 80) || null,
        enteredBy: actorOf(req.user), enteredAt: nowIso(), corrects: null, supersededBy: null, correctionReason: null, observerNotes: []
    };
    entry.flags = flagsFor(entry);
    const tx = transaction();
    entries.save(entry, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "expenditure.entered", resource: { type: "expenditure", id: entry._id }, jurisdiction: asRecord(entry.jurisdiction), after: { amount: entry.amount, category: entry.category, mode: entry.mode } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: entry });
});

/** Candidate or election agent: correct an entry (a new entry supersedes it; nothing is erased). */
export const correctEntry = asyncHandler(async (req, res) => {
    const ctx = await campaignContext(req);
    const result = await entries.withLock(req.params.id, async () => {
        const old = await entries.get(req.params.id);
        if (!old || old.candidateKey !== candidateKey(ctx.candidate)) throw new ApiError(404, "Entry not found.");
        if (old.supersededBy) throw new ApiError(409, "This entry has already been corrected.");
        const reason = requireReason(req.body?.reason, "correction");
        const body = { ...old, ...req.body };
        const next = {
            ...old, _id: newId(), date: dateOf(body.date), category: oneOf(body.category, CATEGORIES, "category"), amount: amountOf(body.amount),
            mode: oneOf(body.mode, MODES, "mode"), payee: requireText(body.payee, "Paid to", { min: 2, max: 150 }), description: requireText(body.description, "Description", { min: 3, max: 400 }),
            voucherRef: clean(body.voucherRef, 80) || null, enteredBy: actorOf(req.user), enteredAt: nowIso(), corrects: old._id, correctionReason: reason, supersededBy: null, observerNotes: []
        };
        next.flags = flagsFor(next);
        const tx = transaction();
        entries.save(next, tx);
        entries.save({ ...old, supersededBy: next._id }, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "expenditure.corrected", resource: { type: "expenditure", id: old._id }, jurisdiction: asRecord(old.jurisdiction), before: { amount: old.amount }, after: { amount: next.amount, replacement: next._id }, note: reason }), tx);
        await tx.exec();
        return next;
    });
    res.json({ success: true, data: result });
});

/** Candidate or election agent: the register and its totals. */
export const myRegister = asyncHandler(async (req, res) => {
    const ctx = await campaignContext(req);
    const election = await getElection(ctx.electionId);
    const list = (await entries.list()).filter((e) => e.electionId === ctx.electionId && e.candidateKey === candidateKey(ctx.candidate));
    res.json({ success: true, data: { context: ctx, summary: summarise(list, election), items: page(list, { limit: 200 }, "enteredAt"), categories: CATEGORIES, modes: MODES } });
});

/** Expenditure observer and other readers: registers in the jurisdiction, per candidate. */
export const listRegisters = asyncHandler(async (req, res) => {
    const q = req.query;
    const all = (await entries.list()).filter((e) => inScope(req, e.jurisdiction) && (!q.electionId || e.electionId === q.electionId));
    const shadows = (await shadow.list()).filter((s) => inScope(req, s.jurisdiction) && (!q.electionId || s.electionId === q.electionId));
    const groups = new Map();
    for (const e of all) {
        const k = `${e.electionId}|${e.candidateKey}`;
        if (!groups.has(k)) groups.set(k, { electionId: e.electionId, candidateKey: e.candidateKey, candidate: e.candidate, jurisdiction: e.jurisdiction, items: [] });
        groups.get(k).items.push(e);
    }
    const candidates = [];
    for (const g of groups.values()) {
        const election = await getElection(g.electionId);
        const observed = shadows.filter((s) => s.electionId === g.electionId && s.candidateKey === g.candidateKey).reduce((n, s) => n + s.estimatedAmount, 0);
        candidates.push({ ...g, summary: { ...summarise(g.items, election), observed }, items: page(g.items, { limit: 200 }, "enteredAt") });
    }
    res.json({ success: true, data: { candidates, shadow: page(shadows, q, "observedAt"), categories: CATEGORIES,
        can: { observe: hasPermission(req.user, "observer:report") && hasPermission(req.user, "expenditure:read") } } });
});

/** Expenditure observer: a note on an entry (an observation, not a finding). */
export const noteEntry = asyncHandler(async (req, res) => {
    if (!(hasPermission(req.user, "observer:report") && hasPermission(req.user, "expenditure:read"))) throw new ApiError(403, "Only the expenditure observer notes registers.");
    const result = await entries.withLock(req.params.id, async () => {
        const e = await entries.get(req.params.id);
        if (!e) throw new ApiError(404, "Entry not found.");
        assertScope(req, e.jurisdiction, "This entry");
        const note = { kind: oneOf(req.body?.kind ?? "discrepancy", ["discrepancy", "query", "verified"], "kind"), text: requireText(req.body?.text, "Note", { min: 5, max: 600 }), by: actorOf(req.user), at: nowIso() };
        const updated = { ...e, observerNotes: [...(e.observerNotes ?? []), note] };
        const tx = transaction();
        entries.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "expenditure.observer_note", resource: { type: "expenditure", id: e._id }, jurisdiction: asRecord(e.jurisdiction), after: { kind: note.kind }, note: note.text }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: result });
});

/** Expenditure observer: the shadow observation register (what was seen at an event). */
export const addShadowEntry = asyncHandler(async (req, res) => {
    if (!(hasPermission(req.user, "observer:report") && hasPermission(req.user, "expenditure:read"))) throw new ApiError(403, "Only the expenditure observer keeps the shadow register.");
    const body = req.body ?? {};
    const area = areaOf(body, "constituency");
    assertScope(req, area, "This constituency");
    const item = {
        _id: newId(), electionId: requireText(body.electionId, "Election", { min: 1, max: 80 }), jurisdiction: area,
        candidateKey: requireText(body.candidateKey, "Candidate", { min: 1, max: 120 }), candidateName: clean(body.candidateName, 120) || null,
        date: dateOf(body.date), event: requireText(body.event, "Event observed", { min: 5, max: 400 }), estimatedAmount: amountOf(body.estimatedAmount, "Estimated amount"),
        observedBy: actorOf(req.user), observedAt: nowIso()
    };
    const tx = transaction();
    shadow.save(item, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "expenditure.shadow_entry", resource: { type: "expenditure_shadow", id: item._id }, jurisdiction: asRecord(area), after: { estimatedAmount: item.estimatedAmount } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: item });
});

export const listAllExpenditure = () => entries.list();
