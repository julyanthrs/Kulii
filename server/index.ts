import { env } from "./env";
import http from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { WebSocketServer, type WebSocket } from "ws";
import {
  ACTIONS,
  authorize,
  CmdError,
  isEmptyPatch,
  makeSeed,
  membershipAffected,
  patchFor,
  registerUser,
  SEED_RE,
  snapshotFor,
  tick,
  type ActionName,
} from "../src/shared/model";
import { Denied, getState, initStore, mutate, onChange, Replay } from "./store";
import { admin, bearer, verifyToken, type Claims } from "./auth";
import { seedDemo } from "./seed";

await initStore();
if (env.seedDemo && Object.keys(getState().users).length === 0) {
  console.log("SEED_DEMO=true and the database is empty — creating the sample workspace…");
  const n = await seedDemo();
  console.log(`Sample workspace ready (${n} demo accounts).`);
}

/* ---------------- profiles ---------------- */

class AccountGone extends Error {}

const cleanUsername =(s: string) => s.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 30) || "user";

/** First sign-in creates the app profile from the Supabase account; later sign-ins keep the email in sync. */
async function ensureProfile(c: Claims) {
  const email = (c.email ?? "").toLowerCase();
  const existing = getState().users[c.sub];
  if (existing) {
    if (email && existing.email !== email)
      await mutate({ actor: c.sub, seed: makeSeed(), now: Date.now() }, (d) => {
        d.users[c.sub].email = email;
      });
    return;
  }
  // A still-valid token can outlive a deleted account — confirm it exists before creating a profile.
  const { data: authUser } = await admin.auth.admin.getUserById(c.sub);
  if (!authUser?.user) throw new AccountGone();
  const meta = c.user_metadata ?? {};
  const base = cleanUsername(String(meta.username ?? email.split("@")[0] ?? "user"));
  const name = String(meta.name ?? meta.full_name ?? email.split("@")[0] ?? "New user").trim().slice(0, 80) || "New user";
  await mutate({ actor: "system", seed: makeSeed(), now: Date.now() }, (d) => {
    if (d.users[c.sub]) return;
    let username = base;
    for (let i = 2; Object.values(d.users).some((u) => u.username === username); i++) username = `${base}${i}`;
    registerUser(d, { id: c.sub, name, email, username });
  });
}

/* ---------------- http ---------------- */

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "1mb" }));

type AuthedRequest = Request & { userId: string };
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  void verifyToken(bearer(req)).then(async (c) => {
    if (!c) return res.status(401).json({ ok: false, error: "Not signed in" });
    try {
      await ensureProfile(c);
    } catch (e) {
      if (e instanceof AccountGone) return res.status(401).json({ ok: false, error: "This account no longer exists" });
      console.error("[profile]", e);
      return res.status(500).json({ ok: false, error: "Couldn't load your profile" });
    }
    (req as AuthedRequest).userId = c.sub;
    next();
  });
};

app.get("/api/me", requireAuth, (req, res) => {
  const uid = (req as AuthedRequest).userId;
  res.json({ ok: true, me: uid, data: snapshotFor(getState(), uid) });
});

app.get("/api/username-available", (req, res) => {
  const u = cleanUsername(String(req.query.u ?? ""));
  const valid = /^[a-z0-9._-]{2,30}$/.test(String(req.query.u ?? "").toLowerCase());
  res.json({ ok: true, available: valid && !Object.values(getState().users).some((x) => x.username === u) });
});

app.post("/api/cmd", requireAuth, async (req, res) => {
  const uid = (req as AuthedRequest).userId;
  const { name, args, seed, now } = req.body ?? {};
  if (typeof name !== "string" || !Object.hasOwn(ACTIONS, name) || !Array.isArray(args))
    return res.status(400).json({ ok: false, error: "Unknown command" });
  if (typeof seed !== "string" || !SEED_RE.test(seed)) return res.status(400).json({ ok: false, error: "Bad request" });

  const at = typeof now === "number" && Math.abs(now - Date.now()) < 5 * 60_000 ? now : Date.now();
  try {
    const fn = ACTIONS[name as ActionName] as (d: unknown, ...a: unknown[]) => unknown;
    const r = await mutate({ actor: uid, seed, now: at, claimSeed: true, guard: (s) => authorize(s, uid, name, args) }, (d) => fn(d, ...args));
    const resync = membershipAffected(r.patch, r.prev, r.next).has(uid);
    res.json({
      ok: true,
      result: r.result,
      ...(resync ? { snapshot: snapshotFor(r.next, uid) } : { patch: patchFor(r.patch, r.prev, r.next, uid) }),
    });
  } catch (e) {
    if (e instanceof Denied) return res.status(403).json({ ok: false, error: e.message });
    if (e instanceof Replay) return res.status(409).json({ ok: false, error: e.message });
    if (e instanceof CmdError) return res.status(400).json({ ok: false, error: e.message });
    console.error(`[cmd ${name}]`, e);
    res.status(500).json({ ok: false, error: "Something went wrong — please try again" });
  }
});

/* ---------------- static client (production) ---------------- */

const dist = resolve("dist");
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/|ws$).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
}

/* ---------------- realtime ---------------- */

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });
const sockets = new Map<string, Set<WebSocket>>();
type Live = WebSocket & { alive?: boolean };

// Browsers can't set headers on WebSockets, so the first message carries the access token.
wss.on("connection", (ws: Live) => {
  let uid: string | null = null;
  const timer = setTimeout(() => !uid && ws.close(4001, "unauthorized"), 10_000);
  ws.alive = true;
  ws.on("pong", () => (ws.alive = true));
  ws.on("message", async (raw) => {
    if (uid) return;
    let msg: { type?: string; token?: string } | null = null;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      /* fallthrough */
    }
    const c = msg?.type === "auth" ? await verifyToken(msg.token) : null;
    if (!c || !getState().users[c.sub]) return ws.close(4001, "unauthorized");
    clearTimeout(timer);
    uid = c.sub;
    const set = sockets.get(uid) ?? new Set();
    set.add(ws);
    sockets.set(uid, set);
    ws.send(JSON.stringify({ type: "hello" }));
  });
  ws.on("close", () => {
    clearTimeout(timer);
    if (!uid) return;
    const set = sockets.get(uid);
    set?.delete(ws);
    if (set && !set.size) sockets.delete(uid);
  });
});

setInterval(() => {
  for (const ws of wss.clients as Set<Live>) {
    if (ws.alive === false) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 30_000);

onChange((prev, next, patch) => {
  const affected = membershipAffected(patch, prev, next);
  for (const [uid, conns] of sockets) {
    let msg: string | null = null;
    if (affected.has(uid)) msg = JSON.stringify({ type: "snapshot", data: snapshotFor(next, uid) });
    else {
      const p = patchFor(patch, prev, next, uid);
      if (!isEmptyPatch(p)) msg = JSON.stringify({ type: "patch", patch: p });
    }
    if (msg) for (const ws of conns) if (ws.readyState === ws.OPEN) ws.send(msg);
  }
});

/* ---------------- background jobs ---------------- */

const runTick = () =>
  mutate({ actor: "system", seed: makeSeed(), now: Date.now() }, (d) => tick(d)).catch((e) => console.error("[tick]", e.message));
setTimeout(runTick, 3_000);
setInterval(runTick, 30_000);

server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EADDRINUSE")
    console.error(`Port ${env.port} is already in use — another Kulii server is probably running. Stop it (or set API_PORT) and try again.`);
  else console.error("[server]", e);
  process.exit(1);
});

server.listen(env.port, () => {
  console.log(`Kulii API listening on http://localhost:${env.port}  (Supabase: ${new URL(env.supabaseUrl).host})`);
});
