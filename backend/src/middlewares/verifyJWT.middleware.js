import jwt from "jsonwebtoken";
import { getUserById } from "../repositories/user.repository.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
    const bearer = req.header("Authorization")?.replace("Bearer ", "");
    const token = bearer || req.cookies?.accessToken;
    if (!token) throw new ApiError(401, "Unauthorized request: no token provided.");
    // CSRF: a session carried only by the cookie (which is SameSite=None in production) must come
    // with a custom header for any state-changing request. Browsers send custom headers only after
    // a CORS preflight, which the origin allow-list refuses for other sites.
    if (!bearer && !["GET", "HEAD", "OPTIONS"].includes(req.method) && req.header("X-Requested-With") !== "XMLHttpRequest") {
        throw new ApiError(403, "This request is missing its anti-forgery header.");
    }

    let decoded;
    try { decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET); }
    catch { throw new ApiError(401, "Invalid or expired token."); }

    const user = await getUserById(decoded?._id);
    if (!user) throw new ApiError(401, "Invalid access token: user not found.");
    // A password change or reset signs out sessions that were started before it.
    if (user.passwordChangedAt && decoded.iat * 1000 < Date.parse(user.passwordChangedAt) - 1000) {
        throw new ApiError(401, "Your password was changed. Please sign in again.");
    }

    req.user = user;
    next();
});

// BLOs still on their temporary password may only change it.
export const requirePasswordChanged = (req, res, next) => {
    if (req.user?.role === "blo" && req.user.mustChangePassword) {
        return next(new ApiError(403, "Set a new password before using the BLO portal."));
    }
    next();
};

export const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
        return next(new ApiError(403, "This portal is not available to your account."));
    }
    next();
};
