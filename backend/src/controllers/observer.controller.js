// Observer portal and app: the observer's profile and deployment, the constituency they watch,
// the officers they deal with, the list of contesting candidates (Form 7A), notices from the
// Commission, the observers' public contact list, and flying-squad positions on a map.
//
// The profile lives in MongoDB (`observer_profiles`); bank details are kept masked except the last
// four digits. Flying-squad positions are hot, short-lived data and live only in Redis (expire
// after 30 minutes without an update).
import { redis } from "../config/redis.js";
import { listAllAssignments } from "../repositories/assignment.repository.js";
import { getContestingList, listElections, listStations } from "../repositories/election.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
import { rollAreaKey } from "../repositories/rollVersion.repository.js";
import { getUserByEpic } from "../repositories/user.repository.js";
import { assignmentInEffect, hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { auditChange, clean, inScope, nowIso, store } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const profiles = docStore("observer_profiles");
const directions = store("direction");
const complaints = store("mcc-complaint");
export const OBSERVER_ROLES = ["general_observer", "police_observer", "expenditure_observer", "counting_observer", "micro_observer"];
const OFFICER_ROLES = { deo: "District Election Officer", ro: "Returning Officer", aro: "Assistant Returning Officer", district_police_officer: "Superintendent of Police", district_nodal_officer: "District nodal officer", flying_squad: "Flying squad" };
const SQUAD_TTL = 30 * 60;
const squadKey = (epic) => `squad:location:${epic}`;
const SQUAD_SET = "squad:locations";

const areaOfA = (a) => ({ state: a.jurisdiction?.state, district: a.jurisdiction?.district, constituency: a.jurisdiction?.constituency });
const mask = (acct) => (acct ? `${"x".repeat(Math.max(0, acct.length - 4))}${acct.slice(-4)}` : null);

const contactOf = async (a) => {
    const u = await getUserByEpic(a.epic).catch(() => null);
    return { role: a.role, roleText: OFFICER_ROLES[a.role] ?? a.role, epic: a.epic, name: u?.name ?? null, phone: u?.mobile ? `${u.mobile}` : null, office: a.jurisdiction?.constituency ? `${a.jurisdiction.constituency} RO office` : `${a.jurisdiction?.district ?? ""} Collectorate`.trim() };
};

/** The signed-in observer's portal: profile, deployment, constituency, officers, candidates, notices. */
export const myObserverPortal = asyncHandler(async (req, res) => {
    if (!OBSERVER_ROLES.includes(req.user.role)) throw new ApiError(403, "This page is for observers.");
    const mine = (req.authority?.assignments ?? []).filter((a) => a.jurisdiction?.state);
    const deployment = mine.map((a) => ({ election: a.election ?? null, state: a.jurisdiction.state, district: a.jurisdiction.district ?? null, constituency: a.jurisdiction.constituency ?? null,
        pollingStation: a.jurisdiction.pollingStation ?? null, from: a.validFrom ?? a.grantedAt ?? null, until: a.validUntil ?? null, status: assignmentInEffect(a) ? "deployed" : "not in effect" }));
    const primary = mine[0];
    const area = primary ? areaOfA(primary) : null;
    const [assignments, stations, electors, elections, profile, dirs] = await Promise.all([listAllAssignments(), listStations(), listElectors(), listElections(), profiles.get(req.user.epic), directions.list()]);
    const officers = [];
    if (area) {
        for (const a of assignments) {
            if (!assignmentInEffect(a) || !OFFICER_ROLES[a.role]) continue;
            const j = a.jurisdiction ?? {};
            if (j.state !== area.state) continue;
            const sameDistrict = j.district && j.district === area.district;
            const sameAc = j.constituency && j.constituency === area.constituency;
            if ((["deo", "district_police_officer", "district_nodal_officer"].includes(a.role) && sameDistrict) || (["ro", "aro", "flying_squad"].includes(a.role) && sameAc)) officers.push(await contactOf(a));
        }
    }
    const acStations = area ? stations.filter((s) => s.state === area.state && s.constituency === area.constituency && s.status === "ACTIVE") : [];
    const acElectors = area ? electors.filter((e) => e.isActive !== false && e.state === area.state && e.assemblyConstituency === area.constituency) : [];
    const election = elections.find((e) => e._id === primary?.election || e.name === primary?.election) ?? elections.find((e) => area && e.states.includes(area.state)) ?? null;
    const contesting = election && area?.constituency ? await getContestingList(election._id, rollAreaKey({ ...area, assemblyConstituency: area.constituency })) : null;
    const notices = dirs.filter((d) => (d.addressedTo === req.user.role || d.addressedTo === "observer") && inScope(req, d.jurisdiction))
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).slice(0, 30);
    res.json({ success: true, data: {
        me: { epic: req.user.epic, name: req.user.name ?? null, role: req.user.role },
        profile: profile ? { ...profile, bank: profile.bank ? { ...profile.bank, account: mask(profile.bank.account) } : null } : null,
        deployment, election: election ? { _id: election._id, name: election.name, schedule: election.schedule } : null,
        constituency: area ? { ...area, stations: acStations.length, electors: acElectors.length, women: acElectors.filter((e) => /^f/i.test(e.gender ?? "")).length,
            parts: [...new Set(acStations.map((s) => s.partNumber))].length, stationList: acStations.slice(0, 400).map((s) => ({ _id: s._id, partNumber: s.partNumber, name: s.name, location: s.location ?? null })) } : null,
        officers, contesting: contesting ? { form: "7A", publishedAt: contesting.publishedAt, candidates: contesting.candidates } : null,
        notices, idCard: { number: `OBS/${(area?.state ?? "IN").slice(0, 2).toUpperCase()}/${req.user.epic}`, name: req.user.name ?? req.user.epic, role: req.user.role, constituency: area?.constituency ?? null, election: election?.name ?? null },
        store: profiles.backend()
    } });
});

/** The observer updates their own contact and bank details (for honorarium). */
export const updateMyProfile = asyncHandler(async (req, res) => {
    if (!OBSERVER_ROLES.includes(req.user.role)) throw new ApiError(403, "This page is for observers.");
    const b = req.body ?? {};
    const phone = clean(b.localContact, 15);
    if (phone && !/^[6-9]\d{9}$/.test(phone)) throw new ApiError(400, "Give a 10-digit mobile number for local contact.");
    const account = clean(b.bankAccount, 20).replace(/\s/g, "");
    if (account && !/^\d{9,18}$/.test(account)) throw new ApiError(400, "The bank account number should have 9 to 18 digits.");
    const ifsc = clean(b.ifsc, 11).toUpperCase();
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new ApiError(400, "The IFSC code should look like SBIN0001234.");
    const existing = (await profiles.get(req.user.epic)) ?? { _id: req.user.epic, epic: req.user.epic, createdAt: nowIso() };
    const next = {
        ...existing, name: req.user.name ?? existing.name ?? null, role: req.user.role, service: clean(b.service, 80) || existing.service || null, batch: clean(b.batch, 10) || existing.batch || null,
        localContact: phone || existing.localContact || null, localAddress: clean(b.localAddress, 300) || existing.localAddress || null, email: clean(b.email, 120) || existing.email || null,
        bank: account || ifsc ? { account: account || existing.bank?.account || null, ifsc: ifsc || existing.bank?.ifsc || null, bankName: clean(b.bankName, 80) || existing.bank?.bankName || null } : existing.bank ?? null,
        publishContact: b.publishContact === undefined ? existing.publishContact ?? true : b.publishContact === true, updatedAt: nowIso()
    };
    await profiles.put(next);
    await auditChange(req, "observer.profile_updated", { type: "observer", id: req.user.epic }, {}, { after: { localContact: Boolean(next.localContact), bank: Boolean(next.bank) } });
    res.json({ success: true, message: "Profile saved.", data: { ...next, bank: next.bank ? { ...next.bank, account: mask(next.bank.account) } : null } });
});

/** Public: the observers deployed in a State (optionally a constituency) and their published contact numbers. */
export const publicObservers = asyncHandler(async (req, res) => {
    const state = clean(req.query.state, 80);
    if (!state) throw new ApiError(400, "Choose a State/UT.");
    const constituency = clean(req.query.constituency, 120) || null;
    const rows = [];
    for (const a of await listAllAssignments()) {
        if (!OBSERVER_ROLES.includes(a.role) || a.role === "micro_observer" || !assignmentInEffect(a)) continue;
        if (a.jurisdiction?.state !== state || (constituency && a.jurisdiction?.constituency !== constituency)) continue;
        const p = await profiles.get(a.epic);
        const u = await getUserByEpic(a.epic).catch(() => null);
        rows.push({ role: a.role, name: u?.name ?? "Observer", constituency: a.jurisdiction.constituency ?? null, district: a.jurisdiction.district ?? null,
            phone: p?.publishContact !== false ? p?.localContact ?? null : null, stayingAt: p?.publishContact !== false ? p?.localAddress ?? null : null });
    }
    res.json({ success: true, data: rows });
});

/** Flying squad: report the team's position (from the app, every few minutes while on duty). */
export const reportSquadLocation = asyncHandler(async (req, res) => {
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ApiError(400, "Give the position as latitude and longitude.");
    const a = (req.authority?.assignments ?? []).find((x) => x.jurisdiction?.constituency);
    if (!a) throw new ApiError(403, "Your squad is not assigned to a constituency.");
    const doc = { epic: req.user.epic, lat, lng, accuracyM: Number(req.body?.accuracyM) || null, jurisdiction: areaOfA(a), vehicle: clean(req.body?.vehicle, 30) || null, at: nowIso() };
    await redis().multi().set(squadKey(req.user.epic), JSON.stringify(doc), { EX: SQUAD_TTL }).sAdd(SQUAD_SET, req.user.epic).exec();
    res.json({ success: true, message: "Position updated.", data: doc });
});

/** Observers, the control room, DEO and RO: where the flying squads are, and what each is on. */
export const squadLocations = asyncHandler(async (req, res) => {
    const epics = await redis().sMembers(SQUAD_SET);
    const open = (await complaints.list()).filter((c) => c.status === "assigned");
    const items = [];
    for (const epic of epics) {
        const raw = await redis().get(squadKey(epic));
        if (!raw) { await redis().sRem(SQUAD_SET, epic); continue; }
        const d = JSON.parse(raw);
        if (!inScope(req, d.jurisdiction)) continue;
        const job = open.find((c) => c.assignedTo?.epic === epic);
        items.push({ ...d, minutesAgo: Math.round((Date.now() - Date.parse(d.at)) / 60000), onComplaint: job ? { referenceId: job.referenceId, category: job.category, place: job.place ?? null } : null });
    }
    res.json({ success: true, data: { items, ttlMinutes: SQUAD_TTL / 60, canReport: hasPermission(req.user, "complaint:investigate") } });
});
