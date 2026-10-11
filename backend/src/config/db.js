import { connectRedis } from "./redis.js";
const connectDB = async () => connectRedis();
export default connectDB;
