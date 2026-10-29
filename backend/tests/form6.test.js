import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Full Form 6 submissions: server-side validation, persistence of every field and document,
// Aadhaar protection, retrieval, BLO-only document access and compatibility with the older
// request format. Synthetic data only. Needs its own disposable Redis (TEST_REDIS_URL).
process.env.ACCESS_TOKEN_SECRET = "test";
process.env.GEMINI_API = "";
const TEST_KEY = crypto.randomBytes(32).toString("hex");
process.env.AADHAAR_ENCRYPTION_KEY = TEST_KEY;
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run" };

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString("base64")}`;
const WEBP = `data:image/webp;base64,${Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 ", "latin1").toString("base64")}`;
const AADHAAR = "234567890124"; // synthetic number with a valid check digit, not a real Aadhaar
const runId = crypto.randomInt(0, 1e6);
let seq = 0;

let ctx;
const setup = async () => {
    if (ctx) return ctx;
    const { connectRedis, redis, jsonGet } = await import("../src/config/redis.js");
    const { saveUser } = await import("../src/repositories/user.repository.js");
    const { getRegistration, listRegistrations } = await import("../src/repositories/registration.repository.js");
    await connectRedis();
    const { default: app } = await import("../src/app.js");
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const ip = () => `10.${crypto.randomInt(0, 255)}.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`;
    const call = async (method, path, body, token) => {
        const res = await fetch(`${base}${path}`, {
            method, headers: { "Content-Type": "application/json", "X-Forwarded-For": ip(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const type = res.headers.get("content-type") || "";
        return { status: res.status, type, headers: res.headers, body: type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer()) };
    };
    const makeUser = async (role) => {
        const user = { _id: crypto.randomUUID(), epic: `TST${String(crypto.randomInt(0, 1e7)).padStart(7, "0")}`, role, name: role, mustChangePassword: false };
        await saveUser(user);
        return jwt.sign({ _id: user._id, epic: user.epic, role }, "test");
    };
    ctx = { redis, jsonGet, call, server, getRegistration, listRegistrations, blo: await makeUser("blo"), voter: await makeUser("voter") };
    return ctx;
};
test.after(async () => { if (ctx) { ctx.server.close(); await ctx.redis().quit(); } });

const form = (over = {}) => {
    seq += 1;
    const base = {
        applicant: { officialLanguage: { first: "कृतिका", surname: "शर्मा" }, english: { first: `kritika t${runId}x${seq}`.replace(/\d/g, (d) => "ABCDEFGHIJ"[d]), surname: "sharma" } },
        relative: { relation: "Mother", officialLanguageName: "सुनीता शर्मा", englishName: "SUNITA SHARMA" },
        contact: { mobile: "9876543210", mobileOf: "Self", email: "Test.User@Example.com", emailOf: "Relative" },
        aadhaar: { option: "have", number: AADHAAR },
        gender: "Third Gender",
        dateOfBirth: "2006-08-20",
        ageProof: { type: "other", otherName: "School leaving certificate" },
        address: { house: "12-B", street: "Ward No. 4, Kotwali Bazaar", town: "Dharamshala", postOffice: "Dharamshala HO", pinCode: "176215", tehsil: "Dharamshala",
            district: "KANGRA", state: "Himachal Pradesh", assemblyConstituencyId: "S08-18" },
        addressProof: { type: "utility-bill", otherName: "", holder: "Parent" },
        disability: { categories: ["Locomotive"], otherDescription: "", percentage: "40", certificateAttached: "No" },
        familyMember: { name: "Sunita Sharma", relation: "Mother", epic: "abc1234567" },
        declaration: { placeOfBirth: { town: "Palampur", district: "KANGRA", state: "Himachal Pradesh" }, residentSince: { month: 3, year: "2010" },
            firstTimeApplicant: true, noListedAgeProof: true, confirmed: true, place: "Dharamshala" }
    };
    for (const [path, value] of Object.entries(over)) {
        const keys = path.split("."); let o = base;
        keys.slice(0, -1).forEach((k) => { o = o[k]; });
        if (value === undefined) delete o[keys.at(-1)]; else o[keys.at(-1)] = value;
    }
    return base;
};
const docs = (over = {}) => ({ photo: { dataUrl: JPEG, fileName: "photo.jpg" }, ageProof: { dataUrl: PNG, fileName: "../../etc/age.png" }, addressProof: { dataUrl: WEBP, fileName: "bill.webp" }, ...over });

const englishNameOf = (f) => `${f.applicant.english.first} ${f.applicant.english.surname}`.toUpperCase().trim();
// Other test files may write to the same Redis at the same time, so check by name, not by counts.
const storedWithName = async (listRegistrations, name) => (await listRegistrations()).filter((r) => r.name === name);
const orphanDocuments = async (redis) => {
    const ids = new Set(await redis().sMembers("registrations:all"));
    return (await redis().keys("registration:document:*")).filter((k) => !ids.has(k.split(":")[2]));
};

test("Form 6: a complete application stores every field and its documents", needsRedis, async () => {
    const { call, redis, jsonGet, getRegistration } = await setup();
    const res = await call("POST", "/auth/register", { form6: form(), documents: docs() });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.data.referenceId;
    const a = await getRegistration(id);

    // existing flat fields, derived on the server
    assert.equal(a.status, "pending");
    assert.match(a.name, /^KRITIKA T[A-J]+X[A-J]+ SHARMA$/);
    assert.equal(a.gender, "Other");
    assert.equal(a.dateOfBirth, "2006-08-20T00:00:00.000Z");
    assert.equal(a.address, "12-B, Ward No. 4, Kotwali Bazaar, Dharamshala, Post Office: Dharamshala HO, Tehsil: Dharamshala");
    assert.equal(a.pinCode, "176215");
    assert.equal(a.referenceImage, WEBP);
    assert.equal(a.formVersion, "form6-v1");

    const f = a.form6;
    assert.deepEqual(f.name, { officialLanguage: { first: "कृतिका", surname: "शर्मा" }, english: { first: a.name.replace(/ SHARMA$/, ""), surname: "SHARMA" } });
    assert.deepEqual(f.relative, { relation: "Mother", officialLanguageName: "सुनीता शर्मा", englishName: "SUNITA SHARMA" });
    assert.deepEqual(f.contact, { mobile: "9876543210", mobileOf: "Self", email: "test.user@example.com", emailOf: "Relative" });
    assert.equal(f.gender, "Third Gender");
    assert.deepEqual(f.ageProof, { type: "other", otherName: "School leaving certificate" });
    assert.deepEqual({ ...f.address, formatted: undefined, constituency: undefined }, { house: "12-B", street: "Ward No. 4, Kotwali Bazaar", town: "Dharamshala", postOffice: "Dharamshala HO",
        pinCode: "176215", tehsil: "Dharamshala", district: "KANGRA", state: "Himachal Pradesh", stateCode: "S08", districtCode: f.address.districtCode,
        assemblyConstituency: "DHARAMSHALA", formatted: undefined, constituency: undefined });
    // The official number and name come from the ECI dataset, not from the client.
    assert.equal(f.address.constituency.id, "S08-18");
    assert.equal(f.address.constituency.no, 18);
    assert.equal(f.address.constituency.name, "DHARAMSHALA");
    assert.equal(f.address.constituency.type, "assembly");
    assert.equal(a.assemblyConstituency, "DHARAMSHALA");
    assert.deepEqual(f.addressProof, { type: "utility-bill", otherName: null, holder: "Parent" });
    assert.deepEqual(f.disability, { categories: ["Locomotive"], otherDescription: null, percentage: 40, certificateAttached: "No" });
    assert.deepEqual(f.familyMember, { name: "Sunita Sharma", relation: "Mother", epic: "ABC1234567" });
    assert.deepEqual(f.declaration.placeOfBirth, { town: "Palampur", district: "KANGRA", state: "Himachal Pradesh" });
    assert.deepEqual(f.declaration.residentSince, { month: 3, year: 2010 });
    assert.equal(f.declaration.firstTimeApplicant, true);
    assert.equal(f.declaration.noListedAgeProof, true);
    assert.equal(f.declaration.alternativeAgeProofName, "School leaving certificate");
    assert.equal(f.declaration.place, "Dharamshala");
    assert.ok(Date.parse(f.declaration.declaredAt));

    // Aadhaar: last 4 + encrypted number that decrypts with the key and this application id only
    assert.equal(f.aadhaar.last4, "0124");
    assert.equal(f.aadhaar.numberStored, true);
    assert.ok(!JSON.stringify(a).includes(AADHAAR), "full Aadhaar must not appear in plaintext");
    const { iv, tag, data } = f.aadhaar.encrypted;
    const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(TEST_KEY, "hex"), Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(Buffer.from(tag, "base64"));
    assert.equal(Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(), AADHAAR);

    // documents: metadata on the record, files in their own keys
    assert.equal(a.documents.photo.mimeType, "image/jpeg");
    assert.equal(a.documents.ageProof.fileName, ".._.._etc_age.png", "path characters are neutralised");
    assert.equal(a.documents.addressProof.storage, "referenceImage");
    const photo = await jsonGet(`registration:document:${id}:photo`);
    assert.equal(photo.data, JPEG.split(",")[1]);
    assert.equal((await jsonGet(`registration:document:${id}:ageProof`)).data, PNG.split(",")[1]);
    assert.ok(await redis().sIsMember("registrations:all", id));
});

test("Form 6: the status check returns the saved application, masked", needsRedis, async () => {
    const { call } = await setup();
    const id = (await call("POST", "/auth/register", { form6: form(), documents: docs() })).body.data.referenceId;
    const res = await call("GET", `/auth/register/${id}`);
    assert.equal(res.status, 200);
    const app = res.body.data.application;
    assert.equal(res.body.data.status, "pending");
    assert.equal(app.form6.contact.mobile, "******3210");
    assert.equal(app.form6.contact.email, "t********@example.com");
    assert.deepEqual(app.form6.aadhaar, { option: "have", last4: "XXXX XXXX 0124" });
    assert.equal(app.form6.address.town, "Dharamshala");
    assert.equal(app.documents.photo.fileName, "photo.jpg");
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes(AADHAAR) && !text.includes("encrypted") && !text.includes("9876543210") && !text.includes("base64"));
});

test("Form 6: without an encryption key only the last 4 Aadhaar digits are kept", needsRedis, async () => {
    const { call, getRegistration } = await setup();
    delete process.env.AADHAAR_ENCRYPTION_KEY;
    try {
        const id = (await call("POST", "/auth/register", { form6: form(), documents: docs() })).body.data.referenceId;
        const a = await getRegistration(id);
        assert.deepEqual(a.form6.aadhaar, { option: "have", last4: "0124", numberStored: false });
        const none = (await call("POST", "/auth/register", { form6: form({ "aadhaar.option": "none", "aadhaar.number": "" }), documents: docs() })).body.data.referenceId;
        assert.deepEqual((await getRegistration(none)).form6.aadhaar, { option: "none", last4: null, numberStored: false });
    } finally { process.env.AADHAAR_ENCRYPTION_KEY = TEST_KEY; }
});

test("Form 6: any 12-digit Aadhaar number is accepted (length check only)", needsRedis, async () => {
    const { call, getRegistration } = await setup();
    for (const number of ["123456789102", "000000000000", "234567890129"]) {
        const res = await call("POST", "/auth/register", { form6: form({ "aadhaar.number": number }), documents: docs() });
        assert.equal(res.status, 201, `${number}: ${JSON.stringify(res.body).slice(0, 200)}`);
        assert.equal((await getRegistration(res.body.data.referenceId)).form6.aadhaar.last4, number.slice(-4));
    }
});

test("Form 6: constituency is saved by ECI number across States/UTs, including UTs without an assembly", needsRedis, async () => {
    const { call, getRegistration } = await setup();
    const cases = [
        ["NCT OF Delhi", "West", "U05-31", 31, "VIKASPURI", "assembly"],
        ["Uttar Pradesh", "Gautam Buddha Nagar", "S24-62", 62, "Dadri", "assembly"],
        ["Ladakh", "KARGIL", "U09-1", 1, "Ladakh", "parliamentary"], // ECI lists Ladakh's seat under Leh; Kargil is offered the UT-wide list
        ["Chandigarh", "CHANDIGARH", "U02-1", 1, "CHANDIGARH", "parliamentary"]
    ];
    for (const [state, district, id, no, name, type] of cases) {
        const res = await call("POST", "/auth/register", { form6: form({ "address.state": state, "address.district": district, "address.assemblyConstituencyId": id }), documents: docs() });
        assert.equal(res.status, 201, `${state}: ${JSON.stringify(res.body).slice(0, 300)}`);
        const a = await getRegistration(res.body.data.referenceId);
        assert.equal(a.state, state);
        assert.equal(a.assemblyConstituency, name);
        assert.deepEqual([a.form6.address.constituency.id, a.form6.address.constituency.no, a.form6.address.constituency.type], [id, no, type]);
        const view = (await call("GET", `/auth/register/${res.body.data.referenceId}`)).body.data.application;
        assert.equal(view.form6.address.constituency.no, no, "status check returns the saved constituency");
    }
});

test("Form 6: optional sections can be left empty", needsRedis, async () => {
    const { call, getRegistration } = await setup();
    const res = await call("POST", "/auth/register", {
        form6: form({ "contact.mobile": "", "contact.mobileOf": "", "contact.email": "", "contact.emailOf": "", "relative.officialLanguageName": "  ", "applicant.officialLanguage.first": "", "applicant.english.surname": "", "address.house": "", "address.street": "",
            "disability.categories": [], "disability.percentage": "", "disability.certificateAttached": "", "familyMember.name": "", "familyMember.relation": "", "familyMember.epic": "",
            "ageProof.type": "passport", "ageProof.otherName": "", "declaration.noListedAgeProof": false }),
        documents: docs()
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const f = (await getRegistration(res.body.data.referenceId)).form6;
    assert.equal(f.disability, null);
    assert.equal(f.familyMember, null);
    assert.deepEqual(f.relative, { relation: "Mother", officialLanguageName: null, englishName: "SUNITA SHARMA" }, "relative's official-language name is optional");
    assert.deepEqual(f.contact, { mobile: null, mobileOf: null, email: null, emailOf: null });
    assert.equal(f.declaration.alternativeAgeProofName, null);
});

test("Form 6: invalid submissions are refused and store nothing", needsRedis, async () => {
    const { call, redis, listRegistrations } = await setup();
    const bigPng = `data:image/png;base64,${Buffer.concat([Buffer.from(PNG.split(",")[1], "base64"), Buffer.alloc(4 * 1024 * 1024)]).toString("base64")}`;
    const cases = {
        missingEnglishName: [form({ "applicant.english.first": "" }), docs(), "applicant.english.first"],
        nonEnglishName: [form({ "relative.englishName": "सुनीता" }), docs(), "relative.englishName"],
        badRelation: [form({ "relative.relation": "Cousin" }), docs(), "relative.relation"],
        relativeNameTooLong: [form({ "relative.officialLanguageName": "क".repeat(121) }), docs(), "relative.officialLanguageName"],
        badMobile: [form({ "contact.mobile": "12345abc" }), docs(), "contact.mobile"],
        badEmail: [form({ "contact.email": "not-an-email" }), docs(), "contact.email"],
        mobileOwnerMissing: [form({ "contact.mobileOf": "" }), docs(), "contact.mobileOf"],
        mobileOwnerInvalid: [form({ "contact.mobileOf": "Neighbour" }), docs(), "contact.mobileOf"],
        mobileOwnerWithoutNumber: [form({ "contact.mobile": "" }), docs(), "contact.mobileOf"],
        emailOwnerMissing: [form({ "contact.emailOf": undefined }), docs(), "contact.emailOf"],
        emailOwnerWithoutEmail: [form({ "contact.email": "" }), docs(), "contact.emailOf"],
        aadhaarLetters: [form({ "aadhaar.number": "2345678901ab" }), docs(), "aadhaar.number"],
        aadhaarTooLong: [form({ "aadhaar.number": "2345678901245" }), docs(), "aadhaar.number"],
        aadhaarShort: [form({ "aadhaar.number": "2345678" }), docs(), "aadhaar.number"],
        aadhaarNoneWithNumber: [form({ "aadhaar.option": "none" }), docs(), "aadhaar.number"],
        badGender: [form({ gender: "Other" }), docs(), "gender"],
        impossibleDate: [form({ dateOfBirth: "2006-02-30" }), docs(), "dateOfBirth"],
        futureDate: [form({ dateOfBirth: "2099-01-01" }), docs(), "dateOfBirth"],
        otherAgeDocWithoutName: [form({ "ageProof.otherName": "" }), docs(), "ageProof.otherName"],
        listedAgeDocWithDeclaration: [form({ "ageProof.type": "pan", "ageProof.otherName": "" }), docs(), "declaration.noListedAgeProof"],
        pinLeadingZero: [form({ "address.pinCode": "017621" }), docs(), "address.pinCode"],
        pinLetters: [form({ "address.pinCode": "17A215" }), docs(), "address.pinCode"],
        constituencyOfOtherState: [form({ "address.assemblyConstituencyId": "S19-61" }), docs(), "address.assemblyConstituency"],
        constituencyOfOtherDistrict: [form({ "address.assemblyConstituencyId": "S08-32" }), docs(), "address.assemblyConstituency"],
        fabricatedConstituency: [form({ "address.assemblyConstituencyId": "S08-999" }), docs(), "address.assemblyConstituency"],
        constituencyNameOnly: [form({ "address.assemblyConstituencyId": undefined, "address.assemblyConstituency": "DHARAMSHALA" }), docs(), "address.assemblyConstituency"],
        oldDistrictName: [form({ "address.district": "Kangra" }), docs(), "address.assemblyConstituency"],
        missingTown: [form({ "address.town": "" }), docs(), "address.town"],
        badHolder: [form({ "addressProof.holder": "Neighbour" }), docs(), "addressProof.holder"],
        percentTooHigh: [form({ "disability.percentage": "150" }), docs(), "disability.percentage"],
        percentWithoutCategory: [form({ "disability.categories": [] }), docs(), "disability.percentage"],
        badFamilyEpic: [form({ "familyMember.epic": "AB12" }), docs(), "familyMember.epic"],
        familyWithoutName: [form({ "familyMember.name": "" }), docs(), "familyMember.name"],
        residentBeforeBirth: [form({ "declaration.residentSince": { month: 1, year: "2001" } }), docs(), "declaration.residentSince"],
        birthDistrictOfOtherState: [form({ "declaration.placeOfBirth.district": "Ludhiana" }), docs(), "declaration.placeOfBirth.district"],
        birthDistrictFreeText: [form({ "declaration.placeOfBirth.district": "Kangra" }), docs(), "declaration.placeOfBirth.district"],
        notFirstTime: [form({ "declaration.firstTimeApplicant": false }), docs(), "declaration.firstTimeApplicant"],
        notConfirmed: [form({ "declaration.confirmed": "yes" }), docs(), "declaration.confirmed"],
        noPlace: [form({ "declaration.place": "" }), docs(), "declaration.place"],
        missingPhoto: [form(), docs({ photo: null }), "documents.photo"],
        webpPhoto: [form(), docs({ photo: { dataUrl: WEBP, fileName: "p.webp" } }), "documents.photo"],
        renamedFile: [form(), docs({ ageProof: { dataUrl: `data:image/png;base64,${Buffer.from("hello world").toString("base64")}`, fileName: "a.png" } }), "documents.ageProof"],
        pdf: [form(), docs({ addressProof: { dataUrl: "data:application/pdf;base64,JVBERi0xLjQK", fileName: "a.pdf" } }), "documents.addressProof"],
        oversized: [form(), docs({ ageProof: { dataUrl: bigPng, fileName: "big.png" } }), "documents.ageProof"]
    };
    for (const [name, [f, d, field]] of Object.entries(cases)) {
        const res = await call("POST", "/auth/register", { form6: f, documents: d });
        assert.equal(res.status, 400, `${name}: ${JSON.stringify(res.body).slice(0, 200)}`);
        assert.ok(res.body.errors.some((e) => e.field === field), `${name}: expected ${field} in ${JSON.stringify(res.body.errors)}`);
        if (f.applicant.english.first) assert.equal((await storedWithName(listRegistrations, englishNameOf(f))).length, 0, `${name}: nothing stored`);
    }
    assert.deepEqual(await orphanDocuments(redis), [], "no document stored without its application");
});

test("Form 6: a repeated submission is refused while the first is pending", needsRedis, async () => {
    const { call, redis, listRegistrations } = await setup();
    const body = { form6: form(), documents: docs() };
    const results = await Promise.all([1, 2, 3].map(() => call("POST", "/auth/register", body)));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
    assert.equal((await storedWithName(listRegistrations, englishNameOf(body.form6))).length, 1);
    assert.deepEqual(await orphanDocuments(redis), []);
});

test("Form 6: documents are available to BLOs only, and are deleted after the decision", needsRedis, async () => {
    const { call, redis, getRegistration, blo, voter } = await setup();
    const id = (await call("POST", "/auth/register", { form6: form(), documents: docs() })).body.data.referenceId;
    const path = `/admin/registrations/${id}/documents`;

    assert.equal((await call("GET", `${path}/photo`)).status, 401);
    assert.equal((await call("GET", `${path}/photo`, undefined, voter)).status, 403);
    assert.equal((await call("GET", `${path}/..%2F..%2Fpasswd`, undefined, blo)).status, 404);
    for (const [category, type, dataUrl] of [["photo", "image/jpeg", JPEG], ["ageProof", "image/png", PNG], ["addressProof", "image/webp", WEBP]]) {
        const res = await call("GET", `${path}/${category}`, undefined, blo);
        assert.equal(res.status, 200, category);
        assert.ok(res.type.startsWith(type), res.type);
        assert.equal(res.headers.get("cache-control"), "private, no-store");
        assert.equal(res.body.toString("base64"), dataUrl.split(",")[1]);
    }

    // The BLO list carries the Form 6 details but never the encrypted Aadhaar.
    const list = await call("GET", "/admin/registrations?status=pending", undefined, blo);
    const row = list.body.data.items.find((r) => r._id === id);
    assert.equal(row.form6.relative.englishName, "SUNITA SHARMA");
    assert.equal(row.form6.aadhaar.last4, "0124");
    assert.equal(row.form6.aadhaar.encrypted, undefined);

    // Approval works as before and deletes the documents, like referenceImage.
    const approved = await call("POST", `/admin/registrations/${id}/approve`, { partNumber: "12", pollingStation: "Govt School, Dharamshala" }, blo);
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.match(approved.body.data.epic, /^DEM\d{7}$/);
    assert.equal(approved.body.data.application.form6.aadhaar.encrypted, undefined);
    const stored = await getRegistration(id);
    assert.equal(stored.referenceImage, null);
    assert.equal(stored.documents.photo.retained, false);
    assert.equal(await redis().exists(`registration:document:${id}:photo`), 0);
    assert.equal(await redis().exists(`registration:document:${id}:ageProof`), 0);
    assert.equal((await call("GET", `${path}/photo`, undefined, blo)).status, 404);
    assert.equal(stored.form6.relative.englishName, "SUNITA SHARMA", "Form 6 details remain after approval");
    const status = (await call("GET", `/auth/register/${id}`)).body.data;
    assert.equal(status.status, "approved");
    assert.equal(status.application.documents.photo.retained, false);
});

test("Form 6: rejection keeps the reason, deletes the documents and keeps the details", needsRedis, async () => {
    const { call, redis, getRegistration, blo } = await setup();
    const id = (await call("POST", "/auth/register", { form6: form(), documents: docs() })).body.data.referenceId;
    const res = await call("POST", `/admin/registrations/${id}/reject`, { note: "Photograph is not clear." }, blo);
    assert.equal(res.status, 200);
    const stored = await getRegistration(id);
    assert.equal(stored.status, "rejected");
    assert.equal(stored.decisionNote, "Photograph is not clear.");
    assert.equal(await redis().exists(`registration:document:${id}:ageProof`), 0);
    assert.equal(stored.documents.ageProof.retained, false);
    assert.equal(stored.form6.address.postOffice, "Dharamshala HO");
    assert.equal((await call("GET", `/auth/register/${id}`)).body.data.note, "Photograph is not clear.");
});

test("Older request format and older records still work", needsRedis, async () => {
    const { call, getRegistration, blo } = await setup();
    const legacy = await call("POST", "/auth/register", {
        name: `Legacy Applicant ${runId}`, dateOfBirth: "1999-05-01", gender: "Male", state: "Himachal Pradesh", district: "KANGRA",
        assemblyConstituency: "DHARAMSHALA", address: "House 9, Main Bazaar, Dharamshala", pinCode: "176215", referenceImage: PNG
    });
    assert.equal(legacy.status, 201);
    const id = legacy.body.data.referenceId;
    const stored = await getRegistration(id);
    assert.equal(stored.form6, undefined);
    assert.equal(stored.formVersion, undefined);
    const status = (await call("GET", `/auth/register/${id}`)).body.data;
    assert.equal(status.application.form6, undefined);
    assert.equal(status.application.address, "House 9, Main Bazaar, Dharamshala");
    assert.equal((await call("GET", `/admin/registrations/${id}/documents/addressProof`, undefined, blo)).status, 200);
    assert.equal((await call("GET", `/admin/registrations/${id}/documents/photo`, undefined, blo)).status, 404);
    const approved = await call("POST", `/admin/registrations/${id}/approve`, { partNumber: "3", pollingStation: "Primary School, Kangra" }, blo);
    assert.equal(approved.status, 200);
});
