import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getElectorByEpic, saveElector } from "../repositories/elector.repository.js";
import { jsonGet, jsonSet, redis, transaction } from "../config/redis.js";
import { performDocumentSanityCheck } from "../services/gemini.service.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const key = (id) => `voting-verification:${id}`;

const getSession = async (id) => {
    const s = await jsonGet(key(id));
    if (!s) throw new ApiError(404, "Voting verification session not found.");
    return s;
};

export const startVotingVerification = asyncHandler(async (req, res) => {
    const epic = String(req.body?.epic || "").trim().toUpperCase();
    if (!epic) throw new ApiError(400, "EPIC number is required.");

    const elector = await getElectorByEpic(epic);
    if (!elector || !elector.isActive) throw new ApiError(404, "No active voter found for this EPIC.");

    if (elector.hasVoted) {
        throw new ApiError(409, `Voter has ALREADY VOTED at ${elector.votedBooth || elector.pollingStation} on ${new Date(elector.votedAt).toLocaleString()}. Duplicate voting is strictly prohibited.`);
    }

    const session = {
        _id: crypto.randomUUID(),
        sessionId: null, // populated below
        epic,
        electorId: elector._id,
        status: "persona_pending",
        personaStatus: "created",
        personaResult: "unverified",
        fingerprint: { verified: false, verifiedAt: null },
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        voter: {
            name: elector.name,
            epic: elector.epic,
            dateOfBirth: elector.dateOfBirth,
            gender: elector.gender,
            state: elector.state,
            district: elector.district,
            assemblyConstituency: elector.assemblyConstituency,
            partNumber: elector.partNumber,
            pollingStation: elector.pollingStation
        }
    };
    session.sessionId = session._id;
    await jsonSet(key(session._id), session, 30 * 60);

    res.status(201).json({
        success: true,
        data: {
            sessionId: session._id,
            status: session.status,
            personaStatus: session.personaStatus,
            voter: session.voter
        }
    });
});

/**
 * Polling-day identity checks through Persona are not connected to a real Persona inquiry yet.
 * Instead of reporting a check that never ran as passed, this step fails clearly unless the
 * operator explicitly turns on the demonstration mode, and then every result is labelled
 * "simulated" so it cannot be mistaken for a real check.
 */
const isPersonaDemoMode = () => process.env.PERSONA_DEMO_MODE === "true";
const requirePersonaDemoMode = () => {
    if (!isPersonaDemoMode()) {
        throw new ApiError(503, "The polling-station Persona check is not connected to Persona yet, so no voter can be verified here. " +
            "For a demonstration, set PERSONA_DEMO_MODE=true in backend/.env; results are then labelled as simulated.");
    }
};

/**
 * Starts Persona inquiry or on-site verification session for voting day
 */
export const startVotingPersona = asyncHandler(async (req, res) => {
    requirePersonaDemoMode();
    const session = await getSession(req.params.id);
    if (session.status !== "persona_pending") {
        throw new ApiError(409, "This voter check is not waiting for the identity step.");
    }
    const elector = await getElectorByEpic(session.epic);
    if (!elector) throw new ApiError(404, "Electoral roll record not found.");

    // Run AI sanity check on elector record
    const aiReview = await performDocumentSanityCheck({
        type: "persona_verification",
        currentRecord: elector,
        requestedData: { epic: elector.epic, name: elector.name, dob: elector.dateOfBirth }
    });

    const inquiryId = `inq_vote_${session._id.slice(0, 8)}`;
    const environmentId = process.env.PERSONA_ENVIRONMENT_ID || "env_sandbox_demo";
    const templateId = process.env.PERSONA_TEMPLATE_ID || "itmpl_sandbox_demo";

    session.inquiryId = inquiryId;
    session.aiReview = aiReview;
    // Demonstration mode only (checked above): the identity step is simulated and labelled as such.
    session.status = "fingerprint_pending";
    session.personaStatus = "approved";
    session.personaResult = "simulated";
    session.simulated = true;

    await jsonSet(key(session._id), session, 30 * 60);

    res.json({
        success: true,
        data: {
            sessionId: session._id,
            inquiryId,
            environmentId,
            templateId,
            status: "approved",
            personaResult: "simulated",
            simulated: true,
            aiReview
        }
    });
});

/**
 * Syncs Persona inquiry status for voting day
 */
export const syncVotingPersona = asyncHandler(async (req, res) => {
    requirePersonaDemoMode();
    const session = await getSession(req.params.id);
    if (session.status !== "persona_pending" && session.status !== "fingerprint_pending") {
        throw new ApiError(409, "This voter check is not waiting for the identity step.");
    }

    // Demonstration mode only (checked above).
    session.status = "fingerprint_pending";
    session.personaStatus = "approved";
    session.personaResult = "simulated";
    session.simulated = true;
    session.updatedAt = new Date().toISOString();

    await jsonSet(key(session._id), session, 30 * 60);

    res.json({
        success: true,
        data: {
            sessionId: session._id,
            status: session.status,
            personaStatus: session.personaStatus,
            personaResult: session.personaResult,
            simulated: true
        }
    });
});

/**
 * Step 2: Fingerprint scanner demo token verification.
 * On success, MARKS THE ELECTOR AS VOTED IN THE ELECTORAL ROLL!
 */
export const verifyFingerprint = asyncHandler(async (req, res) => {
    const session = await getSession(req.params.id);
    // The fingerprint step comes only after the identity step has passed for this session.
    if (session.status !== "fingerprint_pending") {
        throw new ApiError(409, "Complete the identity check for this voter before the fingerprint step.");
    }
    const elector = await getElectorByEpic(session.epic);

    if (!elector) throw new ApiError(404, "Electoral roll record not found.");

    if (elector.hasVoted) {
        throw new ApiError(409, `Duplicate ballot prevented! Voter ${elector.name} has already cast their vote.`);
    }

    const scanToken = String(req.body?.scanToken || "").trim().toUpperCase();
    if (scanToken !== `FP-${session.epic}`) {
        return res.status(400).json({
            success: false,
            message: `Fingerprint scan mismatch. Expected scanner demonstration token 'FP-${session.epic}'.`
        });
    }

    // Claim the vote atomically: if two booths submit for the same voter at once, only one wins.
    const voteClaimed = await redis().set(`voted:${elector.epic}`, session._id, { NX: true });
    if (voteClaimed !== "OK") {
        throw new ApiError(409, `Duplicate ballot prevented! Voter ${elector.name} has already cast their vote.`);
    }

    const now = new Date().toISOString();
    session.fingerprint = { verified: true, verifiedAt: now, method: "scanner-demo-token" };
    session.status = "verified";
    session.completedAt = now;

    // Mark elector as voted in the official Electoral Roll, together with the session.
    elector.hasVoted = true;
    elector.votedAt = now;
    elector.votedBooth = elector.pollingStation;
    const tx = transaction();
    tx.set(key(session._id), JSON.stringify(session), { EX: 30 * 60 });
    saveElector(elector, tx);
    try {
        await tx.exec();
    } catch (error) {
        await redis().del(`voted:${elector.epic}`).catch(() => {});
        throw error;
    }

    res.json({
        success: true,
        message: "Identity verified. Vote cast successfully and recorded in electoral roll.",
        data: {
            status: "verified",
            elector: {
                epic: elector.epic,
                name: elector.name,
                pollingStation: elector.pollingStation,
                hasVoted: true,
                votedAt: now
            }
        }
    });
});

export const getVotingReferencePhoto = asyncHandler(async (req, res) => {
    const session = await getSession(req.params.id);
    const referenceDir = process.env.FACE_REFERENCE_DIR || path.join(PROJECT_ROOT, "face-service", "reference");
    const safeEpic = String(session.epic).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const candidates = [".jpg", ".jpeg", ".png"].map(ext => path.join(referenceDir, `${safeEpic}${ext}`));
    const file = candidates.find(candidate => fs.existsSync(candidate));
    if (!file) return res.status(404).end();

    const extension = path.extname(file).toLowerCase();
    res.type(extension === ".png" ? "png" : "jpg");
    res.set("Cache-Control", "private, no-store");
    fs.createReadStream(file).pipe(res);
});

// Retired step from the old in-app camera flow. It used to move the session straight to the
// fingerprint stage without checking anything, so it now refuses instead.
export const submitVotingDocument = asyncHandler(async () => {
    throw new ApiError(410, "This verification step has been replaced by the Persona identity check.");
});

export const issueVotingChallenge = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { challenge: "blink" } });
});

// Retired step from the old in-app camera flow. It used to move the session straight to the
// fingerprint stage without checking anything, so it now refuses instead.
export const submitVotingFace = asyncHandler(async () => {
    throw new ApiError(410, "This verification step has been replaced by the Persona identity check.");
});
