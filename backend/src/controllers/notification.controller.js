
import { getNotifications } from "../services/otp.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getUserNotifications = asyncHandler(async (req, res) => {
    if (
        process.env.NODE_ENV === "production" ||
        process.env.ENABLE_DEMO_OTP_NOTIFICATIONS !== "true"
    ) {
        throw new ApiError(403, "Demo OTP notifications are disabled.");
    }

    const epic = String(req.query.epic ?? "").trim().toUpperCase();

    if (!/^[A-Z]{3}\d{7}$/.test(epic)) {
        throw new ApiError(400, "A valid EPIC number is required.");
    }

    res.status(200).json({
        success: true,
        data: {
            notifications: getNotifications(epic)
        }
    });
});
