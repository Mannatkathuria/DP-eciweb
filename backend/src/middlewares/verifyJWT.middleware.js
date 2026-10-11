import jwt from "jsonwebtoken";
import { getUserById } from "../repositories/user.repository.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");
    if (!token) throw new ApiError(401, "Unauthorized request: no token provided.");

    let decoded;
    try { decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET); }
    catch { throw new ApiError(401, "Invalid or expired token."); }

    const user = await getUserById(decoded?._id);
    if (!user) throw new ApiError(401, "Invalid access token: user not found.");

    const { passwordHash, ...safeUser } = user;
    req.user = safeUser;
    next();
});

export const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
        return next(new ApiError(403, "This portal is not available to your account."));
    }
    next();
};
