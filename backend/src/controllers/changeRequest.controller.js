import crypto from "crypto";
import { getElectorByEpic, updateElector } from "../repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "../repositories/user.repository.js";
import {
    saveChangeRequest, getChangeRequest, listChangeRequests,
    listChangeRequestsForEpic, lockChangeRequest
} from "../repositories/changeRequest.repository.js";
import { performDocumentSanityCheck } from "../services/gemini.service.js";
import { validateGeography } from "../data/geography.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const clean = (val) => String(val ?? "").trim();
const PIN_CODE_PATTERN = /^[1-9]\d{5}$/;

/**
 * Voter submits a change / correction request (Form 8).
 * Runs an AI sanity check on the uploaded proof vs current record.
 */
export const submitChangeRequest = asyncHandler(async (req, res) => {
    const epic = req.user?.epic;
    if (!epic) throw new ApiError(401, "Sign in as a voter to request changes.");

    const elector = await getElectorByEpic(epic);
    if (!elector || !elector.isActive) {
        throw new ApiError(404, "Electoral record not found.");
    }

    const {
        name, dateOfBirth, gender, state, district,
        assemblyConstituency, address, pinCode, documentProof
    } = req.body ?? {};

    const requestedChanges = {};

    if (name && clean(name) !== clean(elector.name)) {
        if (clean(name).length < 2 || clean(name).length > 100) {
            throw new ApiError(400, "Name must be between 2 and 100 characters.");
        }
        requestedChanges.name = clean(name);
    }

    if (dateOfBirth) {
        const d = new Date(dateOfBirth);
        if (isNaN(d.getTime()) || d > new Date()) {
            throw new ApiError(400, "Invalid date of birth.");
        }
        const iso = d.toISOString();
        if (iso.slice(0, 10) !== (elector.dateOfBirth || "").slice(0, 10)) {
            requestedChanges.dateOfBirth = iso;
            requestedChanges.age = Math.max(0, new Date().getFullYear() - d.getFullYear());
        }
    }

    if (gender && ["Male", "Female", "Other"].includes(gender) && gender !== elector.gender) {
        requestedChanges.gender = gender;
    }

    if (address && clean(address) !== clean(elector.address)) {
        if (clean(address).length < 10 || clean(address).length > 300) {
            throw new ApiError(400, "Full address must be between 10 and 300 characters.");
        }
        requestedChanges.address = clean(address).replace(/\s+/g, " ");
    }

    if (pinCode && clean(pinCode) !== clean(elector.pinCode)) {
        if (!PIN_CODE_PATTERN.test(clean(pinCode))) {
            throw new ApiError(400, "Enter a valid six-digit PIN code.");
        }
        requestedChanges.pinCode = clean(pinCode);
    }

    if (state || district || assemblyConstituency) {
        const newState = clean(state || elector.state);
        const newDistrict = clean(district || elector.district);
        const newConstituency = clean(assemblyConstituency || elector.assemblyConstituency);

        const geoError = validateGeography({
            state: newState,
            district: newDistrict,
            assemblyConstituency: newConstituency
        });
        if (geoError) throw new ApiError(400, geoError);

        if (newState !== elector.state) requestedChanges.state = newState;
        if (newDistrict !== elector.district) requestedChanges.district = newDistrict;
        if (newConstituency !== elector.assemblyConstituency) requestedChanges.assemblyConstituency = newConstituency;
    }

    if (Object.keys(requestedChanges).length === 0) {
        throw new ApiError(400, "No changes detected. Update at least one field to submit a request.");
    }

    if (!documentProof || typeof documentProof !== "string") {
        throw new ApiError(400, "Supporting document proof (e.g. Aadhaar, Passport, Utility bill) is required.");
    }

    // Run Gemini AI sanity check
    const aiReview = await performDocumentSanityCheck({
        type: "change_request",
        currentRecord: elector,
        requestedData: { ...elector, ...requestedChanges },
        documentImage: documentProof
    });

    const changeRequest = {
        _id: crypto.randomUUID(),
        epic: elector.epic,
        electorId: elector._id,
        currentRecord: {
            name: elector.name,
            dateOfBirth: elector.dateOfBirth,
            gender: elector.gender,
            state: elector.state,
            district: elector.district,
            assemblyConstituency: elector.assemblyConstituency,
            address: elector.address || "—",
            pinCode: elector.pinCode || "—",
            partNumber: elector.partNumber,
            pollingStation: elector.pollingStation
        },
        requestedChanges,
        documentProof,
        aiReview,
        status: "pending",
        submittedAt: new Date().toISOString()
    };

    await saveChangeRequest(changeRequest);

    res.status(201).json({
        success: true,
        message: "Change request submitted successfully. A Booth Level Officer will review it.",
        data: {
            requestId: changeRequest._id,
            status: changeRequest.status,
            aiReview
        }
    });
});

/**
 * Voter views their submitted change requests.
 */
export const getMyChangeRequests = asyncHandler(async (req, res) => {
    const epic = req.user?.epic;
    if (!epic) throw new ApiError(401, "Sign in as a voter to view requests.");
    const requests = await listChangeRequestsForEpic(epic);
    requests.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    res.json({ success: true, data: { items: requests, total: requests.length } });
});

/**
 * BLO / Admin views pending or all change requests.
 */
export const listAllChangeRequests = asyncHandler(async (req, res) => {
    const status = req.query.status || "pending";
    const all = await listChangeRequests();
    const items = all
        .filter((r) => status === "all" || r.status === status)
        .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    res.json({ success: true, data: { items, total: items.length } });
});

/**
 * BLO approves change request:
 * Immediately updates the electoral roll (elector.repository.js) and user record!
 */
export const approveChangeRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!(await lockChangeRequest(id))) {
        throw new ApiError(409, "This change request is currently being processed.");
    }

    const request = await getChangeRequest(id);
    if (!request) throw new ApiError(404, "Change request not found.");
    if (request.status !== "pending") throw new ApiError(409, "This request has already been decided.");

    // Update electoral roll
    const updatedElector = await updateElector(request.epic, request.requestedChanges);
    if (!updatedElector) {
        throw new ApiError(404, "Voter electoral record could not be updated.");
    }

    // Update user account if name changed
    if (request.requestedChanges.name) {
        const user = await getUserByEpic(request.epic);
        if (user) {
            await saveUser({ ...user, name: request.requestedChanges.name });
        }
    }

    request.status = "approved";
    request.decidedBy = req.user.epic || req.user.bloId || req.user.name;
    request.decidedAt = new Date().toISOString();
    request.decisionNote = String(req.body?.note ?? "").slice(0, 500);

    await saveChangeRequest(request);

    res.json({
        success: true,
        message: "Change request approved. Electoral roll updated successfully.",
        data: {
            requestId: request._id,
            epic: request.epic,
            updatedElector
        }
    });
});

/**
 * BLO rejects change request with a note.
 */
export const rejectChangeRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!(await lockChangeRequest(id))) {
        throw new ApiError(409, "This change request is currently being processed.");
    }

    const request = await getChangeRequest(id);
    if (!request) throw new ApiError(404, "Change request not found.");
    if (request.status !== "pending") throw new ApiError(409, "This request has already been decided.");

    request.status = "rejected";
    request.decidedBy = req.user.epic || req.user.bloId || req.user.name;
    request.decidedAt = new Date().toISOString();
    request.decisionNote = String(req.body?.note ?? "").slice(0, 500);

    await saveChangeRequest(request);

    res.json({
        success: true,
        message: "Change request rejected.",
        data: request
    });
});
