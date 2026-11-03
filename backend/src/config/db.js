import { connectRedis } from "./redis.js";
import { connectMongo, mongoConfigured } from "./mongo.js";

// Redis is required (system of record). MongoDB is optional: if it is configured but down, the
// server still starts, and features that use it fall back to Redis until it is reachable.
const connectDB = async () => {
    const client = await connectRedis();
    if (mongoConfigured()) await connectMongo().catch((err) => console.error("MongoDB unavailable, using Redis fallbacks:", err.message));
    return client;
};
export default connectDB;
