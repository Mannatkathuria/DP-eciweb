// Elections and their schedule. Dates are calendar dates (YYYY-MM-DD, Indian Standard Time).
import { getElection } from "../repositories/election.repository.js";
import { ApiError } from "../utils/ApiErrors.js";

export const SCHEDULE_STEPS = ["notificationDate", "lastDateOfNominations", "scrutinyDate", "lastDateOfWithdrawal", "pollDate", "countingDate"];
export const ELECTION_TYPES = ["general_assembly", "general_parliament", "bye_election"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s) => DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Today's date in India (UTC+05:30), as YYYY-MM-DD. */
export const todayIST = (now = new Date()) => new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);

/** Validates a full schedule: every date present, valid and in statutory order. */
export const validateSchedule = (schedule = {}) => {
    const out = {};
    for (const step of SCHEDULE_STEPS) {
        const v = String(schedule[step] ?? "").trim();
        if (!validDate(v)) throw new ApiError(400, `${step} must be a date (YYYY-MM-DD).`);
        out[step] = v;
    }
    for (let i = 1; i < SCHEDULE_STEPS.length; i += 1) {
        const [a, b] = [SCHEDULE_STEPS[i - 1], SCHEDULE_STEPS[i]];
        // Scrutiny is the day after nominations close at the earliest; every later step is strictly after the one before.
        if (!(out[b] > out[a])) throw new ApiError(400, `${b} must be after ${a}.`);
    }
    return out;
};

export const requireElection = async (id) => {
    const election = await getElection(String(id ?? ""));
    if (!election) throw new ApiError(404, "Election not found.");
    return election;
};

/** Which stage of the schedule an election is in on `today`. */
export const electionStage = (election, today = todayIST()) => {
    const s = election.schedule;
    if (today < s.notificationDate) return "announced";
    if (today <= s.lastDateOfNominations) return "nominations_open";
    if (today < s.scrutinyDate) return "nominations_closed";
    if (today <= s.lastDateOfWithdrawal) return "scrutiny_and_withdrawal";
    if (today < s.pollDate) return "campaign";
    if (today === s.pollDate) return "poll_day";
    if (today < s.countingDate) return "awaiting_counting";
    if (today === s.countingDate) return "counting_day";
    return "completed";
};

/** Does an assignment belong to this election? Assignments name the election by id or by name. */
export const assignmentInElection = (assignment, election) =>
    !assignment.election || assignment.election === election._id || assignment.election === election.name;
