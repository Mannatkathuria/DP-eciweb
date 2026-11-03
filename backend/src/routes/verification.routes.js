import express from "express";
import { limiter } from "../middlewares/rateLimit.middleware.js";
import {
    submitIdentity,
    issueChallenge,
    submitFace,
    decodeAadhaar,
    sendDemoOtp,
    verifyDemoOtp
} from "../controllers/verification.controller.js";
import multer from "multer";
import os from "node:os";
// import path from "node:path";
import { unlink } from "node:fs/promises";
// import { decodeAadhaar } from "../services/aadhaar.service.js";

const router = express.Router();

// OTP is now the only sign-in credential, so throttle send/verify per IP
// (each OTP also locks after 5 wrong attempts).
const otpLimiter = limiter("otp", { windowMs: 15 * 60 * 1000, limit: 30, message: "Too many OTP requests. Try again later." });

router.post("/otp/send", otpLimiter, sendDemoOtp);
router.post("/otp/verify", otpLimiter, verifyDemoOtp);

// Legacy identity-document and face-match flow. It needs the separate Python face service, has no
// screen in the current web app (identity checks now go through Persona and the poll-day module),
// and is therefore switched off unless LEGACY_FACE_VERIFICATION=on.
if (process.env.LEGACY_FACE_VERIFICATION === "on") {
router.post("/identity", submitIdentity);
router.post("/:id/challenge", issueChallenge);
router.post("/:id/face", submitFace);

const uploadIdentityDocument = multer({
    dest: os.tmpdir(),
    limits: {
        fileSize: 8 * 1024 * 1024,
        files: 1
    },
    fileFilter: (req, file, callback) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(
                new Error("Upload a JPEG, PNG, or WebP image.")
            );
        }

        callback(null, true);
    }
});


router.post(
    "/document/decode",
    uploadIdentityDocument.single("document"),
    async (req, res, next) => {
        const imagePath = req.file?.path;

        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Attach the document image in the field 'document'.",
                });
            }

            if (req.body.method !== "aadhaar") {
                return res.status(422).json({
                    success: false,
                    message: "This decoder currently supports Aadhaar QR images only.",
                });
            }

            const documentData = await decodeAadhaar(imagePath);

            if (
                !documentData ||
                typeof documentData !== "object" ||
                Array.isArray(documentData)
            ) {
                return res.status(422).json({
                    success: false,
                    message: "The document decoder did not return valid document data.",
                });
            }

            return res.json({
                success: true,
                data: { documentData },
            });
        } catch (error) {
            next(error);
        } finally {
            if (imagePath) {
                await unlink(imagePath).catch((err) => {
                    console.error("Temporary file cleanup failed:", err.message);
                });
            }
        }
    }
);
}

export default router;