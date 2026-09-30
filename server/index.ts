import http from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { DEMO_PASSWORD } from "../src/data/seed";
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
import { claimSeed, DB_PATH, getState, mutate, onChange, seedIfEmpty } from "./store";
import { checkLogin, clearFailures, createSession, endSession, recordFailure, sessionUser, setPassword, throttled } from "./auth";

seedIfEmpty((id) => setPassword(id, DEMO_PASSWORD));

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(express.json({ limit: "1mb" }));

type AuthedRequest = Request & { userId: string };
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const uid = sessionUser(req.headers.cookie);
  if (!uid || !getState().users[uid]) return res.status(401).json({ ok: false, error: "Not signed in" });
  (req as AuthedRequest).userId = uid;
  next();
};

const bootstrap = (userId: string) => ({ ok: true, me: userId, data: snapshotFor(getState(), userId) });

/* ---------------- auth ---------------- */

app.post("/api/auth/login", (req, res) => {
  const key = req.ip ?? "?";
  if (throttled(key)) return res.status(429).json({ ok: false, error: "Too many attempts — try again in a few minutes" });
  const { id, password } = req.body ?? {};
  if (typeof id !== "string" || typeof password !== "string") return res.status(400).json({ ok: false, error: "Missing credentials" });
  const uid = checkLogin(id, password);
  if (!uid) {
    recordFailure(key);
    return res.status(401).json({ ok: false, error: "Incorrect email/username or password" });
  }
  clearFailures(key);
  createSession(res, req, uid);
  res.json(bootstrap(uid));
});

app.post("/api/auth/register", (req, res) => {
  const { name, email, username, password } = req.body ?? {};
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  const u = typeof username === "string" ? username.trim().replace(/^@/, "").toLowerCase() : "";
  if (typeof name !== "string" || !name.trim() || name.length > 80) return res.status(400).json({ ok: false, error: "Enter your name" });
  if (!/^\S+@\S+\.\S+$/.test(e) || e.length > 200) return res.status(400).json({ ok: false, error: "Enter a valid email" });
  if (!/^[a-z0-9._-]{2,40}$/.test(u)) return res.status(400).json({ ok: false, error: "Usernames use 2–40 letters, numbers, dots or dashes" });
  if (typeof password !== "string" || password.length < 8) return res.status(400).json({ ok: false, error: "Password needs at least 8 characters" });
  const users = Object.values(getState().users);
  if (users.some((x) => x.email === e)) return res.status(409).json({ ok: false, error: "That email is already registered" });
  if (users.some((x) => x.username === u)) return res.status(409).json({ ok: false, error: "That username is taken" });
  const { result: uid } = mutate("system", makeSeed(), Date.now(), (d) => registerUser(d, { name, email: e, username: u }));
  setPassword(uid, password);
  createSession(res, req, uid);
  res.json(bootstrap(uid));
});

app.post("/api/auth/logout", (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json(bootstrap((req as AuthedRequest).userId));
});

/* ---------------- commands ---------------- */

app.post("/api/cmd", requireAuth, (req, res) => {
  const uid = (req as AuthedRequest).userId;
  const { name, args, seed, now } = req.body ?? {};
  if (typeof name !== "string" || !Object.hasOwn(ACTIONS, name) || !Array.isArray(args))
    return res.status(400).json({ ok: false, error: "Unknown command" });
  if (typeof seed !== "string" || !SEED_RE.test(seed) || !claimSeed(seed))
    return res.status(409).json({ ok: false, error: "Duplicate request" });

  const denied = authorize(getState(), uid, name, args);
  if (denied) return res.status(403).json({ ok: false, error: denied });

  const at = typeof now === "number" && Math.abs(now - Date.now()) < 5 * 60_000 ? now : Date.now();
  try {
    const fn = ACTIONS[name as ActionName] as (d: unknown, ...a: unknown[]) => unknown;
    const r = mutate(uid, seed, at, (d) => fn(d, ...args));
    const resync = membershipAffected(r.patch, r.prev, r.next).has(uid);
    res.json({
      ok: true,
      result: r.result,
      ...(resync ? { snapshot: snapshotFor(r.next, uid) } : { patch: patchFor(r.patch, r.prev, r.next, uid) }),
    });
  } catch (e) {
    if (e instanceof CmdError) return res.status(400).json({ ok: false, error: e.message });
    console.error(`[cmd ${name}]`, e);
    res.status(500).json({ ok: false, error: "Something went wrong" });
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
const wss = new WebSocketServer({ server, path: "/ws" });
const sockets = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws, req) => {
  const uid = sessionUser(req.headers.cookie);
  if (!uid || !getState().users[uid]) return ws.close(4001, "unauthorized");
  const set = sockets.get(uid) ?? new Set();
  set.add(ws);
  sockets.set(uid, set);
  (ws as WebSocket & { alive?: boolean }).alive = true;
  ws.on("pong", () => ((ws as WebSocket & { alive?: boolean }).alive = true));
  ws.on("close", () => {
    set.delete(ws);
    if (!set.size) sockets.delete(uid);
  });
  ws.send(JSON.stringify({ type: "hello" }));
});

// Drop dead connections.
setInterval(() => {
  for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
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
    if (!next.users[uid]) {
      for (const ws of conns) ws.close(4001, "account removed");
      continue;
    }
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

const runTick = () => {
  try {
    mutate("system", makeSeed(), Date.now(), (d) => tick(d));
  } catch (e) {
    console.error("[tick]", e);
  }
};
setTimeout(runTick, 2_000);
setInterval(runTick, 30_000);

const PORT = Number(process.env.API_PORT) || 8787;
server.listen(PORT, () => {
  console.log(`Kulii API listening on http://localhost:${PORT}  (db: ${DB_PATH})`);
});
