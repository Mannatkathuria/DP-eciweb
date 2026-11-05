/**
 * Creates a Booth Level Officer account and prints its BLO ID. The BLO signs in on the normal
 * officer sign-in page with that ID and a one-time code (there is no password).
 *
 * Usage (from the backend folder):
 *   npm run create-blo -- --name "Ravi Kumar" --mobile 9876543210 --state UP
 */
import "dotenv/config";
import { connectRedis, redis } from "../src/config/redis.js";
import { createBlo } from "../src/services/blo.service.js";

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1];
}

if (!args.name || !args.mobile || !args.state) {
    console.error('Usage: npm run create-blo -- --name "Ravi Kumar" --mobile 9876543210 --state UP');
    process.exit(1);
}

try {
    await connectRedis();
    const { bloId, maskedMobile } = await createBlo(args);
    console.log("");
    console.log("BLO account created.");
    console.log(`  BLO ID:     ${bloId}`);
    console.log(`  OTP mobile: ${maskedMobile}`);
    console.log("");
    console.log("Sign in at /signin/blo with the BLO ID and the one-time code. Assign a polling station before field work.");
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await redis().quit().catch(() => {});
}
