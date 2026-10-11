// Run with: npm run check-db
import "dotenv/config";
import { connectRedis, redis } from "./config/redis.js";

try {
    await connectRedis();
    console.log("✅ Ping OK - Redis is reachable:", await redis().ping());
} catch (error) {
    console.error("❌ Could not connect:", error.message);
    process.exitCode = 1;
} finally {
    if (redis) {
        try { await redis().quit(); } catch {}
    }
}
