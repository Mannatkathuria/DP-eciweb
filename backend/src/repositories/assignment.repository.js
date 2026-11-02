import { jsonGet, redis } from "../config/redis.js";

// An assignment ties one account to one role, for one election (optional) and one jurisdiction.
// Assignments are never deleted: revoking one marks it revoked and keeps it for the audit trail.
//
//   {
//     _id, userId, epic, role,
//     election: "Demo general election" | null,
//     jurisdiction: { state?, district?, constituency?, pollingStation?, partNumber? },
//     status: "active" | "revoked",
//     grantedBy, grantedAt, revokedBy, revokedAt, revokeReason
//   }

const key = (id) => `assignment:${id}`;
const userKey = (userId) => `assignments:user:${userId}`;

export const getAssignment = async (id) => jsonGet(key(id));

// Pass a transaction (see config/redis.js) to queue the writes instead of running them now.
export const saveAssignment = async (assignment, tx = null) => {
    const target = tx ?? redis().multi();
    target.set(key(assignment._id), JSON.stringify(assignment));
    target.sAdd(userKey(assignment.userId), assignment._id);
    target.sAdd("assignments:all", assignment._id);
    if (!tx) await target.exec();
    return assignment;
};

export const listAssignmentsForUser = async (userId) => {
    const ids = await redis().sMembers(userKey(userId));
    return (await Promise.all(ids.map(getAssignment))).filter(Boolean);
};

export const listAllAssignments = async () => {
    const ids = await redis().sMembers("assignments:all");
    return (await Promise.all(ids.map(getAssignment))).filter(Boolean);
};
