import jwt from "jsonwebtoken";

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
  _id: user._id, epic: user.epic, role: user.role, name: user.name || null
});

// Signs a JWT, sets the httpOnly cookie, and returns the token.
export const issueSession = (res, user) => {
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