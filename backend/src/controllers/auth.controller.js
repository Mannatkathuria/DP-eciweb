import crypto from "crypto";
import { getUserByEpic } from "../repositories/user.repository.js";
import { getRegistration, saveRegistration, pendingDuplicateKey, registrationDocumentKey } from "../repositories/registration.repository.js";
import { redis, transaction } from "../config/redis.js";
import { FORM6_VERSION, SEPARATE_DOCUMENTS, buildAadhaarRecord, parseForm6, publicApplicationView } from "../utils/form6.js";
import { validateDocumentProof } from "../utils/documentProof.js";
import { geography, validateGeography } from "../data/geography.js";
import { issueOtp } from "../services/otp.service.js";
import { clearSession, publicUser, revokeAllSessions, revokeToken } from "../services/session.service.js";
import { portalRoles, ROLES, ROLE_GROUPS } from "../config/roles.js";
import { ApiError } from "../utils/ApiErrors.js";
import { auditEvent, historyFor, recordAudit } from "../services/audit.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { opsEvent, publishEvents, recordEvent } from "../services/events.service.js";

// EPIC format: three letters followed by seven digits.
export const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;

// Which account roles may use which portal's sign-in page (see config/roles.js: every role has
// its own portal, and the portal id is the role id).

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

    // BLO accounts sign in with their BLO ID, password and a mobile OTP (see blo.controller.js).
    if (user.role === "blo") {
        throw new ApiError(403, "BLO accounts sign in with their BLO ID and password.");
    }

    const allowed = portalRoles(portal);
    if (allowed && !allowed.includes(user.role)) {
        throw new ApiError(403, "This EPIC number is not authorised for this portal.");
    }

    await issueOtp(epic);

    res.status(200).json({
        success: true,
        message: "OTP generated. Continue to verification.",
        data: { epic }
    });
});

/** Public. The role catalogue (labels, groups, permissions) the sign-in and role pages are built from. */
export const getRoles = (req, res) => {
    res.json({
        success: true,
        data: {
            groups: ROLE_GROUPS,
            roles: ROLES.map(({ id, label, group, level, scope, permissions }) => ({ id, label, group, level, scope, permissions }))
        }
    });
};

export const me = asyncHandler(async (req, res) => {
    res.json({ success: true, data: publicUser(req.user) });
});

/** Signs out: the session is revoked on the server, not just forgotten by the browser. */
export const logout = asyncHandler(async (req, res) => {
    const token = req.header("Authorization")?.replace("Bearer ", "") || req.cookies?.accessToken;
    if (token) await revokeToken(token);
    clearSession(res);
    res.json({ success: true, message: "Signed out." });
});

/** Signs out every session of this account, on every device. */
export const logoutEverywhere = asyncHandler(async (req, res) => {
    await revokeAllSessions(req.user._id);
    await recordAudit(auditEvent({ actor: req.user, action: "auth.signed_out_everywhere", resource: { type: "user", id: req.user._id } }));
    clearSession(res);
    res.json({ success: true, message: "Signed out on every device." });
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (value) => String(value ?? "").trim();
// Indian PIN code: six digits, the first of which is not zero.
export const PIN_CODE_PATTERN = /^[1-9]\d{5}$/;
const ADDRESS_MIN = 10;
const ADDRESS_MAX = 300;

/** Public. State/UT -> district -> assembly constituency options for the registration form. */
export const getGeography = (req, res) => {
    // Browsers re-check on every load (Express adds an ETag, so an unchanged list costs a 304),
    // so an updated constituency dataset reaches everyone at once instead of after a day.
    res.set("Cache-Control", "no-cache");
    res.json({ success: true, data: geography });
};

/**
 * Public. A voter submits a registration request. This does NOT create an account:
 * it only stores a pending application that a BLO must approve. The applicant can
 * sign in only after approval.
 */
import { performDocumentSanityCheck } from "../services/gemini.service.js";

export const submitRegistration = asyncHandler(async (req, res) => {
    // The Form 6 page sends { form6, documents }; every field is validated in utils/form6.js and the
    // flat fields below are derived from it. Older clients still send the flat fields directly.
    const form6 = req.body?.form6 !== undefined ? parseForm6(req.body.form6, req.body.documents) : null;
    const {
        name, dateOfBirth, gender, state, district,
        assemblyConstituency, address, pinCode, referenceImage
    } = form6 ? form6.legacy : (req.body ?? {});

    if (![name, dateOfBirth, state, district, assemblyConstituency, address, pinCode]
        .every((v) => clean(v))) {
        throw new ApiError(400, "All required registration fields must be provided.");
    }

    const fullAddress = clean(address).replace(/\s+/g, " ");
    if (fullAddress.length < ADDRESS_MIN || fullAddress.length > ADDRESS_MAX) {
        throw new ApiError(400, `Full address must be between ${ADDRESS_MIN} and ${ADDRESS_MAX} characters.`);
    }
    if (!PIN_CODE_PATTERN.test(clean(pinCode))) {
        throw new ApiError(400, "Enter a valid six-digit PIN code.");
    }

    const geographyError = validateGeography({
        state: clean(state), district: clean(district), assemblyConstituency: clean(assemblyConstituency)
    });
    if (geographyError) throw new ApiError(400, geographyError);

    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) {
        throw new ApiError(400, "Date of birth is not valid.");
    }

    // Form 6 asks for an identity / address proof document; an application without one is refused.
    const proofDocument = validateDocumentProof(referenceImage, "An identity / address proof document");

    // The same applicant details cannot be queued twice while the first application awaits review.
    const applicationId = crypto.randomUUID();
    const duplicateFingerprint = crypto.createHash("sha256").update([
        clean(name).toLowerCase().replace(/\s+/g, " "), dob.toISOString().slice(0, 10),
        clean(pinCode), fullAddress.toLowerCase()
    ].join("|")).digest("hex");
    const duplicateKey = pendingDuplicateKey(duplicateFingerprint);
    if (!(await claimDuplicateKey(duplicateKey, applicationId))) {
        throw new ApiError(409, "An application with these details is already awaiting BLO review. Use your reference ID to check its status.");
    }

    let application;
    try {
        // Run AI sanity check on new registration
        const aiReview = await performDocumentSanityCheck({
            type: "registration",
            requestedData: {
                name: clean(name),
                dateOfBirth: dob.toISOString(),
                gender,
                state: clean(state),
                district: clean(district),
                assemblyConstituency: clean(assemblyConstituency),
                address: fullAddress,
                pinCode: clean(pinCode)
            },
            documentImage: proofDocument
        });

        application = {
            _id: applicationId, status: "pending",
            name: clean(name), dateOfBirth: dob.toISOString(),
            gender: ["Male", "Female", "Other"].includes(gender) ? gender : "Other",
            state: clean(state), district: clean(district),
            assemblyConstituency: clean(assemblyConstituency),
            address: fullAddress, pinCode: clean(pinCode),
            referenceImage: proofDocument,
            aiReview,
            duplicateFingerprint,
            submittedAt: new Date().toISOString()
        };
        if (form6) {
            // The application and its documents are written in one transaction: either all of
            // them are stored or none is, so a record never points to a missing file.
            application.formVersion = FORM6_VERSION;
            application.form6 = { ...form6.record, aadhaar: buildAadhaarRecord(form6.aadhaar, applicationId) };
            application.documents = form6.documentMeta;
            application.updatedAt = application.submittedAt;
            const tx = transaction();
            for (const category of SEPARATE_DOCUMENTS) {
                const file = form6.files[category];
                tx.set(registrationDocumentKey(applicationId, category), JSON.stringify({
                    mimeType: file.mimeType, size: file.size, fileName: file.fileName,
                    uploadedAt: form6.documentMeta[category].uploadedAt, data: file.base64
                }));
            }
            saveRegistration(application, tx);
            const liveEvent = recordEvent(opsEvent({ type: "APPLICATION_SUBMITTED", jurisdiction: { state: application.state, district: application.district, constituency: application.assemblyConstituency }, payload: { kind: "form6" } }), tx);
            await tx.exec();
            await publishEvents(liveEvent);
        } else {
            await saveRegistration(application);
        }
    } catch (error) {
        // Nothing was stored, so the applicant must be able to try again.
        await redis().del(duplicateKey).catch(() => {});
        throw error;
    }
    const { aiReview } = application;

    res.status(201).json({
        success: true,
        message: "Registration request submitted. Your Booth Level Officer will verify it and the Electoral Registration Officer will decide.",
        data: { referenceId: application._id, status: application.status, aiReview }
    });
});

/**
 * Claims the "already pending" marker for these applicant details. A marker left by an
 * application that has since been decided (or no longer exists) is taken over.
 */
const claimDuplicateKey = async (duplicateKey, applicationId) => {
    if ((await redis().set(duplicateKey, applicationId, { NX: true })) === "OK") return true;
    const existingId = await redis().get(duplicateKey);
    const existing = existingId ? await getRegistration(existingId) : null;
    // Still awaiting field verification or the ERO/AERO decision.
    if (["pending", "field_verified"].includes(existing?.status)) return false;
    await redis().set(duplicateKey, applicationId);
    return true;
};

const APPLICANT_STEPS = {
    "registration.field_verified": "field_verified",
    "registration.information_requested": "information_requested",
    "registration.information_provided": "information_provided",
    "registration.reverification_requested": "reverification_requested",
    "registration.approved": "approved",
    "registration.rejected": "rejected"
};

/** Proves the caller is the applicant: the reference ID (in the URL) and the date of birth they gave. */
export const applicantCheck = (req, application) => {
    const given = new Date(String(req.body?.dateOfBirth ?? ""));
    if (Number.isNaN(given.getTime()) || given.toISOString().slice(0, 10) !== String(application.dateOfBirth).slice(0, 10)) {
        throw new ApiError(403, "The date of birth does not match this application.");
    }
};

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
            note: application.status === "rejected" ? application.decisionNote || null : null,
            // What the ERO/AERO asked for, when they need more information from the applicant.
            informationRequest: application.informationRequest
                ? { note: application.informationRequest.note, at: application.informationRequest.at, respondedAt: application.informationRequest.respondedAt }
                : null,
            // The saved application, with contact details and Aadhaar masked and no files.
            application: publicApplicationView(application),
            // Official status history for the applicant: which step happened when. Officers'
            // identities and internal notes are not shown.
            timeline: [
                { step: "submitted", at: application.submittedAt },
                ...(await historyFor("registration", application._id))
                    .filter((e) => APPLICANT_STEPS[e.action])
                    .map((e) => ({ step: APPLICANT_STEPS[e.action], at: e.at }))
            ]
        }
    });
});
