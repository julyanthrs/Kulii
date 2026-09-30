import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when the build had no Supabase settings (e.g. env vars not added on the hosting provider). */
export const supabaseConfigured = Boolean(url && key);

/**
 * Browser client — handles sign-in, session storage and token refresh. Data goes through our API.
 * Built with placeholders when unconfigured so the app can render a helpful error instead of crashing.
 */
export const supabase = createClient(url || "https://not-configured.supabase.co", key || "not-configured", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "kulii-auth" },
});

export async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Friendlier wording for Supabase Auth errors. */
export function authMessage(e: { message?: string; code?: string } | null | undefined) {
  const m = e?.message ?? "Something went wrong";
  if (/invalid login credentials/i.test(m)) return "Incorrect email or password";
  if (/email not confirmed/i.test(m)) return "Confirm your email first — check your inbox for the link";
  if (/already registered/i.test(m)) return "That email is already registered — try signing in";
  if (/rate limit|too many/i.test(m)) return "Too many attempts — please wait a bit and try again";
  if (/password should be at least/i.test(m)) return "Password is too short";
  return m;
}
