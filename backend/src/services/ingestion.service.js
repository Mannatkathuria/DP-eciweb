// Imports records from an approved data source into the staging area (prospective electors) and
// creates registration assistance tasks for the BLOs whose assignment covers each person.
//
//   source record --validate--> prospective elector --eligible?--> BLO task --> Form 6 --> ERO
//
// Nothing here writes to the electoral roll. Every run is recorded (who, when, which source, what
// was accepted or rejected and why) and audited.
import crypto from "crypto";
import { transaction } from "../config/redis.js";
import {
    getDataSource, listProspects, prospectIdForReference, saveIngestionRun, saveProspect
} from "../repositories/integration.repository.js";
import { saveTask } from "../repositories/registrationTask.repository.js";
import { listAllAssignments } from "../repositories/assignment.repository.js";
import { listElectors } from "../repositories/elector.repository.js";
import { listRegistrations } from "../repositories/registration.repository.js";
import { assessEligibility } from "./eligibility.service.js";
import { covers, validateJurisdiction } from "./authority.service.js";
import { auditEvent, recordAudit } from "./audit.service.js";
import { ApiError } from "../utils/ApiErrors.js";

export const MAX_RECORDS_PER_RUN = 1000;
const REF_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
// Who is this person, for duplicate checks: name + date of birth + constituency.
const personKey = (name, dob, constituency) => `${norm(name)}|${String(dob ?? "").slice(0, 10)}|${norm(constituency)}`;

/** Validates one source record. Returns { record } or { error }. Only the minimum fields are kept. */
export const validateSourceRecord = (raw) => {
    if (!raw || typeof raw !== "object") return { error: "Record is not an object." };
    const sourceReference = clean(raw.sourceReference);
    if (!REF_PATTERN.test(sourceReference)) return { error: "sourceReference is missing or invalid." };
    const name = clean(raw.name);
    if (name.length < 2 || name.length > 100) return { error: "name must be 2 to 100 characters." };
    const eligibility = assessEligibility(raw.dateOfBirth);
    if (!eligibility) return { error: "dateOfBirth must be a valid past date (YYYY-MM-DD)." };
    let jurisdiction;
    try {
        jurisdiction = validateJurisdiction("ero", { state: raw.state, district: raw.district, constituency: raw.constituency });
    } catch (error) {
        return { error: error.message };
    }
    const pollingStation = clean(raw.pollingStation);
    const partNumber = clean(raw.partNumber);
    if (partNumber && !/^[1-9]\d{0,3}$/.test(partNumber)) return { error: "partNumber must be 1 to 9999." };
    return {
        record: {
            sourceReference, name,
            dateOfBirth: String(raw.dateOfBirth).slice(0, 10),
            gender: ["Male", "Female", "Other"].includes(raw.gender) ? raw.gender : null,
            jurisdiction: { ...jurisdiction, ...(pollingStation ? { pollingStation } : {}), ...(partNumber ? { partNumber } : {}) },
            address: clean(raw.address).slice(0, 300) || null,
            eligibility
        }
    };
};

/**
 * Picks the BLO for a prospective elector: the one whose assignment names the person's polling
 * station or part, or else the only BLO covering the constituency. With several BLOs and no booth
 * information the task stays unassigned, for the ERO or BLO supervisor to route.
 */
export const pickBlo = (bloAssignments, jurisdiction) => {
    const record = { ...jurisdiction, assemblyConstituency: jurisdiction.constituency };
    const covering = bloAssignments.filter((a) => covers(a, record));
    const exact = covering.filter((a) =>
        (jurisdiction.pollingStation && norm(a.jurisdiction.pollingStation) === norm(jurisdiction.pollingStation)) ||
        (jurisdiction.partNumber && a.jurisdiction.partNumber === jurisdiction.partNumber));
    if (exact.length) return exact[0];
    return covering.length === 1 ? covering[0] : null;
};

export const activeBloAssignments = async () =>
    (await listAllAssignments()).filter((a) => a.role === "blo" && a.status === "active");

/** Runs one import. `records` is an array of source records; `actor` is the signed-in official. */
export const ingest = async ({ sourceId, records, actor, today = new Date() }) => {
    const source = await getDataSource(sourceId);
    if (!source) throw new ApiError(404, "Data source not found.");
    if (source.status !== "active") throw new ApiError(409, "This data source is not active.");
    if (!Array.isArray(records) || records.length === 0) throw new ApiError(400, "Send a non-empty array of records.");
    if (records.length > MAX_RECORDS_PER_RUN) throw new ApiError(413, `At most ${MAX_RECORDS_PER_RUN} records per run.`);

    const [electors, applications, prospects, bloAssignments] = await Promise.all([listElectors(), listRegistrations(), listProspects(), activeBloAssignments()]);
    const staged = new Set(prospects.map((p) => personKey(p.name, p.dateOfBirth, p.jurisdiction?.constituency)));
    const enrolled = new Set(electors.filter((e) => e.isActive !== false).map((e) => personKey(e.name, e.dateOfBirth, e.assemblyConstituency)));
    const applied = new Set(applications.filter((a) => a.status !== "rejected").map((a) => personKey(a.name, a.dateOfBirth, a.assemblyConstituency)));

    const run = {
        _id: crypto.randomUUID(), sourceId, sourceName: source.name, sourceType: source.type,
        startedAt: new Date().toISOString(), by: actor.epic,
        counts: { received: records.length, staged: 0, tasksCreated: 0, unassigned: 0, notYetEligible: 0, duplicates: 0, alreadyEnrolled: 0, alreadyApplied: 0, rejected: 0 },
        rejections: []
    };
    const tx = transaction();
    const seenRefs = new Set();

    for (const [index, raw] of records.entries()) {
        const { record, error } = validateSourceRecord(raw);
        if (error) { run.counts.rejected += 1; run.rejections.push({ index, reason: error }); continue; }
        if (seenRefs.has(record.sourceReference) || await prospectIdForReference(sourceId, record.sourceReference)) {
            run.counts.duplicates += 1; continue;
        }
        seenRefs.add(record.sourceReference);
        const who = personKey(record.name, record.dateOfBirth, record.jurisdiction.constituency);
        if (enrolled.has(who)) { run.counts.alreadyEnrolled += 1; continue; }
        if (staged.has(who)) { run.counts.duplicates += 1; continue; }
        if (applied.has(who)) { run.counts.alreadyApplied += 1; continue; }

        const prospect = {
            _id: crypto.randomUUID(),
            caseId: `NEW_ELECTOR_${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            name: record.name, dateOfBirth: record.dateOfBirth, gender: record.gender, address: record.address,
            jurisdiction: record.jurisdiction,
            eligibility: { ...record.eligibility, assessedAt: today.toISOString().slice(0, 10) },
            registration: { formType: "FORM_6", applicationId: null, status: "NOT_APPLIED" },
            source: { providerId: sourceId, sourceType: source.type, sourceReference: record.sourceReference, importedAt: run.startedAt, ingestionRunId: run._id },
            taskId: null
        };

        if (record.eligibility.status === "FUTURE") {
            run.counts.notYetEligible += 1;
        } else {
            const blo = pickBlo(bloAssignments, record.jurisdiction);
            const task = {
                _id: crypto.randomUUID(), prospectId: prospect._id, caseId: prospect.caseId,
                person: { name: prospect.name, dateOfBirth: prospect.dateOfBirth, gender: prospect.gender, address: prospect.address },
                jurisdiction: record.jurisdiction,
                eligibility: prospect.eligibility,
                assignedTo: blo ? { userId: blo.userId, epic: blo.epic, assignmentId: blo._id } : null,
                status: "open", applicationId: null, outcomes: [],
                createdAt: run.startedAt, dueBy: record.eligibility.qualifyingDate
            };
            prospect.taskId = task._id;
            saveTask(task, tx);
            run.counts.tasksCreated += 1;
            if (!blo) run.counts.unassigned += 1;
        }
        saveProspect(prospect, tx);
        run.counts.staged += 1;
        staged.add(who); // the same person again (from any source or run) is a duplicate
    }

    run.finishedAt = new Date().toISOString();
    run.rejections = run.rejections.slice(0, 100);
    saveIngestionRun(run, tx);
    await recordAudit(auditEvent({
        actor, action: "ingestion.completed", resource: { type: "ingestion_run", id: run._id },
        jurisdiction: {}, after: { sourceId, counts: run.counts }
    }), tx);
    await tx.exec();
    return run;
};

/**
 * Re-checks staged prospective electors who were too young when imported. Anyone who has since
 * reached 17 (advance application) or a qualifying date at 18 gets a BLO task. Meant to run on a
 * schedule (for example before each qualifying date); also callable by the ECI administrator.
 */
export const rescreenProspects = async ({ actor, today = new Date() }) => {
    const [prospects, bloAssignments] = await Promise.all([listProspects(), activeBloAssignments()]);
    const tx = transaction();
    const counts = { checked: 0, tasksCreated: 0, unassigned: 0, stillFuture: 0 };
    for (const prospect of prospects) {
        if (prospect.taskId || prospect.registration?.status !== "NOT_APPLIED") continue;
        counts.checked += 1;
        const eligibility = assessEligibility(prospect.dateOfBirth, today);
        if (!eligibility || eligibility.status === "FUTURE") { counts.stillFuture += 1; continue; }
        const blo = pickBlo(bloAssignments, prospect.jurisdiction);
        const now = new Date().toISOString();
        const task = {
            _id: crypto.randomUUID(), prospectId: prospect._id, caseId: prospect.caseId,
            person: { name: prospect.name, dateOfBirth: prospect.dateOfBirth, gender: prospect.gender, address: prospect.address },
            jurisdiction: prospect.jurisdiction,
            eligibility: { ...eligibility, assessedAt: today.toISOString().slice(0, 10) },
            assignedTo: blo ? { userId: blo.userId, epic: blo.epic, assignmentId: blo._id } : null,
            status: "open", applicationId: null, outcomes: [], createdAt: now, dueBy: eligibility.qualifyingDate
        };
        saveTask(task, tx);
        saveProspect({ ...prospect, taskId: task._id, eligibility: task.eligibility }, tx);
        counts.tasksCreated += 1;
        if (!blo) counts.unassigned += 1;
    }
    await recordAudit(auditEvent({
        actor, action: "prospects.rescreened", resource: { type: "prospects", id: today.toISOString().slice(0, 10) },
        jurisdiction: {}, after: counts
    }), tx);
    await tx.exec();
    return counts;
};
