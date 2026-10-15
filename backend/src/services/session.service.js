import jwt from "jsonwebtoken";

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
        httpOnly: true, sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60 * 1000
    });

    return token;
};
