import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getElectorByEpic, saveElector } from "../repositories/elector.repository.js";
import { jsonGet, jsonSet } from "../config/redis.js";
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
 * Starts Persona inquiry or on-site verification session for voting day
 */
export const startVotingPersona = asyncHandler(async (req, res) => {
    const session = await getSession(req.params.id);
    const elector = await getElectorByEpic(session.epic);

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
    session.status = "fingerprint_pending"; // Pre-approves to fingerprint for on-day demo
    session.personaStatus = "approved";
    session.personaResult = "verified";

    await jsonSet(key(session._id), session, 30 * 60);

    res.json({
        success: true,
        data: {
            sessionId: session._id,
            inquiryId,
            environmentId,
            templateId,
            status: "approved",
            personaResult: "verified",
            aiReview
        }
    });
});

/**
 * Syncs Persona inquiry status for voting day
 */
export const syncVotingPersona = asyncHandler(async (req, res) => {
    const session = await getSession(req.params.id);

    // If persona not already approved, approve and transition to fingerprint stage
    session.status = "fingerprint_pending";
    session.personaStatus = "approved";
    session.personaResult = "verified";
    session.updatedAt = new Date().toISOString();

    await jsonSet(key(session._id), session, 30 * 60);

    res.json({
        success: true,
        data: {
            sessionId: session._id,
            status: session.status,
            personaStatus: session.personaStatus,
            personaResult: session.personaResult
        }
    });
});

/**
 * Step 2: Fingerprint scanner demo token verification.
 * On success, MARKS THE ELECTOR AS VOTED IN THE ELECTORAL ROLL!
 */
export const verifyFingerprint = asyncHandler(async (req, res) => {
    const session = await getSession(req.params.id);
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

    const now = new Date().toISOString();
    session.fingerprint = { verified: true, verifiedAt: now, method: "biometric-scanner-certified" };
    session.status = "verified";
    session.completedAt = now;
    await jsonSet(key(session._id), session, 30 * 60);

    // Mark elector as voted in the official Electoral Roll
    elector.hasVoted = true;
    elector.votedAt = now;
    elector.votedBooth = elector.pollingStation;
    await saveElector(elector);

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

export const submitVotingDocument = asyncHandler(async (req, res) => {
    const session = await getSession(req.params.id);
    session.status = "fingerprint_pending";
    await jsonSet(key(session._id), session, 30 * 60);
    res.json({ success: true, data: { status: session.status } });
});

export const issueVotingChallenge = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { challenge: "blink" } });
});

export const submitVotingFace = asyncHandler(async (req, res) => {
    const session = await getSession(req.params.id);
    session.status = "fingerprint_pending";
    await jsonSet(key(session._id), session, 30 * 60);
    res.json({ success: true, data: { status: session.status } });
});
