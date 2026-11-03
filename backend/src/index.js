import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import { APP_MODE, checkConfig } from "./config/appMode.js";
import { attachRealtime } from "./realtime/socket.js";
import { sweepOfflineDevices } from "./controllers/device.controller.js";
import { mongoConfigured } from "./config/mongo.js";
import { drainProjector } from "./services/projector.service.js";

const configProblems = checkConfig();
if (configProblems.length) {
  for (const problem of configProblems) console.error(`CONFIG: ${problem}`);
  throw new Error("Unsafe configuration; see the messages above.");
}
if (APP_MODE === "training") console.log("TRAINING environment: practice data only.");

const PORT = process.env.PORT || 8000;

// Run DB setup once per instance, retry on the next request if it failed
let ready;
const init = () => {
  if (!ready) {
    ready = connectDB().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
};

// Vercel calls this for every request
const handler = async (req, res) => {
  try {
    await init();
    await connectRedis(); // returns immediately if already connected, rebuilds a dead client
  } catch (err) {
    console.error("Startup failed:", err.message);
    return res.status(503).json({ message: "Database unavailable" });
  }
  // No timers on serverless: copy new records to MongoDB once the response is sent.
  if (mongoConfigured()) res.on("finish", () => { drainProjector(); });
  return app(req, res);
};

export default handler;

// Local development only (Vercel sets VERCEL=1 automatically)
if (!process.env.VERCEL) {
  init()
    .then(async () => {
      const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
      // Live updates need a long-running process, so they are attached here and not on Vercel.
      if (process.env.REALTIME !== "off") {
        const origins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
        await attachRealtime(server, { origins }).catch((err) => console.error("Realtime updates disabled:", err.message));
      }
      // Marks polling-station devices that stopped sending heartbeats as offline (STATION_OFFLINE).
      // Copies committed Redis records into the MongoDB read models every few seconds.
      if (mongoConfigured()) setInterval(() => { drainProjector(); }, 3000).unref();
      setInterval(() => sweepOfflineDevices().catch((err) => console.error("Device sweep failed:", err.message)), 60 * 1000).unref();
    })
    .catch((err) => {
      console.error("STARTUP FAILED:", err.message);
      process.exit(1);
    });
}