import crypto from "crypto";
import { transaction } from "../config/redis.js";
import { getNomination, getStation, listNominations } from "../repositories/election.repository.js";
import { getUserByEpic } from "../repositories/user.repository.js";
import { getAssignment, listAllAssignments, listAssignmentsForUser, saveAssignment } from "../repositories/assignment.repository.js";
import { requireElection, todayIST } from "../services/election.service.js";
import { assertCovers, assignmentInEffect } from "../services/authority.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Agents appointed by a contesting candidate (Conduct of Elections Rules, 1961):
//   election agent   one per candidate (RP Act 1951 s.40; Form 8), appointed by the candidate
//   polling agent    one per polling station per candidate (s.46; Form 10)
//   counting agent   at the counting centre (s.47; Form 18), up to the number of counting tables
// Polling and counting agents may be appointed by the candidate or by their election agent. An
// appointment becomes an ordinary assignment of the agent's account, tied to the candidate's
// nomination, so the existing jurisdiction checks apply. Revoking it is immediate and audited.

export const AGENT_TYPES = {
    election: { role: "election_agent", label: "election agent", max: 1 },
    polling: { role: "polling_agent", label: "polling agent" },
    counting: { role: "counting_agent", label: "counting agent", max: Number(process.env.MAX_COUNTING_AGENTS) || 15 }
};

const LIVE_NOMINATION = ["filed", "accepted"];

/** The nomination the caller acts for: their own (candidate) or the one they are election agent for. */
const actingNomination = async (req, electionId) => {
    if (req.user.role === "candidate") {
        const own = (await listNominations()).find((n) => n.userId === req.user._id && n.electionId === electionId && LIVE_NOMINATION.includes(n.status));
        if (!own) throw new ApiError(409, "You need a live nomination in this election to appoint agents.");
        return { nomination: own, as: "candidate" };
    }
    if (req.user.role === "election_agent") {
        const mine = (await listAssignmentsForUser(req.user._id)).find((a) => assignmentInEffect(a) && a.role === "election_agent" && a.appointedFor);
        const nomination = mine && await getNomination(mine.appointedFor);
        if (!nomination || nomination.electionId !== electionId || !LIVE_NOMINATION.includes(nomination.status)) {
            throw new ApiError(403, "You are not the election agent of a candidate in this election.");
        }
        return { nomination, as: "election_agent" };
    }
    throw new ApiError(403, "Only a candidate or their election agent appoints agents.");
};

const appointmentsFor = async (nominationId) => (await listAllAssignments())
    .filter((a) => a.appointedFor === nominationId);

export const appointAgent = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const type = String(body.type ?? "");
    const spec = AGENT_TYPES[type];
    if (!spec) throw new ApiError(400, "type must be election, polling or counting.");
    const election = await requireElection(body.electionId);
    if (todayIST() > election.schedule.countingDate) throw new ApiError(409, "This election is over.");
    const { nomination, as } = await actingNomination(req, election._id);
    if (type === "election" && as !== "candidate") throw new ApiError(403, "Only the candidate appoints their election agent.");

    const agent = await getUserByEpic(String(body.epic ?? "").trim().toUpperCase());
    if (!agent) throw new ApiError(404, "No account found for that identifier.");
    if (agent.role !== spec.role) throw new ApiError(409, `This account is not a ${spec.label} account (it holds "${agent.role}").`);

    const area = { state: nomination.state, district: nomination.district, constituency: nomination.constituency };
    let jurisdiction = area;
    if (type === "polling") {
        const station = await getStation(String(body.stationId ?? ""));
        if (!station || station.status !== "ACTIVE" || station.constituency !== nomination.constituency || station.state !== nomination.state) {
            throw new ApiError(400, "Choose an approved polling station in your constituency.");
        }
        jurisdiction = { ...area, pollingStation: station.name, partNumber: station.partNumber };
    }

    const existing = (await appointmentsFor(nomination._id)).filter((a) => a.status === "active" && a.role === spec.role);
    if (existing.some((a) => a.userId === agent._id)) throw new ApiError(409, `This person is already your ${spec.label}.`);
    if (spec.max && existing.length >= spec.max) throw new ApiError(409, `You can appoint at most ${spec.max} ${spec.label}${spec.max > 1 ? "s" : ""}. Revoke one first.`);
    if (type === "polling" && existing.some((a) => a.jurisdiction.partNumber === jurisdiction.partNumber)) {
        throw new ApiError(409, "You already have a polling agent at this station. Revoke that appointment first.");
    }

    const now = new Date().toISOString();
    const assignment = {
        _id: crypto.randomUUID(), userId: agent._id, epic: agent.epic, role: spec.role, election: election._id, jurisdiction,
        validFrom: null, validUntil: null, status: "active",
        appointedFor: nomination._id, candidateName: nomination.name, party: nomination.party, agentType: type,
        grantedBy: req.user.epic, grantedByRole: as, grantedAt: now, revokedBy: null, revokedAt: null, revokeReason: null
    };
    const tx = transaction();
    saveAssignment(assignment, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "agent.appointed", resource: { type: "nomination", id: nomination._id },
        jurisdiction, after: { agentType: type, epic: agent.epic, assignmentId: assignment._id } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, message: `${spec.label[0].toUpperCase()}${spec.label.slice(1)} appointed.`, data: assignment });
});

export const revokeAgent = asyncHandler(async (req, res) => {
    const reason = requireReason(req.body?.reason, "revocation");
    const assignment = await getAssignment(req.params.id);
    if (!assignment?.appointedFor) throw new ApiError(404, "Appointment not found.");
    const nomination = await getNomination(assignment.appointedFor);
    const { nomination: mine, as } = await actingNomination(req, nomination.electionId);
    if (mine._id !== nomination._id) throw new ApiError(404, "Appointment not found.");
    if (assignment.agentType === "election" && as !== "candidate") throw new ApiError(403, "Only the candidate revokes their election agent.");
    if (assignment.status !== "active") throw new ApiError(409, "This appointment has already been revoked.");
    const revoked = { ...assignment, status: "revoked", revokedBy: req.user.epic, revokedAt: new Date().toISOString(), revokeReason: reason };
    const tx = transaction();
    saveAssignment(revoked, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "agent.revoked", resource: { type: "nomination", id: nomination._id },
        jurisdiction: assignment.jurisdiction, before: { status: "active", epic: assignment.epic }, after: { status: "revoked" }, note: reason }), tx);
    await tx.exec();
    res.json({ success: true, message: "Appointment revoked.", data: revoked });
});

/** Candidate or election agent: their own appointments. */
export const myAgents = asyncHandler(async (req, res) => {
    const election = await requireElection(req.query.electionId);
    const { nomination } = await actingNomination(req, election._id);
    const items = (await appointmentsFor(nomination._id)).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
    res.json({ success: true, data: { nominationId: nomination._id, candidateName: nomination.name, area: { state: nomination.state, district: nomination.district, constituency: nomination.constituency }, items } });
});

/** RO / ARO: every agent appointed in their constituency for an election. */
export const agentsInConstituency = asyncHandler(async (req, res) => {
    const election = await requireElection(req.query.electionId);
    const items = (await listAllAssignments())
        .filter((a) => a.appointedFor && a.election === election._id && a.status === "active")
        .filter((a) => { try { assertCovers(req.authority.assignments, { ...a.jurisdiction, assemblyConstituency: a.jurisdiction.constituency }); return true; } catch { return false; } })
        .map(({ userId, ...a }) => a)
        .sort((a, b) => a.candidateName.localeCompare(b.candidateName) || a.agentType.localeCompare(b.agentType));
    res.json({ success: true, data: { items } });
});
