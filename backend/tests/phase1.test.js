import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Phase 1: new-voter pipeline (approved sources, ingestion, qualifying dates, BLO tasks),
// published roll versions and the applicant's status timeline.
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = "";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const { assessEligibility, qualifyingDateOnOrAfter } = await import("../src/services/eligibility.service.js");
const { validateSourceRecord, pickBlo } = await import("../src/services/ingestion.service.js");
const { diffEntries } = await import("../src/controllers/rollVersion.controller.js");

const d = (s) => new Date(`${s}T00:00:00Z`);

// ---------------------------------------------------------------- eligibility (no Redis)

test("qualifying dates: 1 Jan, 1 Apr, 1 Jul, 1 Oct; a date that is one counts", () => {
    assert.equal(qualifyingDateOnOrAfter(d("2026-01-01")).toISOString().slice(0, 10), "2026-01-01");
    assert.equal(qualifyingDateOnOrAfter(d("2026-01-02")).toISOString().slice(0, 10), "2026-04-01");
    assert.equal(qualifyingDateOnOrAfter(d("2026-09-30")).toISOString().slice(0, 10), "2026-10-01");
    assert.equal(qualifyingDateOnOrAfter(d("2026-10-02")).toISOString().slice(0, 10), "2027-01-01");
});

test("eligibility: 18 on a past qualifying date is ELIGIBLE; 17+ is ADVANCE; younger is FUTURE", () => {
    const today = d("2026-11-02");
    // 18th birthday 2026-05-10 -> first qualifying date 2026-07-01, already passed.
    assert.deepEqual(assessEligibility("2008-05-10", today), { status: "ELIGIBLE", qualifyingDate: "2026-07-01", eighteenOn: "2026-05-10" });
    // 18 on 2026-10-01 exactly: eligible from that date.
    assert.equal(assessEligibility("2008-10-01", today).status, "ELIGIBLE");
    // 18 on 2026-10-02: next qualifying date 2027-01-01, still ahead -> advance application.
    assert.deepEqual(assessEligibility("2008-10-02", today), { status: "ADVANCE", qualifyingDate: "2027-01-01", eighteenOn: "2026-10-02" });
    // Turned 17 today -> advance.
    assert.equal(assessEligibility("2009-11-02", today).status, "ADVANCE");
    // 17 tomorrow -> future.
    assert.equal(assessEligibility("2009-11-03", today).status, "FUTURE");
    // 29 February: 18th birthday counts from 1 March.
    assert.equal(assessEligibility("2008-02-29", today).eighteenOn, "2026-03-01");
    assert.equal(assessEligibility("2008-02-29", today).qualifyingDate, "2026-04-01");
    // Invalid or future dates.
    for (const bad of ["2008-02-30", "not-a-date", "", "2030-01-01"]) assert.equal(assessEligibility(bad, today), null, bad);
});

test("source records: only the minimum fields are kept, and invalid records explain why", () => {
    const { record } = validateSourceRecord({ sourceReference: "R-1", name: " Asha  Rani ", dateOfBirth: "2008-01-15",
        state: "punjab", district: "ludhiana", constituency: "ludhiana south", religion: "x", phone: "999", aadhaar: "1234" });
    assert.equal(record.name, "Asha Rani");
    assert.deepEqual(record.jurisdiction, { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South" });
    assert.equal(record.religion, undefined); assert.equal(record.phone, undefined); assert.equal(record.aadhaar, undefined);
    assert.match(validateSourceRecord({ name: "A B" }).error, /sourceReference/);
    assert.match(validateSourceRecord({ sourceReference: "R", name: "Asha", dateOfBirth: "2008-01-01", state: "Atlantis" }).error, /State/);
});

test("BLO routing: booth match wins; one BLO covers all; several BLOs and no booth stays unassigned", () => {
    const area = { state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South" };
    const a = { _id: "a", jurisdiction: { ...area, pollingStation: "School A", partNumber: "1" } };
    const b = { _id: "b", jurisdiction: { ...area, pollingStation: "School B", partNumber: "2" } };
    assert.equal(pickBlo([a, b], { ...area, partNumber: "2" })._id, "b");
    assert.equal(pickBlo([a], area)._id, "a");
    assert.equal(pickBlo([a, b], area), null);
    assert.equal(pickBlo([a, b], { ...area, constituency: "Ludhiana North" }), null);
});

test("roll diff: added, removed and modified entries by EPIC", () => {
    const before = [{ epic: "A", name: "x" }, { epic: "B", name: "y" }];
    const after = [{ epic: "B", name: "z" }, { epic: "C", name: "w" }];
    const diff = diffEntries(before, after);
    assert.deepEqual(diff.added, ["C"]); assert.deepEqual(diff.removed, ["A"]);
    assert.deepEqual(diff.modified.map((m) => m.epic), ["B"]);
});

// ---------------------------------------------------------------- end to end (Redis)

let ctx;
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    const { saveElector } = await import("../src/repositories/elector.repository.js");
    await connectRedis();
    const runId = crypto.randomInt(0, 1e9);
    const makeUser = async (role, extra = {}) => {
        const user = { _id: crypto.randomUUID(), epic: `TST${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`, role, name: `${role} ${runId}`, mustChangePassword: false, ...extra };
        await saveUser(user);
        return { user, token: jwt.sign({ _id: user._id, epic: user.epic, role }, "test") };
    };
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = async (method, path, body, token) => {
        const res = await fetch(`${base}${path}`, {
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.1.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    // A constituency of its own for this run's people (Punjab, Ludhiana, the 3rd constituency).
    const geo = (await call("GET", "/auth/geography")).body.data;
    const district = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Ludhiana");
    const area = { state: "Punjab", district: "Ludhiana", constituency: district.constituencies[2] };
    ctx = { redis, server, call, makeUser, saveElector, runId, area, eci: await makeUser("eci") };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });

const yearsAgo = (y, extraDays = 0) => {
    const t = new Date(); t.setUTCFullYear(t.getUTCFullYear() - y); t.setUTCDate(t.getUTCDate() - extraDays);
    return t.toISOString().slice(0, 10);
};

test("pipeline: approved source -> import -> BLO task -> Form 6 -> BLO verification -> ERO approval -> registered", needsRedis, async () => {
    const { call, makeUser, saveElector, eci, area, runId } = await setup();
    const blo = await makeUser("blo");
    const ero = await makeUser("ero");
    // A part of its own for this run, so earlier runs' BLOs in the same Redis never match.
    const part = String(1 + (runId % 9999));
    for (const [who, role, jurisdiction] of [[blo, "blo", { ...area, pollingStation: `Govt School, Ward ${part}`, partNumber: part }], [ero, "ero", area]]) {
        const granted = await call("POST", "/assignments", { epic: who.user.epic, role, jurisdiction }, eci.token);
        assert.equal(granted.status, 201, JSON.stringify(granted.body));
    }

    // Only the ECI administrator registers sources; a real source needs a legal basis and agreement.
    assert.equal((await call("POST", "/integrations/sources", { name: "Feed", type: "synthetic", purpose: "x" }, ero.token)).status, 403);
    assert.equal((await call("POST", "/integrations/sources", { name: "State feed", type: "approved_api", purpose: "Identify potential applicants" }, eci.token)).status, 400);
    assert.equal((await call("POST", "/integrations/sources", { name: "Scraper", type: "website", purpose: "x" }, eci.token)).status, 400);
    const source = await call("POST", "/integrations/sources", { name: `Synthetic ${runId}`, type: "synthetic", purpose: "Prototype testing with synthetic people" }, eci.token);
    assert.equal(source.status, 201);
    const sourceId = source.body.data._id;

    // Someone already on the roll is not a lead.
    const enrolledName = `Enrolled Person ${runId}`;
    await saveElector({ _id: crypto.randomUUID(), epic: `ENR${String(runId).slice(0, 7).padStart(7, "0")}`, name: enrolledName, dateOfBirth: `${yearsAgo(19)}T00:00:00.000Z`,
        state: area.state, district: area.district, assemblyConstituency: area.constituency, isActive: true });

    const person = { name: `New Voter ${runId}`, dateOfBirth: yearsAgo(18, 200) };
    const records = [
        { sourceReference: `R1-${runId}`, ...person, gender: "Female", ...area, partNumber: part },
        { sourceReference: `R2-${runId}`, name: `Advance ${runId}`, dateOfBirth: yearsAgo(17, 30), ...area, partNumber: part },
        { sourceReference: `R3-${runId}`, name: `Young ${runId}`, dateOfBirth: yearsAgo(15), ...area },
        { sourceReference: `R4-${runId}`, name: enrolledName, dateOfBirth: yearsAgo(19), ...area },
        { sourceReference: `R1-${runId}`, ...person, ...area },          // same reference again
        { sourceReference: `R5-${runId}`, name: "X", dateOfBirth: "2008-01-01", ...area } // invalid name
    ];
    const run = await call("POST", `/integrations/sources/${sourceId}/runs`, { records }, eci.token);
    assert.equal(run.status, 201, JSON.stringify(run.body));
    assert.deepEqual(run.body.data.counts, { received: 6, staged: 3, tasksCreated: 2, unassigned: 0, notYetEligible: 1, duplicates: 1, alreadyEnrolled: 1, alreadyApplied: 0, rejected: 1 });
    // Importing the same file again creates nothing new.
    const again = await call("POST", `/integrations/sources/${sourceId}/runs`, { records: records.slice(0, 3) }, eci.token);
    assert.equal(again.body.data.counts.duplicates, 3);

    // The BLO sees both tasks; nobody outside the area does.
    const tasks = (await call("GET", "/registration-tasks", undefined, blo.token)).body.data.items.filter((t) => t.person.name.includes(String(runId)));
    assert.equal(tasks.length, 2);
    const task = tasks.find((t) => t.person.name === person.name);
    assert.equal(task.eligibility.status, "ELIGIBLE");
    assert.equal(task.assignedTo.epic, blo.user.epic);
    assert.equal(tasks.find((t) => t !== task).eligibility.status, "ADVANCE");
    const outsider = await makeUser("blo", { jurisdiction: { ...area, constituency: "Somewhere Else" } });
    assert.ok(!(await call("GET", "/registration-tasks?status=all", undefined, outsider.token)).body.data.items.some((t) => t._id === task._id));
    assert.equal((await call("POST", `/registration-tasks/${task._id}/outcome`, { outcome: "contacted" }, outsider.token)).status, 403);

    // BLO contacts the person, who files Form 6. A mismatched application cannot be linked.
    assert.equal((await call("POST", `/registration-tasks/${task._id}/outcome`, { outcome: "contacted", note: "Visited, will apply" }, blo.token)).status, 200);
    const form6 = { name: person.name, dateOfBirth: person.dateOfBirth, gender: "Female", ...area, assemblyConstituency: area.constituency,
        address: "House 4, Ward 9, Ludhiana", pinCode: "141001",
        referenceImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" };
    const applied = await call("POST", "/auth/register", form6);
    assert.equal(applied.status, 201, JSON.stringify(applied.body));
    const applicationId = applied.body.data.referenceId;
    const other = await call("POST", "/auth/register", { ...form6, name: `Someone Else ${runId}` });
    assert.equal((await call("POST", `/registration-tasks/${task._id}/outcome`, { outcome: "form6_submitted", applicationId: other.body.data.referenceId }, blo.token)).status, 400);
    const linked = await call("POST", `/registration-tasks/${task._id}/outcome`, { outcome: "form6_submitted", applicationId }, blo.token);
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    assert.equal((await call("POST", `/registration-tasks/${task._id}/outcome`, { outcome: "contacted" }, blo.token)).status, 409);

    // The usual Form 6 workflow: BLO field verification, ERO decision.
    assert.equal((await call("POST", `/admin/registrations/${applicationId}/field-verification`, { recommendation: "approve" }, blo.token)).status, 200);
    assert.equal((await call("POST", `/admin/registrations/${applicationId}/approve`, {}, ero.token)).status, 200);
    const after = (await call("GET", "/registration-tasks?status=all", undefined, ero.token)).body.data.items.find((t) => t._id === task._id);
    assert.equal(after.stage, "registered");
    assert.match(after.application.epic, /^DEM\d{7}$/);

    // The applicant's timeline shows each official step, without officers' identities.
    const status = (await call("GET", `/auth/register/${applicationId}`)).body.data;
    assert.deepEqual(status.timeline.map((s) => s.step), ["submitted", "field_verified", "approved"]);
    assert.ok(!JSON.stringify(status.timeline).includes(blo.user.epic));

    // Closing outcomes other than Form 6 need a note.
    const advance = tasks.find((t) => t !== task);
    assert.equal((await call("POST", `/registration-tasks/${advance._id}/outcome`, { outcome: "declined" }, blo.token)).status, 400);
    assert.equal((await call("POST", `/registration-tasks/${advance._id}/outcome`, { outcome: "declined", note: "Studying abroad" }, blo.token)).status, 200);
});

test("pipeline: unassigned tasks are routed by the ERO; rescreening picks up people who came of age", needsRedis, async () => {
    const { call, makeUser, eci, area, runId, redis } = await setup();
    const ero = await makeUser("ero", { jurisdiction: area });
    const bloA = await makeUser("blo"); const bloB = await makeUser("blo");
    for (const [b, n] of [[bloA, "21"], [bloB, "22"]]) {
        assert.equal((await call("POST", "/assignments", { epic: b.user.epic, role: "blo", jurisdiction: { ...area, pollingStation: `Booth ${n} ${runId}`, partNumber: n } }, eci.token)).status, 201);
    }
    const source = (await call("POST", "/integrations/sources", { name: `Synthetic B ${runId}`, type: "synthetic", purpose: "Testing" }, eci.token)).body.data;
    const run = await call("POST", `/integrations/sources/${source._id}/runs`, { records: [
        { sourceReference: "U1", name: `No Booth ${runId}`, dateOfBirth: yearsAgo(19), ...area },
        { sourceReference: "U2", name: `Too Young ${runId}`, dateOfBirth: yearsAgo(16, -10), ...area }
    ] }, eci.token);
    assert.equal(run.body.data.counts.unassigned >= 1, true);
    const task = (await call("GET", "/registration-tasks?status=unassigned", undefined, ero.token)).body.data.items.find((t) => t.person.name === `No Booth ${runId}`);
    assert.ok(task);
    // Two BLOs cover the area and the person has no booth, so the ERO routes the task.
    assert.equal((await call("POST", `/registration-tasks/${task._id}/assign`, { epic: "NOP0000000" }, ero.token)).status, 404);
    assert.equal((await call("POST", `/registration-tasks/${task._id}/assign`, { epic: bloB.user.epic }, ero.token)).status, 200);
    assert.equal((await call("POST", `/registration-tasks/${task._id}/outcome`, { outcome: "contacted" }, bloA.token)).status, 403);
    assert.equal((await call("POST", `/registration-tasks/${task._id}/outcome`, { outcome: "contacted" }, bloB.token)).status, 200);

    // Rescreen: make the young person's stored date of birth 17 years ago and rescreen.
    const ids = await redis().sMembers("prospects:all");
    for (const id of ids) {
        const p = JSON.parse(await redis().get(`prospect:${id}`));
        if (p.name === `Too Young ${runId}`) { p.dateOfBirth = yearsAgo(17, 5); await redis().set(`prospect:${id}`, JSON.stringify(p)); }
    }
    const rescreen = await call("POST", "/integrations/rescreen", {}, eci.token);
    assert.equal(rescreen.status, 200);
    assert.ok(rescreen.body.data.tasksCreated >= 1);
    const young = (await call("GET", "/registration-tasks?status=all", undefined, ero.token)).body.data.items.find((t) => t.person.name === `Too Young ${runId}`);
    assert.equal(young.eligibility.status, "ADVANCE");
});

test("roll versions: the ERO publishes snapshots of their own constituency; changes and integrity are tracked", needsRedis, async () => {
    const { call, makeUser, saveElector, area, runId } = await setup();
    const ero = await makeUser("ero", { jurisdiction: area });
    const blo = await makeUser("blo", { jurisdiction: area });
    const otherEro = await makeUser("ero", { jurisdiction: { ...area, constituency: "Somewhere Else" } });
    const epic = `RVT${String(runId).slice(0, 7).padStart(7, "0")}`;
    await saveElector({ _id: crypto.randomUUID(), epic, name: `Roll Person ${runId}`, gender: "Male", age: 30, state: area.state, district: area.district,
        assemblyConstituency: area.constituency, partNumber: "5", pollingStation: "Booth 5", isActive: true, address: "Secret address" });

    assert.equal((await call("POST", "/roll-versions", area, blo.token)).status, 403);
    assert.equal((await call("POST", "/roll-versions", area, otherEro.token)).status, 403);
    const v1 = await call("POST", "/roll-versions", { ...area, note: "Draft roll" }, ero.token);
    assert.equal(v1.status, 201, JSON.stringify(v1.body));
    // Nothing changed: no new version.
    assert.equal((await call("POST", "/roll-versions", area, ero.token)).status, 409);

    await saveElector({ _id: crypto.randomUUID(), epic, name: `Roll Person ${runId}`, gender: "Male", age: 30, state: area.state, district: area.district,
        assemblyConstituency: area.constituency, partNumber: "6", pollingStation: "Booth 6", isActive: true });
    const v2 = await call("POST", "/roll-versions", area, ero.token);
    assert.equal(v2.status, 201);
    assert.equal(v2.body.data.version, v1.body.data.version + 1);
    assert.equal(v2.body.data.changes.modified, 1);

    const full = (await call("GET", `/roll-versions/${v1.body.data._id}`, undefined, ero.token)).body.data;
    assert.equal(full.integrity, "verified");
    const entry = full.entries.find((e) => e.epic === epic);
    assert.equal(entry.partNumber, "5", "published versions never change");
    assert.equal(entry.address, undefined, "addresses are not in the published extract");
    assert.equal((await call("GET", `/roll-versions/${v1.body.data._id}`, undefined, otherEro.token)).status, 403);
    const list = (await call("GET", `/roll-versions?state=${encodeURIComponent(area.state)}&district=${encodeURIComponent(area.district)}&constituency=${encodeURIComponent(area.constituency)}`, undefined, ero.token)).body.data.items;
    assert.equal(list[0].version, v2.body.data.version);
    assert.equal(list[0].entries, undefined);
});
