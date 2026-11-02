// Authority = permission (what a role may do) + jurisdiction (where its assignment applies).
//
// A dashboard showing a record never implies the right to act on it: every write endpoint asks
// both questions on the server, for the record it is about to change.
import { ROLE_BY_ID, permissionsFor } from "../config/roles.js";
import { geography } from "../data/geography.js";
import { listAssignmentsForUser } from "../repositories/assignment.repository.js";
import { ApiError } from "../utils/ApiErrors.js";

// Jurisdiction fields, broadest first. `partNumber` is a booth detail, never a matching field.
export const JURISDICTION_FIELDS = ["state", "district", "constituency", "pollingStation"];

const norm = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Roles whose scope is the whole country (ECI, CEC, ECs) cover every record. */
const isNationwide = (roleId) => {
    const role = ROLE_BY_ID[roleId === "admin" ? "blo" : roleId];
    return Boolean(role && role.level === 1 && role.scope.length === 0);
};

export const hasPermission = (user, permission) => permissionsFor(user?.role).includes(permission);

/** The jurisdiction a record (application, elector, change request) belongs to. */
export const recordJurisdiction = (record) => ({
    state: record?.state,
    district: record?.district,
    constituency: record?.assemblyConstituency ?? record?.constituency,
    pollingStation: record?.pollingStation
});

/**
 * Does one assignment cover a record? Every field the assignment sets must match the record.
 * A polling-station assignment still covers a record that has no polling station yet (a new
 * Form 6 application only names the constituency); the booth is fixed during field verification.
 */
export const covers = (assignment, record) => {
    if (assignment?.nationwide) return true;
    const target = recordJurisdiction(record);
    const scope = assignment?.jurisdiction ?? {};
    const fields = JURISDICTION_FIELDS.filter((f) => norm(scope[f]));
    if (!fields.length) return false; // an empty, non-national assignment covers nothing
    return fields.every((f) => {
        if (f === "pollingStation" && !norm(target.pollingStation)) return true;
        return norm(scope[f]) === norm(target[f]);
    });
};

export const coversAny = (assignments, record) => assignments.some((a) => covers(a, record));

/**
 * The assignments that currently apply to an account: its active stored assignments for the role
 * it holds now. Seeded demo accounts that only carry a `jurisdiction` on their profile are treated
 * as holding that one assignment. National roles always cover the whole country.
 */
export const effectiveAssignments = async (user) => {
    if (!user) return [];
    if (isNationwide(user.role)) return [{ role: user.role, nationwide: true, jurisdiction: {}, source: "role" }];
    const stored = (await listAssignmentsForUser(user._id))
        .filter((a) => a.status === "active" && a.role === (user.role === "admin" ? "blo" : user.role));
    if (stored.length) return stored;
    if (user.jurisdiction && Object.keys(user.jurisdiction).length) {
        return [{ role: user.role, jurisdiction: user.jurisdiction, source: "profile" }];
    }
    return [];
};

/** Throws 403 unless one of the caller's assignments covers the record. */
export const assertCovers = (assignments, record, what = "this record") => {
    if (!coversAny(assignments, record)) {
        throw new ApiError(403, `${what} is outside your assigned jurisdiction.`);
    }
};

/** The booth (part number + polling station) a BLO assignment fixes, if it names one. */
export const boothFromAssignments = (assignments, record) => {
    const match = assignments.find((a) => covers(a, record) && a.jurisdiction?.pollingStation);
    return match ? { partNumber: match.jurisdiction.partNumber ?? null, pollingStation: match.jurisdiction.pollingStation } : null;
};

// ---- Validating a jurisdiction for a new assignment ----

const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const findCI = (list, name) => list.find((item) => norm(item) === norm(name));

/**
 * Checks that a jurisdiction carries what the role's scope requires and names a real
 * State/UT, district and constituency from the ECI dataset. Returns the jurisdiction with the
 * dataset's official spelling. Below national level the State/UT is always required, because
 * district and constituency names repeat across states.
 */
export const validateJurisdiction = (roleId, input = {}) => {
    const role = ROLE_BY_ID[roleId];
    if (!role) throw new ApiError(400, "Unknown role.");
    const scope = role.scope.filter((f) => f !== "election");
    if (!scope.length) return {};

    const j = Object.fromEntries(
        [...JURISDICTION_FIELDS, "partNumber"].map((f) => [f, clean(input[f])]).filter(([, v]) => v));

    const stateEntry = geography.states.find((s) => norm(s.name) === norm(j.state));
    if (!stateEntry) throw new ApiError(400, "Select a valid State/UT for this assignment.");
    const out = { state: stateEntry.name };

    let districts = stateEntry.districts;
    if (j.district || scope.includes("district")) {
        const district = districts.find((d) => norm(d.name) === norm(j.district));
        if (!district) throw new ApiError(400, "Select a valid district for the selected State/UT.");
        out.district = district.name;
        districts = [district];
    }
    if (j.constituency || scope.includes("constituency") || scope.includes("pollingStation")) {
        const name = districts.map((d) => findCI(d.constituencies, j.constituency)).find(Boolean);
        if (!name) throw new ApiError(400, "Select a valid assembly constituency for this assignment.");
        out.constituency = name;
    }
    if (j.pollingStation) {
        if (j.pollingStation.length < 3 || j.pollingStation.length > 200) {
            throw new ApiError(400, "Polling station must be between 3 and 200 characters.");
        }
        out.pollingStation = j.pollingStation;
    }
    if (j.partNumber) {
        if (!/^[1-9]\d{0,3}$/.test(j.partNumber)) throw new ApiError(400, "Part number must be a whole number between 1 and 9999.");
        out.partNumber = j.partNumber;
    }
    return out;
};

/** Is `inner` (a jurisdiction) entirely inside one of the `outer` assignments? */
export const containsJurisdiction = (outerAssignments, inner) =>
    coversAny(outerAssignments, { ...inner, assemblyConstituency: inner.constituency });
