// Online Index Card: the statistical record of one constituency's election.
//
//   1. PREPARE   The RO starts the card. It is pre-filled from the platform's own records: the
//                schedule (election), electors by category and gender (electoral roll), polling
//                stations (station list), the contesting candidates (Form 7A) and their votes
//                (the registered result source). The RO completes or corrects the rest.
//   2. VALIDATE  Arithmetic checks: categories add up to electors, candidate votes and NOTA add up
//                to valid votes, valid + rejected = votes polled, polled <= electors, the
//                returned candidate has the most votes. Errors block submission.
//   3. SUBMIT    Due within 72 hours of the declaration.
//   4. EXAMINE   The CEO accepts it or returns it with remarks.
//   5. FINALISE  The Commission finalises and locks it; it is then public.
//
// MongoDB is the system of record (`index_cards`, unique per election and constituency).
import { getContestingList } from "../repositories/election.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
import { listStations } from "../repositories/election.repository.js";
import { getResultFeed } from "../repositories/result.repository.js";
import { rollAreaKey } from "../repositories/rollVersion.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { requireElection } from "../services/election.service.js";
import { actorOf, areaOf, assertScope, auditChange, clean, inScope, newId, nowIso, oneOf, requireText } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const cards = docStore("index_cards");
export const CARD_STATUS = { draft: "Draft (RO)", submitted: "Submitted to the CEO", returned: "Returned to the RO", ceo_verified: "Verified by the CEO", finalised: "Finalised by the Commission" };
const int = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; };

/** Votes per candidate from the result feed (EVM rounds + postal), latest corrections applied. */
const votesFromFeed = (feed) => {
    if (!feed) return null;
    const latest = new Map();
    for (const e of feed.entries) {
        if (e.kind === "round") latest.set(String(e.round), e);
        else if (e.kind === "postal") latest.set("postal", e);
        else latest.set(e.corrects, { ...latest.get(e.corrects), votes: e.votes, nota: e.nota });
    }
    const postal = latest.get("postal");
    const rounds = [...latest.entries()].filter(([k]) => k !== "postal").map(([, e]) => e);
    const out = {};
    for (const c of feed.candidates) {
        const evm = rounds.reduce((n, r) => n + (r.votes?.[c.serial] ?? 0), 0);
        out[c.serial] = { evm, postal: postal?.votes?.[c.serial] ?? 0 };
    }
    return { byCandidate: out, notaEvm: rounds.reduce((n, r) => n + (r.nota ?? 0), 0), notaPostal: postal?.nota ?? 0, rejectedPostal: postal?.rejected ?? 0,
        declaredWinnerSerial: feed.publication?.declaredWinnerSerial ?? null, declaredAt: feed.publication?.declaredAt ?? null, source: feed.label ?? feed.source?.name ?? null, mock: feed.source?.type === "mock" };
};

/** Arithmetic validation. Errors stop submission; warnings are shown. */
export const validateCard = (c) => {
    const errors = [], warnings = [];
    const e = c.electors;
    const catTotal = e.general + e.serviceVoters + e.overseas;
    if (catTotal !== e.total) errors.push(`Electors by category (${catTotal}) do not add up to total electors (${e.total}).`);
    if (e.men + e.women + e.thirdGender !== e.general + e.overseas) warnings.push(`Electors by gender (${e.men + e.women + e.thirdGender}) differ from general and overseas electors (${e.general + e.overseas}).`);
    const candTotal = c.candidates.reduce((n, x) => n + x.evm + x.postal, 0);
    const nota = c.votes.notaEvm + c.votes.notaPostal;
    const valid = candTotal + nota;
    if (valid !== c.votes.valid) errors.push(`Candidates' votes plus NOTA (${valid}) do not equal valid votes (${c.votes.valid}).`);
    if (c.votes.valid + c.votes.rejected !== c.votes.polled) errors.push(`Valid (${c.votes.valid}) plus rejected (${c.votes.rejected}) votes do not equal votes polled (${c.votes.polled}).`);
    if (c.votes.polled > e.total) errors.push(`Votes polled (${c.votes.polled}) exceed total electors (${e.total}).`);
    if (!c.candidates.length) errors.push("The card has no candidates.");
    const sorted = [...c.candidates].sort((a, b) => (b.evm + b.postal) - (a.evm + a.postal));
    if (c.result.returnedSerial && sorted[0] && sorted[0].serial !== c.result.returnedSerial) errors.push("The returned candidate is not the candidate with the most votes.");
    if (!c.result.returnedSerial) warnings.push("The returned candidate is not recorded yet.");
    if (sorted[0] && sorted[1] && (sorted[0].evm + sorted[0].postal) === (sorted[1].evm + sorted[1].postal)) warnings.push("The top two candidates are tied: the result is decided by lot (RP Act 1951, s. 65).");
    if (c.stations.total <= 0) errors.push("Give the number of polling stations.");
    const turnout = e.total ? Math.round((c.votes.polled / e.total) * 10000) / 100 : 0;
    const margin = sorted[0] && sorted[1] ? (sorted[0].evm + sorted[0].postal) - (sorted[1].evm + sorted[1].postal) : null;
    return { errors, warnings, derived: { turnoutPercent: turnout, margin, forfeitedDeposits: c.candidates.filter((x) => (x.evm + x.postal) < c.votes.valid / 6).map((x) => x.serial) } };
};

const present = (c) => ({ ...c, statusText: CARD_STATUS[c.status], validation: validateCard(c), dueAt: c.result.declaredAt ? new Date(Date.parse(c.result.declaredAt) + 72 * 3600000).toISOString() : null });

/** Builds a draft card for one constituency from the platform's own records. */
export const buildCard = async (election, area, actor) => {
    const areaKey = rollAreaKey({ ...area, assemblyConstituency: area.constituency });
    const existing = await cards.findOne({ electionId: election._id, "jurisdiction.state": area.state, "jurisdiction.constituency": area.constituency });
    if (existing) throw new ApiError(409, "An index card already exists for this constituency.");
    const [list, feed, electors, stations] = await Promise.all([getContestingList(election._id, areaKey), getResultFeed(election._id, areaKey), listElectors(), listStations()]);
    const here = electors.filter((x) => x.isActive !== false && x.state === area.state && x.assemblyConstituency === area.constituency);
    const general = here.filter((x) => !["service_voter", "overseas_elector"].includes(x.electorCategory));
    const counted = votesFromFeed(feed);
    const candidates = (list?.candidates ?? []).map((c) => ({ serial: c.serial, name: c.name, party: c.party, partyCategory: c.partyCategory ?? (c.independent ? "independent" : "registered_unrecognised"),
        symbol: c.symbol ?? null, age: c.age ?? null, gender: null, evm: counted?.byCandidate?.[c.serial]?.evm ?? 0, postal: counted?.byCandidate?.[c.serial]?.postal ?? 0 }));
    const candTotal = candidates.reduce((n, x) => n + x.evm + x.postal, 0);
    const nota = (counted?.notaEvm ?? 0) + (counted?.notaPostal ?? 0);
    const sorted = [...candidates].sort((a, b) => (b.evm + b.postal) - (a.evm + a.postal));
    const card = {
        _id: newId(), electionId: election._id, electionName: election.name, electionType: election.type, jurisdiction: area, schedule: election.schedule,
        electors: { general: general.length, serviceVoters: here.filter((x) => x.electorCategory === "service_voter").length, overseas: here.filter((x) => x.electorCategory === "overseas_elector").length,
            total: here.length, men: general.filter((x) => /^m/i.test(x.gender ?? "")).length + here.filter((x) => x.electorCategory === "overseas_elector" && /^m/i.test(x.gender ?? "")).length,
            women: general.filter((x) => /^f/i.test(x.gender ?? "")).length + here.filter((x) => x.electorCategory === "overseas_elector" && /^f/i.test(x.gender ?? "")).length, thirdGender: 0 },
        stations: { total: stations.filter((s) => s.status === "ACTIVE" && s.state === area.state && s.constituency === area.constituency).length, auxiliary: 0 },
        votes: { polled: candTotal + nota + (counted?.rejectedPostal ?? 0), valid: candTotal + nota, rejected: counted?.rejectedPostal ?? 0, notaEvm: counted?.notaEvm ?? 0, notaPostal: counted?.notaPostal ?? 0, tendered: 0 },
        candidates,
        result: { returnedSerial: counted?.declaredWinnerSerial ?? sorted[0]?.serial ?? null, declaredAt: counted?.declaredAt ?? null, source: counted?.source ?? null, mockFigures: counted?.mock ?? false },
        sources: { roll: "electoral roll (this platform)", stations: "polling-station list", candidates: list ? "Form 7A" : "none published", votes: counted ? (counted.mock ? "mock result feed" : "registered result source") : "none received" },
        status: "draft", locked: false, history: [{ step: "prepared", by: actor, at: nowIso() }], createdAt: nowIso()
    };
    const ev = card.electors;
    ev.thirdGender = Math.max(0, ev.general + ev.overseas - ev.men - ev.women);
    await cards.insert(card, "An index card already exists for this constituency.");
    return card;
};

export const prepareCard = asyncHandler(async (req, res) => {
    const election = await requireElection(req.body?.electionId);
    const area = areaOf(req.body ?? {}, "constituency");
    assertScope(req, area, "This constituency");
    const card = await buildCard(election, area, actorOf(req.user));
    const ev = card.electors;
    const candidates = card.candidates;
    await auditChange(req, "indexcard.prepared", { type: "index-card", id: card._id }, area, { after: { electors: ev.total, candidates: candidates.length } });
    res.status(201).json({ success: true, message: "Index card prepared from the roll, the station list, Form 7A and the result. Check every figure.", data: present(card) });
});

const loadCard = async (req) => {
    const c = await cards.get(req.params.id);
    if (!c) throw new ApiError(404, "No such index card.");
    if (!inScope(req, c.jurisdiction)) throw new ApiError(403, "This index card is outside your jurisdiction.");
    return c;
};

/** RO: correct figures on a draft or returned card. */
export const editCard = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const updated = await cards.withLock(req.params.id, async () => {
        const c = await loadCard(req);
        if (!["draft", "returned"].includes(c.status)) throw new ApiError(409, "Only a draft or returned card can be changed.");
        const next = structuredClone(c);
        for (const k of ["general", "serviceVoters", "overseas", "total", "men", "women", "thirdGender"]) if (b.electors?.[k] !== undefined) next.electors[k] = int(b.electors[k]);
        for (const k of ["total", "auxiliary"]) if (b.stations?.[k] !== undefined) next.stations[k] = int(b.stations[k]);
        for (const k of ["polled", "valid", "rejected", "notaEvm", "notaPostal", "tendered"]) if (b.votes?.[k] !== undefined) next.votes[k] = int(b.votes[k]);
        for (const x of Array.isArray(b.candidates) ? b.candidates : []) {
            const row = next.candidates.find((r) => r.serial === Number(x.serial));
            if (!row) continue;
            if (x.evm !== undefined) row.evm = int(x.evm);
            if (x.postal !== undefined) row.postal = int(x.postal);
            if (x.gender !== undefined) row.gender = oneOf(x.gender, ["male", "female", "third_gender"], "gender");
        }
        if (b.returnedSerial !== undefined) next.result.returnedSerial = Number(b.returnedSerial) || null;
        next.history.push({ step: "edited", by: actorOf(req.user), at: nowIso(), note: clean(b.note, 300) || null });
        await cards.put(next);
        return next;
    });
    await auditChange(req, "indexcard.edited", { type: "index-card", id: updated._id }, updated.jurisdiction);
    res.json({ success: true, message: "Saved.", data: present(updated) });
});

export const submitCard = asyncHandler(async (req, res) => {
    const updated = await cards.withLock(req.params.id, async () => {
        const c = await loadCard(req);
        if (!["draft", "returned"].includes(c.status)) throw new ApiError(409, "This card has already been submitted.");
        const v = validateCard(c);
        if (v.errors.length) throw new ApiError(422, `The card has ${v.errors.length} error(s): ${v.errors.join(" ")}`);
        const next = { ...c, status: "submitted", submittedAt: nowIso(), history: [...c.history, { step: "submitted", by: actorOf(req.user), at: nowIso() }] };
        await cards.put(next);
        return next;
    });
    await auditChange(req, "indexcard.submitted", { type: "index-card", id: updated._id }, updated.jurisdiction);
    res.json({ success: true, message: "Submitted to the CEO.", data: present(updated) });
});

export const examineCard = asyncHandler(async (req, res) => {
    const decision = oneOf(req.body?.decision, ["accept", "return"], "decision");
    const updated = await cards.withLock(req.params.id, async () => {
        const c = await loadCard(req);
        if (c.status !== "submitted") throw new ApiError(409, "Only a submitted card can be examined.");
        const remarks = decision === "return" ? requireText(req.body?.remarks, "Remarks for the RO", { min: 5, max: 1000 }) : clean(req.body?.remarks, 1000) || null;
        const next = { ...c, status: decision === "accept" ? "ceo_verified" : "returned", ceoRemarks: remarks, history: [...c.history, { step: decision === "accept" ? "ceo_verified" : "returned", by: actorOf(req.user), at: nowIso(), note: remarks }] };
        await cards.put(next);
        return next;
    });
    await auditChange(req, `indexcard.${decision === "accept" ? "verified" : "returned"}`, { type: "index-card", id: updated._id }, updated.jurisdiction);
    res.json({ success: true, message: decision === "accept" ? "Verified; sent to the Commission." : "Returned to the RO with remarks.", data: present(updated) });
});

export const finaliseCard = asyncHandler(async (req, res) => {
    const updated = await cards.withLock(req.params.id, async () => {
        const c = await loadCard(req);
        if (c.status !== "ceo_verified") throw new ApiError(409, "The CEO must verify the card first.");
        const next = { ...c, status: "finalised", locked: true, finalisedAt: nowIso(), history: [...c.history, { step: "finalised", by: actorOf(req.user), at: nowIso() }] };
        await cards.put(next);
        return next;
    });
    await auditChange(req, "indexcard.finalised", { type: "index-card", id: updated._id }, updated.jurisdiction);
    res.json({ success: true, message: "Finalised and locked. The index card is now public.", data: present(updated) });
});

export const listCards = asyncHandler(async (req, res) => {
    const all = (await cards.find(req.query.electionId ? { electionId: clean(req.query.electionId, 80) } : {}, { sort: { createdAt: -1 } })).filter((c) => inScope(req, c.jurisdiction));
    res.json({ success: true, data: { items: all.map(present), statuses: CARD_STATUS,
        can: { prepare: hasPermission(req.user, "index:prepare"), examine: hasPermission(req.user, "index:examine"), finalise: hasPermission(req.user, "index:finalise") }, store: cards.backend() } });
});

export const publicCards = asyncHandler(async (req, res) => {
    const filter = { status: "finalised" };
    if (req.query.electionId) filter.electionId = clean(req.query.electionId, 80);
    if (req.query.state) filter["jurisdiction.state"] = clean(req.query.state, 80);
    const all = await cards.find(filter, { sort: { "jurisdiction.constituency": 1 } });
    res.json({ success: true, data: all.map(({ history, ...c }) => ({ ...c, validation: validateCard(c) })) }); // eslint-disable-line no-unused-vars
});
