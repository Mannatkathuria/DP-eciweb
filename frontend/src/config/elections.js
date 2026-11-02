// Labels shared by the election pages.
export const SCHEDULE_STEPS = [
    ["notificationDate", "Notification"], ["lastDateOfNominations", "Last date of nominations"], ["scrutinyDate", "Scrutiny"],
    ["lastDateOfWithdrawal", "Last date of withdrawal"], ["pollDate", "Poll"], ["countingDate", "Counting"]
];
export const STAGE_LABEL = {
    announced: "Announced", nominations_open: "Nominations open", nominations_closed: "Nominations closed",
    scrutiny_and_withdrawal: "Scrutiny and withdrawal", campaign: "Campaign", poll_day: "Poll day",
    awaiting_counting: "Awaiting counting", counting_day: "Counting day", completed: "Completed"
};
export const TYPE_LABEL = { general_assembly: "General election to the Legislative Assembly", general_parliament: "General election to the Lok Sabha", bye_election: "Bye-election" };
export const NOMINATION_STATUS = { filed: "Filed, awaiting scrutiny", accepted: "Accepted", rejected: "Rejected", withdrawn: "Withdrawn" };
export const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
export const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;
