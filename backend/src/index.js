import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { connectRedis } from "./config/redis.js";

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
  return app(req, res);
};

export default handler;

// Local development only (Vercel sets VERCEL=1 automatically)
if (!process.env.VERCEL) {
  init()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error("STARTUP FAILED:", err.message);
      process.exit(1);
    });
}