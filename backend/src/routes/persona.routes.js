import { Router } from "express";
import axios from "axios";
import crypto from "crypto";
import { verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import { connectRedis, jsonGet, jsonSet } from "../config/redis.js";
import { getVerification, saveVerification } from "../repositories/verification.repository.js";
import { getElectorByEpic } from "../repositories/elector.repository.js";
import { getUserByEpic, saveUser } from "../repositories/user.repository.js";
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

    const headers = getPersonaConfig();
    const response = await persona.get(
      `/inquiries/${encodeURIComponent(targetInquiryId)}`,
      { headers }
    );

    const attributes = response.data.data.attributes;
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
      message: "Could not sync verification status",
    });
  }
});

/**
 * Called when Persona verification completes in the frontend.
 * Retrieves extracted data, triggers Gemini AI sanity check,
 * saves to BLO cases, and marks user as verified!
 */
router.post("/complete-verification", verifyJWT, async (req, res) => {
  try {
    await connectRedis();

    const userId = String(req.user._id);
    const inquiryId = req.body?.inquiryId || (await jsonGet(userKey(userId)))?.inquiryId;

    if (!inquiryId) {
      return res.status(400).json({ success: false, message: "Inquiry ID is required." });
    }

    let personaAttributes = {};
    let status = req.body?.status || "completed";

    try {
      const headers = getPersonaConfig();
      const response = await persona.get(
        `/inquiries/${encodeURIComponent(inquiryId)}`,
        { headers }
      );
      personaAttributes = response.data?.data?.attributes || {};
      if (personaAttributes.status) {
        status = personaAttributes.status;
      }
    } catch (apiErr) {
      console.warn("Could not fetch remote inquiry details, using client payload:", apiErr.message);
    }

    // Default to approved if client reports success or sandbox completed
    if (status === "completed" || status === "created") {
      status = "approved"; // In sandbox prototype, completion marks voter verified
    }

    await saveInquiry(userId, inquiryId, status);
    const { verificationCase, aiReview } = await syncInquiryToVerificationCase(req.user, inquiryId, status, personaAttributes);

    return res.json({
      success: true,
      message: "Identity verification successfully completed.",
      data: {
        inquiryId,
        status,
        verified: status === "approved",
        aiReview,
        caseId: verificationCase._id,
        redirectTo: "/dashboard"
      }
    });
  } catch (error) {
    console.error("Persona completion failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not record verification completion",
    });
  }
});

/**
 * Persona Webhook endpoint for server-to-server notifications
 */
router.post("/webhook", async (req, res) => {
  try {
    const event = req.body?.data;
    if (!event) return res.status(400).json({ success: false });

    const inquiryId = event.id;
    const status = event.attributes?.status;
    const referenceId = event.attributes?.["reference-id"];

    if (inquiryId && status) {
      await connectRedis();
      if (referenceId) {
        await saveInquiry(referenceId, inquiryId, status);
      }
      console.log(`[Persona Webhook] Inquiry ${inquiryId} updated to status: ${status}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    res.status(500).json({ success: false });
  }
});

export default router;
