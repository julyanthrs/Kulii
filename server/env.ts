/** Loads .env before anything else reads process.env. Import this first. */
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"] as const;
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing ${missing.join(", ")} — fill them in .env (see .env.example).`);
  process.exit(1);
}

export const env = {
  supabaseUrl: process.env.SUPABASE_URL!,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  /** The Supabase URI keeps a literal [YOUR-PASSWORD]; we substitute the (URL-encoded) password here. */
  databaseUrl: process.env.DATABASE_URL!.replace("[YOUR-PASSWORD]", encodeURIComponent(process.env.DATABASE_PASSWORD ?? "")),
  databaseCa: process.env.DATABASE_CA_CERT,
  // Hosting providers (Render, Railway…) assign PORT. In dev, PORT belongs to Vite, so only use it with --prod.
  port: Number(process.env.API_PORT) || (process.argv.includes("--prod") ? Number(process.env.PORT) : 0) || 8787,
  /** Website addresses allowed to call the API from another origin, e.g. https://kulii.vercel.app (comma-separated). */
  corsOrigins: (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean),
  /** Opt-in: SEED_DEMO=true creates the sample workspace + demo accounts on an empty database. */
  seedDemo: process.env.SEED_DEMO === "true",
};
