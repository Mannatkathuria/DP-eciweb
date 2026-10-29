import crypto from "crypto";
import { redis, transaction } from "../config/redis.js";
import { getElectorByEpic, saveElector } from "../repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "../repositories/user.repository.js";
import { pendingDuplicateKey, registrationDocumentKey, saveRegistration } from "../repositories/registration.repository.js";
import { SEPARATE_DOCUMENTS, purgedDocumentMeta } from "../utils/form6.js";
import { ApiError } from "../utils/ApiErrors.js";

/**
 * Picks a new EPIC number and claims it with SET NX, so two approvals running at the same
 * moment can never be given the same number. Older records have no claim key, so existing
 * electors and accounts are checked as well.
 */
const reserveUniqueEpic = async (registrationId) => {
    for (let i = 0; i < 20; i += 1) {
        const epic = `DEM${String(crypto.randomInt(0, 10_000_000)).padStart(7, "0")}`;
        const claimed = await redis().set(`epic:allocated:${epic}`, registrationId, { NX: true });
        if (claimed !== "OK") continue;
        const [elector, user] = await Promise.all([getElectorByEpic(epic), getUserByEpic(epic)]);
        if (!elector && !user) return epic;
    }
    throw new ApiError(500, "Could not allocate a unique EPIC number. Please try again.");
};

/**
 * Turns an approved registration application into an electoral-roll record plus a
 * sign-in account. This is the ONLY place voter accounts are created, and it is
 * only reachable from the BLO approval endpoint. The part number and polling station come
 * from the approving BLO's assignment, not from the applicant.
 *
 * The elector, the account and the decided application are written in one transaction:
 * either all three are saved or none are. The caller must hold the registration lock.
 */
export const createVoterFromApplication = async (application, approver, assignment) => {
    const epic = await reserveUniqueEpic(application._id);
    const now = new Date().toISOString();
    const dob = new Date(application.dateOfBirth);

    const elector = {
        _id: crypto.randomUUID(), epic, name: application.name,
        dateOfBirth: dob.toISOString(),
        age: Math.max(0, new Date().getFullYear() - dob.getFullYear()),
        gender: application.gender || "Other", state: application.state, district: application.district,
        assemblyConstituency: application.assemblyConstituency,
        address: application.address || null, pinCode: application.pinCode || null,
        partNumber: assignment.partNumber, pollingStation: assignment.pollingStation,
        photoUrl: null, isActive: true, registeredAt: now,
        registrationId: application._id, approvedBy: approver.epic
    };
    const user = {
        _id: crypto.randomUUID(), epic, name: elector.name, role: "voter",
        registrationId: application._id, approvedBy: approver.epic, createdAt: now
    };
    // Kept only for the best-effort face enrolment below; not stored after approval.
    const referenceImage = application.referenceImage || null;
    const decided = {
        ...application,
        status: "approved", epic,
        partNumber: assignment.partNumber, pollingStation: assignment.pollingStation,
        decidedBy: approver.epic, decidedAt: now, referenceImage: null,
        // Form 6 documents follow the same rule as referenceImage: deleted once decided.
        ...(application.documents ? { documents: purgedDocumentMeta(application.documents, now) } : {})
    };

    const tx = transaction();
    saveElector(elector, tx);
    saveUser(user, tx);
    saveRegistration(decided, tx);
    for (const category of SEPARATE_DOCUMENTS) tx.del(registrationDocumentKey(application._id, category));
    if (application.duplicateFingerprint) tx.del(pendingDuplicateKey(application.duplicateFingerprint));
    try {
        await tx.exec();
    } catch (error) {
        // Nothing was written, so give the reserved number back.
        await redis().del(`epic:allocated:${epic}`).catch(() => {});
        throw error;
    }

    return { epic, application: decided, referenceImage };
};

/**
 * Optional: sends the applicant's photo to the local face service. The approval is already
 * saved, so a missing or failing face service only means no biometric reference is stored.
 */
export const enrollReferenceFace = async (epic, image) => {
    if (!image) return false;
    try {
        const { enrollFace } = await import("./faceClient.js");
        await enrollFace({ epic, image });
        return true;
    } catch (error) {
        console.error("Reference face enrollment failed:", error.message);
        return false;
    }
};
