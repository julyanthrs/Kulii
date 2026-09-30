import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { sql } from "./store";

export const COOKIE = "kulii_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyHash(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

const setCred = sql.prepare("INSERT INTO credentials (user_id, password_hash) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash");
const getCred = sql.prepare("SELECT password_hash FROM credentials WHERE user_id = ?");
const findUser = sql.prepare("SELECT id FROM users WHERE email = ? OR username = ?");

export const setPassword = (userId: string, password: string) => setCred.run(userId, hashPassword(password));

export function checkLogin(identifier: string, password: string): string | null {
  const q = identifier.trim().replace(/^@/, "").toLowerCase();
  const row = findUser.get(q, q) as { id: string } | undefined;
  // Hash anyway so response time doesn't reveal whether the account exists.
  const cred = row ? (getCred.get(row.id) as { password_hash: string } | undefined) : undefined;
  const ok = verifyHash(password, cred?.password_hash ?? "00:00");
  return row && cred && ok ? row.id : null;
}

/* ---------------- sessions ---------------- */

const insertSession = sql.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)");
const readSession = sql.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?");
const dropSession = sql.prepare("DELETE FROM sessions WHERE token = ?");
sql.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());

export function createSession(res: Response, req: Request, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  insertSession.run(token, userId, now, now + SESSION_DAYS * 86400_000);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    path: "/",
    maxAge: SESSION_DAYS * 86400_000,
  });
}

export function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionUser(cookieHeader: string | undefined): string | null {
  const token = parseCookies(cookieHeader)[COOKIE];
  if (!token) return null;
  const row = readSession.get(token) as { user_id: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return row.user_id;
}

export function endSession(req: Request, res: Response) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) dropSession.run(token);
  res.clearCookie(COOKIE, { path: "/" });
}

/* ---------------- naive login throttle ---------------- */

const attempts = new Map<string, { n: number; until: number }>();
export function throttled(key: string) {
  const a = attempts.get(key);
  return !!a && a.n >= 8 && a.until > Date.now();
}
export function recordFailure(key: string) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { n: 1, until: Date.now() + 10 * 60_000 });
  else a.n++;
}
export const clearFailures = (key: string) => attempts.delete(key);
