# Kulii — collaborative task tracker

A spatial, glass-material task tracker and team workspace.

- **Client:** Vite, React and TypeScript, with Zustand + Immer for state.
- **Server:** Node, Express and SQLite (Node's built-in `node:sqlite`), with WebSockets for live sync.

## Run

```bash
npm install
npm run dev        # API on :8787 + web app on :5173 (proxied)
```

| Script | What it does |
|---|---|
| `npm run dev` | Runs the API server (auto-reloads) and the Vite dev server together |
| `npm run build` | Type-checks client + server and builds the web app to `dist/` |
| `npm start` | Production: one server on `:8787` serves the built app, the API and the WebSocket |
| `npm run db:reset` | Deletes the database. It is re-seeded with sample data on the next start (stop the server first) |

Environment variables: `API_PORT` (default `8787`) sets the server port, and `KULII_DB` (default `server/data/kulii.db`) sets the database path.

## Sample data

Sample accounts use the password `demo`. Sign-in buttons for them are on the login page.
Julianne has a different role in each team:

| Team | Julianne's role |
|---|---|
| Trackademic | Owner |
| Design Team | Owner |
| OOP Team | Member |
| Marketing | Viewer |

To see real-time collaboration, sign in as two different people in two browsers (or a normal and a private window).
Team codes: `TRK7Q2`, `OOP4K9`, `DSN8M3`, `MKT2P6`. Invite links have the form `/join/<code>`.

## How it works

- **Auth.** Passwords are hashed with scrypt and sessions use an httpOnly cookie. After repeated failed logins, that address is blocked for a few minutes.
- **One set of rules on both sides.** All business rules live in [`src/shared/model.ts`](src/shared/model.ts). Every change is a named command, such as `createTask`, `approveTask` or `inviteMember`.
- **Optimistic updates.** The client applies a command instantly, then sends it to `POST /api/cmd` with a random seed. The seed makes ids and timestamps deterministic, so the client's version and the server's version match exactly.
- **The server is authoritative.** For each command it:
  1. checks the role matrix for that team;
  2. cleans the input;
  3. applies the command;
  4. writes the changed rows to SQLite in one transaction;
  5. pushes only the changes each connected user is allowed to see, over `/ws`.
- **Recovering from rejections.** If the server rejects a command, the client shows why and re-syncs.
- **Membership changes.** Joining, leaving, removals and role changes send the affected users a fresh snapshot, so their visible data updates immediately.
- **Background jobs.** Reminder and overdue notifications are produced on the server every 30 seconds, even when nobody has the app open.
- **Invites.** Inviting an email that has no account yet stores an invite. The person joins automatically when they sign up with that email.

```
server/index.ts   HTTP routes, WebSocket fan-out, background jobs, static hosting
server/store.ts   SQLite schema, in-memory state, transactional write-through, diffing
server/auth.ts    password hashing, sessions, login throttling
src/shared/       commands, authorization, visibility, patch/diff (runs on client + server)
src/store/db.ts   client store: optimistic commands, reconciliation, realtime socket
```

Attachments record file metadata only; files are not uploaded.
