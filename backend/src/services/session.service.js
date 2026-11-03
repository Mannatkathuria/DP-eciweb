import crypto from "crypto";
import jwt from "jsonwebtoken";
import { redis } from "../config/redis.js";
import { ApiError } from "../utils/ApiErrors.js";

const isProd = process.env.NODE_ENV === "production";

// Shared cookie settings: cross-site on Vercel (frontend and backend are on different subdomains
// of vercel.app), normal "lax" locally.
export const cookieOptions = {
  httpOnly: true,
  secure: isProd,                     // required when sameSite is "none"
  sameSite: isProd ? "none" : "lax",
  path: "/"
};

export const publicUser = (user) => ({
  _id: user._id, epic: user.epic, role: user.role, name: user.name || null,
  // Where this account is assigned to work (state, district, constituency, polling station...).
  ...(user.jurisdiction ? { jurisdiction: user.jurisdiction } : {}),
  ...(user.designation ? { designation: user.designation } : {}),
  // BLOs signing in with a temporary password must set their own before using the portal.
  ...(user.role === "blo" ? { mustChangePassword: Boolean(user.mustChangePassword) } : {})
});

// Signs a JWT, sets the httpOnly cookie, and returns the token.
export const issueSession = (res, user) => {
  // A suspended account is never given a session, whichever sign-in path it used.
  if (user.suspended) throw new ApiError(403, "This account is suspended. Contact the election office that appointed you.");
  // Each session has an id (jti) so that signing out can revoke it on the server.
  const token = jwt.sign(
    { _id: user._id, epic: user.epic, role: user.role },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "8h", jwtid: crypto.randomUUID() }
  );

  res.cookie("accessToken", token, {
    ...cookieOptions,
    maxAge: 8 * 60 * 60 * 1000
  });

  return token;
};

// Use this on logout so the cookie actually gets cleared
export const clearSession = (res) => {
  res.clearCookie("accessToken", cookieOptions);
};

// Server-side revocation, in Redis:
//   session:revoked:<jti>             a signed-out session (kept until the token would have expired)
//   session:revoked-before:<userId>   "sign out everywhere": tokens issued before this time (ms) are refused
const revokedKey = (jti) => `session:revoked:${jti}`;
const revokedBeforeKey = (userId) => `session:revoked-before:${userId}`;

/** Revokes one session token (no-op for a token that is invalid or already expired). */
export const revokeToken = async (token) => {
  let decoded;
  try { decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET); } catch { return false; }
  if (!decoded?.jti) return false;
  const ttl = Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
  await redis().set(revokedKey(decoded.jti), "1", { EX: ttl });
  return true;
};

/** Revokes every session of a user issued up to now. */
export const revokeAllSessions = async (userId) => {
  await redis().set(revokedBeforeKey(userId), String(Date.now()), { EX: 7 * 24 * 3600 });
};

/** True if this decoded token has been signed out (individually or by "sign out everywhere"). */
export const isRevoked = async (decoded) => {
  const [one, before] = await redis().multi()
    .exists(decoded.jti ? revokedKey(decoded.jti) : "session:revoked:-")
    .get(revokedBeforeKey(decoded._id))
    .exec();
  if (one) return true;
  return Boolean(before && decoded.iat * 1000 < Number(before));
};