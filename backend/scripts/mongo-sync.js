import "dotenv/config";
import { connectRedis } from "../src/config/redis.js";
import { closeMongo } from "../src/config/mongo.js";
import { rebuildReadModels } from "../src/services/projector.service.js";

// Rebuilds every MongoDB read model from Redis (the system of record).
// Usage: MONGODB_URI=mongodb://127.0.0.1:27017/eciweb npm run mongo:sync
const client = await connectRedis();
const result = await rebuildReadModels();
console.log("MongoDB read models rebuilt:", result);
await closeMongo();
await client.quit();
