/**
 * npm run db:remove-demo — deletes the 8 sample accounts from Supabase Auth and the
 * sample workspace data. Accounts created by real people are not touched. Stop the server first.
 */
import "./env";
import { DEMO_ACCOUNTS } from "../src/data/seed";
import { admin } from "./auth";
import { initStore, pool, truncateAll, getState } from "./store";

await initStore();
const demoEmails = new Set(DEMO_ACCOUNTS.map((u) => u.email.toLowerCase()));
const realProfiles = Object.values(getState().users).filter((u) => !demoEmails.has(u.email.toLowerCase()));
if (realProfiles.length) {
  console.error(`Stopped: ${realProfiles.length} real account(s) already have data in the app. Nothing was deleted.`);
  process.exit(1);
}

let removed = 0;
for (let page = 1; page <= 50; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const u of data.users) {
    if (u.email && demoEmails.has(u.email.toLowerCase())) {
      const { error: e } = await admin.auth.admin.deleteUser(u.id);
      if (e) throw e;
      removed++;
    }
  }
  if (data.users.length < 200) break;
}
await truncateAll();
console.log(`Removed ${removed} demo accounts and all sample data. Real accounts were kept.`);
await pool.end();
