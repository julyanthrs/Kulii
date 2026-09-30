/**
 * Sample workspace: creates the demo accounts in Supabase Auth (confirmed, password DEMO_PASSWORD)
 * and writes the sample teams/projects/tasks with their real Supabase user ids.
 */
import { buildSeed, DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/data/seed";
import type { Data } from "../src/shared/model";
import { ensureAuthUser } from "./auth";
import { importData } from "./store";

export async function seedDemo() {
  const idMap: Record<string, string> = {};
  for (const u of DEMO_ACCOUNTS) {
    idMap[u.id] = await ensureAuthUser(u.email, DEMO_PASSWORD, { name: u.name, username: u.username });
  }
  // Seed data references users as "u1".."u8" and personal workspaces as "p:u1"… — swap in the real ids.
  const json = JSON.stringify(buildSeed()).replace(/"(p:)?(u[1-8])"/g, (_m, p: string | undefined, u: string) => `"${p ?? ""}${idMap[u]}"`);
  const data = JSON.parse(json) as Data;
  for (const u of Object.values(data.users)) u.createdAt = new Date().toISOString();
  await importData(data);
  return Object.keys(idMap).length;
}
