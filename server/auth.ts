/**
 * Accounts live in Supabase Auth. The browser signs in with supabase-js and sends its
 * access token; the server verifies it and maps the Supabase user id to a profile.
 */
import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { env } from "./env";

export const admin = createClient(env.supabaseUrl, env.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export interface Claims {
  sub: string;
  email?: string;
  role?: string;
  exp?: number;
  user_metadata?: Record<string, unknown>;
}

const cache = new Map<string, Claims>();

/** Verifies a Supabase access token (locally via JWKS when the project uses signing keys). */
export async function verifyToken(token: string | null | undefined): Promise<Claims | null> {
  if (!token || token.length > 4096) return null;
  const hit = cache.get(token);
  if (hit) {
    if ((hit.exp ?? 0) * 1000 > Date.now()) return hit;
    cache.delete(token);
  }
  try {
    const { data, error } = await admin.auth.getClaims(token);
    const c = data?.claims as Claims | undefined;
    if (error || !c?.sub || c.role !== "authenticated") return null;
    if (cache.size > 5000) cache.clear();
    cache.set(token, c);
    return c;
  } catch {
    return null;
  }
}

export const bearer = (req: Request) => req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

/** Finds or creates a confirmed auth user (used for the sample accounts). */
export async function ensureAuthUser(email: string, password: string, meta: Record<string, unknown>): Promise<string> {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  if (created.data.user) return created.data.user.id;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) {
      await admin.auth.admin.updateUserById(u.id, { password, email_confirm: true, user_metadata: meta });
      return u.id;
    }
    if (data.users.length < 200) break;
  }
  throw created.error ?? new Error(`Could not create ${email}`);
}
