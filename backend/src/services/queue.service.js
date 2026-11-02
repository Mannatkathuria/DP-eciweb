// Queue estimates at a polling station. The waiting count is anonymous (a number the polling
// party reports, never linked to anyone); the time estimate uses the station's own measured
// service rate (electors marked in the register over the last 30 minutes), not a fixed guess.
// It is guidance for voters and the control room, not turnout data.

export const RATE_WINDOW_MIN = 30;
export const MIN_SAMPLE = 3;          // fewer marks than this in the window: no estimate
export const STALE_MIN = 30;          // a queue report older than this is shown as stale

/** Electors served per minute over the window ending at `now`, or null when there is too little data. */
export const serviceRate = (register, now = Date.now(), windowMin = RATE_WINDOW_MIN) => {
    const from = now - windowMin * 60000;
    const times = register.map((r) => Date.parse(r.actedAt ?? r.at)).filter((t) => Number.isFinite(t) && t > from && t <= now).sort((a, b) => a - b);
    if (times.length < MIN_SAMPLE) return null;
    // Measure over the span actually observed (at least 5 minutes), so a poll that opened ten
    // minutes ago is not divided by thirty.
    const span = Math.max(5, Math.min(windowMin, (now - times[0]) / 60000));
    return times.length / span;
};

/** The estimate shown to voters and officials. */
export const queueEstimate = ({ queue, register, pollStatus, now = Date.now() }) => {
    if (pollStatus !== "open") return { status: pollStatus === "closed" ? "closed" : "not_open", waiting: null, minutes: null, perMinute: null };
    if (!queue) return { status: "unknown", waiting: null, minutes: null, perMinute: null };
    const age = (now - Date.parse(queue.at)) / 60000;
    const rate = serviceRate(register, now);
    const minutes = rate ? Math.round(queue.waiting / rate) : null;
    return {
        status: age > STALE_MIN ? "stale" : rate ? "estimated" : "insufficient_data",
        waiting: queue.waiting, reportedAt: queue.at, reportAgeMinutes: Math.round(age),
        perMinute: rate ? Math.round(rate * 100) / 100 : null,
        minutes: age > STALE_MIN ? null : minutes,
        basis: rate ? `${RATE_WINDOW_MIN}-minute measured service rate` : null
    };
};
