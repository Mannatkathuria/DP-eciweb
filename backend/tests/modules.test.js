import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { publishStation } from "./helpers/stationApproval.js";

// The modules added from the ECI systems inventory, and how data moves between them:
//   library (handbooks, compendium, eBooks, FAQ, training) · ePlan (vacancy -> plan -> election) ·
//   ERONET roll quality (DSE/PSE scan -> notice -> BLO delivery -> hearing -> deletion in the roll) ·
//   BLO death report · BLO App (facility survey -> station summary; register; EPIC delivery) ·
//   observer portal and flying-squad positions · ENCORE (deposit, paper nomination, symbols, Form 7A,
//   Index Card -> CEO -> Commission) · ETPBMS (ballot -> PIN -> download -> post -> receive -> scan once) ·
//   NGSP grievances · ESMS (direct and from cVIGIL) · IEMS party filings · EMS 2.0 EVMs ·
//   the data-store status (what is in Redis and in MongoDB).
// Runs against Redis alone; with TEST_MONGODB_URI it runs with MongoDB as the document store and read models.
process.env.STEP_UP_REQUIRED = "false";
process.env.ACCESS_TOKEN_SECRET = "test";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
if (process.env.TEST_MONGODB_URI) process.env.MONGODB_URI = process.env.TEST_MONGODB_URI; else delete process.env.MONGODB_URI;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const day = (offset) => { const d = new Date(Date.now() + 330 * 60000); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let ctx;
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis, transaction } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    const { saveElector, getElectorByEpic } = await import("../src/repositories/elector.repository.js");
    const { saveContestingList } = await import("../src/repositories/election.repository.js");
    await connectRedis();
    if (process.env.MONGODB_URI) await (await import("../src/config/mongo.js")).connectMongo();
    const runId = crypto.randomInt(0, 1e9);
    const makeUser = async (role, extra = {}) => {
        const user = { _id: crypto.randomUUID(), epic: `MDT${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`, role, name: `${role} ${runId}`, ...extra };
        await saveUser(user);
        return { user, token: jwt.sign({ _id: user._id, epic: user.epic, role }, "test") };
    };
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = async (method, path, body, token) => {
        const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.21.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    const used = ["Ludhiana", "Bathinda", "Amritsar", "Jalandhar", "Patiala"];
    const district = geo.states.find((s) => s.name === "Punjab").districts.find((d) => !used.includes(d.name) && d.constituencies.length >= 2);
    const area = { state: "Punjab", district: district.name, constituency: district.constituencies[0] };
    const other = { state: "Punjab", district: district.name, constituency: district.constituencies[1] };
    const eci = await makeUser("eci");
    const grant = async (who, role, jurisdiction, election, extra = {}) => {
        const r = await call("POST", "/assignments", { epic: who.user.epic, role, jurisdiction, election, ...extra }, eci.token);
        assert.equal(r.status, 201, JSON.stringify(r.body));
    };
    const mkElection = async (label, schedule) => {
        const r = await call("POST", "/elections", { name: `${label} ${runId}`, type: "general_assembly", states: ["Punjab"], schedule }, eci.token);
        assert.equal(r.status, 201, JSON.stringify(r.body));
        return r.body.data;
    };
    const publishList = async (election, a, names = [["Asha Rani", "Party A", "Lamp"], ["Bhim Singh", "Party B", "Kite"], ["Chetan", "Independent", "Ladder"]]) => {
        const tx = transaction();
        saveContestingList({ form: "7A", electionId: election._id, areaKey: `${a.state.toLowerCase()}|${a.constituency.toLowerCase()}`, ...a, publishedBy: "TEST", publishedAt: new Date().toISOString(),
            candidates: names.map(([name, party, symbol], i) => ({ serial: i + 1, nominationId: `n${i}`, name, party, symbol, independent: party === "Independent", affidavit: {} })) }, tx);
        await tx.exec();
    };
    const mkStations = async (deo, n, a = area) => {
        const ids = [];
        for (let i = 0; i < n; i += 1) {
            const p = await call("POST", "/polling-stations", { ...a, partNumber: String(100 + i + (runId % 500)), name: `Module School ${runId}-${i}`, address: `Ward ${i}, Main Road`, location: { lat: 30.2 + i / 100, lng: 75.8 + i / 100 } }, deo.token);
            assert.equal(p.status, 201, JSON.stringify(p.body));
            assert.equal((await publishStation(call, p.body.data._id, deo.token, eci.token)).status, 200);
            ids.push(p.body.data._id);
        }
        return ids;
    };
    ctx = { call, makeUser, grant, eci, area, other, runId, saveElector, getElectorByEpic, server, redis, mkElection, publishList, mkStations };
    return ctx;
};
test.after(async () => {
    if (!ctx) return;
    ctx.server.close();
    await ctx.redis().quit();
    if (process.env.MONGODB_URI) await (await import("../src/config/mongo.js")).closeMongo();
});

test("library: handbooks, compendium, eBooks, FAQ and training material are public; only the Commission publishes", needsRedis, async () => {
    const { call, eci, makeUser, runId } = await setup();
    const meta = await call("GET", "/library/meta");
    assert.equal(meta.status, 200);
    for (const t of ["handbook", "compendium", "ebook", "faq", "training"]) assert.ok(meta.body.data.counts[t] > 0, `${t} seeded`);
    assert.ok(meta.body.data.faqCategories.includes("EVM"));
    const faq = await call("GET", "/library?type=faq&category=EVM");
    assert.ok(faq.body.data.items.length >= 2 && faq.body.data.items.every((x) => x.category === "EVM"));
    const found = await call("GET", "/library?q=randomisation");
    assert.ok(found.body.data.items.length >= 1, "text search finds the EVM randomisation material");
    const book = await call("GET", "/library/handbook-presiding-officer");
    assert.ok(book.body.data.chapters.length >= 3 && book.body.data.chapters[0].pages.length >= 1, "a handbook has chapters and pages");
    const voter = await makeUser("voter");
    const item = { type: "compendium", title: `Instruction ${runId}`, summary: "A new instruction on test procedures.", body: "Text", category: "Testing" };
    assert.equal((await call("POST", "/library", item, voter.token)).status, 403);
    const pub = await call("POST", "/library", item, eci.token);
    assert.equal(pub.status, 201, JSON.stringify(pub.body));
    const again = await call("POST", "/library", { ...item, summary: "A revised instruction on test procedures." }, eci.token);
    assert.equal(again.body.data.version, 2, "republishing the same item makes a new version");
    assert.equal((await call("POST", `/library/${pub.body.data.slug}/archive`, {}, eci.token)).status, 200);
    assert.equal((await call("GET", `/library/${pub.body.data.slug}`)).status, 404, "archived items are not public");
});

test("ePlan: a vacancy gets a six-month deadline; a plan builds the calendar, warns about holidays, alerts on overdue work and is announced as an election", needsRedis, async () => {
    const { call, eci, makeUser, grant, area, runId } = await setup();
    const ceo = await makeUser("ceo"); await grant(ceo, "ceo", { state: "Punjab" });
    const vac = await call("POST", "/eplan/vacancies", { state: "Punjab", house: "assembly", constituency: area.constituency, district: area.district, reason: "resignation", occurredOn: day(-10) }, eci.token);
    assert.equal(vac.status, 201, JSON.stringify(vac.body));
    assert.equal(vac.body.data.status, "open");
    const exempt = await call("POST", "/eplan/vacancies", { state: "Punjab", house: "assembly", constituency: `Other seat ${runId}`, reason: "death", occurredOn: day(-5), termEndsOn: day(200) }, eci.token);
    assert.equal(exempt.body.data.status, "exempt", "less than a year of the term left: no bye-election");
    assert.equal((await call("POST", "/eplan/vacancies", { state: "Punjab", house: "assembly", constituency: "X", reason: "death", occurredOn: day(-1) }, ceo.token)).status, 403, "the CEO does not record vacancies");
    const pollDate = day(90);
    assert.equal((await call("POST", "/eplan/holidays", { state: "Punjab", date: pollDate, name: `Local festival ${runId}` }, ceo.token)).status, 201);
    const plan = await call("POST", "/eplan/plans", { kind: "bye_election", name: `Bye-election plan ${runId}`, pollDate, vacancyIds: [vac.body.data._id] }, eci.token);
    assert.equal(plan.status, 201, JSON.stringify(plan.body));
    assert.ok(plan.body.data.warnings.some((w) => w.includes("festival")), "the poll date clashing with a holiday is flagged");
    assert.ok(plan.body.data.activities.length >= 15);
    const notif = plan.body.data.activities.find((a) => a.key === "notification");
    assert.equal(notif.dueOn, day(90 - 28));
    const overview = await call("GET", "/eplan", undefined, ceo.token);
    assert.ok(overview.body.data.plans.some((p) => p._id === plan.body.data._id), "the CEO sees the plan for the State");
    assert.equal(overview.body.data.vacancies.find((v) => v._id === vac.body.data._id).status, "planned");
    const done = await call("POST", `/eplan/activities/${notif._id}`, { status: "done", note: "Draft notification ready" }, ceo.token);
    assert.equal(done.status, 200);
    const msg = await call("POST", "/eplan/messages", { channel: "sms", states: ["Punjab"], subject: "Training dates", text: "First training on schedule" }, ceo.token);
    assert.equal(msg.status, 201);
    assert.equal((await call("POST", "/eplan/messages", { channel: "sms", states: ["Kerala"], subject: "Training", text: "Not your State" }, ceo.token)).status, 403);
    const ann = await call("POST", `/eplan/plans/${plan.body.data._id}/announce`, { orderReference: "ECI/464/BYE/2026" }, eci.token);
    assert.equal(ann.status, 201, JSON.stringify(ann.body));
    assert.equal(ann.body.data.schedule.pollDate, pollDate, "the election's schedule comes from the plan's calendar");
    const elections = (await call("GET", "/elections", undefined, eci.token)).body.data;
    assert.ok((elections.items ?? elections).some((e) => e._id === ann.body.data._id), "the announced election is in the elections list (Redis)");
});

test("ERONET roll quality: a DSE pair is flagged once; deletion needs notice, delivery and the hearing; the roll entry is then marked deleted", needsRedis, async () => {
    const { call, makeUser, grant, area, runId, saveElector, getElectorByEpic } = await setup();
    const ero = await makeUser("ero"); await grant(ero, "ero", area);
    const blo = await makeUser("blo"); await grant(blo, "blo", { ...area, pollingStation: "Any", partNumber: "1" });
    const mk = (epic, name, part, extra = {}) => saveElector({ _id: crypto.randomUUID(), epic, name, relativeName: "Harbans Singh", relationType: "father", gender: "male", dateOfBirth: "1984-03-02T00:00:00.000Z",
        state: area.state, district: area.district, assemblyConstituency: area.constituency, partNumber: part, serialNumber: 1, isActive: true, ...extra });
    const a = `DSA${String(runId % 1e7).padStart(7, "0")}`, b = `DSB${String(runId % 1e7).padStart(7, "0")}`;
    await mk(a, `Gurpreet Singh ${runId}`, "3");
    await mk(b, `Gurprit  singh ${runId}`, "9"); // same person, spelt differently, another part
    const p1 = `PSA${String(runId % 1e7).padStart(7, "0")}`, p2 = `PSB${String(runId % 1e7).padStart(7, "0")}`;
    await mk(p1, `Kamla Devi ${runId}`, "4", { gender: "female", relativeName: "Ram", dateOfBirth: "1970-01-01T00:00:00.000Z", photoHash: `photo-${runId}` });
    await mk(p2, `Sunita ${runId}`, "5", { gender: "female", relativeName: "Mohan", dateOfBirth: "1975-01-01T00:00:00.000Z", photoHash: `photo-${runId}` });
    const scan = await call("POST", "/roll-quality/scan", area, ero.token);
    assert.equal(scan.status, 200, JSON.stringify(scan.body));
    assert.ok(scan.body.data.created >= 2, "one DSE and one PSE flag");
    assert.equal((await call("POST", "/roll-quality/scan", area, ero.token)).body.data.created, 0, "the same group is never flagged twice");
    const list = (await call("GET", "/roll-quality", undefined, ero.token)).body.data.items;
    const dse = list.find((f) => f.type === "dse" && f.entries.some((x) => x.epic === a));
    assert.ok(dse && dse.entries.some((x) => x.epic === b));
    assert.ok(list.some((f) => f.type === "pse" && f.entries.some((x) => x.epic === p1)), "photo-similar entries are flagged");
    assert.equal((await call("POST", `/roll-quality/${dse._id}/decide`, { outcome: "delete_entry", reason: "Same person entered twice in two parts" }, ero.token)).status, 409, "no deletion without notice");
    assert.equal((await call("POST", `/roll-quality/${dse._id}/field-check`, {}, blo.token)).status, 403, "the BLO does not send work to itself");
    assert.equal((await call("POST", `/roll-quality/${dse._id}/field-check`, { note: "Check both addresses" }, ero.token)).status, 200);
    assert.equal((await call("POST", `/roll-quality/${dse._id}/field-finding`, { finding: "same_person", note: "Lives at the part 3 address; part 9 entry is old" }, blo.token)).status, 200);
    const notice = await call("POST", `/roll-quality/${dse._id}/notice`, { epic: b, hearingOn: day(0) }, ero.token);
    assert.equal(notice.status, 200, JSON.stringify(notice.body));
    assert.equal((await call("POST", `/roll-quality/${dse._id}/notice-delivered`, { mode: "in_person" }, blo.token)).status, 200);
    const order = await call("POST", `/roll-quality/${dse._id}/decide`, { outcome: "delete_entry", reason: "Heard the elector; the part 9 entry is a duplicate" }, ero.token);
    assert.equal(order.status, 200, JSON.stringify(order.body));
    assert.equal((await getElectorByEpic(b)).isActive, false, "the duplicate entry is marked deleted in the roll (Redis)");
    assert.equal((await getElectorByEpic(b)).deletion.flagId, dse._id);
    assert.equal((await getElectorByEpic(a)).isActive, true);

    // A death found in the field, with the certificate.
    const d = `DTH${String(runId % 1e7).padStart(7, "0")}`;
    await mk(d, `Late Person ${runId}`, "3", { relativeName: `X${runId}` });
    const death = await call("POST", "/roll-quality/death-report", { epic: d, registrationNumber: "D/2026/1234", dateOfDeath: day(-30), copy: PNG }, blo.token);
    assert.equal(death.status, 201, JSON.stringify(death.body));
    assert.equal((await call("POST", "/roll-quality/death-report", { epic: d, registrationNumber: "D/2026/1234", dateOfDeath: day(-30) }, blo.token)).status, 409);
    assert.equal((await call("GET", `/roll-quality/${death.body.data._id}/certificate`, undefined, ero.token)).body.data.dataUrl, PNG);
});

test("BLO App: a facility survey updates the station summary (and the map); the BLO register and EPIC delivery are kept", needsRedis, async () => {
    const { call, makeUser, grant, area, eci, runId, saveElector } = await setup();
    const deo = await makeUser("deo"); await grant(deo, "deo", { state: area.state, district: area.district });
    const [stationId] = await (ctx.mkStations)(deo, 1);
    const blo = await makeUser("blo"); await grant(blo, "blo", { ...area, pollingStation: `Module School ${runId}-0`, partNumber: String(100 + (runId % 500)) });
    const voter = await makeUser("voter");
    assert.equal((await call("POST", `/field/stations/${stationId}/survey`, { amf: {} }, voter.token)).status, 403);
    const survey = await call("POST", `/field/stations/${stationId}/survey`, {
        amf: { ramp: true, drinking_water: true, toilet: true, electricity: true, shade: false, furniture: true, signage: true, wheelchair: true, lighting: true },
        emf: { ground_floor: true, separate_entry_exit: true }, gps: { lat: 30.25, lng: 75.85, accuracyM: 8 }, distances: { bus_stand: 1.2, police_station: 3, hospital: 2.5 }, photo: PNG
    }, blo.token);
    assert.equal(survey.status, 201, JSON.stringify(survey.body).slice(0, 400));
    assert.equal(survey.body.data.amfScore, 89);
    assert.ok(survey.body.data.gpsFlag, "a GPS position far from the recorded location is flagged");
    const station = (await call("GET", `/polling-stations?state=${area.state}`, undefined, deo.token)).body.data;
    const s = (station.items ?? station).find((x) => x._id === stationId);
    assert.equal(s.facilitySurvey.amfScore, 89, "the station in Redis carries the survey summary");
    assert.ok(s.facilitySurvey.missing.includes("Shade or shelter for the queue"));
    const surveys = await call("GET", "/field/surveys", undefined, deo.token);
    assert.ok(surveys.body.data.latest.some((x) => x.stationId === stationId && x.hasPhoto));
    const epic = `REG${String(runId % 1e7).padStart(7, "0")}`;
    await saveElector({ _id: crypto.randomUUID(), epic, name: "House Owner", state: area.state, district: area.district, assemblyConstituency: area.constituency, partNumber: "1", isActive: true });
    const reg = await call("POST", "/field/register", { epic, finding: "shifted", houseNumber: "12-B", nationalHouseNumber: "NH-PB-001122", note: "Moved to Chandigarh last year" }, blo.token);
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    assert.match(reg.body.message, /Form 8/);
    assert.equal((await call("POST", "/field/epic-deliveries", { epic, kind: "replacement" }, blo.token)).status, 201);
    assert.ok((await call("GET", "/field/register", undefined, blo.token)).body.data.counts.shifted >= 1);
    void eci;
});

test("observer portal: profile with masked bank details, deployment, officers, public contact list; flying-squad positions expire", needsRedis, async () => {
    const { call, makeUser, grant, area } = await setup();
    const obs = await makeUser("general_observer"); await grant(obs, "general_observer", area);
    const deo = await makeUser("deo"); await grant(deo, "deo", { state: area.state, district: area.district });
    const fst = await makeUser("flying_squad"); await grant(fst, "flying_squad", area);
    assert.equal((await call("POST", "/observers/me/profile", { localContact: "12345" }, obs.token)).status, 400);
    const saved = await call("POST", "/observers/me/profile", { localContact: "9876543210", localAddress: "Circuit House", bankAccount: "123456789012", ifsc: "SBIN0001234", service: "IAS" }, obs.token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.data.bank.account, "xxxxxxxx9012");
    const portal = await call("GET", "/observers/me", undefined, obs.token);
    assert.equal(portal.status, 200, JSON.stringify(portal.body));
    assert.equal(portal.body.data.constituency.constituency, area.constituency);
    assert.ok(portal.body.data.officers.some((o) => o.role === "deo" && o.epic === deo.user.epic), "the DEO of the district is listed");
    assert.equal((await call("GET", "/observers/me", undefined, deo.token)).status, 403);
    const pub = await call("GET", `/observers/public?state=${encodeURIComponent(area.state)}&constituency=${encodeURIComponent(area.constituency)}`);
    assert.ok(pub.body.data.some((o) => o.phone === "9876543210"), "the observer's local number is published");
    assert.equal((await call("POST", "/observers/squads/location", { lat: 30.2, lng: 75.8 }, obs.token)).status, 403);
    assert.equal((await call("POST", "/observers/squads/location", { lat: 30.2, lng: 75.8, vehicle: "PB10AB1234" }, fst.token)).status, 200);
    const squads = await call("GET", "/observers/squads", undefined, obs.token);
    assert.ok(squads.body.data.items.some((x) => x.epic === fst.user.epic));
    assert.ok(await ctx.redis().ttl(`squad:location:${fst.user.epic}`) > 0, "positions are kept in Redis with an expiry");
});

test("ENCORE: deposit, paper nomination, symbol allotment and Form 7A order; Index Card from the roll and results through the CEO to the Commission", needsRedis, async () => {
    const { call, makeUser, grant, area, mkElection, publishList, eci, runId, saveElector } = await setup();
    const election = await mkElection("Encore", { notificationDate: day(-2), lastDateOfNominations: day(3), scrutinyDate: day(4), lastDateOfWithdrawal: day(6), pollDate: day(20), countingDate: day(23) });
    const ro = await makeUser("ro"); await grant(ro, "ro", area, election.name);
    const digit = await call("POST", "/nominations/digitise", { electionId: election._id, ...area, name: `Paper Candidate ${runId}`, dateOfBirth: "1970-01-01", party: "Party P", sets: 2,
        deposit: { category: "general", amount: 5000, receiptNumber: "R1" } }, ro.token);
    assert.equal(digit.status, 400, "the deposit must be the statutory amount");
    const ok = await call("POST", "/nominations/digitise", { electionId: election._id, ...area, name: `Paper Candidate ${runId}`, dateOfBirth: "1970-01-01", party: "Party P", sets: 2,
        deposit: { category: "sc", amount: 5000, receiptNumber: "R2", mode: "treasury_challan" }, affidavit: { criminalCases: 1 }, criminalAntecedents: { cases: [{ firNumber: "12/2024", sections: "IPC 171E" }] } }, ro.token);
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.data.source, "physical");
    assert.equal(ok.body.data.criminalAntecedents.publicityDue, 3);
    assert.equal((await call("POST", `/nominations/${ok.body.data._id}/symbol`, { partyCategory: "independent", symbol: "Kite" }, ro.token)).status, 409, "symbols go to accepted candidates");

    // Index card: from the roll (Redis), the station list, Form 7A and the result feed.
    const counted = await mkElection("Counted IC", { notificationDate: day(-40), lastDateOfNominations: day(-33), scrutinyDate: day(-32), lastDateOfWithdrawal: day(-30), pollDate: day(-5), countingDate: day(-2) });
    const ro2 = await makeUser("ro"); await grant(ro2, "ro", area, counted.name);
    for (let i = 0; i < 6; i += 1) await saveElector({ _id: crypto.randomUUID(), epic: `ICX${String((runId + i) % 1e7).padStart(7, "0")}`, name: `Elector ${i}`, gender: i % 2 ? "female" : "male", state: area.state, district: area.district, assemblyConstituency: area.constituency, partNumber: "1", isActive: true });
    await publishList(counted, area);
    const card = await call("POST", "/index-cards", { electionId: counted._id, ...area }, ro2.token);
    assert.equal(card.status, 201, JSON.stringify(card.body));
    assert.equal(card.body.data.candidates.length, 3, "candidates come from Form 7A");
    assert.ok(card.body.data.electors.total >= 6, "electors come from the roll");
    assert.equal((await call("POST", "/index-cards", { electionId: counted._id, ...area }, ro2.token)).status, 409, "one card per constituency");
    const id = card.body.data._id;
    const bad = await call("POST", `/index-cards/${id}`, { votes: { polled: 999999, valid: 10, rejected: 0 }, candidates: [{ serial: 1, evm: 5 }, { serial: 2, evm: 3 }, { serial: 3, evm: 2 }], returnedSerial: 1, stations: { total: 1 } }, ro2.token);
    assert.equal(bad.status, 200);
    assert.ok(bad.body.data.validation.errors.length >= 1);
    assert.equal((await call("POST", `/index-cards/${id}/submit`, {}, ro2.token)).status, 422, "arithmetic errors block submission");
    const e = card.body.data.electors.total;
    await call("POST", `/index-cards/${id}`, { votes: { polled: 6, valid: 6, rejected: 0, notaEvm: 0, notaPostal: 0 }, candidates: [{ serial: 1, evm: 3, postal: 0 }, { serial: 2, evm: 2, postal: 0 }, { serial: 3, evm: 1, postal: 0 }], electors: { total: e }, returnedSerial: 1 }, ro2.token);
    const sub = await call("POST", `/index-cards/${id}/submit`, {}, ro2.token);
    assert.equal(sub.status, 200, JSON.stringify(sub.body));
    const ceo = await makeUser("ceo"); await grant(ceo, "ceo", { state: area.state });
    assert.equal((await call("POST", `/index-cards/${id}/finalise`, {}, eci.token)).status, 409, "the CEO examines first");
    assert.equal((await call("POST", `/index-cards/${id}/examine`, { decision: "return" }, ceo.token)).status, 400, "returning needs remarks");
    assert.equal((await call("POST", `/index-cards/${id}/examine`, { decision: "accept" }, ceo.token)).status, 200);
    assert.equal((await call("POST", `/index-cards/${id}/finalise`, {}, eci.token)).status, 200);
    assert.ok((await call("GET", `/index-cards/public?electionId=${counted._id}`)).body.data.some((c) => c._id === id && c.locked));
    assert.equal((await call("POST", `/index-cards/${id}`, { votes: { polled: 7 } }, ro2.token)).status, 409, "a finalised card is locked");
});

test("ETPBMS: ballots for service voters after Form 7A; PIN to the Record Officer; download, post, receive; a ballot is scanned at counting only once", needsRedis, async () => {
    const { call, makeUser, grant, area, mkElection, publishList, runId, saveElector } = await setup();
    const election = await mkElection("ETPB", { notificationDate: day(-20), lastDateOfNominations: day(-13), scrutinyDate: day(-12), lastDateOfWithdrawal: day(-10), pollDate: day(-1), countingDate: day(0) });
    const ro = await makeUser("ro"); await grant(ro, "ro", area, election.name);
    const rec = await makeUser("record_officer"); await grant(rec, "record_officer", { state: area.state });
    const sv = `SVC${String(runId % 1e7).padStart(7, "0")}`;
    await saveElector({ _id: crypto.randomUUID(), epic: sv, name: "Naik Ram", electorCategory: "service_voter", serviceNumber: "JC-123456", state: area.state, district: area.district, assemblyConstituency: area.constituency, partNumber: "1", isActive: true });
    assert.equal((await call("POST", `/etpb/${election._id}/generate`, area, ro.token)).status, 409, "Form 7A comes first");
    await publishList(election, area);
    const gen = await call("POST", `/etpb/${election._id}/generate`, area, ro.token);
    assert.equal(gen.status, 409, "on the counting day no more ballots are sent");
    const later = await mkElection("ETPB2", { notificationDate: day(-20), lastDateOfNominations: day(-13), scrutinyDate: day(-12), lastDateOfWithdrawal: day(-10), pollDate: day(5), countingDate: day(8) });
    const ro2 = await makeUser("ro"); await grant(ro2, "ro", area, later.name);
    await publishList(later, area);
    const g2 = await call("POST", `/etpb/${later._id}/generate`, area, ro2.token);
    assert.equal(g2.status, 201, JSON.stringify(g2.body));
    assert.ok(g2.body.data.generated >= 1);
    assert.equal((await call("POST", `/etpb/${later._id}/generate`, area, ro2.token)).body.data.generated, 0, "one ballot per service voter");
    assert.equal((await call("POST", `/etpb/${later._id}/transmit`, area, ro2.token)).status, 200);
    const pins = (await call("GET", "/etpb/record-officer/pins", undefined, rec.token)).body.data.items;
    const mine = pins.find((p) => p.elector === sv);
    assert.ok(mine && /^\d{6}$/.test(mine.pin), "the PIN reaches the Record Officer separately");
    assert.equal((await call("POST", "/etpb/download", { ballotId: mine.ballotId, pin: "000000" === mine.pin ? "111111" : "000000" })).status, 401);
    const dl = await call("POST", "/etpb/download", { ballotId: mine.ballotId, pin: mine.pin });
    assert.equal(dl.status, 200, JSON.stringify(dl.body));
    assert.equal(dl.body.data.candidates.length, 3);
    assert.equal((await call("POST", `/etpb/record-officer/pins/${mine.ballotId}/collected`, {}, rec.token)).status, 200);
    assert.equal((await call("POST", "/etpb/return", { ballotId: mine.ballotId, pin: mine.pin, speedPostNumber: "bad" })).status, 400);
    assert.equal((await call("POST", "/etpb/return", { ballotId: mine.ballotId, pin: mine.pin, speedPostNumber: "EK123456789IN" })).status, 200);
    assert.equal((await call("GET", `/etpb/track/${mine.ballotId}`)).body.data.article, "EK123456789IN");
    assert.equal((await call("POST", `/etpb/ballots/${mine.ballotId}/receive`, { envelopeIntact: true }, ro2.token)).status, 200);
    const v1 = await call("POST", `/etpb/ballots/${mine.ballotId}/validate`, { form13AValid: true }, ro2.token);
    assert.equal(v1.status, 200, JSON.stringify(v1.body));
    assert.equal(v1.body.data.status, "counted");
    assert.equal((await call("POST", `/etpb/ballots/${mine.ballotId}/validate`, { form13AValid: true }, ro2.token)).status, 409, "a second scan of the same ballot is refused");
});

test("NGSP: a grievance is routed by where it is about, answered with the time taken, and can be reopened once", needsRedis, async () => {
    const { call, makeUser, grant, area } = await setup();
    const g = await call("POST", "/grievances", { category: "polling_booth", stakeholder: "elector", subject: "No ramp at the polling station", description: "The polling station in my ward has no ramp for wheelchair users.", mobile: "9876500001", ...area });
    assert.equal(g.status, 201, JSON.stringify(g.body));
    assert.equal(g.body.data.routedTo, "Constituency (ERO/RO)");
    const ref = g.body.data.referenceId;
    assert.equal((await call("GET", `/grievances/track/${ref}?mobile=9999999999`)).status, 404, "tracking needs the right mobile number");
    const ro = await makeUser("ro"); await grant(ro, "ro", area, null);
    const other = await makeUser("ro"); await grant(other, "ro", ctx.other, null);
    const list = (await call("GET", "/grievances", undefined, ro.token)).body.data.items;
    const mine = list.find((x) => x.referenceId === ref);
    assert.ok(mine);
    assert.equal((await call("GET", "/grievances", undefined, other.token)).body.data.items.some((x) => x.referenceId === ref), false);
    const r = await call("POST", `/grievances/${mine._id}/respond`, { status: "resolved", response: "A temporary ramp has been ordered for the polling station.", actionTaken: "Work order issued" }, ro.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const tracked = (await call("GET", `/grievances/track/${ref}?mobile=9876500001`)).body.data;
    assert.equal(tracked.status, "resolved");
    assert.ok(tracked.responseMinutes >= 0 && tracked.canReopen);
    assert.equal((await call("POST", `/grievances/track/${ref}/reopen`, { mobile: "9876500001", reason: "The ramp has not been built yet." })).status, 200);
    assert.equal((await call("POST", `/grievances/track/${ref}/reopen`, { mobile: "9876500001", reason: "Still not built at all." })).status, 409, "only once");
    const mcc = await call("POST", "/grievances", { category: "malpractice", subject: "Cash being distributed", description: "Cash is being distributed near the market by party workers tonight.", mobile: "9876500002" });
    assert.ok(mcc.body.data.cvigilHint, "an MCC-type grievance points to cVIGIL");
});

test("ESMS: seizures are registered once per agency document, flow in from cVIGIL field reports, and are totalled", needsRedis, async () => {
    const { call, makeUser, grant, area, mkElection } = await setup();
    const election = await mkElection("ESMS", { notificationDate: day(-2), lastDateOfNominations: day(3), scrutinyDate: day(4), lastDateOfWithdrawal: day(6), pollDate: day(20), countingDate: day(23) });
    const enf = await makeUser("enforcement_officer"); await grant(enf, "enforcement_officer", { state: area.state, district: area.district }, election.name);
    const seizure = { ...area, agency: "excise", kind: "liquor", quantity: 240, unit: "litres", value: 96000, description: "Country liquor in a truck", place: "Toll plaza", documentRef: `EX/${ctx.runId}/1` };
    assert.equal((await call("POST", "/seizures", seizure, enf.token)).status, 201);
    assert.equal((await call("POST", "/seizures", seizure, enf.token)).status, 409, "the same document is not entered twice");
    // From cVIGIL: a citizen report, a flying squad, its field report with a seizure.
    const deo = await makeUser("deo"); await grant(deo, "deo", { state: area.state, district: area.district }, election.name);
    const fst = await makeUser("flying_squad"); await grant(fst, "flying_squad", area, election.name);
    const c = await call("POST", "/complaints", { ...area, category: "cash", description: "Cash being handed out at the market square.", place: "Market square", anonymous: true });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const item = (await call("GET", "/complaints", undefined, deo.token)).body.data.items.find((x) => x.referenceId === c.body.data.referenceId);
    assert.equal((await call("POST", `/complaints/${item._id}/dispatch`, { squadEpic: fst.user.epic }, deo.token)).status, 200);
    const fr = await call("POST", `/complaints/${item._id}/field-report`, { found: true, actions: "Reached in 20 minutes; seized cash with a panchnama.", seizures: [{ kind: "cash", value: 250000 }] }, fst.token);
    assert.equal(fr.status, 200, JSON.stringify(fr.body));
    const reg = (await call("GET", "/seizures", undefined, deo.token)).body.data;
    assert.ok(reg.items.some((s) => s.source === "cvigil" && s.linkedComplaint === c.body.data.referenceId && s.value === 250000), "the cVIGIL seizure is in the ESMS register");
    assert.ok(reg.byKind.cash >= 250000 && reg.byKind.liquor >= 96000);
    const cashId = reg.items.find((s) => s.linkedComplaint === c.body.data.referenceId)._id;
    assert.equal((await call("POST", `/seizures/${cashId}/release`, { order: "DGC/7", reason: "Bank withdrawal slip produced by the owner." }, enf.token)).status, 403, "only the district committee (DEO) releases");
    assert.equal((await call("POST", `/seizures/${cashId}/release`, { order: "DGC/7", reason: "Bank withdrawal slip produced by the owner." }, deo.token)).status, 200);
});

test("IEMS: a party's Form 24A is validated row by row, acknowledged, and shows on the Commission's compliance dashboard", needsRedis, async () => {
    const { call, makeUser, eci, runId } = await setup();
    const party = `Test Party ${runId}`;
    const t = await makeUser("party_treasurer", { party });
    const bad = await call("POST", "/party-filings", { filingType: "contribution_24a", financialYear: "2025-26", esignConsent: true, csv: "name,pan,address,amount,mode,date\nA Donor,BADPAN,Delhi,50000,cheque,2025-06-01\nB Donor,ABCDE1234F,Delhi,30000,cash,2025-07-01" }, t.token);
    assert.equal(bad.status, 422);
    assert.match(bad.body.message, /PAN/);
    assert.match(bad.body.message, /cash/);
    const good = await call("POST", "/party-filings", { filingType: "contribution_24a", financialYear: "2025-26", esignConsent: true, csv: "A Donor,ABCDE1234F,Delhi,50000,cheque,2025-06-01\nB Donor,PQRSX6789K,Mumbai,125000,bank_transfer,2025-08-10" }, t.token);
    assert.equal(good.status, 201, JSON.stringify(good.body));
    assert.match(good.body.data.acknowledgement, /^ACK\/24A\/2025-26\//);
    assert.equal(good.body.data.total, 175000);
    assert.equal((await call("POST", "/party-filings", { filingType: "audit_accounts", financialYear: "2025-26", auditor: "Rao & Co", income: 1000000, expenditure: 800000, auditReportDate: "2026-09-01" }, t.token)).status, 400, "eSign is required");
    const dash = await call("GET", "/party-filings/compliance?financialYear=2025-26", undefined, eci.token);
    const row = dash.body.data.rows.find((r) => r.party === party);
    assert.ok(row && ["on_time", "late"].includes(row.contribution_24a.status));
    assert.ok(["due", "not_filed"].includes(row.audit_accounts.status));
    assert.equal((await call("GET", "/party-filings/compliance", undefined, t.token)).status, 403);
    assert.equal((await call("POST", `/party-filings/${good.body.data._id}/scrutiny`, { outcome: "in_order" }, eci.token)).status, 200);
});

test("EMS 2.0: units pass FLC, the DEO's first randomisation fills each constituency with a reserve, the RO's second gives each station one of each, then commissioning", needsRedis, async () => {
    const { call, makeUser, grant, area, mkElection, publishList, runId } = await setup();
    const election = await mkElection("EVM", { notificationDate: day(-20), lastDateOfNominations: day(-13), scrutinyDate: day(-12), lastDateOfWithdrawal: day(-10), pollDate: day(10), countingDate: day(13) });
    const deo = await makeUser("deo"); await grant(deo, "deo", { state: area.state, district: area.district }, election.name);
    await (ctx.mkStations)(deo, 2, ctx.other);
    const ro = await makeUser("ro"); await grant(ro, "ro", ctx.other, election.name);
    const dist = { state: area.state, district: area.district };
    const all = (await call("GET", `/polling-stations?state=${area.state}`, undefined, deo.token)).body.data;
    const stations = (all.items ?? all).filter((s) => s.status === "ACTIVE" && s.district === area.district);
    const acs = [...new Set(stations.map((s) => s.constituency))];
    const need = (r) => acs.reduce((n, ac) => n + Math.ceil(stations.filter((s) => s.constituency === ac).length * (1 + r)), 0);
    const start = 1 + (runId % 100000) * 10;
    for (const [type, r] of [["BU", 0.25], ["CU", 0.25], ["VVPAT", 0.35]]) {
        const add = await call("POST", "/evm/units", { ...dist, unitType: type, manufacturer: "BEL", count: need(r) + 2, startAt: start }, deo.token);
        assert.equal(add.status, 201, JSON.stringify(add.body));
    }
    const r1Early = await call("POST", "/evm/randomise/first", { electionId: election._id, ...dist, witnesses: ["Rep, Party A"] }, deo.token);
    assert.equal(r1Early.status, 409, "units must pass FLC first");
    assert.equal((await call("POST", "/evm/flc", { ...dist, allPending: true, result: "ok", engineer: "BEL team" }, deo.token)).status, 200);
    assert.equal((await call("POST", "/evm/randomise/first", { electionId: election._id, ...dist }, deo.token)).status, 400, "the witnesses are named");
    const r1 = await call("POST", "/evm/randomise/first", { electionId: election._id, ...dist, witnesses: ["Rep, Party A", "Rep, Party B"] }, deo.token);
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    assert.equal((await call("POST", "/evm/randomise/first", { electionId: election._id, ...dist, witnesses: ["Rep"] }, ro.token)).status, 403, "the RO does not do the first randomisation");
    const r2 = await call("POST", "/evm/randomise/second", { electionId: election._id, ...ctx.other, witnesses: ["Rep, Party A"] }, ro.token);
    assert.equal(r2.status, 201, JSON.stringify(r2.body));
    const myStations = stations.filter((s) => s.constituency === ctx.other.constituency);
    const m = await call("GET", `/evm/stations/${myStations[0]._id}`, undefined, ro.token);
    assert.deepEqual(m.body.data.machines.map((x) => x.unitType).sort(), ["BU", "CU", "VVPAT"], "each station gets one BU, CU and VVPAT");
    assert.equal((await call("POST", "/evm/commission", { electionId: election._id, ...ctx.other }, ro.token)).status, 409, "commissioning comes after Form 7A");
    await publishList(election, ctx.other);
    const com = await call("POST", "/evm/commission", { electionId: election._id, ...ctx.other }, ro.token);
    assert.equal(com.status, 200, JSON.stringify(com.body));
    assert.equal(com.body.data.ballotUnitsPerStation, 1);
    const ov = (await call("GET", `/evm?district=${encodeURIComponent(area.district)}`, undefined, deo.token)).body.data;
    assert.ok(ov.summary.CU.commissioned >= myStations.length && ov.randomisations.length >= 2);
});

test("data stores: the status names what is in Redis and in MongoDB and whether the copies match", needsRedis, async () => {
    const { call, eci, makeUser } = await setup();
    const st = await call("GET", "/data-stores", undefined, eci.token);
    assert.equal(st.status, 200, JSON.stringify(st.body));
    assert.equal(st.body.data.documentStore, process.env.MONGODB_URI ? "mongodb" : "redis");
    assert.ok(st.body.data.documents.find((d) => d.collection === "library_items").count > 0);
    const electors = st.body.data.projected.find((p) => p.collection === "electors");
    if (process.env.MONGODB_URI) assert.equal(electors.inSync, true, "every elector in Redis is in the MongoDB read model");
    else assert.equal(electors.mongodb, null);
    assert.equal((await call("GET", "/data-stores", undefined, (await makeUser("deo")).token)).status, 403);
});
