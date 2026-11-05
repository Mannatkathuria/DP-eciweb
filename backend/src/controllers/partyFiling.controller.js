// Integrated Election Expenditure Monitoring System (IEMS): political parties' statutory filings.
//
//   FORM 24A     Contributions over ₹20,000 received in a financial year (RP Act 1951, s. 29C),
//                due by 30 September. Each donor needs a PAN; cash over ₹2,000 is not allowed
//                (Income Tax Act, s. 13A). Rows can be entered or imported in bulk (CSV).
//   AUDIT        The audited annual accounts, due by 31 October.
//   ELECTION     The party's statement of election expenditure, due within 75 days of an
//                Assembly result (90 for the Lok Sabha).
//
// The treasurer signs with Aadhaar eSign (simulated here) and gets an acknowledgement number.
// The Commission sees a compliance dashboard and records its scrutiny. MongoDB is the system of
// record (`party_filings`).
import crypto from "crypto";
import { listElections } from "../repositories/election.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { actorOf, amountOf, auditChange, clean, dateOf, newId, nowIso, oneOf, requireText } from "../services/workflow.service.js";
import { todayIST } from "../services/election.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const filings = docStore("party_filings");
export const FILING_TYPES = { contribution_24a: "Form 24A: contributions over ₹20,000", audit_accounts: "Audited annual accounts", election_expenditure: "Election expenditure statement" };
const MODES = { cheque: "Cheque", bank_transfer: "Bank transfer / NEFT / RTGS", upi: "UPI", demand_draft: "Demand draft", cash: "Cash", in_kind: "In kind" };
const EXP_HEADS = { publicity: "Publicity (media, posters, rallies)", travel: "Travel of star campaigners", candidates: "Lump sum given to candidates", others: "Other expenditure" };
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const FY = /^(\d{4})-(\d{2})$/;

const fyDue = (fy, type) => { const y = Number(FY.exec(fy)[1]) + 1; return type === "contribution_24a" ? `${y}-09-30` : `${y}-10-31`; };
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const partyOf = (req) => {
    const p = clean(req.user.party ?? (req.authority?.assignments ?? []).find((a) => a.party)?.party, 120);
    if (!p) throw new ApiError(403, "Your account is not linked to a political party.");
    return p;
};

/** Contribution rows: validated; problems are returned per row. */
export const checkContributions = (rows) => {
    const out = [], problems = [];
    const seen = new Set();
    rows.slice(0, 5000).forEach((r, i) => {
        const n = i + 1;
        const name = clean(r.name, 120), pan = clean(r.pan, 10).toUpperCase(), mode = String(r.mode ?? "").trim().toLowerCase().replace(/\s+/g, "_");
        const amount = Number(String(r.amount ?? "").replace(/[,₹\s]/g, ""));
        if (name.length < 2) problems.push(`Row ${n}: donor name missing.`);
        if (!Number.isFinite(amount) || amount <= 0) problems.push(`Row ${n}: amount missing.`);
        else if (amount <= 20000) problems.push(`Row ${n}: ₹${amount} is not over ₹20,000; Form 24A lists only larger contributions.`);
        if (!PAN.test(pan)) problems.push(`Row ${n}: PAN ${pan || "(none)"} is not valid.`);
        if (!MODES[mode]) problems.push(`Row ${n}: mode must be one of ${Object.keys(MODES).join(", ")}.`);
        if (mode === "cash" && amount > 2000) problems.push(`Row ${n}: cash contributions over ₹2,000 are not allowed.`);
        const date = clean(r.date, 10);
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`Row ${n}: date must be YYYY-MM-DD.`);
        const k = `${pan}|${amount}|${date}`;
        if (seen.has(k)) problems.push(`Row ${n}: duplicate of an earlier row.`);
        seen.add(k);
        out.push({ name, pan, address: clean(r.address, 200) || null, amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0, mode, date: date || null });
    });
    return { rows: out, problems };
};

/** Parses "name,pan,address,amount,mode,date" CSV (header optional). */
const parseCsv = (text) => String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()).slice(0, 6))
    .filter((c) => !/^name$/i.test(c[0])).map(([name, pan, address, amount, mode, date]) => ({ name, pan, address, amount, mode, date }));

export const fileReturn = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const party = partyOf(req);
    const filingType = oneOf(b.filingType, FILING_TYPES, "filingType");
    if (b.esignConsent !== true) throw new ApiError(400, "Sign the filing with Aadhaar eSign (give consent) to submit it.");
    let period, dueOn, payload;
    if (filingType === "election_expenditure") {
        const election = (await listElections()).find((e) => e._id === b.electionId);
        if (!election) throw new ApiError(404, "Choose the election the statement is for.");
        period = election._id;
        dueOn = addDays(election.schedule.countingDate, election.type === "general_parliament" ? 90 : 75);
        const heads = Object.fromEntries(Object.keys(EXP_HEADS).map((k) => [k, Math.max(0, Math.round((Number(b.heads?.[k]) || 0) * 100) / 100)]));
        payload = { electionName: election.name, heads, total: Object.values(heads).reduce((a, x) => a + x, 0) };
        if (!payload.total) throw new ApiError(400, "Give the expenditure under at least one head.");
    } else {
        period = clean(b.financialYear, 7);
        const m = FY.exec(period);
        if (!m || Number(m[2]) !== (Number(m[1]) + 1) % 100) throw new ApiError(400, "Financial year must look like 2025-26.");
        dueOn = fyDue(period, filingType);
        if (filingType === "contribution_24a") {
            const raw = Array.isArray(b.contributions) ? b.contributions : b.csv ? parseCsv(b.csv) : [];
            const { rows, problems } = checkContributions(raw);
            if (problems.length) throw new ApiError(422, `The contributions have ${problems.length} problem(s): ${problems.slice(0, 8).join(" ")}${problems.length > 8 ? " …" : ""}`);
            payload = { contributions: rows, count: rows.length, total: rows.reduce((n, r) => n + r.amount, 0), nil: rows.length === 0 };
        } else {
            payload = { auditor: requireText(b.auditor, "Auditor (chartered accountant firm)", { min: 3, max: 120 }), income: amountOf(b.income, "Total income"), expenditure: amountOf(b.expenditure, "Total expenditure"),
                auditReportDate: dateOf(b.auditReportDate, "Date of the audit report") };
        }
    }
    const prior = await filings.find({ party, filingType, period, status: { $ne: "superseded" } });
    const at = nowIso();
    const doc = {
        _id: newId(), party, filingType, period, dueOn, filedOn: todayIST(), late: todayIST() > dueOn, ...payload,
        acknowledgement: `ACK/${filingType === "contribution_24a" ? "24A" : filingType === "audit_accounts" ? "AUD" : "EXP"}/${period}/${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
        esign: { method: "aadhaar_esign", reference: `ESIGN-${crypto.randomBytes(5).toString("hex").toUpperCase()}`, simulated: true, at },
        revision: prior.length + 1, status: "filed", scrutiny: null, by: actorOf(req.user), createdAt: at
    };
    await filings.insert(doc);
    for (const p of prior) await filings.put({ ...p, status: "superseded", supersededBy: doc._id });
    await auditChange(req, "party.filing_submitted", { type: "party-filing", id: doc._id }, {}, { after: { party, filingType, period, late: doc.late } });
    res.status(201).json({ success: true, message: `Filed. Acknowledgement ${doc.acknowledgement}${doc.late ? " (after the due date)" : ""}. An SMS and email acknowledgement has been sent.`, data: doc });
});

export const myFilings = asyncHandler(async (req, res) => {
    const party = partyOf(req);
    const items = await filings.find({ party }, { sort: { createdAt: -1 } });
    const elections = (await listElections()).filter((e) => e.schedule.countingDate <= todayIST()).map((e) => ({ _id: e._id, name: e.name, dueOn: addDays(e.schedule.countingDate, e.type === "general_parliament" ? 90 : 75) }));
    res.json({ success: true, data: { party, items: items.map(({ contributions, ...f }) => ({ ...f, rows: contributions?.length ?? null })), elections, lists: { types: FILING_TYPES, modes: MODES, heads: EXP_HEADS } } });
});

/** The Commission: compliance by party and filing type for a financial year. */
export const complianceDashboard = asyncHandler(async (req, res) => {
    const fy = clean(req.query.financialYear, 7) || (() => { const y = Number(todayIST().slice(0, 4)) - (Number(todayIST().slice(5, 7)) < 4 ? 2 : 1); return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; })();
    if (!FY.test(fy)) throw new ApiError(400, "Financial year must look like 2025-26.");
    const all = await filings.find({ status: { $ne: "superseded" } }, { sort: { createdAt: -1 } });
    const parties = [...new Set(all.map((f) => f.party))].sort();
    const today = todayIST();
    const rows = parties.map((party) => {
        const cell = (type) => {
            const f = all.find((x) => x.party === party && x.filingType === type && x.period === fy);
            const due = fyDue(fy, type);
            return f ? { status: f.late ? "late" : "on_time", filedOn: f.filedOn, acknowledgement: f.acknowledgement, id: f._id, scrutiny: f.scrutiny?.outcome ?? null, total: f.total ?? f.income ?? null }
                : { status: today > due ? "not_filed" : "due", dueOn: due };
        };
        return { party, contribution_24a: cell("contribution_24a"), audit_accounts: cell("audit_accounts"),
            election_expenditure: all.filter((x) => x.party === party && x.filingType === "election_expenditure").map((x) => ({ election: x.electionName, filedOn: x.filedOn, late: x.late, total: x.total, id: x._id })) };
    });
    res.json({ success: true, data: { financialYear: fy, rows, totals: { filings: all.length, late: all.filter((f) => f.late).length, contributions: all.filter((f) => f.filingType === "contribution_24a" && f.period === fy).reduce((n, f) => n + (f.total ?? 0), 0) },
        recent: all.slice(0, 30).map(({ contributions, ...f }) => ({ ...f, rows: contributions?.length ?? null })), can: { review: hasPermission(req.user, "party:review") }, store: filings.backend() } });
});

export const getFiling = asyncHandler(async (req, res) => {
    const f = await filings.get(req.params.id);
    if (!f) throw new ApiError(404, "No such filing.");
    if (!hasPermission(req.user, "party:review") && !hasPermission(req.user, "national:view") && f.party !== clean(req.user.party, 120)) throw new ApiError(403, "Not your party's filing.");
    res.json({ success: true, data: f });
});

export const scrutiniseFiling = asyncHandler(async (req, res) => {
    const outcome = oneOf(req.body?.outcome, ["in_order", "deficiency_notice"], "outcome");
    const updated = await filings.withLock(req.params.id, async () => {
        const f = await filings.get(req.params.id);
        if (!f || f.status === "superseded") throw new ApiError(404, "No such current filing.");
        const next = { ...f, scrutiny: { outcome, remarks: outcome === "deficiency_notice" ? requireText(req.body?.remarks, "Deficiencies", { min: 10, max: 1000 }) : clean(req.body?.remarks, 1000) || null, by: actorOf(req.user), at: nowIso() } };
        await filings.put(next);
        return next;
    });
    await auditChange(req, `party.filing_${outcome}`, { type: "party-filing", id: updated._id }, {}, { after: { party: updated.party } });
    res.json({ success: true, message: outcome === "in_order" ? "Recorded as in order." : "Deficiency notice recorded for the party.", data: updated });
});
