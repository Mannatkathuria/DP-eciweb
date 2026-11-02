import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Phase 2: elections and their schedule, polling stations (DEO proposes, ECI approves), election
// staff assignments, nominations, scrutiny, withdrawal and the published list of candidates.
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = "";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const { validateSchedule, electionStage, todayIST } = await import("../src/services/election.service.js");

const day = (offset) => { const d = new Date(`${todayIST()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
// A schedule whose dates sit around today: start = offset of the notification date.
const scheduleFrom = (start) => ({
    notificationDate: day(start), lastDateOfNominations: day(start + 7), scrutinyDate: day(start + 8),
    lastDateOfWithdrawal: day(start + 10), pollDate: day(start + 30), countingDate: day(start + 33)
});
const NOMINATIONS_OPEN = scheduleFrom(-2);     // today is inside the nomination period
const SCRUTINY = scheduleFrom(-8);             // today is the scrutiny date
const AFTER_WITHDRAWAL = scheduleFrom(-12);    // withdrawals closed two days ago

test("schedule: every date present and in statutory order", () => {
    assert.deepEqual(validateSchedule(NOMINATIONS_OPEN), NOMINATIONS_OPEN);
    assert.throws(() => validateSchedule({ ...NOMINATIONS_OPEN, scrutinyDate: NOMINATIONS_OPEN.lastDateOfNominations }), /scrutinyDate must be after/);
    assert.throws(() => validateSchedule({ ...NOMINATIONS_OPEN, pollDate: "2026-02-30" }), /pollDate must be a date/);
    assert.throws(() => validateSchedule({}), /notificationDate/);
});

test("schedule: the stage follows the calendar", () => {
    const e = { schedule: validateSchedule({ notificationDate: "2026-03-01", lastDateOfNominations: "2026-03-08", scrutinyDate: "2026-03-09", lastDateOfWithdrawal: "2026-03-11", pollDate: "2026-04-01", countingDate: "2026-04-04" }) };
    const at = { "2026-02-28": "announced", "2026-03-01": "nominations_open", "2026-03-08": "nominations_open", "2026-03-09": "scrutiny_and_withdrawal",
        "2026-03-11": "scrutiny_and_withdrawal", "2026-03-12": "campaign", "2026-04-01": "poll_day", "2026-04-02": "awaiting_counting", "2026-04-04": "counting_day", "2026-04-05": "completed" };
    for (const [date, stage] of Object.entries(at)) assert.equal(electionStage(e, date), stage, date);
});

let ctx;
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    const { saveElector, getElectorByEpic } = await import("../src/repositories/elector.repository.js");
    await connectRedis();
    const runId = crypto.randomInt(0, 1e9);
    const makeUser = async (role) => {
        const user = { _id: crypto.randomUUID(), epic: `TST${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`, role, name: `${role} ${runId}`, mustChangePassword: false };
        await saveUser(user);
        return { user, token: jwt.sign({ _id: user._id, epic: user.epic, role }, "test") };
    };
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = async (method, path, body, token) => {
        const res = await fetch(`${base}${path}`, {
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.2.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    const ludhiana = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Ludhiana");
    const otherDistrict = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name !== "Ludhiana");
    const area = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[4] };
    const otherArea = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[5] };
    const eci = await makeUser("eci");
    const grant = async (who, role, jurisdiction, election, by = eci) => {
        const r = await call("POST", "/assignments", { epic: who.user.epic, role, jurisdiction, election }, by.token);
        assert.equal(r.status, 201, JSON.stringify(r.body));
        return r.body.data;
    };
    ctx = { redis, server, call, makeUser, grant, saveElector, getElectorByEpic, runId, area, otherArea, otherDistrict, eci };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });

test("elections: only the ECI administrator announces one; schedules are validated; revisions keep history", needsRedis, async () => {
    const { call, makeUser, eci, runId } = await setup();
    const deo = await makeUser("deo");
    const body = { name: `General election ${runId}`, type: "general_assembly", states: ["punjab"], schedule: NOMINATIONS_OPEN };
    assert.equal((await call("POST", "/elections", body, deo.token)).status, 403);
    assert.equal((await call("POST", "/elections", body)).status, 401);
    assert.equal((await call("POST", "/elections", { ...body, states: ["Atlantis"] }, eci.token)).status, 400);
    assert.equal((await call("POST", "/elections", { ...body, type: "mayoral" }, eci.token)).status, 400);
    assert.equal((await call("POST", "/elections", { ...body, schedule: { ...NOMINATIONS_OPEN, countingDate: NOMINATIONS_OPEN.pollDate } }, eci.token)).status, 400);
    const created = await call("POST", "/elections", body, eci.token);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual(created.body.data.states, ["Punjab"]);
    assert.equal(created.body.data.stage, "nominations_open");
    assert.equal((await call("POST", "/elections", body, eci.token)).status, 409);

    const id = created.body.data._id;
    assert.equal((await call("POST", `/elections/${id}/schedule`, { schedule: SCRUTINY }, eci.token)).status, 400); // no reason
    const revised = await call("POST", `/elections/${id}/schedule`, { schedule: SCRUTINY, reason: "Poll deferred after flooding" }, eci.token);
    assert.equal(revised.status, 200);
    assert.equal(revised.body.data.stage, "scrutiny_and_withdrawal");
    assert.deepEqual(revised.body.data.scheduleHistory[0].schedule, NOMINATIONS_OPEN);

    const listed = (await call("GET", "/public/elections")).body.data.items.find((e) => e._id === id);
    assert.equal(listed.stage, "scrutiny_and_withdrawal");
    const history = (await call("GET", `/audit/election/${id}`, undefined, eci.token)).body.data.items.map((e) => e.action);
    assert.deepEqual(history.sort(), ["election.created", "election.schedule_revised"]);
});

test("polling stations: the DEO proposes inside their district; only ECI-approved stations are public; relocation updates the part's electors", needsRedis, async () => {
    const { call, makeUser, grant, saveElector, getElectorByEpic, eci, area, otherDistrict, runId } = await setup();
    const deo = await makeUser("deo");
    await grant(deo, "deo", { state: "Punjab", district: "Ludhiana" });
    const part = String(1 + (runId % 9000));
    const station = { ...area, partNumber: part, name: `Government High School ${runId}`, address: "Ward 12, Model Town, Ludhiana 141002",
        location: { lat: 30.89, lng: 75.84 }, accessibility: { ramp: true, wheelchair: true, toilet: true } };

    // Validation and jurisdiction are enforced on the server.
    assert.equal((await call("POST", "/polling-stations", { ...station, location: { lat: 51.5, lng: -0.12 } }, deo.token)).status, 400);
    assert.equal((await call("POST", "/polling-stations", { ...station, partNumber: "0" }, deo.token)).status, 400);
    assert.equal((await call("POST", "/polling-stations", { ...station, address: "short" }, deo.token)).status, 400);
    const outside = await call("POST", "/polling-stations", { ...station, district: otherDistrict.name, constituency: otherDistrict.constituencies[0] }, deo.token);
    assert.equal(outside.status, 403);
    const ero = await makeUser("ero");
    assert.equal((await call("POST", "/polling-stations", station, ero.token)).status, 403);

    const proposed = await call("POST", "/polling-stations", station, deo.token);
    assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
    assert.equal(proposed.body.data.status, "PROPOSED");
    const id = proposed.body.data._id;
    assert.equal((await call("POST", "/polling-stations", { ...station, name: "Another school here" }, deo.token)).status, 409); // one station per part
    assert.equal((await call("POST", `/polling-stations/${id}/approve`, {}, deo.token)).status, 403); // the DEO cannot approve

    const pub = async () => (await call("GET", `/public/stations?state=Punjab&constituency=${encodeURIComponent(area.constituency)}`)).body.data.items.find((s) => s._id === id);
    assert.equal(await pub(), undefined, "a proposal is not public");
    assert.equal((await call("POST", `/polling-stations/${id}/reject`, { reason: " " }, eci.token)).status, 400);
    const approved = await call("POST", `/polling-stations/${id}/approve`, {}, eci.token);
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.source.version, 1);
    const shown = await pub();
    assert.equal(shown.name, station.name);
    assert.equal(shown.accessibility.ramp, true); assert.equal(shown.accessibility.shade, false);
    assert.equal(shown.createdBy, undefined, "public view carries no staff details");
    assert.equal((await call("POST", `/polling-stations/${id}/approve`, {}, eci.token)).status, 409);

    // Electors of this part.
    const epic = `PSV${String(runId % 1e7).padStart(7, "0")}`;
    await saveElector({ _id: crypto.randomUUID(), epic, name: "Part Elector", dateOfBirth: "1990-01-01T00:00:00.000Z", state: area.state, district: area.district,
        assemblyConstituency: area.constituency, partNumber: part, pollingStation: station.name, isActive: true });
    const lookup = (await call("GET", `/public/stations/epic/${epic}`)).body.data;
    assert.equal(lookup.station.name, station.name);
    assert.equal(lookup.name, undefined, "the EPIC lookup returns no personal details");

    // Relocation: reason required, approved by the ECI, electors follow, notice shown.
    const move = { name: `Community Hall ${runId}`, address: "Block C, Model Town Extension, Ludhiana 141002", accessibility: { ramp: true } };
    assert.equal((await call("POST", `/polling-stations/${id}/relocation`, move, deo.token)).status, 400);
    const relocation = await call("POST", `/polling-stations/${id}/relocation`, { ...move, reason: "School building declared unsafe" }, deo.token);
    assert.equal(relocation.status, 200, JSON.stringify(relocation.body));
    assert.equal((await call("POST", `/polling-stations/${id}/relocation`, { ...move, reason: "Again" }, deo.token)).status, 409);
    assert.equal((await pub()).name, station.name, "unchanged until approved");
    const done = await call("POST", `/polling-stations/${id}/approve`, {}, eci.token);
    assert.equal(done.status, 200);
    assert.match(done.body.message, /1 electors updated/);
    assert.equal(done.body.data.source.version, 2);
    assert.equal((await getElectorByEpic(epic)).pollingStation, move.name);
    const after = (await call("GET", `/public/stations/epic/${epic}`)).body.data;
    assert.equal(after.pollingStation, move.name);
    assert.equal(after.station.relocationNotice.from, station.name);

    // Staff lists are jurisdiction-limited.
    const otherDeo = await makeUser("deo");
    await grant(otherDeo, "deo", { state: "Punjab", district: otherDistrict.name });
    assert.equal((await call("GET", "/polling-stations", undefined, otherDeo.token)).body.data.items.some((s) => s._id === id), false);
    assert.equal((await call("GET", "/polling-stations", undefined, deo.token)).body.data.items.some((s) => s._id === id), true);
    const audit = (await call("GET", `/audit/station/${id}`, undefined, eci.token)).body.data.items.map((e) => e.action);
    assert.deepEqual(audit.sort(), ["station.approved", "station.proposed", "station.relocated", "station.relocation_proposed"]);
});

test("election staff: the DEO appoints polling staff in their district at approved stations; the RO arranges polling parties in their constituency", needsRedis, async () => {
    const { call, makeUser, grant, eci, area, otherDistrict, runId } = await setup();
    const deo = await makeUser("deo");
    await grant(deo, "deo", { state: "Punjab", district: "Ludhiana" });
    const part = String(1 + ((runId + 1) % 9000));
    const name = `Primary School ${runId}`;
    const st = await call("POST", "/polling-stations", { ...area, partNumber: part, name, address: "Street 9, Haibowal Kalan, Ludhiana 141001" }, deo.token);
    await call("POST", `/polling-stations/${st.body.data._id}/approve`, {}, eci.token);

    const presiding = await makeUser("presiding_officer");
    const at = (pollingStation) => ({ ...area, pollingStation, partNumber: part });
    const r1 = await call("POST", "/assignments", { epic: presiding.user.epic, role: "presiding_officer", jurisdiction: at("Some Unknown Building"), election: "E" }, deo.token);
    assert.equal(r1.status, 400, JSON.stringify(r1.body)); // not an approved station in this constituency
    const r2 = await call("POST", "/assignments", { epic: presiding.user.epic, role: "presiding_officer", jurisdiction: at(name), election: "E" }, deo.token);
    assert.equal(r2.status, 201, JSON.stringify(r2.body));
    assert.equal((await call("POST", "/assignments", { epic: presiding.user.epic, role: "presiding_officer", jurisdiction: at(name), election: "E" }, deo.token)).status, 409); // no duplicates
    const elsewhere = await call("POST", "/assignments", { epic: presiding.user.epic, role: "presiding_officer",
        jurisdiction: { state: "Punjab", district: otherDistrict.name, constituency: otherDistrict.constituencies[0], pollingStation: "Somewhere Else School" } }, deo.token);
    assert.equal(elsewhere.status, 403);
    const eroUser = await makeUser("ero");
    assert.equal((await call("POST", "/assignments", { epic: eroUser.user.epic, role: "ero", jurisdiction: area }, deo.token)).status, 403);

    const ro = await makeUser("ro");
    await grant(ro, "ro", area, "E");
    const po = await makeUser("polling_officer");
    assert.equal((await call("POST", "/assignments", { epic: po.user.epic, role: "polling_officer", jurisdiction: at(name), election: "E" }, ro.token)).status, 201);
    const cs = await makeUser("counting_supervisor");
    assert.equal((await call("POST", "/assignments", { epic: cs.user.epic, role: "counting_supervisor", jurisdiction: area }, ro.token)).status, 403);
    const po2 = await makeUser("polling_officer");
    const otherConstituency = await call("POST", "/assignments", { epic: po2.user.epic, role: "polling_officer", jurisdiction: { ...ctx.otherArea, pollingStation: "School in another seat" } }, ro.token);
    assert.equal(otherConstituency.status, 403);
    // The DEO may revoke staff they appointed, with a reason.
    assert.equal((await call("POST", `/assignments/${r2.body.data._id}/revoke`, { reason: "Officer on medical leave" }, deo.token)).status, 200);
});

test("nominations: filed in the nomination period, scrutinised by the RO, withdrawn by the candidate, then the list is published once", needsRedis, async () => {
    const { call, makeUser, grant, eci, area, otherArea, runId } = await setup();
    const created = await call("POST", "/elections", { name: `Assembly election ${runId}`, type: "general_assembly", states: ["Punjab"], schedule: NOMINATIONS_OPEN }, eci.token);
    const election = created.body.data;
    const candidate = async (name) => { const c = await makeUser("candidate"); await grant(c, "candidate", area, election._id); return { ...c, name }; };
    const [a, b, c, d] = await Promise.all([candidate("Zora Singh"), candidate("Amrit Pal"), candidate("Indie Kaur"), candidate("Late Withdrawer")]);
    const filing = (who, extra = {}) => ({ electionId: election._id, name: who.name, dateOfBirth: "1980-05-01", party: "Demo Party", symbol: "Lamp",
        affidavit: { criminalCases: 0, assets: 1000000, liabilities: 0, education: "Graduate", declarationAccepted: true }, ...extra });

    assert.equal((await call("POST", "/nominations", filing(a, { dateOfBirth: `${new Date().getUTCFullYear() - 22}-01-01` }), a.token)).status, 400); // under 25
    assert.equal((await call("POST", "/nominations", filing(a, { affidavit: { declarationAccepted: false } }), a.token)).status, 400);
    const voter = await makeUser("voter");
    assert.equal((await call("POST", "/nominations", filing(a), voter.token)).status, 403);
    const unassigned = await makeUser("candidate");
    assert.equal((await call("POST", "/nominations", filing(a), unassigned.token)).status, 403);

    const nA = await call("POST", "/nominations", filing(a), a.token);
    assert.equal(nA.status, 201, JSON.stringify(nA.body));
    assert.equal(nA.body.data.constituency, area.constituency);
    assert.equal((await call("POST", "/nominations", filing(a), a.token)).status, 409); // one per election
    const nB = await call("POST", "/nominations", filing(b, { party: "Another Party" }), b.token);
    const nC = await call("POST", "/nominations", filing(c, { independent: true, party: "" }), c.token);
    const nD = await call("POST", "/nominations", filing(d), d.token);
    assert.equal(nC.body.data.party, "Independent");

    const ro = await makeUser("ro");
    await grant(ro, "ro", area, election._id);
    const otherRo = await makeUser("ro");
    await grant(otherRo, "ro", otherArea, election._id);
    // Scrutiny not before the scrutiny date.
    assert.equal((await call("POST", `/nominations/${nA.body.data._id}/scrutiny`, { decision: "accepted" }, ro.token)).status, 409);
    await call("POST", `/elections/${election._id}/schedule`, { schedule: SCRUTINY, reason: "Test: move to scrutiny" }, eci.token);
    assert.equal((await call("POST", "/nominations", filing(unassigned), a.token)).status, 409); // nominations closed

    const listedForOther = (await call("GET", `/nominations?electionId=${election._id}`, undefined, otherRo.token)).body.data.items;
    assert.equal(listedForOther.length, 0);
    assert.equal((await call("POST", `/nominations/${nA.body.data._id}/scrutiny`, { decision: "accepted" }, otherRo.token)).status, 403);
    assert.equal((await call("GET", `/nominations?electionId=${election._id}`, undefined, ro.token)).body.data.items.length, 4);

    assert.equal((await call("POST", `/nominations/${nB.body.data._id}/scrutiny`, { decision: "rejected" }, ro.token)).status, 400); // reason needed
    for (const n of [nA, nB, nC, nD]) {
        const decision = n === nB ? { decision: "rejected", reason: "Form 26 affidavit incomplete" } : { decision: "accepted" };
        assert.equal((await call("POST", `/nominations/${n.body.data._id}/scrutiny`, decision, ro.token)).status, 200);
    }
    assert.equal((await call("POST", `/nominations/${nA.body.data._id}/scrutiny`, { decision: "rejected", reason: "x y z" }, ro.token)).status, 409);

    // Only the candidate withdraws their own nomination.
    assert.equal((await call("POST", `/nominations/${nD.body.data._id}/withdraw`, {}, a.token)).status, 404);
    assert.equal((await call("POST", `/nominations/${nD.body.data._id}/withdraw`, {}, d.token)).status, 200);
    const mine = (await call("GET", "/nominations/mine", undefined, b.token)).body.data.items[0];
    assert.equal(mine.scrutiny.reason, "Form 26 affidavit incomplete");

    const publish = () => call("POST", "/nominations/contesting", { electionId: election._id, ...area }, ro.token);
    assert.equal((await publish()).status, 409); // withdrawals still open
    const aro = await makeUser("aro");
    await grant(aro, "aro", area, election._id);
    assert.equal((await call("POST", "/nominations/contesting", { electionId: election._id, ...area }, aro.token)).status, 403); // the RO publishes
    await call("POST", `/elections/${election._id}/schedule`, { schedule: AFTER_WITHDRAWAL, reason: "Test: withdrawals closed" }, eci.token);
    assert.equal((await call("POST", `/nominations/${nA.body.data._id}/withdraw`, {}, a.token)).status, 409);
    assert.equal((await call("POST", "/nominations/contesting", { electionId: election._id, ...otherArea }, ro.token)).status, 403);
    const published = await publish();
    assert.equal(published.status, 201, JSON.stringify(published.body));
    assert.deepEqual(published.body.data.candidates.map((x) => [x.serial, x.name, x.party]), [[1, "Zora Singh", "Demo Party"], [2, "Indie Kaur", "Independent"]]);
    assert.equal((await publish()).status, 409); // fixed once published

    const pub = await call("GET", `/public/candidates?electionId=${election._id}&state=Punjab&constituency=${encodeURIComponent(area.constituency)}`);
    assert.equal(pub.body.data.candidates.length, 2);
    assert.equal(pub.body.data.candidates[0].dateOfBirth, undefined, "no date of birth in public");
    assert.equal(pub.body.data.candidates[0].epic, undefined);
    const audit = (await call("GET", `/audit/nomination/${nB.body.data._id}`, undefined, eci.token)).body.data.items.map((e) => e.action);
    assert.deepEqual(audit.sort(), ["nomination.filed", "nomination.rejected"]);
});
