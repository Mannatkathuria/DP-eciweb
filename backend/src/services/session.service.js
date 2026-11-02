import jwt from "jsonwebtoken";
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
  const token = jwt.sign(
    { _id: user._id, epic: user.epic, role: user.role },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "8h" }
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