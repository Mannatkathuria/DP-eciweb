// Which candidate, election and constituency a candidate or election agent acts for.
// A candidate acts for their own nomination (or, before filing, for their candidate assignment);
// an election agent acts only for the candidate whose nomination they were appointed to.
import { getNomination, listNominations } from "../repositories/election.repository.js";
import { listAssignmentsForUser } from "../repositories/assignment.repository.js";
import { assignmentInEffect } from "./authority.service.js";
import { electionFor } from "./workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";

const LIVE = ["filed", "accepted"];

export const campaignContext = async (req) => {
    const assignments = (await listAssignmentsForUser(req.user._id)).filter(assignmentInEffect);
    if (req.user.role === "candidate") {
        const nominations = (await listNominations()).filter((n) => n.userId === req.user._id && LIVE.includes(n.status));
        const nomination = nominations.sort((a, b) => String(b.filedAt).localeCompare(String(a.filedAt)))[0] ?? null;
        const assignment = assignments.find((a) => a.role === "candidate") ?? req.authority?.assignments?.find((a) => a.role === "candidate") ?? null;
        const election = nomination ? { _id: nomination.electionId } : await electionFor(assignment);
        const area = nomination ? { state: nomination.state, district: nomination.district, constituency: nomination.constituency } : assignment?.jurisdiction;
        if (!election || !area?.constituency) throw new ApiError(409, "You need a candidate assignment or a nomination in an election first.");
        return { electionId: election._id, area: { state: area.state, district: area.district, constituency: area.constituency },
            candidate: { name: nomination?.name ?? req.user.name, party: nomination?.party ?? null, nominationId: nomination?._id ?? null, epic: req.user.epic }, as: "candidate" };
    }
    if (req.user.role === "election_agent") {
        const mine = assignments.find((a) => a.role === "election_agent" && a.appointedFor);
        const nomination = mine && await getNomination(mine.appointedFor);
        if (nomination && LIVE.includes(nomination.status)) {
            return { electionId: nomination.electionId, area: { state: nomination.state, district: nomination.district, constituency: nomination.constituency },
                candidate: { name: nomination.name, party: nomination.party ?? null, nominationId: nomination._id, epic: nomination.epic ?? null }, as: "election_agent" };
        }
        // Seeded demo agents carry a plain assignment to the demo election and constituency.
        const plain = assignments.find((a) => a.role === "election_agent") ?? req.authority?.assignments?.find((a) => a.role === "election_agent");
        const election = await electionFor(plain);
        if (!election || !plain?.jurisdiction?.constituency) throw new ApiError(403, "You are not the election agent of a candidate in an election.");
        return { electionId: election._id, area: { state: plain.jurisdiction.state, district: plain.jurisdiction.district, constituency: plain.jurisdiction.constituency },
            candidate: { name: plain.candidateName ?? "Candidate (not named in the appointment)", party: null, nominationId: null, epic: null }, as: "election_agent" };
    }
    throw new ApiError(403, "Only a candidate or their election agent can do this.");
};
