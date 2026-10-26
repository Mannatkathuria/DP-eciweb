import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import electorRoutes from "./routes/elector.routes.js";
import verificationRoutes from "./routes/verification.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import votingVerificationRoutes from "./routes/votingVerification.routes.js";
import personaRoutes from "./routes/persona.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import changeRequestRoutes from "./routes/changeRequest.routes.js";
import eciRoutes from "./routes/eci.routes.js";


const app = express();

app.set("trust proxy", 1);

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      console.warn("CORS blocked:", origin, "| allowed:", allowedOrigins.join(","));
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Camera frames are sent as base64 JPEGs, so the body limit must be generous.
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Public lookup endpoints are rate-limited to make bulk EPIC enumeration harder.
const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please slow down." }
});

app.get("/api/v1/health", (req, res) => {
    res.status(200).json({ success: true, message: "Election Management API is running", database: "redis" });
});

app.use("/api/v1/electors", publicLimiter, electorRoutes);
app.use("/api/v1/verification", publicLimiter, verificationRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/voting-verification", votingVerificationRoutes);
app.use("/api/v1/persona", personaRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/changes", changeRequestRoutes);
app.use("/api/v1/eci", eciRoutes);

app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Something went wrong";

    if (err.type === "entity.too.large") {
        statusCode = 413;
        message = "Request body too large.";
    } else if (err.name === "CastError" || err.name === "ValidationError") {
        statusCode = 400;
    } else if (statusCode === 500) {
        console.error(err);
        message = "Internal server error.";
    }

    res.status(statusCode).json({
        success: false,
        statusCode,
        message,
        errors: err.errors || []
    });
});

export default app;
