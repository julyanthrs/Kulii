# Kulii — collaborative task tracker

A spatial, glass-material task tracker and team workspace.

- **Client:** Vite, React and TypeScript.
- **Accounts and database:** Supabase (Auth and Postgres).
- **Server:** Node and Express, which enforces the rules and pushes live updates over WebSockets.

## Setup

1. Fill in `.env`. See `.env.example`; every value comes from your Supabase project.
2. In the Supabase dashboard, go to **Authentication → URL Configuration** and set:
   - **Site URL:** `http://localhost:5180` (your deployed URL later)
   - **Redirect URLs:** add `http://localhost:5180/**`
   Confirmation and password-reset emails link back to these addresses.
3. Install and run:

```bash
npm install
npm run dev        # API on :8787 + web app on :5180 (proxied)
```

On first start, the server creates its tables in a private `kulii` schema.

| Script | What it does |
|---|---|
| `npm run dev` | Runs the API server (auto-reloads) and the Vite dev server together |
| `npm run build` | Type-checks client and server, then builds the web app to `dist/` |
| `npm start` | Production: one server on `:8787` serves the app, the API and the WebSocket |
| `npm run db:reset` | Wipes all app data (sign-in accounts are kept). Stop the server first |
| `npm run db:remove-demo` | Deletes the sample accounts and their data. Stop the server first |

Optional variables:
- `API_PORT` sets the server port.
- `SEED_DEMO=true` creates the sample workspace on an empty database.
- `DATABASE_CA_CERT` points to Supabase's CA certificate, downloaded from **Project Settings → Database**, so the database's TLS certificate is verified.

## Accounts

- **Sign-up, login, email confirmation, password reset and password change** all use Supabase Auth. Passwords are never seen or stored by the app server.
- **The server verifies the Supabase access token** on every request and WebSocket connection. It creates the user's profile on their first sign-in. Pending team invites for that email are turned into memberships automatically.
- **No sample accounts by default.** Everyone signs up with their own email. To bring back the demo workspace (8 accounts such as `julianne@example.com`, password `demo1234`), start the server once with `SEED_DEMO=true` on an empty database. `npm run db:remove-demo` deletes them again.

> **Email delivery:** Supabase's built-in email service only sends to members of your Supabase organisation and is heavily rate-limited. To send confirmation and reset emails to real users, set up custom SMTP (for example, Resend, which has a free tier) under **Authentication → Emails → SMTP Settings**. While testing, you can instead turn off **Confirm email** under **Authentication → Sign In / Providers → Email**.

## Security model

- **The browser uses only the publishable key, and only for sign-in.** All data goes through the API server.
- **The data isn't reachable through Supabase's public API.** The app's tables are in a `kulii` schema that Supabase's auto-generated API doesn't expose, and row-level security is on for every table. Only the server (connecting as the database owner) can read or write them.
- **Every command is checked on the server.** The server applies the team's role matrix (Owner, Admin, Member, Viewer) and cleans the input before running it.
- **Replayed requests are rejected.** Each change carries a single-use random seed, and a request that reuses one is refused.
- **Each user receives only the data from their own teams and personal workspace.**

## How sync works

- **One set of rules on both sides.** All business rules live in [`src/shared/model.ts`](src/shared/model.ts) and run on both the client and the server.
- **Optimistic updates.** The client applies a command instantly and sends it to `POST /api/cmd`. The server replays the same command against the latest state.
- **Server writes.** Writes happen one at a time. Each command's changes are committed to Postgres in a single round-trip (`kulii.apply_patch`).
- **Live updates.** Connected users receive only the changes they're allowed to see.
- **Membership changes.** Joining, leaving and role changes send the affected users a fresh snapshot of their data.
- **Background jobs.** The server sends reminder and overdue notifications every 30 seconds.

```
server/index.ts   routes, profile bootstrap, WebSocket fan-out, background jobs, static hosting
server/store.ts   Postgres schema + write-through store (serialised, single round-trip commits)
server/auth.ts    Supabase token verification, admin helpers
server/seed.ts    sample accounts + workspace
src/shared/       commands, authorization, visibility, diff/patch (client + server)
src/store/db.ts   client store: Supabase sign-in, optimistic commands, realtime socket
```

Attachments still record file metadata only; files aren't uploaded yet. Supabase Storage is the natural next step.
