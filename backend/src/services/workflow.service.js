// Small shared helpers for the case-style workflows (elector forms, campaign permissions,
// expenditure, observer reports, directions, security, logistics and nodal work).
//
// Every record carries the jurisdiction it belongs to (state, district, constituency), and every
// read and write checks it against the caller's assignments. Records are stored as JSON under
// `<kind>:<id>` with the ids in the set `<kind>:all`.
import crypto from "crypto";
import { acquireLock, jsonGet, redis } from "../config/redis.js";
import { listElections } from "../repositories/election.repository.js";
import { coversAny, validateJurisdiction } from "./authority.service.js";
import { assignmentInElection } from "./election.service.js";
import { ApiError } from "../utils/ApiErrors.js";

export const clean = (v, max = 500) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
export const norm = (v) => clean(v).toLowerCase();
export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

/** A tiny repository for one kind of record. */
export const store = (kind) => {
    const key = (id) => `${kind}:${id}`;
    const setKey = `${kind}:all`;
    return {
        get: (id) => jsonGet(key(String(id ?? ""))),
        save: (doc, tx) => { tx.set(key(doc._id), JSON.stringify(doc)); tx.sAdd(setKey, doc._id); return doc; },
        list: async () => (await Promise.all((await redis().sMembers(setKey)).map((id) => jsonGet(key(id))))).filter(Boolean),
        withLock: async (id, fn) => {
            const release = await acquireLock(`${kind}:lock:${id}`, 15);
            if (!release) throw new ApiError(409, "This record is being updated. Try again in a moment.");
            try { return await fn(); } finally { await release(); }
        }
    };
};

/** The record form the authority service understands. */
export const asRecord = (area = {}) => ({ ...area, assemblyConstituency: area.constituency ?? area.assemblyConstituency });

/** Does one of the caller's assignments cover this record? */
export const inScope = (req, area) => coversAny(req.authority?.assignments ?? [], asRecord(area));
export const assertScope = (req, area, what = "This record") => {
    if (!inScope(req, area)) throw new ApiError(403, `${what} is outside your assigned jurisdiction.`);
};

/**
 * A State/UT, district and (optionally) assembly constituency checked against the ECI dataset.
 * `level` is the narrowest field required: "constituency", "district" or "state".
 */
export const areaOf = (body = {}, level = "constituency") => {
    const role = level === "constituency" ? "ero" : level === "district" ? "deo" : "ceo";
    const j = validateJurisdiction(role, body);
    const out = { state: j.state };
    if (j.district) out.district = j.district;
    if (j.constituency) out.constituency = j.constituency;
    return out;
};

/** Text that must be present, with a length range. */
export const requireText = (value, label, { min = 3, max = 1000 } = {}) => {
    const text = clean(value, max + 1);
    if (text.length < min) throw new ApiError(400, `${label} must be at least ${min} characters.`);
    if (text.length > max) throw new ApiError(400, `${label} must be ${max} characters or fewer.`);
    return text;
};

export const oneOf = (value, allowed, label) => {
    const v = clean(value);
    const keys = Array.isArray(allowed) ? allowed : Object.keys(allowed);
    if (!keys.includes(v)) throw new ApiError(400, `${label} must be one of: ${keys.join(", ")}.`);
    return v;
};

/** The caller's first assignment (optionally of a role) and the election it names, if any. */
export const primaryAssignment = (req, roles = null) =>
    (req.authority?.assignments ?? []).find((a) => !roles || roles.includes(a.role)) ?? null;

export const electionFor = async (assignment) => {
    if (!assignment?.election) return null;
    return (await listElections()).find((e) => e._id === assignment.election || e.name === assignment.election) ?? null;
};

/** Assignments of the caller that belong to an election. */
export const assignmentsInElection = (req, election) =>
    (req.authority?.assignments ?? []).filter((a) => assignmentInElection(a, election));

/** Who acted, as stored on a record. */
export const actorOf = (user) => ({ epic: user.epic, name: user.name ?? null, role: user.role });

/** Paging of an already-filtered list (newest first by default). */
export const page = (items, query = {}, field = "createdAt") => {
    const sorted = [...items].sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")));
    const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit, 10) || 100));
    return sorted.slice(0, limit);
};

/** A positive amount of rupees, whole or with paise. */
export const amountOf = (value, label = "Amount") => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 1e10) throw new ApiError(400, `${label} must be a positive number of rupees.`);
    return Math.round(n * 100) / 100;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const dateOf = (value, label = "Date") => {
    const v = clean(value);
    if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new ApiError(400, `${label} must be a date (YYYY-MM-DD).`);
    return v;
};
