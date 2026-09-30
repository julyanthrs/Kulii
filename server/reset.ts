/**
 * npm run db:reset — wipes all app data (teams, tasks, profiles…). Stop the server first.
 * Sign-in accounts in Supabase Auth are kept; their profiles are recreated on next sign-in.
 * With SEED_DEMO=true the sample workspace is restored afterwards.
 */
import { env } from "./env";
import { initStore, pool, truncateAll } from "./store";
import { seedDemo } from "./seed";

await initStore();
await truncateAll();
console.log("All app data removed.");
if (env.seedDemo) console.log(`Sample workspace restored with ${await seedDemo()} demo accounts.`);
await pool.end();
