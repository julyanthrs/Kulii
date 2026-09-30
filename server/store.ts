/**
 * Authoritative state: kept in memory for fast permission checks and diffing,
 * written through to SQLite (one row per entity) inside a transaction on every change.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { produce } from "immer";
import { buildSeed } from "../src/data/seed";
import {
  diff,
  emptyData,
  isEmptyPatch,
  keyOf,
  RECORD_COLLS,
  withCtx,
  type Coll,
  type Data,
  type Patch,
} from "../src/shared/model";

export const DB_PATH = resolve(process.env.KULII_DB ?? "server/data/kulii.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const sql = new DatabaseSync(DB_PATH);
sql.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

const TABLE: Record<Coll, string> = {
  users: "users",
  teams: "teams",
  memberships: "memberships",
  projects: "projects",
  tasks: "tasks",
  activity: "activity",
  vault: "vault_items",
  vaultCategories: "vault_categories",
  notifications: "notifications",
  announcements: "announcements",
  inbox: "inbox_items",
  invites: "invites",
};

const scopeOf = (c: Coll, e: any): string => {
  switch (c) {
    case "users":
    case "teams": return e.id;
    case "memberships":
    case "invites": return e.teamId;
    case "notifications":
    case "inbox": return e.userId;
    case "vaultCategories": return e.ws;
    default: return e.workspaceId;
  }
};

sql.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS credentials (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS used_seeds (seed TEXT PRIMARY KEY, at INTEGER NOT NULL);
`);
for (const [c, t] of Object.entries(TABLE)) {
  if (c === "users") continue;
  sql.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, scope TEXT NOT NULL, data TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ${t}_scope ON ${t}(scope);`);
}

const upsertStmt = Object.fromEntries(
  Object.entries(TABLE).map(([c, t]) => [
    c,
    c === "users"
      ? sql.prepare(`INSERT INTO users (id, email, username, data) VALUES (?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET email = excluded.email, username = excluded.username, data = excluded.data`)
      : sql.prepare(`INSERT INTO ${t} (id, scope, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET scope = excluded.scope, data = excluded.data`),
  ]),
) as Record<Coll, ReturnType<typeof sql.prepare>>;
const deleteStmt = Object.fromEntries(Object.entries(TABLE).map(([c, t]) => [c, sql.prepare(`DELETE FROM ${t} WHERE id = ?`)])) as Record<
  Coll,
  ReturnType<typeof sql.prepare>
>;

function persist(patch: Patch) {
  sql.exec("BEGIN");
  try {
    for (const [c, list] of Object.entries(patch.upsert) as [Coll, any[]][]) {
      for (const e of list) {
        if (c === "users") upsertStmt.users.run(e.id, e.email.toLowerCase(), e.username.toLowerCase(), JSON.stringify(e));
        else upsertStmt[c].run(keyOf(c, e), scopeOf(c, e), JSON.stringify(c === "vaultCategories" ? e.names : e));
      }
    }
    for (const [c, keys] of Object.entries(patch.remove) as [Coll, string[]][]) for (const k of keys) deleteStmt[c].run(k);
    sql.exec("COMMIT");
  } catch (e) {
    sql.exec("ROLLBACK");
    throw e;
  }
}

function load(): Data {
  const d = emptyData();
  for (const [c, t] of Object.entries(TABLE) as [Coll, string][]) {
    const rows = sql.prepare(`SELECT id, data FROM ${t}`).all() as { id: string; data: string }[];
    for (const r of rows) {
      const v = JSON.parse(r.data);
      if (c === "vaultCategories") d.vaultCategories[r.id] = v;
      else if ((RECORD_COLLS as readonly string[]).includes(c)) (d as any)[c][r.id] = v;
      else (d as any)[c].push(v);
    }
  }
  const byAtDesc = (a: { at: string }, b: { at: string }) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0);
  d.activity.sort(byAtDesc);
  d.notifications.sort(byAtDesc);
  d.announcements.sort(byAtDesc);
  d.inbox.sort(byAtDesc);
  return d;
}

let state: Data = load();
export const isFresh = Object.keys(state.users).length === 0;

/** First boot: write the sample workspace into the database. */
export function seedIfEmpty(onUser: (id: string) => void) {
  if (!isFresh) return;
  const seed = buildSeed() as Data;
  persist(diff(emptyData(), seed));
  state = load();
  for (const id of Object.keys(state.users)) onUser(id);
}

export const getState = () => state;

type Listener = (prev: Data, next: Data, patch: Patch) => void;
const listeners = new Set<Listener>();
export const onChange = (l: Listener) => listeners.add(l);

/** Runs a mutation, persists the diff, swaps state and notifies subscribers. */
export function mutate<T>(actor: string, seed: string, now: number, fn: (draft: Data) => T) {
  let result!: T;
  const prev = state;
  const next = produce(prev, (draft) => {
    result = withCtx({ actor, seed, now }, () => fn(draft as Data));
  });
  const patch = diff(prev, next);
  if (!isEmptyPatch(patch)) {
    persist(patch);
    state = next;
    for (const l of listeners) l(prev, next, patch);
  }
  return { result, prev, next, patch };
}

/* ---------------- replay protection for client-provided seeds ---------------- */

const seedExists = sql.prepare("SELECT 1 FROM used_seeds WHERE seed = ?");
const seedInsert = sql.prepare("INSERT INTO used_seeds (seed, at) VALUES (?, ?)");
export function claimSeed(seed: string) {
  if (seedExists.get(seed)) return false;
  seedInsert.run(seed, Date.now());
  return true;
}
