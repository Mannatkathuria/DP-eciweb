import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getElectorByEpic } from "../repositories/elector.repository.js";
import { jsonGet, jsonSet } from "../config/redis.js";
import { verifyFace } from "../services/faceClient.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const CHALLENGES = ["blink", "left", "right"];
const randomChallenge = () => CHALLENGES[crypto.randomInt(CHALLENGES.length)];
const key = id => `voting-verification:${id}`;

const getSession = async id => {
    const s = await jsonGet(key(id));
    if (!s) throw new ApiError(404, "Voting verification session not found.");
    return s;
};

const normalise = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const startVotingVerification = asyncHandler(async (req, res) => {
    const epic = String(req.body?.epic || "").trim().toUpperCase();
    if (!epic) throw new ApiError(400, "EPIC number is required.");

    const elector = await getElectorByEpic(epic);
    if (!elector || !elector.isActive) throw new ApiError(404, "No active voter found for this EPIC.");

    const session = {
        _id: crypto.randomUUID(), epic, electorId: elector._id,
        status: "document_pending", createdAt: new Date().toISOString(),
        document: null, face: { challenge: null, match: null, liveness: false },
        fingerprint: { verified: false, verifiedAt: null },
        startedAt: new Date().toISOString()
    };
    await jsonSet(key(session._id), session, 15 * 60);
    const referenceDir = process.env.FACE_REFERENCE_DIR || path.join(PROJECT_ROOT, "face-service", "reference");
    const safeEpic = elector.epic.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const referencePhotoAvailable = [".jpg", ".jpeg", ".png"].some(ext => fs.existsSync(path.join(referenceDir, `${safeEpic}${ext}`)));
    res.status(201).json({ success: true, data: { sessionId: session._id, status: session.status, voter: {
        name: elector.name, epic: elector.epic, dateOfBirth: elector.dateOfBirth, gender: elector.gender,
        state: elector.state, district: elector.district, assemblyConstituency: elector.assemblyConstituency,
        partNumber: elector.partNumber, pollingStation: elector.pollingStation,
        photoAvailable: referencePhotoAvailable,
        referencePhotoUrl: `/api/v1/voting-verification/${session._id}/reference-photo`
    }}});
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
    if (session.status !== "document_pending") throw new ApiError(409, "Document stage is already complete.");

    const { epic, name, dateOfBirth, documentType } = req.body ?? {};
    if (!epic || !name) throw new ApiError(400, "OCR must provide at least EPIC and name.");

    const elector = await getElectorByEpic(session.epic);
    const reasons = [];
    if (normalise(epic) !== normalise(elector.epic)) reasons.push("Document EPIC does not match the electoral record.");
    if (normalise(name) !== normalise(elector.name)) reasons.push("Document name does not match the electoral record.");
    if (dateOfBirth && new Date(dateOfBirth).toISOString().slice(0,10) !== new Date(elector.dateOfBirth).toISOString().slice(0,10)) {
        reasons.push("Document date of birth does not match the electoral record.");
    }

    session.document = {
        documentType: documentType || "electoral_identity_document",
        extracted: { epic, name, dateOfBirth: dateOfBirth || null },
        matched: reasons.length === 0, reasons, checkedAt: new Date().toISOString()
    };
    session.status = reasons.length ? "review_required" : "face_pending";
    await jsonSet(key(session._id), session, 15 * 60);

    res.json({ success: true, data: {
        status: session.status, reasons, extracted: session.document.extracted,
        voter: { name: elector.name, epic: elector.epic, dateOfBirth: elector.dateOfBirth }
    }});
});

export const issueVotingChallenge = asyncHandler(async (req, res) => {
    const session = await getSession(req.params.id);
    if (session.status !== "face_pending") throw new ApiError(409, "Face verification is not available at this stage.");
    session.face.challenge = randomChallenge();
    await jsonSet(key(session._id), session, 15 * 60);
    res.json({ success: true, data: { challenge: session.face.challenge }});
});

export const submitVotingFace = asyncHandler(async (req, res) => {
    const session = await getSession(req.params.id);
    if (session.status !== "face_pending") throw new ApiError(409, "Face verification is not available at this stage.");
    const { frames } = req.body ?? {};
    if (!Array.isArray(frames) || frames.length < 8 || frames.length > 40) {
        throw new ApiError(400, "Between 8 and 40 camera frames are required.");
    }

    const result = await verifyFace({ epic: session.epic, frames, challenge: session.face.challenge });
    session.face.match = result.faceMatch ?? null;
    session.face.liveness = !!result.liveness;
    session.face.detected = !!result.faceDetected;
    session.face.distance = result.distance ?? null;

    const reasons = [];
    if (!result.faceDetected) reasons.push("Face was not clearly detected.");
    if (result.faceMatch !== true) reasons.push("Face did not match the enrolled voter reference.");
    if (!result.liveness) reasons.push("Liveness check failed.");

    session.status = reasons.length ? "review_required" : "fingerprint_pending";
    session.face.checkedAt = new Date().toISOString();
    session.face.reasons = reasons;
    await jsonSet(key(session._id), session, 15 * 60);

    res.json({ success: true, data: {
        status: session.status, reasons,
        face: { match: session.face.match, liveness: session.face.liveness, detected: session.face.detected }
    }});
});

export const verifyFingerprint = asyncHandler(async (req, res) => {
    const session = await getSession(req.params.id);
    if (session.status !== "fingerprint_pending") throw new ApiError(409, "Fingerprint verification is not available at this stage.");

    /*
     * Prototype boundary:
     * browsers do not expose raw fingerprint images/templates. In production,
     * this endpoint must be backed by a certified fingerprint scanner SDK/API.
     * The demo accepts a one-time operator scan token so the full workflow can
     * be demonstrated without pretending a laptop webcam is a fingerprint reader.
     */
    const scanToken = String(req.body?.scanToken || "");
    if (scanToken !== `FP-${session.epic}`) {
        return res.status(400).json({ success: false, message: "Fingerprint scan failed. Use the configured demonstration scanner." });
    }

    session.fingerprint = { verified: true, verifiedAt: new Date().toISOString(), method: "scanner-demo" };
    session.status = "verified";
    session.completedAt = new Date().toISOString();
    session.durationMs = new Date(session.completedAt) - new Date(session.startedAt);
    await jsonSet(key(session._id), session, 15 * 60);

    res.json({ success: true, data: {
        status: "verified",
        message: "Voter identity verified for the polling-station workflow."
    }});
});
