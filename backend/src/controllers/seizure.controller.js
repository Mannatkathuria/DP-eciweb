// Election Seizure Management System (ESMS): every interception and seizure by the enforcement
// agencies, in one register, so the CEO and the Commission see inducements as they happen.
//
//   RECORD     A flying squad, static surveillance team, the police or another agency (excise,
//              income tax, NCB, customs, DRI, GST, RPF) records a seizure from the field report /
//              panchnama: what, how much, its value, where, the document number. The same agency
//              and document number cannot be entered twice, so a seizure reported both through
//              cVIGIL and directly is counted once.
//   FROM cVIGIL  Seizures in a flying squad's cVIGIL field report are entered here automatically.
//   RELEASE    The district grievance committee may release cash on proof of its source, with
//              the order reference.
//   ANALYSE    Totals by kind, agency and district, and by day.
//
// A seizure is not a finding that a candidate broke the law. MongoDB is the system of record.
import { hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { actorOf, amountOf, areaOf, assertScope, auditChange, clean, dateOf, inScope, newId, nowIso, oneOf, page, requireText } from "../services/workflow.service.js";
import { todayIST } from "../services/election.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const seizures = docStore("seizures", { textFields: ["description", "place", "documentRef"] });
export const AGENCIES = { fst: "Flying squad (FST)", sst: "Static surveillance team (SST)", police: "State police", excise: "State excise", income_tax: "Income Tax Department", ncb: "Narcotics Control Bureau", customs: "Customs", dri: "Directorate of Revenue Intelligence", gst: "GST authorities", rpf: "Railway Protection Force" };
export const KINDS = { cash: "Cash", liquor: "Liquor", drugs: "Drugs and narcotics", precious_metals: "Precious metals", freebies: "Freebies and other items", other: "Other" };
export const UNITS = { rupees: "₹", litres: "litres", kg: "kg", grams: "grams", pieces: "pieces" };
const UNIT_OF = { cash: "rupees", liquor: "litres", drugs: "kg", precious_metals: "grams", freebies: "pieces", other: "pieces" };

/** Called after a flying squad's cVIGIL field report: its seizures join the register. */
export const recordComplaintSeizures = async (req, complaint) => {
    const list = complaint?.seizures ?? [];
    if (!list.length) return 0;
    const docs = list.map((s, i) => ({
        _id: newId(), agency: "fst", kind: s.kind === "precious_metals" ? "precious_metals" : KINDS[s.kind] ? s.kind : "other", quantity: s.kind === "cash" ? s.value : null, unit: UNIT_OF[s.kind] ?? "pieces",
        value: s.value, description: s.description ?? `From cVIGIL complaint ${complaint.referenceId}`, place: complaint.place ?? null, documentRef: `${complaint.referenceId}-${i + 1}`,
        interceptedOn: String(s.at ?? nowIso()).slice(0, 10), jurisdiction: complaint.jurisdiction, linkedComplaint: complaint.referenceId, source: "cvigil",
        status: "seized", by: actorOf(req.user), createdAt: nowIso()
    }));
    await seizures.insertMany(docs);
    await auditChange(req, "seizure.recorded_from_cvigil", { type: "mcc-complaint", id: complaint._id }, complaint.jurisdiction, { after: { count: docs.length, value: docs.reduce((n, d) => n + d.value, 0) } });
    return docs.length;
};

export const recordSeizure = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const area = areaOf(b, "constituency");
    assertScope(req, area, "This constituency");
    const kind = oneOf(b.kind, KINDS, "kind");
    const quantity = b.quantity === undefined || b.quantity === "" ? null : Number(b.quantity);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) throw new ApiError(400, "Quantity must be a positive number.");
    const interceptedOn = dateOf(b.interceptedOn ?? todayIST(), "Date of interception");
    if (interceptedOn > todayIST()) throw new ApiError(400, "The date cannot be in the future.");
    const doc = {
        _id: newId(), agency: oneOf(b.agency, AGENCIES, "agency"), kind, quantity, unit: oneOf(b.unit ?? UNIT_OF[kind], UNITS, "unit"), value: amountOf(b.value, "Estimated value"),
        description: requireText(b.description, "Description", { min: 5, max: 600 }), place: requireText(b.place, "Place", { min: 3, max: 200 }),
        documentRef: requireText(b.documentRef, "Panchnama / FIR / seizure memo number", { min: 3, max: 60 }).toUpperCase(), interceptedOn, jurisdiction: area,
        vehicle: clean(b.vehicle, 20).toUpperCase() || null, personsDetained: Math.max(0, Math.round(Number(b.personsDetained) || 0)), linkedComplaint: clean(b.linkedComplaint, 40) || null,
        source: "direct", status: "seized", by: actorOf(req.user), createdAt: nowIso()
    };
    await seizures.insert(doc, `This ${AGENCIES[doc.agency]} document (${doc.documentRef}) is already in the register.`);
    await auditChange(req, "seizure.recorded", { type: "seizure", id: doc._id }, area, { after: { agency: doc.agency, kind, value: doc.value } });
    res.status(201).json({ success: true, message: `Seizure recorded: ${KINDS[kind]} worth ₹${doc.value.toLocaleString("en-IN")}.`, data: doc });
});

export const releaseSeizure = asyncHandler(async (req, res) => {
    const updated = await seizures.withLock(req.params.id, async () => {
        const s = await seizures.get(req.params.id);
        if (!s) throw new ApiError(404, "No such seizure.");
        assertScope(req, s.jurisdiction, "This seizure");
        if (s.status !== "seized") throw new ApiError(409, "Already released.");
        const next = { ...s, status: "released", release: { order: requireText(req.body?.order, "Committee order number", { min: 3, max: 60 }), reason: requireText(req.body?.reason, "Reason", { min: 10, max: 600 }), by: actorOf(req.user), at: nowIso() } };
        await seizures.put(next);
        return next;
    });
    await auditChange(req, "seizure.released", { type: "seizure", id: updated._id }, updated.jurisdiction, { after: { order: updated.release.order } });
    res.json({ success: true, message: "Released by the committee's order.", data: updated });
});

const sumBy = (list, key) => list.reduce((m, s) => { const k = typeof key === "function" ? key(s) : s[key]; m[k] = Math.round(((m[k] ?? 0) + s.value) * 100) / 100; return m; }, {});

export const listSeizures = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.kind) filter.kind = oneOf(req.query.kind, KINDS, "kind");
    if (req.query.agency) filter.agency = oneOf(req.query.agency, AGENCIES, "agency");
    const all = (await seizures.find(filter, { q: clean(req.query.q, 80) || null, sort: { interceptedOn: -1, createdAt: -1 }, limit: 5000 })).filter((s) => inScope(req, s.jurisdiction));
    const held = all.filter((s) => s.status === "seized");
    const national = (req.authority?.assignments ?? []).some((a) => a.nationwide);
    const level = national ? "state" : all.every((s) => s.jurisdiction.district === all[0]?.jurisdiction.district) ? "constituency" : "district";
    res.json({ success: true, data: {
        items: page(all, req.query, "interceptedOn"), total: Math.round(held.reduce((n, s) => n + s.value, 0)), count: all.length, released: all.filter((s) => s.status === "released").length,
        byKind: sumBy(held, "kind"), byAgency: sumBy(held, "agency"), byArea: sumBy(held, (s) => s.jurisdiction[level] ?? "—"), areaLevel: level, byDay: sumBy(held, "interceptedOn"),
        fromCvigil: all.filter((s) => s.source === "cvigil").length,
        lists: { agencies: AGENCIES, kinds: KINDS, units: UNITS }, can: { record: hasPermission(req.user, "seizure:record"), release: hasPermission(req.user, "seizure:release") }, store: seizures.backend()
    } });
});
