import { Router } from "express";
import axios from "axios";
import crypto from "crypto";
import { verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { connectRedis, jsonGet, jsonSet } from "../config/redis.js";
import { getVerification, saveVerification } from "../repositories/verification.repository.js";
import { getElectorByEpic } from "../repositories/elector.repository.js";
import { getUserById, saveUser } from "../repositories/user.repository.js";
import { performDocumentSanityCheck } from "../services/gemini.service.js";

const router = Router();

const persona = axios.create({
  baseURL: "https://api.withpersona.com/api/v1",
  headers: {
    "Content-Type": "application/json",
    "Persona-Version": process.env.PERSONA_API_VERSION || "2025-10-27",
  },
});

const userKey = (userId) => `persona:user:${userId}`;
const terminalStatuses = ["declined", "failed", "expired"];

function makeRecord(inquiryId, status, extra = {}) {
  return {
    inquiryId,
    status,
    verified: status === "approved",
    awaitingDecision: status === "completed" || status === "needs_review",
    updatedAt: new Date().toISOString(),
    ...extra
  };
}

async function saveInquiry(userId, inquiryId, status, extra = {}) {
  const record = makeRecord(inquiryId, status, extra);
  await jsonSet(userKey(userId), record);
  return record;
}

function getPersonaConfig() {
  const requiredValues = {
    PERSONA_API_KEY: process.env.PERSONA_API_KEY,
    PERSONA_TEMPLATE_ID: process.env.PERSONA_TEMPLATE_ID,
    PERSONA_ENVIRONMENT_ID: process.env.PERSONA_ENVIRONMENT_ID,
  };
  const missingValues = Object.entries(requiredValues)
    .filter(([, value]) => !value || value.includes("YOUR_"))
    .map(([name]) => name);

  if (missingValues.length) {
    const error = new Error(
      `Persona configuration is missing or still uses example values: ${missingValues.join(", ")}`
    );
    error.statusCode = 500;
    throw error;
  }

  return {
    Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
  };
}

/**
 * Syncs Persona inquiry data to the central BLO Verification Cases table
 */
async function syncInquiryToVerificationCase(user, inquiryId, personaStatus, personaAttributes = {}) {
  const elector = await getElectorByEpic(user.epic);
  let existingCase = await getVerification(inquiryId);

  // Status mapping
  let caseStatus = "in_progress";
  if (personaStatus === "approved") {
    caseStatus = "verified";
  } else if (["completed", "marked_for_review", "marked-for-review", "needs_review"].includes(personaStatus)) {
    caseStatus = "review_required";
  } else if (terminalStatuses.includes(personaStatus)) {
    caseStatus = "declined";
  }

  // Extract fields if available
  const fields = personaAttributes.fields || {};
  const extractedFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v?.value !== undefined) extractedFields[k] = v.value;
    else if (typeof v === "string" || typeof v === "number") extractedFields[k] = v;
  }

  // Run Gemini AI sanity check if review or verified
  let aiReview = existingCase?.aiReview || null;
  if (!aiReview || caseStatus !== "in_progress") {
    aiReview = await performDocumentSanityCheck({
      type: "persona_verification",
      currentRecord: elector || { epic: user.epic, name: user.name },
      requestedData: extractedFields,
      extractedFields
    });
  }

  const now = new Date().toISOString();
  const verificationCase = {
    _id: inquiryId,
    elector: elector?._id || user._id,
    epic: user.epic,
    inquiryId,
    identity: {
      method: "persona",
      status: caseStatus,
      extractedFields,
      aiReview,
      checkedAt: now
    },
    aiReview,
    status: caseStatus,
    reasons: aiReview?.anomalies || [],
    startedAt: existingCase?.startedAt || now,
    createdAt: existingCase?.createdAt || existingCase?.startedAt || now,
    completedAt: caseStatus !== "in_progress" ? now : null,
    updatedAt: now
  };

  await saveVerification(verificationCase);

  // If verified, update user account verified flag
  if (caseStatus === "verified") {
    await saveUser({ ...user, verified: true });
  }

  return { verificationCase, aiReview };
}

/**
 * Fetches an inquiry from Persona and checks that it was created for this user
 * (reference-id is set to the user's id in /start). Throws with a statusCode on failure.
 */
async function fetchOwnedInquiry(userId, inquiryId) {
  const headers = getPersonaConfig();
  let response;
  try {
    response = await persona.get(`/inquiries/${encodeURIComponent(inquiryId)}`, { headers });
  } catch (err) {
    const error = new Error("Could not reach Persona to confirm the verification result. Try again shortly.");
    error.statusCode = err.response?.status === 404 ? 404 : 502;
    throw error;
  }
  const attributes = response.data?.data?.attributes || {};
  if (String(attributes["reference-id"] ?? "") !== String(userId)) {
    const error = new Error("This verification does not belong to your account.");
    error.statusCode = 403;
    throw error;
  }
  return attributes;
}

// POST /api/v1/persona/start
router.post("/start", verifyJWT, async (req, res) => {
  try {
    await connectRedis();

    const userId = String(req.user._id);
    const headers = getPersonaConfig();
    const environmentId = process.env.PERSONA_ENVIRONMENT_ID;

    const existing = await jsonGet(userKey(userId));

    let inquiryId =
      existing && !terminalStatuses.includes(existing.status)
        ? existing.inquiryId
        : null;

    let status = existing?.status;
    let sessionToken;

    if (!inquiryId) {
      const response = await persona.post(
        "/inquiries",
        {
          data: {
            attributes: {
              "inquiry-template-id": process.env.PERSONA_TEMPLATE_ID,
              "reference-id": userId,
            },
          },
        },
        { headers }
      );

      inquiryId = response.data.data.id;
      status = response.data.data.attributes.status || "created";

      await saveInquiry(userId, inquiryId, status);
    } else if (status === "pending" || status === "created") {
      try {
        const resumeResponse = await persona.post(
          `/inquiries/${encodeURIComponent(inquiryId)}/resume`,
          undefined,
          { headers }
        );
        sessionToken = resumeResponse.data.meta?.["session-token"];
      } catch (resumeErr) {
        console.warn("Persona resume token fetch skipped:", resumeErr.message);
      }
    }

    // Always ensure a case exists in verifications:all for BLO visibility!
    await syncInquiryToVerificationCase(req.user, inquiryId, status);

    const verificationUrl = new URL("https://inquiry.withpersona.com/verify");
    verificationUrl.searchParams.set("inquiry-id", inquiryId);
    if (sessionToken) {
      verificationUrl.searchParams.set("session-token", sessionToken);
    }

    return res.json({
      success: true,
      data: {
        inquiryId,
        status,
        environmentId,
        templateId: process.env.PERSONA_TEMPLATE_ID,
        ...(sessionToken ? { sessionToken } : {}),
        verificationUrl: verificationUrl.toString(),
      },
    });
  } catch (error) {
    console.error("Persona start failed:", error.response?.data || error.message);

    return res.status(error.statusCode || 502).json({
      success: false,
      message: error.message || "Could not start identity verification",
    });
  }
});

// GET /api/v1/persona/status
router.get("/status", verifyJWT, async (req, res) => {
  try {
    await connectRedis();

    const userId = String(req.user._id);
    const record = await jsonGet(userKey(userId));

    return res.json({
      success: true,
      data: record || {
        status: "not_started",
        verified: req.user.verified || false,
        awaitingDecision: false,
      },
    });
  } catch (error) {
    console.error("Persona status failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not retrieve verification status",
    });
  }
});

// POST /api/v1/persona/sync
router.post("/sync", verifyJWT, async (req, res) => {
  try {
    await connectRedis();

    const userId = String(req.user._id);
    const record = await jsonGet(userKey(userId));
    const targetInquiryId = req.body?.inquiryId || record?.inquiryId;

    if (!targetInquiryId) {
      return res.status(404).json({
        success: false,
        message: "No inquiry found for this user",
      });
    }

    const attributes = await fetchOwnedInquiry(userId, targetInquiryId);
    const status = attributes.status;

    await saveInquiry(userId, targetInquiryId, status);
    const { verificationCase } = await syncInquiryToVerificationCase(req.user, targetInquiryId, status, attributes);

    return res.json({
      success: true,
      data: {
        ...record,
        status,
        verified: status === "approved",
        verificationCase
      },
    });
  } catch (error) {
    console.error("Persona sync failed:", error.response?.data || error.message);
    return res.status(error.statusCode || 502).json({
      success: false,
      message: error.statusCode ? error.message : "Could not sync verification status",
    });
  }
});

/**
 * Called when the embedded Persona flow finishes in the browser. The browser only says the
 * flow ended; the result itself is always read from Persona. A voter is verified only when
 * Persona reports "approved". "completed" means Persona is still deciding, so the case goes
 * to the BLO review queue instead.
 */
router.post("/complete-verification", verifyJWT, async (req, res) => {
  try {
    await connectRedis();

    const userId = String(req.user._id);
    const inquiryId = req.body?.inquiryId || (await jsonGet(userKey(userId)))?.inquiryId;

    if (!inquiryId) {
      return res.status(400).json({ success: false, message: "Inquiry ID is required." });
    }

    const personaAttributes = await fetchOwnedInquiry(userId, inquiryId);
    const status = personaAttributes.status;

    await saveInquiry(userId, inquiryId, status);
    const { verificationCase, aiReview } = await syncInquiryToVerificationCase(req.user, inquiryId, status, personaAttributes);
    const verified = status === "approved";

    return res.json({
      success: true,
      message: verified
        ? "Identity verification approved."
        : "Verification submitted. Your status updates when a decision is made.",
      data: {
        inquiryId,
        status,
        verified,
        caseStatus: verificationCase.status,
        aiReview,
        caseId: verificationCase._id,
        redirectTo: "/dashboard"
      }
    });
  } catch (error) {
    console.error("Persona completion failed:", error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Could not record verification completion",
    });
  }
});

/**
 * Checks the Persona-Signature header ("t=<timestamp>,v1=<hmac>"): an HMAC-SHA256 of
 * "<timestamp>.<raw body>" with PERSONA_WEBHOOK_SECRET. Several v1 values may be present
 * while a secret is being rotated.
 */
function hasValidPersonaSignature(req, secret) {
  const header = String(req.get("Persona-Signature") || "");
  const parts = header.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith("v1=")).flatMap((p) => p.slice(3).split(" "));
  if (!timestamp || !signatures.length || !req.rawBody) return false;
  // Reject replays of old events (5 minutes).
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${req.rawBody}`).digest("hex");
  return signatures.some((sig) =>
    sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

/**
 * Persona Webhook endpoint for server-to-server notifications. Only signed events are
 * accepted; an unsigned request could otherwise mark any voter as verified.
 */
router.post("/webhook", async (req, res) => {
  try {
    const secret = process.env.PERSONA_WEBHOOK_SECRET;
    if (!secret || /your_/i.test(secret)) {
      console.warn("[Persona Webhook] Ignored: PERSONA_WEBHOOK_SECRET is not configured.");
      return res.status(503).json({ success: false, message: "Webhook secret is not configured." });
    }
    if (!hasValidPersonaSignature(req, secret)) {
      return res.status(401).json({ success: false, message: "Invalid webhook signature." });
    }

    // Persona wraps the inquiry in an event: data.attributes.payload.data
    const inquiry = req.body?.data?.attributes?.payload?.data;
    const inquiryId = inquiry?.id;
    const status = inquiry?.attributes?.status;
    const referenceId = inquiry?.attributes?.["reference-id"];

    if (inquiryId && status && referenceId) {
      await connectRedis();
      await saveInquiry(referenceId, inquiryId, status);
      const user = await getUserById(referenceId);
      if (user) await syncInquiryToVerificationCase(user, inquiryId, status, inquiry.attributes);
      console.log(`[Persona Webhook] Inquiry ${inquiryId} updated to status: ${status}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    res.status(500).json({ success: false });
  }
});

export default router;
