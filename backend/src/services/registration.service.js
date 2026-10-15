import crypto from "crypto";
import { getElectorByEpic, saveElector } from "../repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "../repositories/user.repository.js";
import { ApiError } from "../utils/ApiErrors.js";

const generateUniqueEpic = async () => {
    for (let i = 0; i < 20; i += 1) {
        const epic = `DEM${String(crypto.randomInt(0, 10_000_000)).padStart(7, "0")}`;
        const [elector, user] = await Promise.all([getElectorByEpic(epic), getUserByEpic(epic)]);
        if (!elector && !user) return epic;
    }
    throw new ApiError(500, "Could not allocate a unique EPIC number. Please try again.");
};

/**
 * Turns an approved registration application into an electoral-roll record plus a
 * sign-in account. This is the ONLY place voter accounts are created, and it is
 * only reachable from the BLO approval endpoint.
 */
export const createVoterFromApplication = async (application, approver) => {
    const epic = await generateUniqueEpic();
    const now = new Date().toISOString();
    const dob = new Date(application.dateOfBirth);

    const elector = {
        _id: crypto.randomUUID(), epic, name: application.name,
        dateOfBirth: dob.toISOString(),
        age: Math.max(0, new Date().getFullYear() - dob.getFullYear()),
        gender: application.gender || "Other", state: application.state, district: application.district,
        assemblyConstituency: application.assemblyConstituency,
        partNumber: application.partNumber, pollingStation: application.pollingStation,
        photoUrl: null, isActive: true, registeredAt: now,
        registrationId: application._id, approvedBy: approver.epic
    };
    await saveElector(elector);

    await saveUser({
        _id: crypto.randomUUID(), epic, name: elector.name, role: "voter",
        registrationId: application._id, approvedBy: approver.epic, createdAt: now
    });

    let biometricEnrolled = false;
    if (application.referenceImage) {
        try {
            const { enrollFace } = await import("./faceClient.js");
            await enrollFace({ epic, image: application.referenceImage });
            biometricEnrolled = true;
        } catch (error) {
            console.error("Reference face enrollment failed:", error.message);
        }
    }

    return { epic, biometricEnrolled };
};
