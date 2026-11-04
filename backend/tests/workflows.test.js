import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { publishStation } from "./helpers/stationApproval.js";

// The role workflows added for the role dashboards: electoral forms 2-8 (BLO verifies, ERO
// decides), campaign permissions (police remark, RO decides), expenditure registers and the
// expenditure observer, observer reports and Commission directions, security, logistics, nodal
// officers, station issues and the consolidated reports. Each is checked for jurisdiction and
// separation of duties.
process.env.STEP_UP_REQUIRED = "false";
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.FORM7_NOTICE_DAYS = "0";
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const day = (offset) => { const d = new Date(Date.now() + 330 * 60000); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let ctx;
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    const { saveElector, getElectorByEpic } = await import("../src/repositories/elector.repository.js");
    await connectRedis();
    const runId = crypto.randomInt(0, 1e9);
    const makeUser = async (role, extra = {}) => {
        const user = { _id: crypto.randomUUID(), epic: `WFT${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`, role, name: `${role} ${runId}`, ...extra };
        await saveUser(user);
        return { user, token: jwt.sign({ _id: user._id, epic: user.epic, role }, "test") };
    };
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const call = async (method, path, body, token) => {
        const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.9.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
    const geo = (await call("GET", "/auth/geography")).body.data;
    const ludhiana = geo.states.find((s) => s.name === "Punjab").districts.find((x) => x.name === "Ludhiana");
    const area = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[5] };
    const other = { state: "Punjab", district: "Ludhiana", constituency: ludhiana.constituencies[6] };
    const eci = await makeUser("eci");
    const grant = async (who, role, jurisdiction, election, extra = {}) => {
        const r = await call("POST", "/assignments", { epic: who.user.epic, role, jurisdiction, election, ...extra }, eci.token);
        assert.equal(r.status, 201, JSON.stringify(r.body));
    };
    const election = (await call("POST", "/elections", { name: `Workflow election ${runId}`, type: "general_assembly", states: ["Punjab"],
        schedule: { notificationDate: day(-2), lastDateOfNominations: day(3), scrutinyDate: day(4), lastDateOfWithdrawal: day(6), pollDate: day(25), countingDate: day(28) } }, eci.token)).body.data;
    ctx = { call, makeUser, grant, eci, area, other, election, runId, saveElector, getElectorByEpic, server, redis };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });

test("electoral forms: intake is not approval; the BLO verifies, only the ERO of the constituency decides and the roll changes", needsRedis, async () => {
    const { call, makeUser, grant, area, other, runId, saveElector, getElectorByEpic } = await setup();
    const blo = await makeUser("blo"); await grant(blo, "blo", area);
    const ero = await makeUser("ero"); await grant(ero, "ero", area);
    const otherEro = await makeUser("ero"); await grant(otherEro, "ero", other);

    // Form 6A (overseas elector): anyone may submit, addressed to one constituency.
    const form6a = { formCode: "FORM_6A", jurisdiction: area, application: { firstName: "ASHA", lastName: "RAO", dateOfBirth: "1990-05-01", gender: "female", truthConfirmed: true, aadhaarNumber: "1234 5678 9012" }, documents: { photo: { dataUrl: PNG, fileName: "p.png", mimeType: "image/png" } } };
    assert.equal((await call("POST", "/elector-forms/form-6a", { ...form6a, jurisdiction: { state: "Punjab", constituency: "Nowhere" } })).status, 400);
    assert.equal((await call("POST", "/elector-forms/form-6a", { ...form6a, documents: { photo: { dataUrl: "data:image/png;base64,AAAA" } } })).status, 400, "a file that is not what it claims is refused");
    const sent = await call("POST", "/elector-forms/form-6a", form6a);
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    const ref = sent.body.data.referenceId;
    assert.equal((await call("POST", "/elector-forms/form-6a", form6a)).status, 409, "an identical open application is refused");
    const tracked = await call("GET", `/elector-forms/status/${ref}`);
    assert.equal(tracked.body.data.status, "submitted");
    assert.equal(tracked.body.data.fieldReport, undefined, "the public view carries no officer details");

    const list = await call("GET", "/elector-forms/staff", undefined, ero.token);
    const item = list.body.data.items.find((a) => a.referenceId === ref);
    assert.ok(item);
    assert.equal((await call("GET", "/elector-forms/staff", undefined, otherEro.token)).body.data.items.some((a) => a.referenceId === ref), false, "another constituency's ERO does not see it");
    const detail = await call("GET", `/elector-forms/staff/${item._id}`, undefined, ero.token);
    assert.equal(detail.body.data.aadhaar.last4, "9012");
    assert.equal(JSON.stringify(detail.body.data).includes("123456789012"), false, "the Aadhaar number is never stored");

    assert.equal((await call("POST", `/elector-forms/staff/${item._id}/decide`, { decision: "approve" }, ero.token)).status, 409, "no approval before field verification");
    assert.equal((await call("POST", `/elector-forms/staff/${item._id}/field-report`, { recommendation: "approve" }, ero.token)).status, 403, "the ERO does not file field reports");
    const fr = await call("POST", `/elector-forms/staff/${item._id}/field-report`, { recommendation: "approve", method: "documents", partNumber: "7", pollingStation: `School ${runId}` }, blo.token);
    assert.equal(fr.status, 200, JSON.stringify(fr.body));
    assert.equal((await call("POST", `/elector-forms/staff/${item._id}/decide`, { decision: "approve" }, blo.token)).status, 403, "the BLO cannot decide");
    assert.equal((await call("POST", `/elector-forms/staff/${item._id}/decide`, { decision: "approve" }, otherEro.token)).status, 403);
    const decided = await call("POST", `/elector-forms/staff/${item._id}/decide`, { decision: "approve", reason: "Passport and visa seen" }, ero.token);
    assert.equal(decided.status, 200, JSON.stringify(decided.body));
    const epic = decided.body.data.decision.epic;
    const elector = await getElectorByEpic(epic);
    assert.equal(elector.electorCategory, "overseas_elector");
    assert.equal(elector.partNumber, "7");
    assert.equal((await call("GET", `/elector-forms/status/${ref}`)).body.data.decision.epic, epic);

    // Form 7: deletion of an entry; nothing is erased, the entry is marked deleted with the order.
    const target = `WFD${String(runId % 1e7).padStart(7, "0")}`;
    await saveElector({ _id: crypto.randomUUID(), epic: target, name: "Gone Person", state: area.state, district: area.district, assemblyConstituency: area.constituency, partNumber: "7", isActive: true });
    const f7 = await call("POST", "/elector-forms/form-7", { jurisdiction: area, application: { applicantName: "Neighbour", applicationType: "delete-existing", reason: "death", personEpic: target, declarationConfirmed: true } });
    assert.equal(f7.status, 201, JSON.stringify(f7.body));
    const f7item = (await call("GET", "/elector-forms/staff?status=submitted", undefined, ero.token)).body.data.items.find((a) => a.referenceId === f7.body.data.referenceId);
    await call("POST", `/elector-forms/staff/${f7item._id}/field-report`, { recommendation: "approve" }, blo.token);
    assert.equal((await call("POST", `/elector-forms/staff/${f7item._id}/decide`, { decision: "approve", reason: "Death certificate verified" }, ero.token)).status, 200);
    const deleted = await getElectorByEpic(target);
    assert.equal(deleted.isActive, false);
    assert.equal(deleted.deletion.order.referenceId, f7.body.data.referenceId);

    // Form 8 addressed to the wrong constituency is refused at intake.
    assert.equal((await call("POST", "/elector-forms/form-8", { jurisdiction: other, application: { applicantName: "X", epicNumber: epic, applicationType: "correction", correctionFields: ["name"], correctedName: "ASHA R", truthConfirmed: true } })).status, 400);
    const f8 = await call("POST", "/elector-forms/form-8", { jurisdiction: area, application: { applicantName: "ASHA RAO", epicNumber: epic, applicationType: "correction", correctionFields: ["name"], correctedName: "ASHA R RAO", truthConfirmed: true } });
    assert.equal(f8.status, 201, JSON.stringify(f8.body));
    const f8item = (await call("GET", "/elector-forms/staff?status=submitted", undefined, ero.token)).body.data.items.find((a) => a.referenceId === f8.body.data.referenceId);
    await call("POST", `/elector-forms/staff/${f8item._id}/field-report`, { recommendation: "approve" }, blo.token);
    const rejected = await call("POST", `/elector-forms/staff/${f8item._id}/decide`, { decision: "reject" }, ero.token);
    assert.equal(rejected.status, 400, "a rejection needs a reason");
    assert.equal((await call("POST", `/elector-forms/staff/${f8item._id}/decide`, { decision: "approve" }, ero.token)).status, 200);
    assert.equal((await getElectorByEpic(epic)).name, "ASHA R RAO");
});

test("campaign permissions: police remark first, then only the RO/ARO decides; s. 126 silence period", needsRedis, async () => {
    const { call, makeUser, grant, area, other, election } = await setup();
    const cand = await makeUser("candidate"); await grant(cand, "candidate", area, election.name);
    const ro = await makeUser("ro"); await grant(ro, "ro", area, election.name);
    const otherRo = await makeUser("ro"); await grant(otherRo, "ro", other, election.name);
    const spo = await makeUser("sector_police_officer"); await grant(spo, "sector_police_officer", area, election.name);
    const base = { type: "public_meeting", date: day(2), from: "10:00", to: "12:00", venue: "Town hall ground", purpose: "Public meeting" };
    assert.equal((await call("POST", "/campaign-permissions", { ...base, date: day(24) }, cand.token)).status, 400, "no meeting in the 48 hours before the poll closes");
    const applied = await call("POST", "/campaign-permissions", base, cand.token);
    assert.equal(applied.status, 201, JSON.stringify(applied.body));
    const id = applied.body.data._id;
    assert.equal((await call("POST", `/campaign-permissions/${id}/decide`, { decision: "grant" }, ro.token)).status, 409, "police remarks come first");
    assert.equal((await call("POST", `/campaign-permissions/${id}/police`, { remark: "no_objection" }, cand.token)).status, 403);
    assert.equal((await call("POST", `/campaign-permissions/${id}/police`, { remark: "objection" }, spo.token)).status, 400, "an objection needs a reason");
    assert.equal((await call("POST", `/campaign-permissions/${id}/police`, { remark: "no_objection" }, spo.token)).status, 200);
    assert.equal((await call("POST", `/campaign-permissions/${id}/decide`, { decision: "grant" }, otherRo.token)).status, 403);
    assert.equal((await call("POST", `/campaign-permissions/${id}/decide`, { decision: "grant" }, cand.token)).status, 403);
    const granted = await call("POST", `/campaign-permissions/${id}/decide`, { decision: "grant", conditions: "No loudspeakers after 10 pm" }, ro.token);
    assert.equal(granted.status, 200);
    assert.ok(granted.body.data.decision.permitNumber);
    const mine = await call("GET", "/campaign-permissions/mine", undefined, cand.token);
    assert.equal(mine.body.data.items.find((p) => p._id === id).status, "granted");
});

test("expenditure: append-only register, corrections supersede, the observer reads and notes; others cannot", needsRedis, async () => {
    const { call, makeUser, grant, area, election } = await setup();
    const cand = await makeUser("candidate"); await grant(cand, "candidate", area, election.name);
    const eo = await makeUser("expenditure_observer"); await grant(eo, "expenditure_observer", area, election.name);
    const voter = await makeUser("voter");
    const e = await call("POST", "/expenditure", { date: day(0), category: "vehicles", amount: 15000, mode: "cash", payee: "Travels", description: "Two vehicles" }, cand.token);
    assert.equal(e.status, 201, JSON.stringify(e.body));
    assert.deepEqual(e.body.data.flags, ["cash_above_10000", "no_voucher"]);
    assert.equal((await call("POST", `/expenditure/${e.body.data._id}/correct`, { amount: 9000 }, cand.token)).status, 400, "a correction needs a reason");
    const c = await call("POST", `/expenditure/${e.body.data._id}/correct`, { amount: 9000, voucherRef: "V1", reason: "Wrong bill entered" }, cand.token);
    assert.equal(c.status, 200);
    const reg = (await call("GET", "/expenditure/mine", undefined, cand.token)).body.data;
    assert.equal(reg.summary.total, 9000);
    assert.equal((await call("GET", "/expenditure", undefined, voter.token)).status, 403);
    const obs = await call("GET", "/expenditure", undefined, eo.token);
    assert.ok(obs.body.data.candidates.some((g) => g.summary.total === 9000));
    assert.equal((await call("POST", `/expenditure/${c.body.data._id}/notes`, { kind: "discrepancy", text: "Three vehicles seen at the rally" }, eo.token)).status, 200);
    assert.equal((await call("POST", "/expenditure", { date: day(0), category: "vehicles", amount: 1, mode: "cash", payee: "x", description: "xyz" }, eo.token)).status, 403);
});

test("observer reports are confidential; the Commission directs; the addressee complies; the incident path ends at the Commission", needsRedis, async () => {
    const { call, makeUser, grant, area, other, election } = await setup();
    const go = await makeUser("general_observer"); await grant(go, "general_observer", area, election.name);
    const mo = await makeUser("micro_observer"); await grant(mo, "micro_observer", area, election.name);
    const cec = await makeUser("cec");
    const deo = await makeUser("deo"); await grant(deo, "deo", { state: "Punjab", district: "Ludhiana" }, election.name);
    const ro = await makeUser("ro"); await grant(ro, "ro", area, election.name);
    const otherRo = await makeUser("ro"); await grant(otherRo, "ro", other, election.name);
    const cand = await makeUser("candidate"); await grant(cand, "candidate", area, election.name);

    const r = await call("POST", "/oversight/observer-reports", { ...area, topic: "campaign", severity: "serious", title: "Cash distribution", facts: "Envelopes were handed out near ward 4 office on the evening of the 3rd." }, mo.token);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok((await call("GET", "/oversight/observer-reports", undefined, go.token)).body.data.items.some((x) => x._id === r.body.data._id), "the general observer receives micro observers' reports");
    assert.ok((await call("GET", "/oversight/observer-reports", undefined, deo.token)).body.data.items.some((x) => x._id === r.body.data._id));
    assert.equal((await call("GET", "/oversight/observer-reports", undefined, cand.token)).status, 403, "never shown to candidates");
    assert.equal((await call("GET", "/oversight/observer-reports", undefined, ro.token)).status, 403);

    assert.equal((await call("POST", "/oversight/directions", { ...area, addressedTo: "ro", instruction: "Inquire and report within 24 hours." }, deo.token)).status, 403, "only the Commission issues directions");
    const d = await call("POST", "/oversight/directions", { ...area, subjectType: "observer_report", subjectId: r.body.data._id, addressedTo: "ro", legalBasis: "mcc", instruction: "Inquire and report within 24 hours." }, cec.token);
    assert.equal(d.status, 201, JSON.stringify(d.body));
    assert.equal((await call("POST", `/oversight/directions/${d.body.data._id}/comply`, { note: "Inquiry done, FIR registered" }, otherRo.token)).status, 403);
    assert.equal((await call("POST", `/oversight/directions/${d.body.data._id}/close`, {}, cec.token)).status, 409, "closed after compliance");
    assert.equal((await call("POST", `/oversight/directions/${d.body.data._id}/comply`, { note: "Inquiry done, FIR registered with the police station" }, ro.token)).status, 200);
    assert.equal((await call("POST", `/oversight/directions/${d.body.data._id}/close`, { note: "Satisfied" }, cec.token)).status, 200);
});

test("polling-station issues, security, logistics, nodal and reports respect jurisdiction and subject", needsRedis, async () => {
    const { call, makeUser, grant, area, other, election, eci, runId } = await setup();
    const deo = await makeUser("deo"); await grant(deo, "deo", { state: "Punjab", district: "Ludhiana" });
    const p = await call("POST", "/polling-stations", { ...area, partNumber: String(1 + (runId % 9000)), name: `Workflow School ${runId}`, address: "Ward 3, Civil Lines, Ludhiana 141001" }, deo.token);
    assert.equal((await publishStation(call, p.body.data._id, deo.token, eci.token)).status, 200);
    const stationId = p.body.data._id;

    const so = await makeUser("sector_officer"); await grant(so, "sector_officer", area, election.name);
    const soElsewhere = await makeUser("sector_officer"); await grant(soElsewhere, "sector_officer", other, election.name);
    const issue = await call("POST", "/polling-stations/issues", { stationId, kind: "damaged", details: "Roof of room 2 collapsed in the rain." }, so.token);
    assert.equal(issue.status, 201, JSON.stringify(issue.body));
    assert.equal((await call("POST", "/polling-stations/issues", { stationId, kind: "damaged", details: "Roof of room 2 collapsed in the rain." }, soElsewhere.token)).status, 403);
    assert.ok((await call("GET", "/polling-stations/issues", undefined, deo.token)).body.data.items.some((i) => i._id === issue.body.data._id));
    assert.equal((await call("POST", `/polling-stations/issues/${issue.body.data._id}/close`, { resolution: "Relocation proposed" }, deo.token)).status, 200);

    const dpo = await makeUser("district_police_officer"); await grant(dpo, "district_police_officer", { state: "Punjab", district: "Ludhiana" }, election.name);
    assert.equal((await call("POST", `/security/stations/${stationId}/assessment`, { category: "critical" }, dpo.token)).status, 400, "a reason is needed");
    assert.equal((await call("POST", `/security/stations/${stationId}/assessment`, { category: "critical", reasons: ["past_violence"], capf: 4 }, dpo.token)).status, 201);
    assert.equal((await call("POST", `/security/stations/${stationId}/assessment`, { category: "normal" }, so.token)).status, 403, "civil officers read security plans, police make them");
    const sec = await call("GET", "/security", undefined, so.token);
    assert.equal(sec.body.data.stations.find((s) => s.stationId === stationId).assessment.category, "critical");
    const cand = await makeUser("candidate"); await grant(cand, "candidate", area, election.name);
    assert.equal((await call("GET", "/security", undefined, cand.token)).status, 403);

    assert.equal((await call("POST", `/logistics/stations/${stationId}`, { electionId: election._id, step: "party_dispatched", vehicle: "PB10AB1234" }, so.token)).status, 201);
    assert.equal((await call("POST", `/logistics/stations/${stationId}`, { electionId: election._id, step: "party_dispatched" }, soElsewhere.token)).status, 403);
    const log = await call("GET", `/logistics?electionId=${election._id}`, undefined, deo.token);
    assert.equal(log.body.data.stations.find((s) => s.stationId === stationId).last.step, "party_dispatched");

    const dno = await makeUser("district_nodal_officer");
    assert.equal((await call("POST", "/assignments", { epic: dno.user.epic, role: "district_nodal_officer", jurisdiction: { state: "Punjab", district: "Ludhiana" } }, eci.token)).status, 400, "a nodal assignment names its subject");
    await grant(dno, "district_nodal_officer", { state: "Punjab", district: "Ludhiana" }, election.name, { function: "evm" });
    const task = await call("POST", "/nodal/tasks", { state: "Punjab", district: "Ludhiana", function: "transport", title: "Book 40 buses for polling parties" }, deo.token);
    assert.equal(task.status, 201, JSON.stringify(task.body));
    assert.equal((await call("POST", `/nodal/tasks/${task.body.data._id}`, { status: "done" }, dno.token)).status, 403, "another subject's task");
    assert.equal((await call("POST", "/nodal/reports", { function: "transport", progressPercent: 50, summary: "Half the buses are booked." }, dno.token)).status, 403);
    assert.equal((await call("POST", "/nodal/reports", { progressPercent: 60, summary: "FLC of 300 of 500 control units done." }, dno.token)).status, 201);

    const summary = await call("GET", "/reports/summary", undefined, deo.token);
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    assert.equal(summary.body.data.level, "constituency");
    assert.ok(summary.body.data.stations.byStatus.ACTIVE >= 1);
    const national = await call("GET", "/reports/summary", undefined, eci.token);
    assert.equal(national.body.data.level, "state");
});
