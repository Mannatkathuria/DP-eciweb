import crypto from "crypto";
import { jsonGet, redis, transaction } from "../config/redis.js";
import { getDevice, lockDevice, saveDevice } from "../repositories/device.repository.js";
import { listPollCases, listRegister, votedAt } from "../repositories/poll.repository.js";
import { todayIST } from "../services/election.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { opsEvent, publishEvents, recordEvent } from "../services/events.service.js";
import { sealPackage, signingKeys } from "../services/stationPackage.service.js";
import { verifiedDevice } from "./device.controller.js";
import { BLOCKING, ID_DOCUMENTS, ageOf, markVoterAtStation, partWithSerials, stationContext, stationRecord } from "./pollDay.controller.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Offline poll day. A registered device downloads its station's signed, encrypted package, works
// from it while the connection is down, keeps each mark in an outbox with an idempotency key,
// and sends the outbox here when it reconnects. The server stays the record: every event is
// checked again, a repeated event is answered with its first result, and a mark that clashes
// with the register (the elector was already marked elsewhere) is kept as a conflict for the
// presiding officer, never written over.

const MAX_EVENTS = 500;
const SKEW_MS = 5 * 60 * 1000;
const RESULT_TTL = 14 * 86400;
const resultKey = (deviceId, key) => `sync:result:${deviceId}:${key}`;
const conflictKey = (id) => `sync:conflict:${id}`;
const conflictsKey = (electionId, stationId) => `sync:conflicts:${electionId}:${stationId}`;

export const publicKey = asyncHandler(async (req, res) => {
    const { publicKeyRaw, keyId } = await signingKeys();
    res.json({ success: true, data: { algorithm: "Ed25519", keyId, publicKey: publicKeyRaw } });
});

const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

export const downloadPackage = asyncHandler(async (req, res) => {
    const device = await verifiedDevice(req);
    const { station, election } = await stationContext({ ...req, query: { ...req.query, stationId: device.stationId } });
    const until = dayDiff(election.schedule.pollDate, todayIST());
    if (until < 0 || until > 1) throw new ApiError(409, `Station packages can be downloaded on the day before the poll and on poll day (${election.schedule.pollDate}).`);
    const { part, serial } = await partWithSerials(station);
    const cases = await listPollCases(election._id, station._id);
    const voted = new Set((await listRegister(election._id, station._id)).map((r) => r.epic));
    for (const e of part) if (!voted.has(e.epic) && await votedAt(election._id, e.epic)) voted.add(e.epic);
    // Only what the polling party needs to find and mark an elector: no dates of birth, addresses or contact details.
    const body = {
        station: { _id: station._id, name: station.name, partNumber: station.partNumber, constituency: station.constituency, district: station.district, state: station.state },
        election: { _id: election._id, name: election.name, pollDate: election.schedule.pollDate },
        electors: part.map((e) => ({ epic: e.epic, name: e.name, age: ageOf(e.dateOfBirth), gender: e.gender, serial: serial.get(e.epic),
            relativeName: e.relativeName ?? null, relationType: e.relationType ?? null, houseNumber: e.houseNumber ?? null })),
        voted: [...voted],
        blocked: [...new Set(cases.filter((c) => BLOCKING.includes(c.type) && (c.status === "open" || ["refused", "upheld"].includes(c.decision))).map((c) => c.epic))],
        idDocuments: ID_DOCUMENTS
    };
    const sealed = await sealPackage({ body, device, electionId: election._id, expiresAt: new Date(`${election.schedule.pollDate}T23:59:59+05:30`).toISOString() });
    const release = await lockDevice(device._id);
    try {
        const fresh = (await getDevice(device._id)) ?? device;
        const tx = transaction();
        saveDevice({ ...fresh, lastPackage: { packageId: sealed.manifest.packageId, version: sealed.manifest.version, at: sealed.manifest.issuedAt, electors: body.electors.length } }, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "device.package_issued", resource: { type: "device", id: device._id }, jurisdiction: stationRecord(station),
            after: { packageId: sealed.manifest.packageId, version: sealed.manifest.version, electors: body.electors.length } }), tx);
        await tx.exec();
    } finally { if (release) await release(); }
    res.json({ success: true, data: sealed });
});

const checkEvent = (e, device) => {
    const key = String(e?.idempotencyKey ?? "");
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) return { error: "Each record needs an idempotency key (8 to 100 letters, digits, - or _)." };
    if (e.type !== "mark") return { key, error: "Unknown record type." };
    const epic = String(e.epic ?? "").trim().toUpperCase();
    if (!epic) return { key, error: "The record has no EPIC number." };
    if (!ID_DOCUMENTS[e.idDocument]) return { key, error: "The record does not say which identity document was shown." };
    if (e.checks?.photoMatches !== true || e.checks?.inkApplied !== true) return { key, error: "The guided checks were not completed for this record." };
    const at = Date.parse(e.actedAt);
    if (!Number.isFinite(at) || at > Date.now() + SKEW_MS || at < Date.parse(device.registeredAt) - SKEW_MS) return { key, error: "The time on this record is not valid." };
    return { key, epic, idDocument: e.idDocument, actedAt: new Date(at).toISOString() };
};

export const sync = asyncHandler(async (req, res) => {
    const device = await verifiedDevice(req);
    const { station, election } = await stationContext({ ...req, query: { ...req.query, stationId: device.stationId } });
    const events = Array.isArray(req.body?.events) ? req.body.events : null;
    if (!events) throw new ApiError(400, "events must be a list.");
    if (events.length > MAX_EVENTS) throw new ApiError(413, `Send at most ${MAX_EVENTS} records at a time.`);
    const results = []; const counts = { accepted: 0, duplicate: 0, conflict: 0, rejected: 0, retry: 0 };
    const conflicts = [];

    for (const raw of events) {
        const ev = checkEvent(raw, device);
        if (ev.error) { counts.rejected += 1; results.push({ idempotencyKey: ev.key ?? null, status: "rejected", message: ev.error }); continue; }
        const rk = resultKey(device._id, ev.key);
        // Claim the key; a key already answered gets its first answer again.
        if ((await redis().set(rk, JSON.stringify({ status: "processing" }), { NX: true, EX: 60 })) !== "OK") {
            const prior = await jsonGet(rk);
            if (prior?.status === "processing") { counts.retry += 1; results.push({ idempotencyKey: ev.key, status: "retry", message: "This record is being processed. Send it again shortly." }); continue; }
            counts.duplicate += 1; results.push({ ...prior, idempotencyKey: ev.key, duplicate: true }); continue;
        }
        let result;
        try {
            const entry = await markVoterAtStation({ user: req.user, station, election, epic: ev.epic, idDocument: ev.idDocument, actedAt: ev.actedAt, idempotencyKey: `sync:${device._id}:${ev.key}`, deviceId: device._id });
            if (!entry) { await redis().del(rk); counts.retry += 1; results.push({ idempotencyKey: ev.key, status: "retry", message: "The station register is busy." }); continue; }
            result = { status: "accepted", serial: entry.serial, epic: ev.epic };
        } catch (err) {
            if (!(err instanceof ApiError)) { await redis().del(rk); throw err; }
            const already = /already been marked/.test(err.message);
            const blocked = /doubt or challenge|may not vote/.test(err.message);
            if (already || blocked) {
                // Kept for the presiding officer; the register is not changed.
                const existing = already ? (await listRegister(election._id, station._id)).find((r) => r.epic === ev.epic) ?? { elsewhere: await votedAt(election._id, ev.epic) } : null;
                const conflict = {
                    _id: crypto.randomUUID(), electionId: election._id, stationId: station._id, epic: ev.epic, kind: already ? "already_marked" : "blocked_by_case",
                    offline: { actedAt: ev.actedAt, by: req.user.epic, deviceId: device._id, deviceLabel: device.label, idDocument: ev.idDocument, idempotencyKey: ev.key },
                    existing: existing ? { serial: existing.serial ?? null, at: existing.actedAt ?? existing.at ?? null, by: existing.by ?? null, deviceId: existing.deviceId ?? null, otherStation: existing.elsewhere && existing.elsewhere !== station._id ? true : undefined } : null,
                    message: err.message, status: "open", createdAt: new Date().toISOString()
                };
                conflicts.push(conflict);
                result = { status: "conflict", epic: ev.epic, conflictId: conflict._id, message: err.message };
            } else {
                result = { status: "rejected", epic: ev.epic, message: err.message };
            }
        }
        counts[result.status] += 1;
        await redis().set(rk, JSON.stringify(result), { EX: RESULT_TTL });
        results.push({ idempotencyKey: ev.key, ...result });
    }

    const at = new Date().toISOString();
    const tx = transaction();
    for (const c of conflicts) { tx.set(conflictKey(c._id), JSON.stringify(c)); tx.sAdd(conflictsKey(election._id, station._id), c._id); }
    const fresh = (await getDevice(device._id)) ?? device;
    saveDevice({ ...fresh, lastSync: { at, ...counts, packageVersion: String(req.body?.packageVersion ?? "").slice(0, 40) || null } }, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "device.synced", resource: { type: "device", id: device._id }, jurisdiction: stationRecord(station), after: counts }), tx);
    const liveEvents = events.length ? [recordEvent(opsEvent({ type: counts.rejected && !counts.accepted && !counts.duplicate ? "SYNC_FAILED" : "SYNC_COMPLETED", jurisdiction: stationRecord(station),
        electionId: election._id, stationId: station._id, payload: { deviceId: device._id, ...counts }, actor: req.user }), tx)] : [];
    if (conflicts.length) liveEvents.push(recordEvent(opsEvent({ type: "EXCEPTION_CREATED", jurisdiction: stationRecord(station), electionId: election._id, stationId: station._id,
        payload: { kind: "offline_conflict", count: conflicts.length }, actor: req.user }), tx));
    await tx.exec();
    await publishEvents(liveEvents);
    const voted = (await listRegister(election._id, station._id)).map((r) => r.epic);
    res.json({ success: true, data: { results, counts, voted, serverTime: at } });
});

export const listConflicts = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const ids = await redis().sMembers(conflictsKey(election._id, station._id));
    const items = (await Promise.all(ids.map((id) => jsonGet(conflictKey(id))))).filter(Boolean).sort((a, b) => (a.status === "resolved") - (b.status === "resolved") || a.createdAt.localeCompare(b.createdAt));
    res.json({ success: true, data: { items } });
});

const DECISIONS = {
    duplicate_confirmed: "The same voter was recorded twice; the first record stands",
    tendered_vote: "A different person voted in this elector's name; a tendered vote is recorded",
    referred: "Referred to the Returning Officer"
};
export const resolveConflict = asyncHandler(async (req, res) => {
    const { station, election } = await stationContext(req);
    const conflict = await jsonGet(conflictKey(req.params.id));
    if (!conflict || conflict.stationId !== station._id || conflict.electionId !== election._id) throw new ApiError(404, "Conflict not found at your station.");
    if (conflict.status === "resolved") throw new ApiError(409, "This conflict has already been resolved.");
    const decision = String(req.body?.decision ?? "");
    if (!DECISIONS[decision]) throw new ApiError(400, `decision must be one of ${Object.keys(DECISIONS).join(", ")}.`);
    const note = requireReason(req.body?.note, "resolution");
    const updated = { ...conflict, status: "resolved", decision, decisionText: DECISIONS[decision], note, resolvedBy: req.user.epic, resolvedAt: new Date().toISOString() };
    const tx = transaction();
    tx.set(conflictKey(conflict._id), JSON.stringify(updated));
    await recordAudit(auditEvent({ actor: req.user, action: "poll.sync_conflict_resolved", resource: { type: "sync_conflict", id: conflict._id }, jurisdiction: stationRecord(station), after: { decision, epic: conflict.epic }, note }), tx);
    const ev = recordEvent(opsEvent({ type: "EXCEPTION_RESOLVED", jurisdiction: stationRecord(station), electionId: election._id, stationId: station._id, payload: { kind: "offline_conflict", decision }, actor: req.user }), tx);
    await tx.exec();
    await publishEvents(ev);
    res.json({ success: true, data: updated });
});
