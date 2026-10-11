import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getUserByUsername, saveUser } from "../repositories/user.repository.js";
import { saveElector } from "../repositories/elector.repository.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const publicUser = (user) => ({
    _id: user._id, username: user.username, role: user.role, epic: user.epic || null
});

export const login = asyncHandler(async (req, res) => {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!username || !password) throw new ApiError(400, "Username and password are required.");

    const user = await getUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new ApiError(401, "Invalid username or password.");
    }

    const token = jwt.sign(
        { _id: user._id, username: user.username, role: user.role, epic: user.epic || null },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "8h" }
    );

    res.cookie("accessToken", token, {
        httpOnly: true, sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60 * 1000
    });

    res.status(200).json({ success: true, message: "Signed in.", token, user: publicUser(user) });
});

export const me = asyncHandler(async (req, res) => {
    res.json({ success: true, data: publicUser(req.user) });
});

export const logout = asyncHandler(async (req, res) => {
    res.clearCookie("accessToken");
    res.json({ success: true, message: "Signed out." });
});

export const registerVoter = asyncHandler(async (req, res) => {
    const {
        username, password, name, dateOfBirth, gender, state, district,
        assemblyConstituency, partNumber, pollingStation, referenceImage
    } = req.body ?? {};

    if (!username || !password || !name || !dateOfBirth || !state || !district ||
        !assemblyConstituency || !partNumber || !pollingStation) {
        throw new ApiError(400, "All required registration fields must be provided.");
    }

    const normalUsername = String(username).trim().toLowerCase();
    if (await getUserByUsername(normalUsername)) {
        throw new ApiError(409, "Username is already registered.");
    }

    const epic = `DEM${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const elector = {
        _id: crypto.randomUUID(), epic, name: String(name).trim(),
        dateOfBirth: new Date(dateOfBirth).toISOString(),
        age: Math.max(0, new Date().getFullYear() - new Date(dateOfBirth).getFullYear()),
        gender: gender || "Other", state: String(state).trim(), district: String(district).trim(),
        assemblyConstituency: String(assemblyConstituency).trim(),
        partNumber: String(partNumber).trim(), pollingStation: String(pollingStation).trim(),
        photoUrl: null, isActive: true, registeredAt: new Date().toISOString()
    };
    await saveElector(elector);

    const user = {
        _id: crypto.randomUUID(), username: normalUsername,
        passwordHash: await bcrypt.hash(password, 12), role: "voter", epic,
        createdAt: new Date().toISOString()
    };
    await saveUser(user);

    let biometricEnrolled = false;
    if (referenceImage) {
        try {
            const { enrollFace } = await import("../services/faceClient.js");
            await enrollFace({ epic, image: referenceImage });
            biometricEnrolled = true;
        } catch (error) {
            console.error("Reference face enrollment failed:", error.message);
        }
    }

    res.status(201).json({
        success: true, message: "Voter registration submitted.",
        data: { epic, username: normalUsername, biometricEnrolled }
    });
});
