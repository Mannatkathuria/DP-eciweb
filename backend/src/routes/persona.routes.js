
import { Router } from "express";
import axios from "axios";

const router = Router();

router.post("/start", async (req, res) => {
  try {
    if (!process.env.PERSONA_API_KEY ||
        !process.env.PERSONA_TEMPLATE_ID) {
      return res.status(500).json({
        success: false,
        message: "Persona is not configured"
      });
    }

    // Replace this with your authenticated user's actual ID.
    // Protect this route with your existing authentication middleware.
    // TEMPORARY SANDBOX TEST ONLY — NOT FOR PRODUCTION
    const userId = req.body?.userId;

    if (userId !== "dummy-voter-001") {
    return res.status(401).json({
        success: false,
        message: "Invalid test user",
    });
    }

    const response = await axios.post(
      "https://api.withpersona.com/api/v1/inquiries",
      {
        data: {
          attributes: {
            "inquiry-template-id":
              process.env.PERSONA_TEMPLATE_ID,
            "reference-id": String(userId)
          }
        }
      },
      {
        headers: {
          Authorization:
            `Bearer ${process.env.PERSONA_API_KEY}`,
          "Content-Type": "application/json",
          "Persona-Version": "2025-10-27"
        }
      }
    );

    const inquiryId = response.data.data.id;

    // Persist inquiryId + userId in your database here.
    // Do not trust a frontend redirect as proof of verification.

    return res.json({
      success: true,
      inquiryId,
      verificationUrl:
        `https://inquiry.withpersona.com/verify?inquiry-id=${encodeURIComponent(inquiryId)}`
    });
  } catch (error) {
    console.error(
      "Persona inquiry creation failed:",
      error.response?.data || error.message
    );

    return res.status(502).json({
      success: false,
      message: "Could not start identity verification"
    });
  }
});

export default router;
