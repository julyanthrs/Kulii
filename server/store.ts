/**
 * Authoritative state: kept in memory for fast permission checks and diffing,
 * written through to Supabase Postgres (one row per entity) on every change.
 *
 * Writes are serialised — each command reads the latest state, and its diff is
 * committed in a single round-trip (kulii.apply_patch) before the state is swapped.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { produce } from "immer";
import { env } from "./env";
import { diff, emptyData, isEmptyPatch, keyOf, RECORD_COLLS, withCtx, type Coll, type Data, type Patch } from "../src/shared/model";

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  // Supabase requires TLS. Provide DATABASE_CA_CERT (path to Supabase's CA, from Project Settings → Database) to verify it.
  ssl: env.databaseCa ? { ca: readFileSync(env.databaseCa, "utf8") } : { rejectUnauthorized: false },
  max: 4,
});
pool.on("error", (e) => console.error("[pg]", e.message));

export const TABLE: Record<Coll, string> = {
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

/* ---------------- schema (idempotent) ---------------- */

const entityTables = Object.values(TABLE).filter((t) => t !== "users");

const MIGRATION = `
create schema if not exists kulii;
revoke all on schema kulii from public;
do $$ begin
  -- Keep the app's tables out of Supabase's auto-generated public API.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema kulii from anon, authenticated';
  end if;
end $$;

create table if not exists kulii.users (
  id text primary key,
  email text not null unique,
  username text not null unique,
  data jsonb not null
);
alter table kulii.users enable row level security;

${entityTables
  .map(
    (t) => `create table if not exists kulii.${t} (id text primary key, scope text not null, data jsonb not null);
create index if not exists ${t}_scope_idx on kulii.${t} (scope);
alter table kulii.${t} enable row level security;`,
  )
  .join("\n")}

create table if not exists kulii.used_seeds (seed text primary key, at timestamptz not null default now());
alter table kulii.used_seeds enable row level security;
delete from kulii.used_seeds where at < now() - interval '30 days';

create or replace function kulii.apply_patch(p jsonb, claim_seed text) returns void
language plpgsql as $fn$
declare
  t text;
  rows jsonb;
begin
  if claim_seed is not null then
    insert into kulii.used_seeds (seed) values (claim_seed); -- unique violation = replayed request
  end if;
  for t, rows in select key, value from jsonb_each(coalesce(p -> 'upsert', '{}'::jsonb)) loop
    if t = 'users' then
      insert into kulii.users (id, email, username, data)
      select x ->> 'id', x ->> 'email', x ->> 'username', x -> 'data' from jsonb_array_elements(rows) x
      on conflict (id) do update set email = excluded.email, username = excluded.username, data = excluded.data;
    else
      execute format(
        'insert into kulii.%I (id, scope, data) select x ->> ''id'', x ->> ''scope'', x -> ''data'' from jsonb_array_elements($1) x
         on conflict (id) do update set scope = excluded.scope, data = excluded.data', t) using rows;
    end if;
  end loop;
  for t, rows in select key, value from jsonb_each(coalesce(p -> 'remove', '{}'::jsonb)) loop
    execute format('delete from kulii.%I where id in (select jsonb_array_elements_text($1))', t) using rows;
  end loop;
end $fn$;
revoke all on function kulii.apply_patch(jsonb, text) from public;
`;

/* ---------------- persistence ---------------- */

function toRows(patch: Patch) {
  const upsert: Record<string, unknown[]> = {};
  const remove: Record<string, string[]> = {};
  for (const [c, list] of Object.entries(patch.upsert) as [Coll, any[]][]) {
    upsert[TABLE[c]] = list.map((e) =>
      c === "users"
        ? { id: e.id, email: String(e.email).toLowerCase(), username: String(e.username).toLowerCase(), data: e }
        : { id: keyOf(c, e), scope: scopeOf(c, e), data: c === "vaultCategories" ? e.names : e },
    );
  }
  for (const [c, keys] of Object.entries(patch.remove) as [Coll, string[]][]) remove[TABLE[c]] = keys;
  return { upsert, remove };
}

async function persist(patch: Patch, claimSeed: string | null) {
  await pool.query("select kulii.apply_patch($1::jsonb, $2)", [JSON.stringify(toRows(patch)), claimSeed]);
}

async function load(): Promise<Data> {
  const d = emptyData();
  for (const [c, t] of Object.entries(TABLE) as [Coll, string][]) {
    const { rows } = await pool.query<{ id: string; data: any }>(`select id, data from kulii.${t}`);
    for (const r of rows) {
      if (c === "vaultCategories") d.vaultCategories[r.id] = r.data;
      else if ((RECORD_COLLS as readonly string[]).includes(c)) (d as any)[c][r.id] = r.data;
      else (d as any)[c].push(r.data);
    }
  }
  const byAtDesc = (a: { at: string }, b: { at: string }) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0);
  d.activity.sort(byAtDesc);
  d.notifications.sort(byAtDesc);
  d.announcements.sort(byAtDesc);
  d.inbox.sort(byAtDesc);
  return d;
}

/* ---------------- state ---------------- */

let state: Data = emptyData();
export const getState = () => state;

export async function initStore() {
  await pool.query(MIGRATION);
  state = await load();
}

/** Replaces everything with `data` (used by seeding). */
export async function importData(data: Data) {
  return exclusive(async () => {
    const patch = diff(state, data);
    if (!isEmptyPatch(patch)) await persist(patch, null);
    state = data;
  });
}

export async function truncateAll() {
  await pool.query(`truncate ${[...Object.values(TABLE), "used_seeds"].map((t) => `kulii.${t}`).join(", ")}`);
  state = emptyData();
}

type Listener = (prev: Data, next: Data, patch: Patch) => void;
const listeners = new Set<Listener>();
export const onChange = (l: Listener) => listeners.add(l);

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export class Denied extends Error {}
export class Replay extends Error {}

const recentSeeds = new Set<string>();

/**
 * Runs a command against the latest state: authorise → apply → commit → swap → notify.
 * `guard` runs inside the lock so permission checks never see stale state.
 */
export function mutate<T>(
  o: { actor: string; seed: string; now: number; claimSeed?: boolean; guard?: (s: Data) => string | null },
  fn: (draft: Data) => T,
) {
  return exclusive(async () => {
    if (o.claimSeed && recentSeeds.has(o.seed)) throw new Replay("Duplicate request");
    const prev = state;
    const denied = o.guard?.(prev);
    if (denied) throw new Denied(denied);
    let result!: T;
    const next = produce(prev, (draft) => {
      result = withCtx({ actor: o.actor, seed: o.seed, now: o.now }, () => fn(draft as Data));
    });
    const patch = diff(prev, next);
    const changed = !isEmptyPatch(patch);
    if (changed || o.claimSeed) {
      try {
        await persist(patch, o.claimSeed ? o.seed : null);
      } catch (e) {
        if ((e as { code?: string }).code === "23505" && String((e as Error).message).includes("used_seeds")) throw new Replay("Duplicate request");
        throw e;
      }
    }
    if (o.claimSeed) {
      recentSeeds.add(o.seed);
      if (recentSeeds.size > 20_000) recentSeeds.clear();
    }
    if (changed) {
      state = next;
      for (const l of listeners) l(prev, next, patch);
    }
    return { result, prev, next, patch };
  });
}
