import crypto from "crypto";
import { getUserByEpic } from "../repositories/user.repository.js";
import { getRegistration, saveRegistration } from "../repositories/registration.repository.js";
import { issueOtp } from "../services/otp.service.js";
import { publicUser } from "../services/session.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// EPIC format: three letters followed by seven digits.
export const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;

// Which account roles may use which portal's sign-in page.
const PORTAL_ROLES = {
    voter: ["voter"],
    blo: ["blo", "admin"],
    eci: ["eci"]
};

/**
 * Step 1 of sign-in. Takes an EPIC number only (no username, no password).
 * It never creates an account: the EPIC must already belong to a user that a BLO
 * registered (or a seeded staff account). On success an OTP is generated and the
 * client is sent to the verification page, where the OTP is entered. The session
 * is issued by POST /verification/otp/verify once the OTP is correct.
 */
export const login = asyncHandler(async (req, res) => {
    const epic = String(req.body?.epic ?? "").trim().toUpperCase();
    const portal = req.body?.portal;

    // console.log(epic);

    if (!epic) throw new ApiError(400, "EPIC number is required.");
    if (!EPIC_PATTERN.test(epic)) {
        throw new ApiError(400, "Enter a valid EPIC number (three letters followed by seven digits).");
    }

    const user = await getUserByEpic(epic);
    // console.log(user);

    if (!user) {
        throw new ApiError(404, "This EPIC number is not registered. Apply for registration first; you can sign in once a Booth Level Officer approves it.");
    }

    if (PORTAL_ROLES[portal] && !PORTAL_ROLES[portal].includes(user.role)) {
        throw new ApiError(403, "This EPIC number is not authorised for this portal.");
    }

    issueOtp(epic);

    res.status(200).json({
        success: true,
        message: "OTP generated. Continue to verification.",
        data: { epic }
    });
});

export const me = asyncHandler(async (req, res) => {
    res.json({ success: true, data: publicUser(req.user) });
});

export const logout = asyncHandler(async (req, res) => {
    res.clearCookie("accessToken");
    res.json({ success: true, message: "Signed out." });
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (value) => String(value ?? "").trim();

/**
 * Public. A voter submits a registration request. This does NOT create an account:
 * it only stores a pending application that a BLO must approve. The applicant can
 * sign in only after approval.
 */
export const submitRegistration = asyncHandler(async (req, res) => {
    const {
        name, dateOfBirth, gender, state, district,
        assemblyConstituency, partNumber, pollingStation, referenceImage
    } = req.body ?? {};

    if (![name, dateOfBirth, state, district, assemblyConstituency, partNumber, pollingStation]
        .every((v) => clean(v))) {
        throw new ApiError(400, "All required registration fields must be provided.");
    }

    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) {
        throw new ApiError(400, "Date of birth is not valid.");
    }

    if (referenceImage !== undefined && referenceImage !== null && referenceImage !== "") {
        if (typeof referenceImage !== "string" || !referenceImage.startsWith("data:image/") ||
            referenceImage.length > 6_000_000) {
            throw new ApiError(400, "Reference image must be an image under about 4 MB.");
        }
    }

    const application = {
        _id: crypto.randomUUID(), status: "pending",
        name: clean(name), dateOfBirth: dob.toISOString(),
        gender: ["Male", "Female", "Other"].includes(gender) ? gender : "Other",
        state: clean(state), district: clean(district),
        assemblyConstituency: clean(assemblyConstituency),
        partNumber: clean(partNumber), pollingStation: clean(pollingStation),
        // Kept only until the BLO decides; removed on approval or rejection.
        referenceImage: referenceImage || null,
        submittedAt: new Date().toISOString()
    };
    await saveRegistration(application);

    res.status(201).json({
        success: true,
        message: "Registration request submitted. A Booth Level Officer will review it.",
        data: { referenceId: application._id, status: application.status }
    });
});

/** Public. Lets an applicant check their request using the reference ID they were given. */
export const getRegistrationStatus = asyncHandler(async (req, res) => {
    const id = clean(req.params.id);
    const application = UUID_PATTERN.test(id) ? await getRegistration(id) : null;
    if (!application) throw new ApiError(404, "No registration request found for that reference ID.");

    res.json({
        success: true,
        data: {
            status: application.status,
            name: application.name,
            submittedAt: application.submittedAt,
            epic: application.status === "approved" ? application.epic : null,
            note: application.status === "rejected" ? application.decisionNote || null : null
        }
    });
});
