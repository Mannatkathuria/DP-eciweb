
import { Router } from "express";
import axios from "axios";
import { verifyJWT } from "../middlewares/verifyJWT.middleware.js";
import {
  connectRedis,
  jsonGet,
  jsonSet,
} from "../config/redis.js";

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

function makeRecord(inquiryId, status) {
  return {
    inquiryId,
    status,
    verified: status === "approved",
    awaitingDecision: status === "completed",
    updatedAt: new Date().toISOString(),
  };
}

async function saveInquiry(userId, inquiryId, status) {
  const record = makeRecord(inquiryId, status);

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
              "inquiry-template-id":
                process.env.PERSONA_TEMPLATE_ID,
              "reference-id": userId,
            },
          },
        },
        { headers }
      );

      inquiryId = response.data.data.id;
      status =
        response.data.data.attributes.status || "created";

      await saveInquiry(userId, inquiryId, status);
    } else if (status === "pending") {
      // Pending inquiries need a session token to resume the embedded flow.
      const resumeResponse = await persona.post(
        `/inquiries/${encodeURIComponent(inquiryId)}/resume`,
        undefined,
        { headers }
      );
      sessionToken = resumeResponse.data.meta?.["session-token"];
      if (!sessionToken) {
        throw new Error("Persona did not return a session token for the pending inquiry.");
      }
    }

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
        ...(sessionToken ? { sessionToken } : {}),
        verificationUrl: verificationUrl.toString(),
      },
    });
  } catch (error) {
    console.error(
      "Persona start failed:",
      error.response?.data || error.message
    );

    return res.status(error.statusCode || 502).json({
      success: false,
      message: "Could not start identity verification",
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
        verified: false,
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
// Fetch the current inquiry status from Persona's API.
router.post("/sync", verifyJWT, async (req, res) => {
  try {
    await connectRedis();

    const userId = String(req.user._id);
    const record = await jsonGet(userKey(userId));

    if (!record?.inquiryId) {
      return res.status(404).json({
        success: false,
        message: "No inquiry found for this user",
      });
    }

    const headers = getPersonaConfig();

    const response = await persona.get(
      `/inquiries/${encodeURIComponent(record.inquiryId)}`,
      { headers }
    );

    const attributes = response.data.data.attributes;
    const status = attributes.status;

    const updated = await saveInquiry(
      userId,
      record.inquiryId,
      status
    );

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error(
      "Persona sync failed:",
      error.response?.data || error.message
    );

    return res.status(error.statusCode || 502).json({
      success: false,
      message: "Could not sync verification status",
    });
  }
});

export default router;
