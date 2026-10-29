import crypto from "crypto";
import { getUserByEpic, saveUser, listUsers } from "../repositories/user.repository.js";
import { getElectorByEpic, listElectors } from "../repositories/elector.repository.js";
import {
    createBlo, generateTemporaryPassword, hashPassword,
    STATE_CODE_PATTERN, MOBILE_PATTERN, normaliseBloId
} from "../services/blo.service.js";
import { redis } from "../config/redis.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * ECI Official lists all registered Booth Level Officers
 */
export const listBloOfficers = asyncHandler(async (req, res) => {
    const allUsers = await listUsers();
    const bloUsers = allUsers.filter((u) => u.role === "blo");
    const electors = Object.fromEntries((await listElectors()).map((e) => [e.epic, e]));

    const items = bloUsers.map((u) => {
        const elector = electors[u.epic] || electors[u.voterEpic] || null;
        return {
            _id: u._id,
            bloId: u.bloId || u.epic,
            epic: u.voterEpic || u.epic,
            name: u.name || elector?.name || "BLO Officer",
            mobile: u.mobile || "—",
            state: u.state || elector?.state || "—",
            assignedStation: elector?.pollingStation || "Booth Jurisdiction Assigned",
            createdAt: u.createdAt
        };
    });

    res.json({ success: true, data: { items, total: items.length } });
});

/**
 * ECI Official promotes a voter EPIC to BLO role
 */
export const assignBloRole = asyncHandler(async (req, res) => {
    const { epic, state, mobile } = req.body ?? {};
    const cleanEpic = String(epic ?? "").trim().toUpperCase();

    if (!cleanEpic) throw new ApiError(400, "Voter EPIC number is required.");

    const elector = await getElectorByEpic(cleanEpic);
    if (!elector) {
        throw new ApiError(404, `No elector found on the electoral roll with EPIC '${cleanEpic}'.`);
    }

    let existingUser = await getUserByEpic(cleanEpic);
    const stateCode = String(state || elector.state || "UP").slice(0, 2).toUpperCase();
    const cleanMobile = String(mobile || "9876543210").replace(/[\s-]/g, "");

    // Generate unique BLO serial and ID
    const serial = await redis().incr(`blo:serial:${stateCode}`);
    const bloId = `BLO-${stateCode}-${String(serial).padStart(6, "0")}`;

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const bloUser = {
        _id: existingUser?._id || crypto.randomUUID(),
        epic: cleanEpic,
        voterEpic: cleanEpic,
        bloId,
        name: existingUser?.name || elector.name,
        role: "blo",
        mobile: cleanMobile,
        state: stateCode,
        passwordHash,
        mustChangePassword: false, // allow immediate sign in with generated password
        createdAt: new Date().toISOString()
    };

    // Save under both EPIC and BLO ID so sign-in works seamlessly
    await saveUser(bloUser);
    await redis().set(`user:${bloId}`, JSON.stringify(bloUser));

    res.status(201).json({
        success: true,
        message: `BLO role assigned to ${elector.name} (${cleanEpic}).`,
        data: {
            bloId,
            epic: cleanEpic,
            name: elector.name,
            temporaryPassword,
            mobile: cleanMobile,
            state: stateCode
        }
    });
});

/**
 * ECI Official revokes BLO role from an EPIC / BLO ID
 */
export const removeBloRole = asyncHandler(async (req, res) => {
    const identifier = String(req.body?.epic || req.body?.bloId || req.params.id || "").trim().toUpperCase();
    if (!identifier) throw new ApiError(400, "EPIC or BLO ID is required.");

    const user = await getUserByEpic(identifier);
    if (!user) throw new ApiError(404, "User account not found.");

    if (user.role !== "blo") {
        throw new ApiError(400, "This user does not currently hold a BLO role.");
    }

    // Demote to voter
    user.role = "voter";
    user.bloId = null;
    user.passwordHash = null;
    user.updatedAt = new Date().toISOString();

    await saveUser(user);
    if (identifier.startsWith("BLO-")) {
        await redis().del(`user:${identifier}`);
    }

    res.json({
        success: true,
        message: `BLO role successfully revoked for ${user.name} (${user.epic}). Reverted to voter role.`,
        data: { epic: user.epic, role: user.role }
    });
});

/**
 * ECI Official searches voters/electors to check their BLO status and voting status
 */
export const searchEciVoters = asyncHandler(async (req, res) => {
    const query = String(req.query.q || "").trim().toLowerCase();
    const allElectors = await listElectors();
    const allUsers = Object.fromEntries((await listUsers()).map(u => [u.epic, u]));

    const filtered = allElectors.filter(e =>
        !query ||
        e.epic.toLowerCase().includes(query) ||
        e.name.toLowerCase().includes(query) ||
        (e.assemblyConstituency && e.assemblyConstituency.toLowerCase().includes(query))
    );

    const items = filtered.slice(0, 50).map(e => {
        const u = allUsers[e.epic];
        return {
            epic: e.epic,
            name: e.name,
            dateOfBirth: e.dateOfBirth,
            gender: e.gender,
            state: e.state,
            district: e.district,
            assemblyConstituency: e.assemblyConstituency,
            partNumber: e.partNumber,
            pollingStation: e.pollingStation,
            role: u?.role || "voter",
            bloId: u?.bloId || null,
            hasVoted: Boolean(e.hasVoted),
            votedAt: e.votedAt || null
        };
    });

    res.json({ success: true, data: { items, total: items.length } });
});
