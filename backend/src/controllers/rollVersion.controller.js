import crypto from "crypto";
import { acquireLock, transaction } from "../config/redis.js";
import { listElectors } from "../repositories/elector.repository.js";
import { getRollVersion, listRollVersions, rollAreaKey, saveRollVersion } from "../repositories/rollVersion.repository.js";
import { assertCovers, validateJurisdiction } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Fields captured in a published roll entry. Address and contact details are not part of the
// published roll extract.
const ENTRY_FIELDS = ["epic", "name", "gender", "age", "partNumber", "pollingStation", "isActive"];
const norm = (v) => String(v ?? "").trim().toLowerCase();

const entryOf = (e) => Object.fromEntries(ENTRY_FIELDS.map((f) => [f, e[f] ?? null]));
const hashEntries = (entries) => crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex");

/** Changes between two snapshots, by EPIC. */
export const diffEntries = (before = [], after = []) => {
    const old = new Map(before.map((e) => [e.epic, e]));
    const now = new Map(after.map((e) => [e.epic, e]));
    const added = after.filter((e) => !old.has(e.epic)).map((e) => e.epic);
    const removed = before.filter((e) => !now.has(e.epic)).map((e) => e.epic);
    const modified = after.filter((e) => old.has(e.epic) && JSON.stringify(old.get(e.epic)) !== JSON.stringify(e))
        .map((e) => ({ epic: e.epic, fields: ENTRY_FIELDS.filter((f) => old.get(e.epic)[f] !== e[f]) }));
    return { added, removed, modified };
};

const areaFrom = (input) => {
    const j = validateJurisdiction("ero", input ?? {});
    return { state: j.state, district: j.district, constituency: j.constituency };
};
const summary = ({ entries, ...version }) => ({ ...version, entryCount: entries?.length ?? version.entryCount });

/** ERO publishes the current roll of a constituency inside their jurisdiction as a new version. */
export const publishRollVersion = asyncHandler(async (req, res) => {
    const area = areaFrom(req.body);
    assertCovers(req.authority.assignments, { ...area, assemblyConstituency: area.constituency }, "This constituency");
    const areaKey = rollAreaKey(area);
    const release = await acquireLock(`rollversion:lock:${areaKey}`);
    if (!release) throw new ApiError(409, "A version of this roll is being published. Try again in a moment.");
    try {
        const entries = (await listElectors())
            .filter((e) => norm(e.state) === norm(area.state) && norm(e.assemblyConstituency) === norm(area.constituency))
            .map(entryOf)
            .sort((a, b) => a.epic.localeCompare(b.epic));
        const previous = (await listRollVersions(areaKey)).at(-1) ?? null;
        const hash = hashEntries(entries);
        if (previous && previous.hash === hash) throw new ApiError(409, `Nothing has changed since version ${previous.version}.`);
        const changes = diffEntries(previous?.entries, entries);
        const version = {
            _id: crypto.randomUUID(), areaKey, ...area,
            version: (previous?.version ?? 0) + 1, previousVersionId: previous?._id ?? null,
            publishedBy: req.user.epic, publishedByRole: req.user.role, publishedAt: new Date().toISOString(),
            note: String(req.body?.note ?? "").trim().slice(0, 300) || null,
            entryCount: entries.length, hash,
            changes: { added: changes.added.length, removed: changes.removed.length, modified: changes.modified.length },
            changeDetail: changes,
            entries
        };
        const tx = transaction();
        saveRollVersion(version, tx);
        await recordAudit(auditEvent({
            actor: req.user, action: "roll.published", resource: { type: "rollversion", id: version._id },
            jurisdiction: area, after: { version: version.version, entryCount: entries.length, hash, changes: version.changes }
        }), tx);
        await tx.exec();
        res.status(201).json({ success: true, message: `Version ${version.version} published.`, data: summary(version) });
    } finally {
        await release();
    }
});

export const listVersions = asyncHandler(async (req, res) => {
    const area = areaFrom(req.query);
    assertCovers(req.authority.assignments, { ...area, assemblyConstituency: area.constituency }, "This constituency");
    const items = (await listRollVersions(rollAreaKey(area))).map(summary).reverse();
    res.json({ success: true, data: { items } });
});

/** One version with its entries; the hash is recomputed so tampering with stored entries shows. */
export const getVersion = asyncHandler(async (req, res) => {
    const version = await getRollVersion(req.params.id);
    if (!version) throw new ApiError(404, "Roll version not found.");
    assertCovers(req.authority.assignments, { ...version, assemblyConstituency: version.constituency }, "This roll");
    res.json({ success: true, data: { ...version, integrity: hashEntries(version.entries) === version.hash ? "verified" : "MISMATCH" } });
});
