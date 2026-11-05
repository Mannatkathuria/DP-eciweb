// ERONET roll quality: photo-similar entries (PSE), demographically similar entries (DSE) and
// deaths reported by BLOs, taken to a reasoned decision.
//
//   1. SCAN       The ERO scans the roll of the constituency. Entries sharing a photograph
//                 fingerprint (PSE) or the same folded name, relative's name and date of birth
//                 (DSE, within the State) are flagged. A flag is a reason to look, not proof.
//      DEATH      A BLO reports a death found in the field, with the death certificate details.
//   2. FIELD      The ERO asks the BLO to check; the BLO records what was found.
//   3. NOTICE     Before any deletion the ERO issues a notice to the elector, with a hearing date;
//                 the BLO records its delivery (Registration of Electors Rules, 1960, r. 21A).
//   4. ORDER      After the hearing, the ERO keeps all entries or deletes one, with a reasoned
//                 order. Deletion marks the Redis roll entry inactive (it is never erased).
//
// Flags live in MongoDB (`roll_flags`, unique fingerprint so the same pair is never raised twice);
// the electoral roll itself stays in Redis, and the scan reads the MongoDB `electors` read model.
import crypto from "crypto";
import { mongo, mongoConfigured } from "../config/mongo.js";
import { transaction } from "../config/redis.js";
import { getElectorByEpic, listElectors, saveElector } from "../repositories/elector.repository.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { opsEvent, publishEvents, recordEvent } from "../services/events.service.js";
import { ensureDrained } from "../services/projector.service.js";
import { todayIST } from "../services/election.service.js";
import { actorOf, areaOf, assertScope, auditChange, clean, dateOf, inScope, newId, nowIso, oneOf, requireText } from "../services/workflow.service.js";
import { nameKey, photoHashOf } from "../utils/nameKey.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const flags = docStore("roll_flags");
export const FLAG_TYPES = { pse: "Photo-similar entries (PSE)", dse: "Demographically similar entries (DSE)", death: "Death reported by the BLO" };
export const FLAG_STATUS = {
    open: "Flagged, awaiting the ERO", field_check: "With the BLO for field verification", field_reported: "BLO has reported",
    notice_issued: "Notice issued, awaiting delivery", notice_delivered: "Notice delivered, hearing due", decided: "Decided by the ERO"
};
export const FINDINGS = { same_person: "Same person entered more than once", different_persons: "Different persons", dead: "The elector has died", shifted: "Shifted from the address", not_found: "Not found at the address" };
const DATA_URL = /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/]+={0,2}$/;

const entryOf = (e) => ({ epic: e.epic, name: e.name, relativeName: e.relativeName ?? null, gender: e.gender ?? null, dateOfBirth: e.dateOfBirth ? String(e.dateOfBirth).slice(0, 10) : null,
    state: e.state, district: e.district, constituency: e.assemblyConstituency, partNumber: e.partNumber ?? null, serialNumber: e.serialNumber ?? null, houseNumber: e.houseNumber ?? null, isActive: e.isActive !== false });
const areaOfEntry = (e) => ({ state: e.state, district: e.district, constituency: e.constituency ?? e.assemblyConstituency });
const fingerprintOf = (type, epics) => crypto.createHash("sha256").update(`${type}:${[...epics].sort().join(",")}`).digest("hex").slice(0, 40);

/** Groups of active electors in a State that share a DSE key or a photo fingerprint. */
const similarGroups = async (state) => {
    if (mongoConfigured()) {
        try {
            if (await ensureDrained()) {
                const col = mongo().collection("electors");
                const base = { state, isActive: { $ne: false } };
                const dse = await col.aggregate([{ $match: { ...base, nameKey: { $ne: null } } },
                    { $group: { _id: { n: "$nameKey", r: "$relativeNameKey", d: { $substrBytes: ["$dateOfBirth", 0, 10] }, g: "$gender" }, docs: { $push: "$$ROOT" }, n: { $sum: 1 } } },
                    { $match: { n: { $gt: 1 } } }], { allowDiskUse: true }).toArray();
                const pse = await col.aggregate([{ $match: { ...base, photoHash: { $ne: null } } }, { $group: { _id: "$photoHash", docs: { $push: "$$ROOT" }, n: { $sum: 1 } } },
                    { $match: { n: { $gt: 1 } } }], { allowDiskUse: true }).toArray();
                return { source: "mongodb", dse: dse.map((g) => g.docs), pse: pse.map((g) => g.docs) };
            }
        } catch (err) { console.error("Roll scan: MongoDB failed, using Redis:", err.message); }
    }
    const all = (await listElectors()).filter((e) => e.state === state && e.isActive !== false);
    const group = (keyFn) => Object.values(all.reduce((m, e) => { const k = keyFn(e); if (k) (m[k] ??= []).push(e); return m; }, {})).filter((g) => g.length > 1);
    return {
        source: "redis",
        dse: group((e) => (nameKey(e.name) ? `${nameKey(e.name)}|${nameKey(e.relativeName)}|${String(e.dateOfBirth ?? "").slice(0, 10)}|${e.gender}` : null)),
        pse: group((e) => photoHashOf(e))
    };
};

export const scanRoll = asyncHandler(async (req, res) => {
    const area = areaOf(req.body ?? {}, "constituency");
    assertScope(req, area, "This constituency");
    const groups = await similarGroups(area.state);
    let created = 0, already = 0;
    const at = nowIso();
    for (const [type, list] of [["pse", groups.pse], ["dse", groups.dse]]) {
        for (const docs of list) {
            const entries = docs.map(entryOf);
            if (!entries.some((x) => x.constituency === area.constituency)) continue; // the ERO's own roll is involved
            const fingerprint = fingerprintOf(type, entries.map((x) => x.epic));
            const here = entries.find((x) => x.constituency === area.constituency);
            const doc = { _id: newId(), type, fingerprint, entries, jurisdiction: areaOfEntry(here), crossConstituency: new Set(entries.map((x) => x.constituency)).size > 1,
                status: "open", reasons: type === "pse" ? ["Same photograph fingerprint"] : ["Same name (folded spelling), relative's name, date of birth and gender"],
                timeline: [{ step: "flagged", at, by: actorOf(req.user) }], createdAt: at };
            try { await flags.insert(doc); created += 1; } catch (err) { if (err.statusCode === 409 || err.status === 409) already += 1; else throw err; }
        }
    }
    await auditChange(req, "roll.quality_scanned", { type: "roll", id: `${area.state}:${area.constituency}` }, area, { after: { created, already, source: groups.source } });
    res.json({ success: true, message: `Scan complete: ${created} new flag(s)${already ? `, ${already} already flagged` : ""}.`, data: { created, already, source: groups.source } });
});

/** BLO: a death found in the field, with the death certificate details. */
export const reportDeath = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const elector = await getElectorByEpic(clean(b.epic, 20).toUpperCase());
    if (!elector || elector.isActive === false) throw new ApiError(404, "No active roll entry with this EPIC.");
    const entry = entryOf(elector);
    assertScope(req, areaOfEntry(entry), "This entry");
    const certificate = { registrationNumber: requireText(b.registrationNumber, "Death registration number", { min: 3, max: 60 }), dateOfDeath: dateOf(b.dateOfDeath, "Date of death"),
        issuedBy: clean(b.issuedBy, 120) || null, hasCopy: false };
    if (certificate.dateOfDeath > todayIST()) throw new ApiError(400, "The date of death cannot be in the future.");
    let copy = null;
    if (b.copy) { if (!DATA_URL.test(b.copy) || b.copy.length > 3_000_000) throw new ApiError(400, "The certificate copy must be a JPEG, PNG, WEBP or PDF under 2 MB."); copy = b.copy; certificate.hasCopy = true; }
    const at = nowIso();
    const doc = { _id: newId(), type: "death", fingerprint: fingerprintOf("death", [entry.epic]), entries: [entry], jurisdiction: areaOfEntry(entry), certificate, certificateCopy: copy,
        status: "field_reported", fieldReport: { finding: "dead", note: clean(b.note, 400) || null, by: actorOf(req.user), at },
        timeline: [{ step: "death_reported", at, by: actorOf(req.user) }], createdAt: at };
    await flags.insert(doc, "A death has already been reported for this entry.");
    await auditChange(req, "roll.death_reported", { type: "roll-flag", id: doc._id }, doc.jurisdiction, { after: { epic: entry.epic, dateOfDeath: certificate.dateOfDeath } });
    res.status(201).json({ success: true, message: "Death reported. The ERO will issue notice to the family and decide.", data: { ...doc, certificateCopy: undefined } });
});

const view = ({ certificateCopy, ...f }) => ({ ...f, typeText: FLAG_TYPES[f.type], statusText: FLAG_STATUS[f.status], hasCertificateCopy: Boolean(certificateCopy) }); // eslint-disable-line no-unused-vars

export const listFlags = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = oneOf(req.query.status, FLAG_STATUS, "status");
    if (req.query.type) filter.type = oneOf(req.query.type, FLAG_TYPES, "type");
    const all = (await flags.find(filter, { sort: { createdAt: -1 }, limit: 1000 })).filter((f) => inScope(req, f.jurisdiction));
    const isBlo = !hasPermission(req.user, "application:decide") && hasPermission(req.user, "verification:field-report");
    const items = isBlo ? all.filter((f) => ["field_check", "notice_issued"].includes(f.status) || f.fieldReport?.by?.epic === req.user.epic) : all;
    const counts = all.reduce((m, f) => ((m[f.status] = (m[f.status] ?? 0) + 1), m), {});
    const byType = all.reduce((m, f) => ((m[f.type] = (m[f.type] ?? 0) + 1), m), {});
    res.json({ success: true, data: { items: items.slice(0, 200).map(view), counts, byType, types: FLAG_TYPES, statuses: FLAG_STATUS, findings: FINDINGS,
        can: { scan: hasPermission(req.user, "roll:manage"), decide: hasPermission(req.user, "application:decide"), field: hasPermission(req.user, "verification:field-report") }, store: flags.backend() } });
});

const loadFlag = async (req) => {
    const f = await flags.get(req.params.id);
    if (!f) throw new ApiError(404, "No such flag.");
    assertScope(req, f.jurisdiction, "This flag");
    return f;
};
const step = (f, s, req, extra = {}) => ({ ...f, ...extra, status: s, updatedAt: nowIso(), timeline: [...f.timeline, { step: s, at: nowIso(), by: actorOf(req.user), ...(extra.note ? { note: extra.note } : {}) }] });

export const sendForFieldCheck = asyncHandler(async (req, res) => {
    const updated = await flags.withLock(req.params.id, async () => {
        const f = await loadFlag(req);
        if (!["open", "field_reported"].includes(f.status)) throw new ApiError(409, "This flag is past the field-check stage.");
        const next = step(f, "field_check", req, { fieldCheck: { askedBy: actorOf(req.user), at: nowIso(), note: clean(req.body?.note, 300) || null } });
        await flags.put(next);
        return next;
    });
    await auditChange(req, "roll.flag_field_check", { type: "roll-flag", id: updated._id }, updated.jurisdiction);
    res.json({ success: true, message: "Sent to the BLO for field verification.", data: view(updated) });
});

export const recordFieldFinding = asyncHandler(async (req, res) => {
    const finding = oneOf(req.body?.finding, FINDINGS, "finding");
    const updated = await flags.withLock(req.params.id, async () => {
        const f = await loadFlag(req);
        if (f.status !== "field_check") throw new ApiError(409, "The ERO has not asked for a field check.");
        const next = step(f, "field_reported", req, { fieldReport: { finding, note: requireText(req.body?.note, "What you found", { min: 5, max: 600 }), by: actorOf(req.user), at: nowIso() } });
        await flags.put(next);
        return next;
    });
    await auditChange(req, "roll.flag_field_reported", { type: "roll-flag", id: updated._id }, updated.jurisdiction, { after: { finding } });
    res.json({ success: true, message: "Field report recorded. The ERO decides.", data: view(updated) });
});

export const issueNotice = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const updated = await flags.withLock(req.params.id, async () => {
        const f = await loadFlag(req);
        if (!["open", "field_reported"].includes(f.status)) throw new ApiError(409, "A notice can be issued only before the decision and outside a field check.");
        const epic = clean(b.epic, 20).toUpperCase();
        if (!f.entries.some((x) => x.epic === epic)) throw new ApiError(400, "The notice must be addressed to one of the flagged entries.");
        const hearingOn = dateOf(b.hearingOn, "Hearing date");
        if (hearingOn < todayIST()) throw new ApiError(400, "The hearing date cannot be in the past.");
        const notice = { number: `N/${f.jurisdiction.constituency.slice(0, 3).toUpperCase()}/${Date.now().toString().slice(-6)}`, epic, hearingOn, issuedAt: nowIso(), issuedBy: actorOf(req.user),
            text: `You are asked to appear on ${hearingOn} to show why the entry ${epic} should not be deleted (${FLAG_TYPES[f.type]}).`, delivered: null };
        const next = step(f, "notice_issued", req, { notice });
        await flags.put(next);
        return next;
    });
    await auditChange(req, "roll.notice_issued", { type: "roll-flag", id: updated._id }, updated.jurisdiction, { after: { epic: updated.notice.epic, hearingOn: updated.notice.hearingOn } });
    res.json({ success: true, message: `Notice ${updated.notice.number} issued; the BLO delivers it.`, data: view(updated) });
});

export const recordNoticeDelivery = asyncHandler(async (req, res) => {
    const mode = oneOf(req.body?.mode ?? "in_person", ["in_person", "family_member", "affixed", "post"], "mode");
    const updated = await flags.withLock(req.params.id, async () => {
        const f = await loadFlag(req);
        if (f.status !== "notice_issued") throw new ApiError(409, "There is no notice awaiting delivery.");
        const next = step(f, "notice_delivered", req, { notice: { ...f.notice, delivered: { mode, on: todayIST(), by: actorOf(req.user), note: clean(req.body?.note, 200) || null } } });
        await flags.put(next);
        return next;
    });
    await auditChange(req, "roll.notice_delivered", { type: "roll-flag", id: updated._id }, updated.jurisdiction, { after: { mode } });
    res.json({ success: true, message: "Delivery recorded. The ERO hears the elector on the hearing date.", data: view(updated) });
});

/** The ERO's order after the hearing: keep every entry, or delete one. */
export const decideFlag = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const outcome = oneOf(b.outcome, ["keep_all", "delete_entry"], "outcome");
    const reason = requireText(b.reason, "Reasons for the order", { min: 10, max: 1000 });
    let event = null;
    const updated = await flags.withLock(req.params.id, async () => {
        const f = await loadFlag(req);
        if (f.status === "decided") throw new ApiError(409, "Already decided.");
        let deleted = null;
        if (outcome === "delete_entry") {
            if (f.status !== "notice_delivered") throw new ApiError(409, "An entry is deleted only after the notice is delivered and the elector is heard.");
            if (f.notice.hearingOn > todayIST()) throw new ApiError(409, `The hearing is on ${f.notice.hearingOn}; decide after it.`);
            const elector = await getElectorByEpic(f.notice.epic);
            if (!elector || elector.isActive === false) throw new ApiError(409, "The entry is already deleted.");
            const at = nowIso();
            const tx = transaction();
            saveElector({ ...elector, isActive: false, updatedAt: at, deletion: { form: f.type === "death" ? "Death (BLO report)" : f.type.toUpperCase(), flagId: f._id, reason, orderedBy: req.user.epic, at } }, tx);
            event = recordEvent(opsEvent({ type: "ELECTORAL_ROLL_UPDATED", jurisdiction: areaOfEntry(entryOf(elector)), payload: { change: "deletion", via: f.type }, actor: req.user }), tx);
            await recordAudit(auditEvent({ actor: req.user, action: "elector.deleted", resource: { type: "elector", id: elector.epic }, jurisdiction: areaOfEntry(entryOf(elector)),
                before: { isActive: true }, after: { isActive: false, flagId: f._id, type: f.type }, note: reason }), tx);
            await tx.exec();
            deleted = elector.epic;
        }
        const next = step(f, "decided", req, { decision: { outcome, deleted, reason, by: actorOf(req.user), at: nowIso() } });
        await flags.put(next);
        return next;
    });
    if (event) await publishEvents(event);
    await auditChange(req, `roll.flag_${outcome}`, { type: "roll-flag", id: updated._id }, updated.jurisdiction, { after: { outcome, deleted: updated.decision.deleted }, note: reason });
    res.json({ success: true, message: outcome === "delete_entry" ? `Entry ${updated.decision.deleted} deleted from the roll by order.` : "All entries kept. This group will not be flagged again.", data: view(updated) });
});

export const flagCertificate = asyncHandler(async (req, res) => {
    const f = await loadFlag(req);
    if (!f.certificateCopy) throw new ApiError(404, "No certificate copy was uploaded.");
    res.json({ success: true, data: { dataUrl: f.certificateCopy } });
});
