// Appeals against the ERO's orders on the roll (RP Act 1950, s. 24; Registration of Electors
// Rules, 1960, rules 23 and 27).
//
//   FIRST APPEAL   to the appellate authority of the district (the District Magistrate / DEO in
//                  this platform's configuration: "appeal:decide-first"), within 15 days of the
//                  ERO's order.
//   SECOND APPEAL  from the first appellate order to the Chief Electoral Officer
//                  ("appeal:decide-second"), within 30 days.
//
// An appellate authority does not edit the roll itself. Allowing an appeal makes an order to the
// ERO of the constituency, who implements it through the roll (and records that they did). Every
// step is audited; the appellant follows the appeal by its reference.
import crypto from "crypto";
import { redis, transaction } from "../config/redis.js";
import { getRegistration } from "../repositories/registration.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { actorOf, asRecord, assertScope, clean, inScope, newId, nowIso, oneOf, page, requireText, store } from "../services/workflow.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const appeals = store("roll-appeal");
const eforms = store("eform");
const refKey = (ref) => `roll-appeal:ref:${ref}`;
const FIRST_DAYS = Number(process.env.APPEAL_FIRST_DAYS ?? 15);
const SECOND_DAYS = Number(process.env.APPEAL_SECOND_DAYS ?? 30);
export const STATUS = {
    first_appeal: "First appeal with the district appellate authority", first_decided: "First appeal decided",
    second_appeal: "Second appeal with the Chief Electoral Officer", second_decided: "Second appeal decided",
    with_ero: "Allowed: order sent to the ERO to implement", implemented: "Implemented by the ERO"
};
const OUTCOMES = { dismissed: "Dismissed: the ERO's order stands", allowed: "Allowed: the ERO is to change the roll as ordered", remanded: "Remanded: the ERO is to decide again after hearing" };

/** The ERO order being appealed, found by the applicant's reference. */
const findOrder = async (ref, dateOfBirth) => {
    const r = clean(ref).toUpperCase();
    if (/^EF\d{4}[0-9A-F]{10}$/.test(r)) {
        const id = await redis().get(`eform:ref:${r}`);
        const f = id ? await eforms.get(id) : null;
        if (!f) return null;
        if (f.fields?.dateOfBirth && dateOfBirth && f.fields.dateOfBirth !== dateOfBirth) return null;
        return { kind: "eform", id: f._id, reference: f.referenceId, title: f.title, status: f.status, decidedAt: f.decision?.at ?? null, reason: f.decision?.reason ?? null, jurisdiction: f.jurisdiction, applicant: f.subject?.name ?? null };
    }
    const reg = await getRegistration(clean(ref));
    if (!reg) return null;
    if (reg.dateOfBirth && String(reg.dateOfBirth).slice(0, 10) !== clean(dateOfBirth)) return null;
    return { kind: "form6", id: reg._id, reference: reg._id, title: "Form 6: inclusion in the roll", status: reg.status, decidedAt: reg.decidedAt ?? null, reason: reg.decisionNote ?? null,
        jurisdiction: { state: reg.state, district: reg.district, constituency: reg.assemblyConstituency }, applicant: reg.name };
};

const view = (a) => ({ ...a, statusText: STATUS[a.status], outcomes: OUTCOMES });
const publicView = (a) => ({ referenceId: a.referenceId, status: a.status, statusText: STATUS[a.status], order: { title: a.order.title, reference: a.order.reference, constituency: a.order.jurisdiction.constituency },
    filedAt: a.filedAt, first: a.first ? { outcome: a.first.outcome, outcomeText: OUTCOMES[a.first.outcome], reason: a.first.reason, at: a.first.at } : null,
    second: a.second ? { outcome: a.second.outcome, outcomeText: OUTCOMES[a.second.outcome], reason: a.second.reason, at: a.second.at } : null, implementation: a.implementation ? { at: a.implementation.at, note: a.implementation.note } : null });

/** Anyone affected by the ERO's order: file the first appeal. */
export const fileAppeal = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const order = await findOrder(b.reference, clean(b.dateOfBirth));
    if (!order) throw new ApiError(404, "No decided application matches that reference (and date of birth).");
    if (!["approved", "rejected"].includes(order.status) || !order.decidedAt) throw new ApiError(409, "Only an order the ERO has made can be appealed.");
    if (Date.now() > Date.parse(order.decidedAt) + FIRST_DAYS * 86400000) throw new ApiError(409, `A first appeal is made within ${FIRST_DAYS} days of the ERO's order.`);
    if ((await appeals.list()).some((a) => a.order.id === order.id && a.status !== "implemented" && !["first_decided", "second_decided"].includes(a.status))) throw new ApiError(409, "An appeal against this order is already pending.");
    const at = nowIso();
    const a = {
        _id: newId(), referenceId: `AP${new Date().getUTCFullYear()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`, order, jurisdiction: order.jurisdiction,
        appellant: { name: requireText(b.name ?? order.applicant, "Appellant's name", { min: 2, max: 120 }), mobile: /^[6-9]\d{9}$/.test(clean(b.mobile)) ? clean(b.mobile) : null, epic: req.user?.epic ?? null },
        grounds: requireText(b.grounds, "Grounds of appeal", { min: 20, max: 3000 }), status: "first_appeal", filedAt: at, first: null, second: null, implementation: null,
        timeline: [{ step: "first_appeal", at }]
    };
    const tx = transaction();
    appeals.save(a, tx);
    tx.set(refKey(a.referenceId), a._id);
    await recordAudit(auditEvent({ actor: req.user ?? null, action: "appeal.filed", resource: { type: "roll_appeal", id: a._id }, jurisdiction: asRecord(a.jurisdiction), after: { order: order.reference, kind: order.kind } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: "First appeal filed with the district appellate authority.", data: publicView(a) });
});

export const trackAppeal = asyncHandler(async (req, res) => {
    const id = await redis().get(refKey(clean(req.params.ref).toUpperCase()));
    const a = id ? await appeals.get(id) : null;
    if (!a) throw new ApiError(404, "No appeal was found with that reference.");
    res.json({ success: true, data: publicView(a) });
});

/** Appellant: take a decided first appeal to the CEO. */
export const secondAppeal = asyncHandler(async (req, res) => {
    const id = await redis().get(refKey(clean(req.params.ref).toUpperCase()));
    const result = await appeals.withLock(id ?? "none", async () => {
        const a = id ? await appeals.get(id) : null;
        if (!a) throw new ApiError(404, "No appeal was found with that reference.");
        if (a.status !== "first_decided") throw new ApiError(409, "A second appeal lies only from a decided first appeal.");
        if (Date.now() > Date.parse(a.first.at) + SECOND_DAYS * 86400000) throw new ApiError(409, `A second appeal is made within ${SECOND_DAYS} days of the first appellate order.`);
        const at = nowIso();
        const updated = { ...a, status: "second_appeal", secondGrounds: requireText(req.body?.grounds, "Grounds of the second appeal", { min: 20, max: 3000 }), timeline: [...a.timeline, { step: "second_appeal", at }] };
        const tx = transaction();
        appeals.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user ?? null, action: "appeal.second_filed", resource: { type: "roll_appeal", id: a._id }, jurisdiction: asRecord(a.jurisdiction) }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: publicView(result) });
});

export const listAppeals = asyncHandler(async (req, res) => {
    const items = (await appeals.list()).filter((a) => inScope(req, a.jurisdiction)).filter((a) => !req.query.status || a.status === req.query.status);
    res.json({ success: true, data: { items: page(items, req.query, "filedAt").map(view), outcomes: OUTCOMES, statusText: STATUS,
        can: { first: hasPermission(req.user, "appeal:decide-first"), second: hasPermission(req.user, "appeal:decide-second"), implement: hasPermission(req.user, "application:decide") } } });
});

const act = (action, fn) => asyncHandler(async (req, res) => {
    const result = await appeals.withLock(req.params.id, async () => {
        const a = await appeals.get(req.params.id);
        if (!a) throw new ApiError(404, "Appeal not found.");
        assertScope(req, a.jurisdiction, "This appeal");
        const updated = fn(a, req);
        const tx = transaction();
        appeals.save(updated, tx);
        await recordAudit(auditEvent({ actor: req.user, action, resource: { type: "roll_appeal", id: a._id }, jurisdiction: asRecord(a.jurisdiction), before: { status: a.status }, after: { status: updated.status } }), tx);
        await tx.exec();
        return updated;
    });
    res.json({ success: true, data: view(result) });
});

const decision = (req) => ({ outcome: oneOf(req.body?.outcome, OUTCOMES, "outcome"), reason: requireReason(req.body?.reason, "appellate order"), hearingDate: clean(req.body?.hearingDate, 10) || null, by: actorOf(req.user), at: nowIso() });

/** District appellate authority: decide the first appeal after hearing. */
export const decideFirst = act("appeal.first_decided", (a, req) => {
    if (a.status !== "first_appeal") throw new ApiError(409, "This appeal is not awaiting the first appellate order.");
    const d = decision(req);
    return { ...a, first: d, status: d.outcome === "dismissed" ? "first_decided" : "with_ero", timeline: [...a.timeline, { step: `first_${d.outcome}`, at: d.at }] };
});

/** CEO: decide the second appeal. */
export const decideSecond = act("appeal.second_decided", (a, req) => {
    if (a.status !== "second_appeal") throw new ApiError(409, "This appeal is not with the CEO.");
    const d = decision(req);
    return { ...a, second: d, status: d.outcome === "dismissed" ? "second_decided" : "with_ero", timeline: [...a.timeline, { step: `second_${d.outcome}`, at: d.at }] };
});

/** ERO: record that the appellate order was carried out in the roll. */
export const implementAppeal = act("appeal.implemented", (a, req) => {
    if (a.status !== "with_ero") throw new ApiError(409, "There is no appellate order to implement.");
    const note = requireText(req.body?.note, "What was done in the roll", { min: 10, max: 1000 });
    const at = nowIso();
    return { ...a, status: "implemented", implementation: { note, by: actorOf(req.user), at }, timeline: [...a.timeline, { step: "implemented", at }] };
});

export const listAllAppeals = () => appeals.list();
