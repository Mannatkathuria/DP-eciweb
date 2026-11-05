/**
 * Renames BLO accounts from BLO-XX-NNNNNN to BLO1000001-style IDs and removes BLO passwords.
 * `npm run seed` runs this too. Usage (from the backend folder): npm run migrate:blo-ids
 */
import "dotenv/config";
import { connectRedis, redis } from "../src/config/redis.js";
import { closeMongo } from "../src/config/mongo.js";
import { migrateBloIds } from "../src/migrations/bloIds.js";

try {
    await connectRedis();
    const result = await migrateBloIds();
    if (!result.renamed && !result.stripped) console.log("Nothing to migrate: every BLO already has a BLO1000001-style ID and no password.");
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await redis().quit().catch(() => {});
    await closeMongo().catch(() => {});
}
