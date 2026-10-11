import crypto from "crypto";
import { getElectorByEpic } from "../repositories/elector.repository.js";
import { getVerification, saveVerification } from "../repositories/verification.repository.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { SUPPORTED_METHODS, fetchCredential, compareIdentity } from "../services/identity.service.js";
import { verifyFace } from "../services/faceClient.js";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const CHALLENGES = ["blink", "left", "right"];
const MAX_FACE_ATTEMPTS = 2;
const randomChallenge = (exclude) => {
    const pool = CHALLENGES.filter((c) => c !== exclude);
    return pool[crypto.randomInt(pool.length)];
};

const finish = (verification, status, reasons = []) => {
    verification.status = status;
    verification.reasons = reasons;
    verification.completedAt = new Date().toISOString();
    verification.durationMs =
        new Date(verification.completedAt).getTime() - new Date(verification.startedAt).getTime();
};

const getActiveVerification = async (id) => {
    const verification = await getVerification(id);
    if (!verification) throw new ApiError(404, "Verification session not found.");
    if (verification.status !== "in_progress") {
        throw new ApiError(409, "This verification session has already been completed.");
    }
    return verification;
};



export const submitIdentity = asyncHandler(async (req, res) => {
    const { electorId, method, documentData } = req.body ?? {};

    if (typeof electorId !== "string" || !electorId.trim()) {
        throw new ApiError(400, "A valid electorId is required.");
    }

    if (!SUPPORTED_METHODS.includes(method)) {
        throw new ApiError(400, "Unsupported identity method.");
    }

    const elector = await getElectorByEpic(electorId.trim());

    if (!elector || !elector.isActive) {
        throw new ApiError(404, "Electoral record not found.");
    }

    let result;

    try {
        if (documentData !== undefined) {
            if (
                !documentData ||
                typeof documentData !== "object" ||
                Array.isArray(documentData)
            ) {
                throw new ApiError(400, "Invalid extracted document data.");
            }

            const allowedFields = [
                "name",
                "dateOfBirth",
                "dob",
                "documentType",
                "documentNumber",
                "epic"
            ];

            const credential = {};

            for (const key of allowedFields) {
                const value = documentData[key];

                if (typeof value === "string" && value.trim()) {
                    credential[key] = value.trim();
                }
            }

            if (Object.keys(credential).length === 0) {
                throw new ApiError(400, "No usable identity fields were extracted.");
            }

            const comparison = compareIdentity(elector, credential);

            result = {
                status: "review_required",
                comparison: comparison ?? {},
                reason: "Extracted document data requires authenticity review."
            };
        } else {
            result = compareIdentity(
                elector,
                await fetchCredential(method, elector)
            );
        }
    } catch (error) {
        if (error instanceof ApiError) throw error;

        result = {
            status: "unavailable",
            comparison: {},
            reason: "Technical failure while retrieving or comparing identity data."
        };
    }

    const now = new Date().toISOString();

    const identityNeedsReview = [
        "significant_discrepancy",
        "unavailable",
        "review_required"
    ].includes(result.status);

    const identityReasons = identityNeedsReview
        ? [result.reason || "Manual identity review is required."]
        : [];

    const verification = {
        _id: crypto.randomUUID(),
        elector: elector._id,
        epic: elector.epic,
        identity: {
            method,
            status: result.status,
            comparison: result.comparison ?? {},
            reviewRequired: identityNeedsReview,
            reasons: identityReasons,
            checkedAt: now
        },
        face: {
            challenge: null,
            attempts: 0,
            match: null,
            liveness: null
        },
        // IMPORTANT: don't finish the session here.
        status: "in_progress",
        reasons: [],
        notes: result.note ? [result.note] : [],
        startedAt: now
    };

    await saveVerification(verification);

    res.json({
        success: true,
        data: {
            verificationId: verification._id,
            status: verification.status,
            reasons: [],
            identity: {
                method,
                status: result.status,
                comparison: result.comparison ?? {},
                reviewRequired: identityNeedsReview,
                reasons: identityReasons,
                note: result.note || result.reason || null
            }
        }
    });
});

export const issueChallenge = asyncHandler(async (req, res) => {
    const verification = await getActiveVerification(req.params.id);
    verification.face.challenge = randomChallenge(verification.face.challenge);
    await saveVerification(verification);
    res.json({ success: true, data: { challenge: verification.face.challenge, attemptsUsed: verification.face.attempts } });
});

export const submitFace = asyncHandler(async (req, res) => {
    const verification = await getActiveVerification(req.params.id);
    const { frames } = req.body ?? {};

    if (!verification.face.challenge) {
        throw new ApiError(400, "Request a liveness challenge first.");
    }

    if (!Array.isArray(frames) || frames.length < 8 || frames.length > 40) {
        throw new ApiError(400, "Between 8 and 40 camera frames are required.");
    }

    if (frames.some(
        (frame) =>
            typeof frame !== "string" ||
            !frame.startsWith("data:image/") ||
            frame.length > 1_500_000
    )) {
        throw new ApiError(400, "Invalid frame data.");
    }

    verification.face.attempts += 1;
    verification.face.checkedAt = new Date().toISOString();

    const identityReasons = verification.identity?.reasons ?? [];

    let result;

    try {
        result = await verifyFace({
            epic: verification.epic,
            frames,
            challenge: verification.face.challenge
        });
    } catch {
        finish(verification, "review_required", [
            ...identityReasons,
            "Technical failure: face verification service unavailable."
        ]);

        await saveVerification(verification);

        return res.json({
            success: true,
            data: {
                status: "review_required",
                reasons: verification.reasons,
                technicalFailure: true
            }
        });
    }

    verification.face.detected = !!result.faceDetected;
    verification.face.match = result.faceMatch ?? null;
    verification.face.distance = result.distance ?? null;
    verification.face.liveness = !!result.liveness;

    const faceReasons = [];

    if (!result.faceDetected) {
        faceReasons.push("No single clear face was detected.");
    } else if (result.faceMatch === null || result.faceMatch === undefined) {
        faceReasons.push("No reference photograph is available for comparison.");
    } else if (!result.faceMatch) {
        faceReasons.push("Face verification did not match the reference photograph.");
    }

    if (!result.liveness) {
        faceReasons.push("Liveness challenge was not completed.");
    }

    // Retry is based on the face check alone, not on identity review flags.
    const retryable =
        faceReasons.length > 0 &&
        result.faceMatch !== null &&
        result.faceMatch !== undefined;

    if (retryable && verification.face.attempts < MAX_FACE_ATTEMPTS) {
        verification.face.challenge = randomChallenge(verification.face.challenge);

        await saveVerification(verification);

        return res.json({
            success: true,
            data: {
                status: "retry",
                reasons: faceReasons,
                challenge: verification.face.challenge,
                attemptsLeft: MAX_FACE_ATTEMPTS - verification.face.attempts
            }
        });
    }

    const finalReasons = [...identityReasons, ...faceReasons];

    if (finalReasons.length > 0) {
        finish(verification, "review_required", finalReasons);
    } else {
        finish(verification, "verified");
    }

    await saveVerification(verification);

    return res.json({
        success: true,
        data: {
            status: verification.status,
            reasons: verification.reasons,
            notes: verification.notes,
            identity: {
                status: verification.identity?.status,
                comparison: verification.identity?.comparison ?? {}
            },
            face: {
                detected: verification.face.detected,
                match: verification.face.match,
                liveness: verification.face.liveness,
                challenge: verification.face.challenge
            }
        }
    });
});

const execFileAsync = promisify(execFile);

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Adjust this path if your backend is nested differently.
const projectRoot = path.resolve(currentDir, "../../..");

const pythonPath = path.join(
  projectRoot,
  ".venv",
  "bin",
  "python"
);

const decoderPath = path.join(
  projectRoot,
  "pyaadhaar",
  "adhaar_service.py"
);

export async function decodeAadhaar(imagePath) {
  const { stdout } = await execFileAsync(
    pythonPath,
    [decoderPath, imagePath],
    {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    }
  );

  return JSON.parse(stdout);
}

// Demo-only OTP storage. Lost when the backend restarts.
const demoOtpStore = new Map();

export const sendDemoOtp = asyncHandler(async (req, res) => {
    const { electorId } = req.body ?? {};

    if (typeof electorId !== "string" || !electorId.trim()) {
        throw new ApiError(400, "Elector ID is required.");
    }

    const elector = await getElectorByEpic(electorId.trim());

    if (!elector || !elector.isActive) {
        throw new ApiError(404, "Active electoral record not found.");
    }

    const otp = String(crypto.randomInt(100000, 1000000));

    demoOtpStore.set(elector.epic, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 0
    });

    // Demo delivery only: inspect the backend terminal to obtain the code.
    console.log(`[DEMO OTP] EPIC ${elector.epic}: ${otp}`);

    res.json({
        success: true,
        message: "Demo OTP generated. Check the backend terminal."
    });
});

export const verifyDemoOtp = asyncHandler(async (req, res) => {
    const { electorId, otp } = req.body ?? {};

    if (
        typeof electorId !== "string" ||
        !electorId.trim() ||
        typeof otp !== "string" ||
        !/^\d{6}$/.test(otp)
    ) {
        throw new ApiError(400, "Enter the six-digit OTP.");
    }

    const epic = electorId.trim().toUpperCase();
    const record = await getElectorByEpic(epic);

    if (!record || !record.isActive) {
        throw new ApiError(404, "Active electoral record not found.");
    }

    const saved = demoOtpStore.get(record.epic);

    if (!saved || Date.now() > saved.expiresAt) {
        demoOtpStore.delete(record.epic);
        throw new ApiError(400, "OTP expired. Request a new one.");
    }

    saved.attempts += 1;

    if (saved.attempts > 5) {
        demoOtpStore.delete(record.epic);
        throw new ApiError(429, "Too many attempts. Request a new OTP.");
    }

    if (saved.otp !== otp) {
        if (saved.attempts >= 5) {
            demoOtpStore.delete(record.epic);
        }
        throw new ApiError(400, "Incorrect OTP. Please try again.");
    }

    demoOtpStore.delete(record.epic);

    res.json({
        success: true,
        message: "Demo OTP verified."
    });
});