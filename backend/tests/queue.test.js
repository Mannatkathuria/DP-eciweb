import test from "node:test";
import assert from "node:assert/strict";

// Queue estimates use the station's measured pace, never a fixed guess, and say when they are stale.
const { serviceRate, queueEstimate } = await import("../src/services/queue.service.js");
const now = Date.parse("2026-11-03T10:00:00Z");
const ago = (min) => new Date(now - min * 60000).toISOString();

test("service rate: measured from recent marks; too few marks give no rate", () => {
    assert.equal(serviceRate([{ at: ago(1) }, { at: ago(2) }], now), null);
    const steady = Array.from({ length: 30 }, (_, i) => ({ at: ago(i + 0.5) })); // one a minute for 30 minutes
    assert.ok(Math.abs(serviceRate(steady, now) - 1) < 0.05);
    // A poll that opened ten minutes ago with 20 marks: 2 a minute, not 20/30.
    const early = Array.from({ length: 20 }, (_, i) => ({ at: ago(10 - i * 0.5) }));
    assert.ok(serviceRate(early, now) > 1.9);
    // Offline marks count at the time the officer acted.
    assert.equal(serviceRate([{ at: ago(0), actedAt: ago(90) }, { at: ago(0), actedAt: ago(91) }, { at: ago(0), actedAt: ago(92) }], now), null);
});

test("estimate: minutes from the waiting count and the pace; stale and closed are explicit", () => {
    const register = Array.from({ length: 30 }, (_, i) => ({ at: ago(i + 0.5) }));
    assert.deepEqual(
        (({ status, waiting, minutes }) => ({ status, waiting, minutes }))(queueEstimate({ queue: { waiting: 12, at: ago(5) }, register, pollStatus: "open", now })),
        { status: "estimated", waiting: 12, minutes: 12 });
    const stale = queueEstimate({ queue: { waiting: 12, at: ago(45) }, register, pollStatus: "open", now });
    assert.equal(stale.status, "stale"); assert.equal(stale.minutes, null);
    assert.equal(queueEstimate({ queue: { waiting: 4, at: ago(1) }, register: [], pollStatus: "open", now }).status, "insufficient_data");
    assert.equal(queueEstimate({ queue: null, register, pollStatus: "open", now }).status, "unknown");
    assert.equal(queueEstimate({ queue: { waiting: 4, at: ago(1) }, register, pollStatus: "closed", now }).status, "closed");
});
