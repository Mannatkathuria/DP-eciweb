import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { limiter } from "./middlewares/rateLimit.middleware.js";

import electorRoutes from "./routes/elector.routes.js";
import verificationRoutes from "./routes/verification.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import votingVerificationRoutes from "./routes/votingVerification.routes.js";
import personaRoutes from "./routes/persona.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import changeRequestRoutes from "./routes/changeRequest.routes.js";
import eciRoutes from "./routes/eci.routes.js";
import assignmentRoutes from "./routes/assignment.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import integrationRoutes from "./routes/integration.routes.js";
import registrationTaskRoutes from "./routes/registrationTask.routes.js";
import rollVersionRoutes from "./routes/rollVersion.routes.js";
import electionRoutes from "./routes/election.routes.js";
import pollingStationRoutes from "./routes/pollingStation.routes.js";
import nominationRoutes from "./routes/nomination.routes.js";
import publicRoutes from "./routes/public.routes.js";
import pollDayRoutes from "./routes/pollDay.routes.js";
import controlRoomRoutes from "./routes/controlRoom.routes.js";
import resultRoutes from "./routes/result.routes.js";
import trainingRoutes from "./routes/training.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import userRoutes from "./routes/user.routes.js";
import eventsRoutes from "./routes/events.routes.js";
import deviceRoutes from "./routes/device.routes.js";
import countingRoutes from "./routes/counting.routes.js";
import objectionRoutes from "./routes/objection.routes.js";
import { isTraining } from "./config/appMode.js";
import { mongoStatus } from "./config/mongo.js";
import { redis } from "./config/redis.js";
import { projectorBacklog } from "./services/projector.service.js";


const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

// Security headers for an API that only serves JSON, plus the deployment mode on every response.
app.use((req, res, next) => {
    res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "Cache-Control": "no-store",
        "X-App-Mode": isTraining() ? "training" : "live"
    });
    next();
});

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
    allowedHeaders: ["Content-Type", "Authorization", "X-Step-Up", "X-Requested-With", "X-Device-Id", "X-Device-Token"],
    exposedHeaders: ["X-App-Mode"]
  })
);

// Camera frames are sent as base64 JPEGs, so the body limit must be generous.
// The raw body is kept only for the Persona webhook, whose signature covers the exact bytes sent.
const jsonOptions = {
    verify: (req, res, buf) => {
        if (req.originalUrl.startsWith("/api/v1/persona/webhook")) req.rawBody = buf.toString("utf8");
    }
};
const defaultJson = express.json({ ...jsonOptions, limit: "8mb" });
// A Form 6 application carries three images of up to 4 MB each (about 16 MB once base64-encoded),
// so only that one route accepts a larger body.
const registrationJson = express.json({ ...jsonOptions, limit: "18mb" });
app.use((req, res, next) =>
    (req.method === "POST" && req.path === "/api/v1/auth/register" ? registrationJson : defaultJson)(req, res, next));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Public lookup endpoints are rate-limited to make bulk EPIC enumeration harder.
const publicLimiter = limiter("public", { windowMs: 60 * 1000, limit: 60, message: "Too many requests. Please slow down." });

app.get("/api/v1/health", async (req, res) => {
    // Redis is the system of record; MongoDB holds read models and archives fed from it.
    let redisState = "ok";
    try { await redis().ping(); } catch { redisState = "error"; }
    const mongodb = await mongoStatus();
    let backlog = null;
    if (mongodb !== "not configured" && redisState === "ok") backlog = await projectorBacklog().catch(() => null);
    res.status(redisState === "ok" ? 200 : 503).json({
        success: redisState === "ok", message: "Election Management API is running",
        database: { redis: redisState, mongodb, mongoBacklog: backlog }, mode: isTraining() ? "training" : "live"
    });
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
app.use("/api/v1/assignments", assignmentRoutes);
app.use("/api/v1/audit", auditRoutes);
app.use("/api/v1/integrations", integrationRoutes);
app.use("/api/v1/registration-tasks", registrationTaskRoutes);
app.use("/api/v1/roll-versions", rollVersionRoutes);
app.use("/api/v1/elections", electionRoutes);
app.use("/api/v1/polling-stations", pollingStationRoutes);
app.use("/api/v1/nominations", nominationRoutes);
app.use("/api/v1/public", publicLimiter, publicRoutes);
app.use("/api/v1/poll-day", pollDayRoutes);
app.use("/api/v1/control-room", controlRoomRoutes);
app.use("/api/v1/results", resultRoutes);
app.use("/api/v1/training", trainingRoutes);
app.use("/api/v1/agents", agentRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/events", eventsRoutes);
app.use("/api/v1/devices", deviceRoutes);
app.use("/api/v1/counting", countingRoutes);
app.use("/api/v1/objections", objectionRoutes);

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
