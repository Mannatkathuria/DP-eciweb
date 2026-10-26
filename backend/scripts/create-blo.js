/**
 * Creates a Booth Level Officer account and prints its BLO ID and one-time temporary password.
 * The BLO must set their own password the first time they sign in.
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
    const { bloId, temporaryPassword, maskedMobile } = await createBlo(args);
    console.log("");
    console.log("BLO account created.");
    console.log(`  BLO ID:             ${bloId}`);
    console.log(`  Temporary password: ${temporaryPassword}`);
    console.log(`  OTP mobile:         ${maskedMobile}`);
    console.log("");
    console.log("Give these to the BLO. The temporary password works once: they must set their own");
    console.log("password after their first sign-in. It is not stored and cannot be shown again.");
    await redis().quit();
} catch (error) {
    console.error(`Could not create the BLO account: ${error.message}`);
    try { await redis().quit(); } catch { /* not connected */ }
    process.exit(1);
}
