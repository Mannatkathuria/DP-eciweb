// Service voters and the Electronically Transmitted Postal Ballot System (ETPBS).
//
// Enrolment: the service voter (or their Record Officer) files Form 2, 2A or 3 through the normal
// electoral forms; the Record Officer verifies the service particulars; the ERO decides and the
// entry joins the roll as a service voter (electorCategory "service_voter").
//
// Ballots, for one election and constituency:
//   1. GENERATE   After the list of contesting candidates (Form 7A) is published, the RO
//                 generates one ballot per service voter: the ballot with the candidates, Form 13A
//                 (declaration), 13B (inner cover) and 13C (outer cover). Each ballot has an id and
//                 a PIN; only the PIN's hash is kept with the ballot.
//   2. TRANSMIT   The ballot goes electronically to the unit; the PIN goes separately to the
//                 Record Officer, who passes it to the voter.
//   3. DOWNLOAD   The voter opens the ballot with its id and PIN, prints it, marks it on paper.
//   4. RETURN     The marked ballot goes back by post (free Speed Post; the article number is
//                 recorded so it can be tracked).
//   5. RECEIVE    The RO records its arrival; one arriving after counting of postal ballots
//                 starts is not counted.
//   6. VALIDATE   At counting, the ballot's code is scanned once: Redis refuses a second scan of
//                 the same ballot, and a ballot without a valid Form 13A is rejected.
//
// No vote is cast online: the ballot is marked on paper. Ballots live in MongoDB (`etpb_ballots`);
// PINs awaiting collection and the scan-once guard live in Redis.
import crypto from "crypto";
import { redis } from "../config/redis.js";
import { getContestingList } from "../repositories/election.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
import { rollAreaKey } from "../repositories/rollVersion.repository.js";
import { hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { requireElection, todayIST } from "../services/election.service.js";
import { actorOf, areaOf, assertScope, auditChange, clean, inScope, newId, nowIso, oneOf, page, store } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const ballots = docStore("etpb_ballots");
const eforms = store("eform");
export const BALLOT_STATUS = {
    generated: "Generated", transmitted: "Sent to the unit; PIN with the Record Officer", downloaded: "Downloaded by the service voter", in_post: "Marked ballot in the post",
    received: "Received by the RO", late: "Received after counting began (not counted)", counted: "Validated and counted", rejected: "Rejected at counting"
};
const pinKey = (ballotId) => `etpb:pin:${ballotId}`;
const countedKey = (electionId, ballotId) => `etpb:counted:${electionId}:${ballotId}`;
const PIN_TTL = 60 * 86400;
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const step = (b, status, by, extra = {}) => ({ ...b, ...extra, status, updatedAt: nowIso(), timeline: [...b.timeline, { status, at: nowIso(), by }] });
const view = ({ pinHash, ...b }) => ({ ...b, statusText: BALLOT_STATUS[b.status] }); // eslint-disable-line no-unused-vars

/** RO: generate ballots for every service voter of the constituency. */
export const generateBallots = asyncHandler(async (req, res) => {
    const election = await requireElection(req.params.electionId);
    const area = areaOf(req.body ?? {}, "constituency");
    assertScope(req, area, "This constituency");
    const list = await getContestingList(election._id, rollAreaKey({ ...area, assemblyConstituency: area.constituency }));
    if (!list) throw new ApiError(409, "Publish the list of contesting candidates (Form 7A) first.");
    if (todayIST() >= election.schedule.countingDate) throw new ApiError(409, "Counting has begun; no more postal ballots can be sent.");
    const voters = (await listElectors()).filter((e) => e.isActive !== false && e.electorCategory === "service_voter" && e.state === area.state && e.assemblyConstituency === area.constituency);
    const existing = new Set((await ballots.find({ electionId: election._id, "jurisdiction.constituency": area.constituency, "jurisdiction.state": area.state })).map((b) => b.elector));
    const at = nowIso();
    const fresh = [];
    const pins = [];
    for (const v of voters) {
        if (existing.has(v.epic)) continue;
        const ballotId = crypto.randomBytes(6).toString("hex").toUpperCase();
        const pin = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
        pins.push([ballotId, pin]);
        fresh.push({
            _id: newId(), ballotId, electionId: election._id, electionName: election.name, elector: v.epic, name: v.name, serviceNumber: v.serviceNumber ?? null,
            jurisdiction: area, partNumber: v.partNumber ?? null, candidates: list.candidates.map((c) => ({ serial: c.serial, name: c.name, party: c.party, symbol: c.symbol ?? null })),
            forms: ["13A", "13B", "13C"], pinHash: hash(`${ballotId}:${pin}`), pinCollected: false, status: "generated", post: null, counting: null,
            timeline: [{ status: "generated", at, by: req.user.epic }], createdAt: at
        });
    }
    if (fresh.length) {
        await ballots.insertMany(fresh);
        const tx = redis().multi();
        for (const [id, pin] of pins) tx.set(pinKey(id), pin, { EX: PIN_TTL });
        await tx.exec();
    }
    await auditChange(req, "etpb.generated", { type: "etpb", id: `${election._id}:${area.constituency}` }, area, { after: { generated: fresh.length, serviceVoters: voters.length } });
    res.status(201).json({ success: true, message: `${fresh.length} postal ballot(s) generated for ${voters.length} service voter(s)${existing.size ? ` (${existing.size} already had one)` : ""}.`, data: { generated: fresh.length, serviceVoters: voters.length } });
});

/** RO: transmit generated ballots to the units (PINs go to the Record Officers). */
export const transmitBallots = asyncHandler(async (req, res) => {
    const election = await requireElection(req.params.electionId);
    const area = areaOf(req.body ?? {}, "constituency");
    assertScope(req, area, "This constituency");
    const ready = await ballots.find({ electionId: election._id, status: "generated", "jurisdiction.state": area.state, "jurisdiction.constituency": area.constituency });
    for (const b of ready) await ballots.put(step(b, "transmitted", req.user.epic, { transmittedAt: nowIso() }));
    await auditChange(req, "etpb.transmitted", { type: "etpb", id: `${election._id}:${area.constituency}` }, area, { after: { transmitted: ready.length } });
    res.json({ success: true, message: `${ready.length} ballot(s) transmitted to the units; PINs released to the Record Officers.`, data: { transmitted: ready.length } });
});

/** Record Officer: the PINs of transmitted ballots for voters of their State (each shown until collected). */
export const recordOfficerPins = asyncHandler(async (req, res) => {
    const items = (await ballots.find({ status: { $in: ["transmitted", "downloaded"] } }, { sort: { createdAt: -1 }, limit: 2000 })).filter((b) => inScope(req, { state: b.jurisdiction.state }));
    const out = [];
    for (const b of items) out.push({ ballotId: b.ballotId, elector: b.elector, name: b.name, constituency: b.jurisdiction.constituency, election: b.electionName, status: b.status, statusText: BALLOT_STATUS[b.status],
        pin: b.pinCollected ? null : await redis().get(pinKey(b.ballotId)), pinCollected: b.pinCollected });
    res.json({ success: true, data: { items: out } });
});

export const collectPin = asyncHandler(async (req, res) => {
    const b = await ballots.findOne({ ballotId: clean(req.params.ballotId, 20).toUpperCase() });
    if (!b || !inScope(req, { state: b.jurisdiction.state })) throw new ApiError(404, "No such ballot.");
    await ballots.put({ ...b, pinCollected: true, pinCollectedBy: req.user.epic, pinCollectedAt: nowIso() });
    await redis().del(pinKey(b.ballotId));
    await auditChange(req, "etpb.pin_passed_on", { type: "etpb-ballot", id: b.ballotId }, { state: b.jurisdiction.state });
    res.json({ success: true, message: "PIN marked as passed on to the service voter." });
});

/** Service voter: open the ballot with its id and PIN, to print it. */
export const downloadBallot = asyncHandler(async (req, res) => {
    const ballotId = clean(req.body?.ballotId, 20).toUpperCase();
    const pin = clean(req.body?.pin, 6);
    const b = ballotId ? await ballots.findOne({ ballotId }) : null;
    if (!b || b.pinHash !== hash(`${ballotId}:${pin}`)) throw new ApiError(401, "The ballot id or PIN is not right.");
    if (!["transmitted", "downloaded"].includes(b.status)) throw new ApiError(409, b.status === "generated" ? "This ballot has not been sent yet." : "This ballot has already been returned.");
    if (b.status === "transmitted") await ballots.put(step(b, "downloaded", "service-voter", { downloadedAt: nowIso() }));
    res.json({ success: true, data: { ballotId, election: b.electionName, constituency: b.jurisdiction.constituency, state: b.jurisdiction.state, elector: b.elector, name: b.name, candidates: b.candidates,
        instructions: ["Print the ballot and the three forms.", "Fill in Form 13A (declaration) and have it attested by your commanding officer or another attesting officer.",
            "Mark the ballot with a tick or cross against one candidate. Fold it and put it in Form 13B (inner cover); seal it.", "Put Form 13A and the sealed Form 13B in Form 13C (outer cover) addressed to the Returning Officer.",
            "Post it. Speed Post is free for service voters. It must reach the RO before counting of postal ballots starts."],
        forms: { "13A": "Declaration by the elector", "13B": "Cover A (inner envelope)", "13C": "Cover B (outer envelope addressed to the RO)" } } });
});

/** Service voter or post office: the marked ballot is in the post. */
export const postBallot = asyncHandler(async (req, res) => {
    const ballotId = clean(req.body?.ballotId, 20).toUpperCase();
    const article = clean(req.body?.speedPostNumber, 20).toUpperCase();
    if (!/^[A-Z]{2}\d{9}IN$/.test(article)) throw new ApiError(400, "Give the Speed Post article number (two letters, nine digits, IN), e.g. EK123456789IN.");
    const b = ballotId ? await ballots.findOne({ ballotId }) : null;
    if (!b || b.pinHash !== hash(`${ballotId}:${clean(req.body?.pin, 6)}`)) throw new ApiError(401, "The ballot id or PIN is not right.");
    if (b.status !== "downloaded") throw new ApiError(409, "Only a downloaded ballot can be posted.");
    await ballots.put(step(b, "in_post", "service-voter", { post: { article, postedOn: todayIST(), tracking: [{ at: nowIso(), event: "Booked at the post office" }] } }));
    res.json({ success: true, message: `Recorded. Track article ${article} with India Post.` });
});

/** Public: where a returned ballot is (by ballot id), without any personal details. */
export const trackBallot = asyncHandler(async (req, res) => {
    const b = await ballots.findOne({ ballotId: clean(req.params.ballotId, 20).toUpperCase() });
    if (!b) throw new ApiError(404, "No such ballot.");
    res.json({ success: true, data: { ballotId: b.ballotId, status: b.status, statusText: BALLOT_STATUS[b.status], constituency: b.jurisdiction.constituency, article: b.post?.article ?? null, tracking: b.post?.tracking ?? [], timeline: b.timeline.map((t) => ({ status: t.status, at: t.at })) } });
});

/** RO: a returned ballot arrived. */
export const receiveBallot = asyncHandler(async (req, res) => {
    const updated = await ballots.withLock(req.params.ballotId, async () => {
        const b = await ballots.findOne({ ballotId: clean(req.params.ballotId, 20).toUpperCase() });
        if (!b) throw new ApiError(404, "No such ballot.");
        assertScope(req, b.jurisdiction, "This ballot");
        if (!["in_post", "downloaded", "transmitted"].includes(b.status)) throw new ApiError(409, `This ballot is ${BALLOT_STATUS[b.status].toLowerCase()}.`);
        const election = await requireElection(b.electionId);
        const late = todayIST() > election.schedule.countingDate || (todayIST() === election.schedule.countingDate && req.body?.afterCountingStarted === true);
        const next = step(b, late ? "late" : "received", req.user.epic, { receivedOn: todayIST(), post: b.post ? { ...b.post, tracking: [...b.post.tracking, { at: nowIso(), event: "Delivered to the Returning Officer" }] } : null,
            envelopeIntact: req.body?.envelopeIntact !== false });
        await ballots.put(next);
        return next;
    });
    await auditChange(req, `etpb.${updated.status}`, { type: "etpb-ballot", id: updated.ballotId }, updated.jurisdiction);
    res.json({ success: true, message: updated.status === "late" ? "Received after counting began: kept, but not counted." : "Received. It will be validated at counting.", data: view(updated) });
});

/** RO at counting: scan once; reject without a valid Form 13A. */
export const validateBallot = asyncHandler(async (req, res) => {
    const ballotId = clean(req.params.ballotId, 20).toUpperCase();
    const b = await ballots.findOne({ ballotId });
    if (!b) throw new ApiError(404, "Unknown ballot code: it was not generated by this system.");
    assertScope(req, b.jurisdiction, "This ballot");
    if (!(await redis().set(countedKey(b.electionId, ballotId), req.user.epic, { NX: true }))) throw new ApiError(409, "This ballot has already been scanned at counting. A second copy is rejected.");
    try {
        if (b.status !== "received") throw new ApiError(409, `This ballot is ${BALLOT_STATUS[b.status].toLowerCase()}; only a ballot received in time is counted.`);
        const valid13A = req.body?.form13AValid === true;
        const next = step(b, valid13A && b.envelopeIntact !== false ? "counted" : "rejected", req.user.epic, { counting: { form13AValid: valid13A, reason: valid13A ? null : clean(req.body?.reason, 200) || "Form 13A missing or not attested", at: nowIso() } });
        await ballots.put(next);
        await auditChange(req, `etpb.${next.status}`, { type: "etpb-ballot", id: ballotId }, b.jurisdiction, { after: { form13AValid: valid13A } });
        res.json({ success: true, message: next.status === "counted" ? "Valid: sent to the postal-ballot counting table." : `Rejected: ${next.counting.reason}.`, data: view(next) });
    } catch (err) {
        if (err.statusCode === 409 && !String(err.message).includes("already been scanned")) await redis().del(countedKey(b.electionId, ballotId));
        throw err;
    }
});

export const listBallots = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.electionId) filter.electionId = clean(req.query.electionId, 80);
    if (req.query.status) filter.status = oneOf(req.query.status, BALLOT_STATUS, "status");
    const all = (await ballots.find(filter, { sort: { createdAt: -1 }, limit: 5000 })).filter((b) => inScope(req, b.jurisdiction));
    const counts = all.reduce((m, b) => ((m[b.status] = (m[b.status] ?? 0) + 1), m), {});
    res.json({ success: true, data: { items: page(all, req.query).map(view), counts, statuses: BALLOT_STATUS, can: { manage: hasPermission(req.user, "etpb:manage") }, store: ballots.backend() } });
});

/** Record Officer: service-voter enrolments they filed (Forms 2, 2A, 3) and where each stands with the ERO. */
export const recordOfficerEnrolments = asyncHandler(async (req, res) => {
    const mine = (await eforms.list()).filter((f) => f.category === "service_voter" && (f.submittedBy?.epic === req.user.epic || inScope(req, { state: f.jurisdiction.state })));
    const enrolled = (await listElectors()).filter((e) => e.electorCategory === "service_voter" && e.isActive !== false && inScope(req, { state: e.state }));
    res.json({ success: true, data: { applications: page(mine, req.query, "submittedAt").map((f) => ({ _id: f._id, referenceId: f.referenceId, formCode: f.formCode, name: f.subject?.name ?? null, constituency: f.jurisdiction.constituency,
        status: f.status, submittedAt: f.submittedAt, verifiedByRecordOfficer: f.recordOfficer ?? null, decision: f.decision ? { outcome: f.decision.outcome, epic: f.decision.epic ?? null } : null })),
        enrolled: enrolled.length, byConstituency: enrolled.reduce((m, e) => ((m[e.assemblyConstituency] = (m[e.assemblyConstituency] ?? 0) + 1), m), {}) } });
});

/** Record Officer: confirm the service particulars on a service-voter application (it then goes to the ERO). */
export const verifyServiceParticulars = asyncHandler(async (req, res) => {
    const f = await eforms.get(req.params.formId);
    if (!f || f.category !== "service_voter") throw new ApiError(404, "No such service-voter application.");
    if (!inScope(req, { state: f.jurisdiction.state })) throw new ApiError(403, "This application is for a State you do not cover.");
    if (!["submitted", "field_verification", "field_reported"].includes(f.status)) throw new ApiError(409, "This application is already decided.");
    const serviceNumber = clean(req.body?.serviceNumber, 30);
    if (!serviceNumber) throw new ApiError(400, "Give the service number you checked.");
    const verified = req.body?.verified === true;
    const { transaction } = await import("../config/redis.js");
    const tx = transaction();
    eforms.save({ ...f, recordOfficer: { verified, serviceNumber, note: clean(req.body?.note, 300) || null, by: actorOf(req.user), at: nowIso() }, timeline: [...f.timeline, { step: verified ? "record_officer_verified" : "record_officer_flagged", at: nowIso() }] }, tx);
    await tx.exec();
    await auditChange(req, "service_voter.particulars_checked", { type: "eform", id: f._id }, f.jurisdiction, { after: { verified } });
    res.json({ success: true, message: verified ? "Service particulars verified; the ERO decides." : "Flagged to the ERO: the particulars did not match.", data: { verified } });
});
