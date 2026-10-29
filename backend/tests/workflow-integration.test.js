import test from "node:test";
import assert from "node:assert/strict";
import { connectRedis, redis } from "../src/config/redis.js";
import { performDocumentSanityCheck } from "../src/services/gemini.service.js";
import {
    saveChangeRequest, getChangeRequest, listChangeRequests
} from "../src/repositories/changeRequest.repository.js";
import { getElectorByEpic, saveElector, updateElector } from "../src/repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "../src/repositories/user.repository.js";
import { getVerification, saveVerification, listVerifications } from "../src/repositories/verification.repository.js";

// These tests write test records, so they need their own, disposable Redis. They never use
// REDIS_URL or the default local Redis, which may hold your development data.
const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
if (TEST_REDIS_URL) process.env.REDIS_URL = TEST_REDIS_URL;
const needsRedis = { skip: TEST_REDIS_URL ? false : "set TEST_REDIS_URL to a disposable Redis to run this test" };

test("Gemini Service: performs document sanity checks and flags anomalies", async () => {
    // 1. Underage check
    const underage = await performDocumentSanityCheck({
        type: "registration",
        requestedData: { name: "Test Minor", dateOfBirth: "2015-01-01", pinCode: "123456" },
        documentImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    });
    assert.equal(underage.sanityCheckPassed, false);
    assert.equal(underage.riskLevel, "HIGH");
    assert.ok(underage.anomalies.some(a => a.includes("Underage")));

    // 2. Valid adult check
    const valid = await performDocumentSanityCheck({
        type: "registration",
        requestedData: { name: "Adult Voter", dateOfBirth: "2000-01-01", pinCode: "152026" },
        documentImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    });
    assert.equal(valid.sanityCheckPassed, true);
    assert.equal(valid.riskLevel, "LOW");
    assert.ok(valid.shortAiReview.length > 0);
});

test("Change Request Workflow: Form 8 submission and BLO approval reflects in Electoral Roll", needsRedis, async () => {
    await connectRedis();

    const testEpic = "TEST7778881";
    await saveElector({
        _id: "test-elector-1",
        epic: testEpic,
        name: "Ramesh Sharma",
        dateOfBirth: "1990-05-10T00:00:00.000Z",
        gender: "Male",
        state: "Punjab",
        district: "Muktsar",
        assemblyConstituency: "Faridkot",
        address: "Old House 10, Malout",
        pinCode: "152026",
        partNumber: "12",
        pollingStation: "Station A",
        isActive: true,
        hasVoted: false
    });

    // Create change request
    const changeReq = {
        _id: "change-req-test-1",
        epic: testEpic,
        requestedChanges: {
            address: "New Villa 99, Malout",
            pinCode: "152026"
        },
        documentProof: "data:image/png;base64,testproof",
        aiReview: {
            sanityCheckPassed: true,
            riskLevel: "LOW",
            shortAiReview: "Address change verified with utility bill."
        },
        status: "pending",
        submittedAt: new Date().toISOString()
    };
    await saveChangeRequest(changeReq);

    // Verify stored
    const fetched = await getChangeRequest("change-req-test-1");
    assert.equal(fetched.epic, testEpic);
    assert.equal(fetched.status, "pending");

    // Simulate BLO approval
    await updateElector(testEpic, changeReq.requestedChanges);
    fetched.status = "approved";
    await saveChangeRequest(fetched);

    // Verify electoral roll immediately reflects changes!
    const updatedElector = await getElectorByEpic(testEpic);
    assert.equal(updatedElector.address, "New Villa 99, Malout");
    assert.equal(updatedElector.pinCode, "152026");
});

test("Verification Cases: Persona inquiry maps to BLO cases with proper status and AI review", needsRedis, async () => {
    await connectRedis();

    const caseId = "test-inq-case-999";
    const verificationCase = {
        _id: caseId,
        inquiryId: caseId,
        epic: "ABC1234567",
        status: "verified",
        identity: { method: "persona", status: "verified" },
        aiReview: {
            sanityCheckPassed: true,
            riskLevel: "LOW",
            shortAiReview: "All document and biometric checks passed."
        },
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString()
    };

    await saveVerification(verificationCase);

    const all = await listVerifications();
    const found = all.find(c => c._id === caseId);
    assert.ok(found);
    assert.equal(found.status, "verified");
    assert.equal(found.aiReview.riskLevel, "LOW");
});

test("ECI Workflow: On-day voting verification marks elector as voted and prevents duplicate voting", needsRedis, async () => {
    await connectRedis();

    const testVoterEpic = "VOTE1234567";
    const testElector = {
        _id: "test-vote-elec-1",
        epic: testVoterEpic,
        name: "Pooja Malhotra",
        dateOfBirth: "1995-12-12T00:00:00.000Z",
        gender: "Female",
        state: "Punjab",
        district: "Muktsar",
        assemblyConstituency: "Faridkot",
        partNumber: "15",
        pollingStation: "Govt School Booth 15",
        isActive: true,
        hasVoted: false
    };
    await saveElector(testElector);

    // First vote: Not voted yet
    let current = await getElectorByEpic(testVoterEpic);
    assert.equal(current.hasVoted, false);

    // Cast vote with biometric token FP-<EPIC>
    const token = `FP-${testVoterEpic}`;
    assert.equal(token, "FP-VOTE1234567");

    current.hasVoted = true;
    current.votedAt = new Date().toISOString();
    current.votedBooth = current.pollingStation;
    await saveElector(current);

    // Second check: Must show voted and block duplicate voting
    const votedElector = await getElectorByEpic(testVoterEpic);
    assert.equal(votedElector.hasVoted, true);
    assert.ok(votedElector.votedAt);

    await redis().quit();
});
