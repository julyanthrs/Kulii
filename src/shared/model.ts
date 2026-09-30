/**
 * Shared domain model — runs on both the server (authoritative) and the client (optimistic).
 *
 * Every mutation is a named command in ACTIONS operating on an Immer draft of `Data`.
 * Commands are deterministic given a context {actor, seed, now}: ids come from the seed
 * and timestamps from `now`, so the client's optimistic result and the server's
 * authoritative result produce identical entities.
 */
import { addDays, addMonths } from "date-fns";
import type {
  ActivityEvent,
  Announcement,
  AppNotification,
  InboxItem,
  Invite,
  Membership,
  NotificationType,
  Priority,
  Project,
  ReminderOffset,
  Role,
  Status,
  Task,
  Team,
  User,
  VaultItem,
} from "../data/types";
import { DEFAULT_VAULT_CATEGORIES } from "../data/seed";
import { firstName, normalizeUrl, personalWs, STATUS_LABEL } from "../lib/utils";
import { can, denyReason, type Action } from "../lib/permissions";

export interface Data {
  users: Record<string, User>;
  teams: Record<string, Team>;
  memberships: Membership[];
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
  activity: ActivityEvent[];
  vault: Record<string, VaultItem>;
  vaultCategories: Record<string, string[]>;
  notifications: AppNotification[];
  announcements: Announcement[];
  inbox: InboxItem[];
  invites: Invite[];
}

export const emptyData = (): Data => ({
  users: {}, teams: {}, memberships: [], projects: {}, tasks: {}, activity: [], vault: {},
  vaultCategories: {}, notifications: [], announcements: [], inbox: [], invites: [],
});

export class CmdError extends Error {}

/* ---------------- deterministic command context ---------------- */

interface Ctx {
  actor: string;
  seed: string;
  now: number;
  n: number;
}
let CTX: Ctx = { actor: "", seed: "x", now: 0, n: 0 };

export function withCtx<T>(ctx: { actor: string; seed: string; now: number }, fn: () => T): T {
  const prev = CTX;
  CTX = { ...ctx, n: 0 };
  try {
    return fn();
  } finally {
    CTX = prev;
  }
}

const newId = (p: string) => `${p}_${CTX.seed}${(CTX.n++).toString(36)}`;
const nowIso = () => new Date(CTX.now).toISOString();
const me = () => CTX.actor;

/** Seeded pseudo-random in [0,1) — same sequence on client and server. */
function rand() {
  let h = 2166136261;
  const str = `${CTX.seed}:${CTX.n++}`;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

export function makeSeed() {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-3);
}
export const SEED_RE = /^[a-z0-9]{8,24}$/;

/* ---------------- lookups ---------------- */

export function roleIn(s: Pick<Data, "memberships">, wsId: string, userId: string): Role | null {
  if (!wsId) return null;
  if (wsId.startsWith("p:")) return wsId === personalWs(userId) ? "OWNER" : null;
  return s.memberships.find((m) => m.teamId === wsId && m.userId === userId)?.role ?? null;
}

const wsMembers = (s: Data, ws: string) =>
  ws.startsWith("p:") ? [ws.slice(2)] : s.memberships.filter((m) => m.teamId === ws).map((m) => m.userId);

const managers = (s: Data, ws: string) =>
  s.memberships.filter((m) => m.teamId === ws && (m.role === "OWNER" || m.role === "ADMIN")).map((m) => m.userId);

const actorName = (s: Data) => firstName(s.users[me()]?.name ?? "Someone");

function need<T>(v: T | undefined | null, what = "Item"): T {
  if (!v) throw new CmdError(`${what} not found`);
  return v;
}

/* ---------------- input sanitising ---------------- */

const STATUSES: Status[] = ["todo", "in_progress", "review", "done", "blocked"];
const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"];
const REMINDERS: ReminderOffset[] = ["none", "10m", "1h", "1d", "custom"];
const ROLES: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const isoOrNull = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const strArr = (v: unknown, max = 50) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, max).map((x) => x.slice(0, 80)) : []);

function pick<T extends object>(obj: unknown, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of keys) if (k in (obj as object)) (out as any)[k] = (obj as any)[k];
  return out;
}

/** Normalises a task patch; drops anything clients may not set directly. */
function cleanTaskFields(s: Data, ws: string, p: Partial<Task>, selfId?: string): Partial<Task> {
  const o: Partial<Task> = {};
  if (p.title !== undefined) o.title = str(p.title, 300).trim() || "Untitled";
  if (p.description !== undefined) o.description = str(p.description, 10_000);
  if (p.projectId !== undefined) o.projectId = p.projectId && s.projects[p.projectId]?.workspaceId === ws ? p.projectId : null;
  if (p.priority !== undefined) o.priority = PRIORITIES.includes(p.priority) ? p.priority : "medium";
  if (p.status !== undefined) o.status = STATUSES.includes(p.status) ? p.status : "todo";
  if (p.dueDate !== undefined) o.dueDate = isoOrNull(p.dueDate);
  if (p.startDate !== undefined) o.startDate = isoOrNull(p.startDate);
  if (p.tags !== undefined) o.tags = [...new Set(strArr(p.tags, 20))];
  if (p.assigneeIds !== undefined) {
    const allowed = new Set(ws.startsWith("p:") ? [ws.slice(2)] : s.memberships.filter((m) => m.teamId === ws && m.role !== "VIEWER").map((m) => m.userId));
    o.assigneeIds = [...new Set(strArr(p.assigneeIds))].filter((id) => allowed.has(id));
  }
  if (p.blockedBy !== undefined) o.blockedBy = [...new Set(strArr(p.blockedBy))].filter((id) => id !== selfId && s.tasks[id]?.workspaceId === ws);
  if (p.reminder !== undefined) o.reminder = REMINDERS.includes(p.reminder) ? p.reminder : "none";
  if (p.reminderCustomMin !== undefined) o.reminderCustomMin = Math.max(1, Math.min(60 * 24 * 30, Number(p.reminderCustomMin) || 30));
  if (p.remindedAt !== undefined) o.remindedAt = null;
  if (p.recurrence !== undefined) {
    const r = p.recurrence;
    o.recurrence = r && ["daily", "weekly", "monthly", "custom"].includes(r.freq) ? { freq: r.freq, interval: Math.max(1, Math.min(365, Number(r.interval) || 1)) } : null;
  }
  if (p.subtasks !== undefined && Array.isArray(p.subtasks))
    o.subtasks = p.subtasks.slice(0, 100).map((st) => ({ id: newId("s"), title: str(st?.title, 300) || "Subtask", done: !!st?.done }));
  return o;
}

/* ---------------- side effects: activity & notifications ---------------- */

function log(s: Data, ws: string, text: string, taskId: string | null = null, projectId: string | null = null) {
  s.activity.unshift({ id: newId("a"), workspaceId: ws, actorId: me(), text, taskId, projectId, at: nowIso() });
  if (s.activity.length > 2000) s.activity.length = 2000;
}

function notify(s: Data, userIds: string[], type: NotificationType, title: string, body: string, taskId: string | null, ws: string | null, includeSelf = false) {
  const seen = new Set<string>();
  for (const u of userIds) {
    if (seen.has(u) || (!includeSelf && u === me()) || !s.users[u]) continue;
    seen.add(u);
    s.notifications.unshift({ id: newId("n"), userId: u, type, title, body, at: nowIso(), read: false, taskId, workspaceId: ws });
  }
}

function mentionedUsers(s: Data, ws: string, body: string) {
  const handles = [...body.matchAll(/@([\w.-]+)/g)].map((m) => m[1].toLowerCase());
  if (!handles.length) return [];
  return wsMembers(s, ws).filter((id) => {
    const u = s.users[id];
    return u && handles.some((h) => h === u.username.toLowerCase() || h === firstName(u.name).toLowerCase());
  });
}

function nextDue(iso: string, r: NonNullable<Task["recurrence"]>) {
  const d = new Date(iso);
  if (r.freq === "daily") return addDays(d, 1).toISOString();
  if (r.freq === "weekly") return addDays(d, 7).toISOString();
  if (r.freq === "monthly") return addMonths(d, 1).toISOString();
  return addDays(d, Math.max(1, r.interval)).toISOString();
}

function applyStatus(s: Data, t: Task, status: Status) {
  const prev = t.status;
  if (prev === status) return;
  t.status = status;
  t.updatedAt = nowIso();
  t.completedAt = status === "done" ? nowIso() : null;
  if (status === "review") {
    log(s, t.workspaceId, `submitted "${t.title}" for review`, t.id, t.projectId);
    notify(s, managers(s, t.workspaceId), "review", "Review requested", `${actorName(s)} submitted "${t.title}" for review`, t.id, t.workspaceId);
  } else if (status === "done") {
    log(s, t.workspaceId, `completed "${t.title}"`, t.id, t.projectId);
    if (t.recurrence && t.dueDate) {
      const id = newId("k");
      s.tasks[id] = {
        ...JSON.parse(JSON.stringify(t)),
        id,
        status: "todo",
        dueDate: nextDue(t.dueDate, t.recurrence),
        subtasks: t.subtasks.map((st) => ({ ...st, id: newId("s"), done: false })),
        comments: [], attachments: [], completedAt: null, remindedAt: null, overdueNotifiedAt: null,
        createdAt: nowIso(), updatedAt: nowIso(),
      };
    }
  } else {
    log(s, t.workspaceId, `changed "${t.title}": ${STATUS_LABEL[prev]} → ${STATUS_LABEL[status]}`, t.id, t.projectId);
  }
}

function teamCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += a[Math.floor(rand() * a.length)];
  return c;
}

/* ---------------- commands ---------------- */

type NewTask = Partial<Task> & { title: string; workspaceId: string };
type NewProject = Partial<Project> & { name: string; workspaceId: string };
type NewVault = Partial<VaultItem> & { title: string; url: string; workspaceId: string };
type TeamInput = Pick<Team, "name" | "description" | "icon" | "color" | "category">;

export const ACTIONS = {
  /* profile */
  /** Email is owned by the sign-in account (Supabase Auth) and synced by the server, so it isn't editable here. */
  updateProfile(s: Data, patch: Partial<Pick<User, "name" | "title" | "availability" | "username">>) {
    const u = need(s.users[me()], "User");
    const p = pick<User>(patch, ["name", "title", "availability", "username"]);
    const others = Object.values(s.users).filter((x) => x.id !== u.id);
    if (p.username !== undefined) {
      p.username = str(p.username, 40).trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9._-]{2,40}$/.test(p.username)) throw new CmdError("Usernames use letters, numbers, dots and dashes");
      if (others.some((x) => x.username.toLowerCase() === p.username)) throw new CmdError("That username is taken");
    }
    if (p.name !== undefined) p.name = str(p.name, 80).trim() || u.name;
    if (p.title !== undefined) p.title = str(p.title, 80);
    if (p.availability !== undefined && !["available", "busy", "away", "offline"].includes(p.availability)) delete p.availability;
    Object.assign(u, p);
  },

  /* teams */
  createTeam(s: Data, p: TeamInput) {
    const id = newId("t");
    const name = str(p?.name, 80).trim();
    if (!name) throw new CmdError("Team name is required");
    s.teams[id] = {
      id, name, description: str(p.description, 1000), icon: str(p.icon, 30) || "layers", color: str(p.color, 20) || "#8C877F",
      category: str(p.category, 40) || "Other", code: teamCode(), createdAt: nowIso(), membersCanCreateTasks: true,
    };
    s.memberships.push({ teamId: id, userId: me(), role: "OWNER", joinedAt: nowIso() });
    s.vaultCategories[id] = [...DEFAULT_VAULT_CATEGORIES];
    log(s, id, `created the team ${name}`);
    return id;
  },
  updateTeam(s: Data, id: string, patch: Partial<Team>) {
    const t = need(s.teams[id], "Team");
    const p = pick<Team>(patch, ["name", "description", "icon", "color", "category", "code", "membersCanCreateTasks"]);
    if (p.name !== undefined) p.name = str(p.name, 80).trim() || t.name;
    if (p.code !== undefined) {
      p.code = str(p.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (p.code.length < 4 || Object.values(s.teams).some((x) => x.id !== id && x.code === p.code)) p.code = teamCode();
    }
    if (p.membersCanCreateTasks !== undefined) p.membersCanCreateTasks = !!p.membersCanCreateTasks;
    Object.assign(t, p);
  },
  deleteTeam(s: Data, id: string) {
    need(s.teams[id], "Team");
    delete s.teams[id];
    s.memberships = s.memberships.filter((m) => m.teamId !== id);
    s.invites = s.invites.filter((i) => i.teamId !== id);
    s.announcements = s.announcements.filter((a) => a.workspaceId !== id);
    s.activity = s.activity.filter((a) => a.workspaceId !== id);
    delete s.vaultCategories[id];
    for (const t of Object.values(s.tasks)) if (t.workspaceId === id) delete s.tasks[t.id];
    for (const p of Object.values(s.projects)) if (p.workspaceId === id) delete s.projects[p.id];
    for (const v of Object.values(s.vault)) if (v.workspaceId === id) delete s.vault[v.id];
  },
  joinTeam(s: Data, codeOrLink: string) {
    const code = str(codeOrLink, 200).trim().split(/[/=]/).pop()!.toUpperCase();
    const team = Object.values(s.teams).find((t) => t.code === code);
    if (!team) return { ok: false, message: "No team matches that code" };
    if (roleIn(s, team.id, me())) return { ok: false, message: `You're already in ${team.name}`, teamId: team.id };
    s.memberships.push({ teamId: team.id, userId: me(), role: "MEMBER", joinedAt: nowIso() });
    const u = s.users[me()];
    s.invites = s.invites.filter((i) => !(i.teamId === team.id && u && [u.email, u.username].includes(i.target.toLowerCase())));
    log(s, team.id, "joined the team");
    notify(s, managers(s, team.id), "member", "New team member", `${actorName(s)} joined ${team.name}`, null, team.id);
    return { ok: true, message: `Joined ${team.name}`, teamId: team.id };
  },
  leaveTeam(s: Data, teamId: string) {
    const role = roleIn(s, teamId, me());
    const owners = s.memberships.filter((m) => m.teamId === teamId && m.role === "OWNER");
    if (role === "OWNER" && owners.length === 1) return "Transfer ownership to another member before leaving";
    s.memberships = s.memberships.filter((m) => !(m.teamId === teamId && m.userId === me()));
    for (const t of Object.values(s.tasks)) if (t.workspaceId === teamId && t.assigneeIds.includes(me())) t.assigneeIds = t.assigneeIds.filter((a) => a !== me());
    log(s, teamId, "left the team");
    return null;
  },
  inviteMember(s: Data, teamId: string, target: string, role: Role) {
    const team = need(s.teams[teamId], "Team");
    const q = str(target, 200).trim().replace(/^@/, "").toLowerCase();
    if (!q) throw new CmdError("Enter an email or username");
    if (!ROLES.includes(role) || role === "OWNER") role = "MEMBER";
    const u = Object.values(s.users).find((u) => u.email.toLowerCase() === q || u.username.toLowerCase() === q);
    if (u && roleIn(s, teamId, u.id)) return `${u.name} is already a member`;
    if (u) {
      s.memberships.push({ teamId, userId: u.id, role, joinedAt: nowIso() });
      log(s, teamId, `added ${u.name} as ${role.toLowerCase()}`);
      notify(s, [u.id], "member", `You were added to ${team.name}`, `${actorName(s)} invited you as ${role.toLowerCase()}`, null, teamId);
      return `${u.name} added to ${team.name}`;
    }
    if (!q.includes("@")) throw new CmdError(`No account with the username @${q}`);
    if (s.invites.some((i) => i.teamId === teamId && i.target === q)) return `${q} already has a pending invite`;
    s.invites.push({ id: newId("inv"), teamId, target: q, role, invitedBy: me(), at: nowIso() });
    log(s, teamId, `invited ${q}`);
    return `Invite saved for ${q} — they'll join automatically when they sign up`;
  },
  cancelInvite(s: Data, id: string) {
    s.invites = s.invites.filter((i) => i.id !== id);
  },
  changeRole(s: Data, teamId: string, userId: string, role: Role) {
    if (!ROLES.includes(role)) throw new CmdError("Unknown role");
    const m = need(s.memberships.find((m) => m.teamId === teamId && m.userId === userId), "Member");
    m.role = role;
    log(s, teamId, `changed ${s.users[userId]?.name ?? "a member"}'s role to ${role.toLowerCase()}`);
    notify(s, [userId], "member", "Your role changed", `You're now ${role.toLowerCase()} in ${s.teams[teamId]?.name}`, null, teamId);
  },
  removeMember(s: Data, teamId: string, userId: string) {
    s.memberships = s.memberships.filter((m) => !(m.teamId === teamId && m.userId === userId));
    for (const t of Object.values(s.tasks)) if (t.workspaceId === teamId && t.assigneeIds.includes(userId)) t.assigneeIds = t.assigneeIds.filter((a) => a !== userId);
    log(s, teamId, `removed ${s.users[userId]?.name ?? "a member"} from the team`);
  },

  /* projects */
  createProject(s: Data, p: NewProject) {
    const id = newId("p");
    const ws = str(p?.workspaceId, 60);
    const name = str(p.name, 120).trim();
    if (!name) throw new CmdError("Project name is required");
    const members = new Set(wsMembers(s, ws));
    const memberIds = [...new Set(strArr(p.memberIds))].filter((m) => members.has(m));
    s.projects[id] = {
      id, workspaceId: ws, name, description: str(p.description, 2000), memberIds: memberIds.length ? memberIds : [me()],
      startDate: p.startDate === undefined ? nowIso() : isoOrNull(p.startDate), deadline: isoOrNull(p.deadline),
      createdAt: nowIso(), createdBy: me(), archivedAt: null, deletedAt: null, links: [],
    };
    log(s, ws, `created the project ${name}`, null, id);
    notify(s, s.projects[id].memberIds, "project", "Added to project", `${actorName(s)} added you to ${name}`, null, ws);
    return id;
  },
  updateProject(s: Data, id: string, patch: Partial<Project>) {
    const p = need(s.projects[id], "Project");
    const o = pick<Project>(patch, ["name", "description", "memberIds", "startDate", "deadline", "links"]);
    if (o.name !== undefined) o.name = str(o.name, 120).trim() || p.name;
    if (o.description !== undefined) o.description = str(o.description, 2000);
    if (o.startDate !== undefined) o.startDate = isoOrNull(o.startDate);
    if (o.deadline !== undefined) o.deadline = isoOrNull(o.deadline);
    if (o.memberIds !== undefined) {
      const members = new Set(wsMembers(s, p.workspaceId));
      o.memberIds = [...new Set(strArr(o.memberIds))].filter((m) => members.has(m));
    }
    if (o.links !== undefined)
      o.links = (Array.isArray(o.links) ? o.links : []).slice(0, 100).map((l) => ({ id: str(l?.id, 60) || newId("l"), label: str(l?.label, 120), url: normalizeUrl(str(l?.url, 2000)) }));
    const deadlineChanged = o.deadline !== undefined && o.deadline !== p.deadline;
    Object.assign(p, o);
    if (deadlineChanged) {
      log(s, p.workspaceId, `changed the deadline of ${p.name}`, null, id);
      notify(s, p.memberIds, "deadline", "Project deadline changed", `${p.name} deadline was updated`, null, p.workspaceId);
    }
  },
  archiveProject(s: Data, id: string, archived: boolean) {
    const p = need(s.projects[id], "Project");
    p.archivedAt = archived ? nowIso() : null;
    log(s, p.workspaceId, `${archived ? "archived" : "restored"} ${p.name}`, null, id);
    notify(s, p.memberIds, "project", "Project update", `${p.name} was ${archived ? "archived" : "restored"}`, null, p.workspaceId);
  },
  trashProject(s: Data, id: string) {
    const p = need(s.projects[id], "Project");
    p.deletedAt = nowIso();
    log(s, p.workspaceId, `moved ${p.name} to trash`, null, id);
  },
  restoreProject(s: Data, id: string) {
    need(s.projects[id], "Project").deletedAt = null;
  },
  deleteProjectForever(s: Data, id: string) {
    delete s.projects[id];
    for (const t of Object.values(s.tasks)) if (t.projectId === id) t.projectId = null;
    for (const v of Object.values(s.vault)) if (v.projectId === id) v.projectId = null;
  },

  /* tasks */
  createTask(s: Data, p: NewTask) {
    const id = newId("k");
    const ws = str(p?.workspaceId, 60);
    const fields = cleanTaskFields(s, ws, p, id);
    const t: Task = {
      id, workspaceId: ws, projectId: null, title: "Untitled", description: "", assigneeIds: [me()], createdBy: me(), startDate: null, dueDate: null,
      priority: "medium", status: "todo", tags: [], subtasks: [], attachments: [], comments: [], blockedBy: [],
      reminder: "none", reminderCustomMin: 30, remindedAt: null, overdueNotifiedAt: null, recurrence: null,
      createdAt: nowIso(), updatedAt: nowIso(), completedAt: null, deletedAt: null,
      ...fields,
    };
    if (t.status === "done") t.completedAt = nowIso();
    s.tasks[id] = t;
    log(s, ws, `created "${t.title}"`, id, t.projectId);
    notify(s, t.assigneeIds, "assigned", "Task assigned to you", `${actorName(s)} assigned you "${t.title}"`, id, ws);
    return id;
  },
  updateTask(s: Data, id: string, patch: Partial<Task>) {
    const t = need(s.tasks[id], "Task");
    const { status, ...rest } = cleanTaskFields(s, t.workspaceId, patch, id);
    if (rest.assigneeIds) {
      const added = rest.assigneeIds.filter((a) => !t.assigneeIds.includes(a));
      for (const a of added) log(s, t.workspaceId, `assigned ${firstName(s.users[a]?.name ?? "someone")} to "${t.title}"`, id, t.projectId);
      notify(s, added, "assigned", "Task assigned to you", `${actorName(s)} assigned you "${t.title}"`, id, t.workspaceId);
    }
    if (rest.dueDate !== undefined && rest.dueDate !== t.dueDate) {
      log(s, t.workspaceId, `changed the due date of "${t.title}"`, id, t.projectId);
      notify(s, t.assigneeIds, "deadline", "Deadline changed", `"${t.title}" due date was updated`, id, t.workspaceId);
      t.remindedAt = null;
      t.overdueNotifiedAt = null;
    }
    if (rest.priority && rest.priority !== t.priority) log(s, t.workspaceId, `set priority of "${t.title}" to ${rest.priority}`, id, t.projectId);
    if (rest.title && rest.title !== t.title) log(s, t.workspaceId, `renamed "${t.title}" to "${rest.title}"`, id, t.projectId);
    Object.assign(t, rest, { updatedAt: nowIso() });
    if (status) applyStatus(s, t, status);
  },
  setStatus(s: Data, id: string, status: Status) {
    if (!STATUSES.includes(status)) throw new CmdError("Unknown status");
    applyStatus(s, need(s.tasks[id], "Task"), status);
  },
  approveTask(s: Data, id: string) {
    const t = need(s.tasks[id], "Task");
    applyStatus(s, t, "done");
    log(s, t.workspaceId, `approved "${t.title}"`, id, t.projectId);
    notify(s, t.assigneeIds, "approved", "Task approved", `${actorName(s)} approved "${t.title}"`, id, t.workspaceId);
  },
  requestChanges(s: Data, id: string, note: string) {
    const t = need(s.tasks[id], "Task");
    const body = str(note, 2000).trim();
    t.status = "in_progress";
    t.updatedAt = nowIso();
    t.comments.push({ id: newId("c"), authorId: me(), body: `Requested changes: ${body}`, at: nowIso(), parentId: null, reactions: {}, attachments: [] });
    log(s, t.workspaceId, `requested changes on "${t.title}"`, id, t.projectId);
    notify(s, t.assigneeIds, "changes", "Changes requested", `${actorName(s)}: ${body}`, id, t.workspaceId);
  },
  addSubtask(s: Data, id: string, title: string) {
    const t = need(s.tasks[id], "Task");
    t.subtasks.push({ id: newId("s"), title: str(title, 300).trim() || "Subtask", done: false });
    t.updatedAt = nowIso();
  },
  toggleSubtask(s: Data, id: string, subId: string) {
    const t = need(s.tasks[id], "Task");
    const st = need(t.subtasks.find((x) => x.id === subId), "Subtask");
    st.done = !st.done;
    t.updatedAt = nowIso();
    if (st.done) log(s, t.workspaceId, `checked "${st.title}" in "${t.title}"`, id, t.projectId);
  },
  removeSubtask(s: Data, id: string, subId: string) {
    const t = need(s.tasks[id], "Task");
    t.subtasks = t.subtasks.filter((x) => x.id !== subId);
  },
  addComment(s: Data, id: string, body: string, parentId: string | null = null, files: { name: string; size: number }[] = []) {
    const t = need(s.tasks[id], "Task");
    const text = str(body, 5000).trim();
    if (!text) throw new CmdError("Comment is empty");
    const parent = parentId ? t.comments.find((c) => c.id === parentId) : undefined;
    const attachments = (Array.isArray(files) ? files : []).slice(0, 10).map((f) => ({ id: newId("f"), name: str(f?.name, 200) || "file", size: Math.max(0, Number(f?.size) || 0), uploadedBy: me(), at: nowIso() }));
    t.comments.push({ id: newId("c"), authorId: me(), body: text, at: nowIso(), parentId: parent ? parent.id : null, reactions: {}, attachments });
    t.attachments.push(...attachments);
    log(s, t.workspaceId, `commented on "${t.title}"`, id, t.projectId);
    const mentioned = mentionedUsers(s, t.workspaceId, text);
    notify(s, mentioned, "mention", `${actorName(s)} mentioned you`, `"${text.slice(0, 80)}" — ${t.title}`, id, t.workspaceId);
    if (parent && !mentioned.includes(parent.authorId))
      notify(s, [parent.authorId], "mention", `${actorName(s)} replied to you`, `"${text.slice(0, 80)}" — ${t.title}`, id, t.workspaceId);
  },
  toggleReaction(s: Data, id: string, commentId: string, emoji: string) {
    const c = need(need(s.tasks[id], "Task").comments.find((c) => c.id === commentId), "Comment");
    const e = str(emoji, 8);
    if (!e) return;
    const list = c.reactions[e] ?? [];
    c.reactions[e] = list.includes(me()) ? list.filter((x) => x !== me()) : [...list, me()];
    if (!c.reactions[e].length) delete c.reactions[e];
  },
  addAttachment(s: Data, id: string, file: { name: string; size: number }) {
    const t = need(s.tasks[id], "Task");
    const name = str(file?.name, 200) || "file";
    t.attachments.push({ id: newId("f"), name, size: Math.max(0, Number(file?.size) || 0), uploadedBy: me(), at: nowIso() });
    log(s, t.workspaceId, `uploaded ${name}`, id, t.projectId);
  },
  removeAttachment(s: Data, id: string, attId: string) {
    const t = need(s.tasks[id], "Task");
    t.attachments = t.attachments.filter((a) => a.id !== attId);
  },
  trashTask(s: Data, id: string) {
    const t = need(s.tasks[id], "Task");
    t.deletedAt = nowIso();
    log(s, t.workspaceId, `moved "${t.title}" to trash`, id, t.projectId);
  },
  restoreTask(s: Data, id: string) {
    const t = need(s.tasks[id], "Task");
    t.deletedAt = null;
    log(s, t.workspaceId, `restored "${t.title}"`, id, t.projectId);
  },
  deleteTaskForever(s: Data, id: string) {
    delete s.tasks[id];
    for (const t of Object.values(s.tasks)) if (t.blockedBy.includes(id)) t.blockedBy = t.blockedBy.filter((b) => b !== id);
  },
  bulkUpdate(s: Data, ids: string[], patch: Partial<Pick<Task, "status" | "priority">>) {
    for (const id of strArr(ids, 500)) {
      const t = s.tasks[id];
      if (!t) continue;
      if (patch?.priority && PRIORITIES.includes(patch.priority)) t.priority = patch.priority;
      if (patch?.status && STATUSES.includes(patch.status)) applyStatus(s, t, patch.status);
    }
  },
  bulkTrash(s: Data, ids: string[]) {
    for (const id of strArr(ids, 500)) if (s.tasks[id]) s.tasks[id].deletedAt = nowIso();
  },
  /** Permanently removes trashed items — only in workspaces where the actor may delete. */
  emptyTrash(s: Data) {
    const allowed = (ws: string, a: Action) => can({ role: roleIn(s, ws, me()), userId: me() }, a);
    for (const t of Object.values(s.tasks)) if (t.deletedAt && (allowed(t.workspaceId, "task.delete") || t.createdBy === me())) delete s.tasks[t.id];
    for (const p of Object.values(s.projects)) if (p.deletedAt && allowed(p.workspaceId, "project.edit")) delete s.projects[p.id];
    for (const v of Object.values(s.vault)) if (v.deletedAt && (allowed(v.workspaceId, "vault.edit") || v.addedBy === me())) delete s.vault[v.id];
  },

  /* vault */
  addVault(s: Data, p: NewVault) {
    const id = newId("v");
    const ws = str(p?.workspaceId, 60);
    const url = normalizeUrl(str(p.url, 2000));
    if (!url) throw new CmdError("A URL is required");
    const projectId = p.projectId && s.projects[p.projectId]?.workspaceId === ws ? p.projectId : null;
    s.vault[id] = {
      id, workspaceId: ws, title: str(p.title, 200) || url, url, description: str(p.description, 1000), category: str(p.category, 40) || "Other",
      addedBy: me(), at: nowIso(), projectId, tags: strArr(p.tags, 20), pinned: !!p.pinned, favorite: false, notes: str(p.notes, 2000), deletedAt: null,
    };
    log(s, ws, `added "${s.vault[id].title}" to the Vault`);
    return id;
  },
  updateVault(s: Data, id: string, patch: Partial<VaultItem>) {
    const v = need(s.vault[id], "Link");
    const o = pick<VaultItem>(patch, ["title", "url", "description", "category", "projectId", "tags", "pinned", "favorite", "notes"]);
    if (o.url !== undefined) o.url = normalizeUrl(str(o.url, 2000)) || v.url;
    if (o.title !== undefined) o.title = str(o.title, 200) || v.title;
    if (o.description !== undefined) o.description = str(o.description, 1000);
    if (o.category !== undefined) o.category = str(o.category, 40) || "Other";
    if (o.projectId !== undefined) o.projectId = o.projectId && s.projects[o.projectId]?.workspaceId === v.workspaceId ? o.projectId : null;
    if (o.tags !== undefined) o.tags = strArr(o.tags, 20);
    if (o.notes !== undefined) o.notes = str(o.notes, 2000);
    if (o.pinned !== undefined) o.pinned = !!o.pinned;
    if (o.favorite !== undefined) o.favorite = !!o.favorite;
    Object.assign(v, o);
  },
  trashVault(s: Data, id: string) {
    need(s.vault[id], "Link").deletedAt = nowIso();
  },
  restoreVault(s: Data, id: string) {
    need(s.vault[id], "Link").deletedAt = null;
  },
  deleteVaultForever(s: Data, id: string) {
    delete s.vault[id];
  },
  addVaultCategory(s: Data, ws: string, name: string) {
    const n = str(name, 40).trim();
    if (!n) return;
    const list = (s.vaultCategories[ws] ??= [...DEFAULT_VAULT_CATEGORIES]);
    if (!list.some((c) => c.toLowerCase() === n.toLowerCase())) list.push(n);
  },

  /* notifications, announcements, inbox */
  markRead(s: Data, id: string) {
    const n = s.notifications.find((n) => n.id === id);
    if (n) n.read = true;
  },
  markAllRead(s: Data) {
    for (const n of s.notifications) if (n.userId === me() && !n.read) n.read = true;
  },
  addAnnouncement(s: Data, ws: string, title: string, body: string, important: boolean) {
    const t = str(title, 200).trim();
    if (!t) throw new CmdError("Headline is required");
    s.announcements.unshift({ id: newId("an"), workspaceId: ws, authorId: me(), title: t, body: str(body, 3000), important: !!important, at: nowIso() });
    notify(s, wsMembers(s, ws), "announcement", important ? "Important announcement" : "New announcement", t, null, ws);
    log(s, ws, `posted an announcement: ${t}`);
  },
  deleteAnnouncement(s: Data, id: string) {
    s.announcements = s.announcements.filter((a) => a.id !== id);
  },
  addInbox(s: Data, text: string) {
    const t = str(text, 500).trim();
    if (!t) return;
    s.inbox.unshift({ id: newId("i"), userId: me(), text: t, at: nowIso() });
  },
  removeInbox(s: Data, id: string) {
    s.inbox = s.inbox.filter((i) => i.id !== id);
  },
  convertInbox(s: Data, id: string, p: NewTask) {
    need(s.inbox.find((i) => i.id === id && i.userId === me()), "Inbox item");
    const taskId = ACTIONS.createTask(s, p);
    s.inbox = s.inbox.filter((i) => i.id !== id);
    return taskId;
  },
};

export type ActionName = keyof typeof ACTIONS;
type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;
export type ActionArgs<K extends ActionName> = Tail<Parameters<(typeof ACTIONS)[K]>>;
export type ActionResult<K extends ActionName> = ReturnType<(typeof ACTIONS)[K]>;

/** Commands the client must not apply optimistically (it lacks the data to compute them). */
export const SERVER_ONLY: ActionName[] = ["joinTeam", "inviteMember"];

/* ---------------- system jobs (server only) ---------------- */

/** Reminder & overdue scan. Runs as the "system" actor. */
export function tick(s: Data) {
  const now = CTX.now;
  for (const t of Object.values(s.tasks)) {
    if (t.deletedAt || t.status === "done" || !t.dueDate) continue;
    const due = new Date(t.dueDate).getTime();
    if (t.reminder !== "none" && !t.remindedAt) {
      const mins = t.reminder === "10m" ? 10 : t.reminder === "1h" ? 60 : t.reminder === "1d" ? 1440 : t.reminderCustomMin;
      if (now >= due - mins * 60_000 && now < due) {
        t.remindedAt = nowIso();
        const when = mins >= 1440 ? "tomorrow" : `in ${mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins} min`}`;
        notify(s, t.assigneeIds, "reminder", "Reminder", `"${t.title}" is due ${when}`, t.id, t.workspaceId, true);
      }
    }
    if (!t.overdueNotifiedAt && now > due) {
      t.overdueNotifiedAt = nowIso();
      notify(s, t.assigneeIds, "overdue", "Task overdue", `"${t.title}" is past its due date`, t.id, t.workspaceId, true);
    }
  }
}

/** Creates an account and turns any pending invites for its email/username into memberships. */
export function registerUser(s: Data, p: { id: string; name: string; email: string; username: string }) {
  const id = p.id;
  const email = p.email.trim().toLowerCase();
  const username = p.username.trim().replace(/^@/, "").toLowerCase();
  s.users[id] = { id, name: p.name.trim(), email, username, title: "Member", hue: Math.floor(rand() * 360), availability: "available", createdAt: nowIso() };
  s.vaultCategories[personalWs(id)] = [...DEFAULT_VAULT_CATEGORIES];
  const pending = s.invites.filter((i) => i.target === email || i.target === username);
  for (const inv of pending) {
    if (!s.teams[inv.teamId] || roleIn(s, inv.teamId, id)) continue;
    s.memberships.push({ teamId: inv.teamId, userId: id, role: inv.role, joinedAt: nowIso() });
    CTX.actor = id;
    log(s, inv.teamId, "joined the team from an invite");
    notify(s, managers(s, inv.teamId), "member", "New team member", `${p.name.trim()} joined ${s.teams[inv.teamId].name}`, null, inv.teamId);
  }
  s.invites = s.invites.filter((i) => !pending.includes(i));
  return id;
}

/* ---------------- server-side authorization ---------------- */

export function authorize(s: Data, actor: string, name: string, args: unknown[]): string | null {
  const a = args as any[];
  const role = (ws: string) => roleIn(s, ws, actor);
  const ctx = (ws: string) => ({ role: role(ws), userId: actor, membersCanCreateTasks: ws?.startsWith("p:") ? true : s.teams[ws]?.membersCanCreateTasks });
  const needP = (ws: string, act: Action, t?: Task) => (can(ctx(ws), act, t) ? null : denyReason(ctx(ws), act));
  const taskOf = (id: unknown) => (typeof id === "string" ? s.tasks[id] : undefined);
  const edit = (t?: Task) => (!t ? "Task not found" : needP(t.workspaceId, "task.edit", t));
  const reviewGuard = (t: Task, status: unknown) =>
    t.status === "review" && status === "done" && !can(ctx(t.workspaceId), "task.review") ? "Only owners and admins can approve reviews" : null;
  const canDelete = (t?: Task) =>
    !t ? "Task not found" : can(ctx(t.workspaceId), "task.delete") || (can(ctx(t.workspaceId), "task.edit", t) && t.createdBy === actor) ? null : "You can't delete this task";
  const vaultEdit = (v?: VaultItem) =>
    !v ? "Link not found" : can(ctx(v.workspaceId), "vault.edit") || (can(ctx(v.workspaceId), "vault.add") && v.addedBy === actor) ? null : "You can't edit this link";
  const sameSet = (x: string[], y: string[]) => x.length === y.length && x.every((v) => y.includes(v));

  switch (name) {
    case "updateProfile":
    case "createTeam":
    case "joinTeam":
    case "markAllRead":
    case "addInbox":
    case "emptyTrash":
      return null;
    case "updateTeam":
      return needP(a[0], "team.settings");
    case "deleteTeam":
      return needP(a[0], "team.delete");
    case "leaveTeam":
      return role(a[0]) ? null : "You're not a member of this team";
    case "inviteMember": {
      const e = needP(a[0], "member.invite");
      if (e) return e;
      return role(a[0]) !== "OWNER" && (a[2] === "ADMIN" || a[2] === "OWNER") ? "Only owners can invite admins" : null;
    }
    case "cancelInvite": {
      const inv = s.invites.find((i) => i.id === a[0]);
      return inv ? needP(inv.teamId, "member.invite") : "Invite not found";
    }
    case "changeRole":
      return a[1] === actor ? "You can't change your own role" : needP(a[0], "member.role");
    case "removeMember":
      if (a[1] === actor) return "Use Leave team instead";
      if (roleIn(s, a[0], a[1]) === "OWNER") return "Owners can't be removed";
      return needP(a[0], "member.remove");
    case "createProject":
      return needP(a[0]?.workspaceId, "project.create");
    case "updateProject": {
      const p = s.projects[a[0]];
      if (!p) return "Project not found";
      const keys = Object.keys(a[1] ?? {});
      return keys.length && keys.every((k) => k === "links") ? needP(p.workspaceId, "task.comment") : needP(p.workspaceId, "project.edit");
    }
    case "archiveProject":
    case "trashProject":
    case "restoreProject":
    case "deleteProjectForever": {
      const p = s.projects[a[0]];
      return p ? needP(p.workspaceId, name === "archiveProject" ? "project.archive" : "project.edit") : "Project not found";
    }
    case "createTask":
      return needP(a[0]?.workspaceId, "task.create");
    case "updateTask": {
      const t = taskOf(a[0]);
      const e = edit(t);
      if (e || !t) return e;
      const patch = (a[1] ?? {}) as Partial<Task>;
      if (Array.isArray(patch.assigneeIds) && !sameSet(patch.assigneeIds, t.assigneeIds) && !t.workspaceId.startsWith("p:")) {
        const e2 = needP(t.workspaceId, "task.assign");
        if (e2) return e2;
      }
      return reviewGuard(t, patch.status);
    }
    case "setStatus": {
      const t = taskOf(a[0]);
      return edit(t) ?? reviewGuard(t!, a[1]);
    }
    case "approveTask":
    case "requestChanges": {
      const t = taskOf(a[0]);
      return t ? needP(t.workspaceId, "task.review") : "Task not found";
    }
    case "addSubtask":
    case "toggleSubtask":
    case "removeSubtask":
      return edit(taskOf(a[0]));
    case "addComment":
    case "toggleReaction":
    case "addAttachment": {
      const t = taskOf(a[0]);
      return t ? needP(t.workspaceId, "task.comment") : "Task not found";
    }
    case "removeAttachment": {
      const t = taskOf(a[0]);
      if (!t) return "Task not found";
      return t.attachments.find((x) => x.id === a[1])?.uploadedBy === actor && role(t.workspaceId) ? null : edit(t);
    }
    case "trashTask":
    case "restoreTask":
    case "deleteTaskForever":
      return canDelete(taskOf(a[0]));
    case "bulkUpdate":
    case "bulkTrash": {
      if (!Array.isArray(a[0])) return "Invalid selection";
      for (const id of a[0]) {
        const t = taskOf(id);
        const e = name === "bulkTrash" ? canDelete(t) : edit(t) ?? reviewGuard(t!, a[1]?.status);
        if (e) return e;
      }
      return null;
    }
    case "addVault":
      return needP(a[0]?.workspaceId, "vault.add");
    case "updateVault": {
      const v = s.vault[a[0]];
      if (!v) return "Link not found";
      const keys = Object.keys(a[1] ?? {});
      if (keys.length && keys.every((k) => k === "favorite")) return role(v.workspaceId) ? null : "Not allowed";
      return vaultEdit(v);
    }
    case "trashVault":
    case "restoreVault":
    case "deleteVaultForever":
      return vaultEdit(s.vault[a[0]]);
    case "addVaultCategory":
      return needP(a[0], "vault.add");
    case "markRead":
      return s.notifications.find((n) => n.id === a[0])?.userId === actor ? null : "Not found";
    case "addAnnouncement":
      return needP(a[0], "announce.create");
    case "deleteAnnouncement": {
      const an = s.announcements.find((x) => x.id === a[0]);
      return an ? needP(an.workspaceId, "announce.create") : "Announcement not found";
    }
    case "removeInbox":
      return s.inbox.find((i) => i.id === a[0])?.userId === actor ? null : "Not found";
    case "convertInbox":
      return s.inbox.find((i) => i.id === a[0])?.userId === actor ? needP(a[1]?.workspaceId, "task.create") : "Not found";
    default:
      return "Unknown command";
  }
}

/* ---------------- sync: visibility, diff, patches ---------------- */

export const RECORD_COLLS = ["users", "teams", "projects", "tasks", "vault"] as const;
export const ARRAY_COLLS = ["memberships", "activity", "notifications", "announcements", "inbox", "invites"] as const;
export type RecordColl = (typeof RECORD_COLLS)[number];
export type ArrayColl = (typeof ARRAY_COLLS)[number];
export type Coll = RecordColl | ArrayColl | "vaultCategories";

export const keyOf = (coll: Coll, e: any): string =>
  coll === "memberships" ? `${e.teamId}:${e.userId}` : coll === "vaultCategories" ? e.ws : e.id;

export interface Patch {
  upsert: Partial<Record<Coll, any[]>>;
  remove: Partial<Record<Coll, string[]>>;
}

export const isEmptyPatch = (p: Patch) =>
  !Object.values(p.upsert).some((v) => v?.length) && !Object.values(p.remove).some((v) => v?.length);

/** Structural diff relying on Immer's reference sharing. */
export function diff(prev: Data, next: Data): Patch {
  const p: Patch = { upsert: {}, remove: {} };
  const push = (c: Coll, kind: "upsert" | "remove", v: any) => ((p[kind][c] ??= []) as any[]).push(v);
  for (const c of RECORD_COLLS) {
    const a = prev[c] as Record<string, unknown>;
    const b = next[c] as Record<string, unknown>;
    if (a === b) continue;
    for (const k in b) if (a[k] !== b[k]) push(c, "upsert", b[k]);
    for (const k in a) if (!(k in b)) push(c, "remove", k);
  }
  for (const c of ARRAY_COLLS) {
    const a = prev[c] as any[];
    const b = next[c] as any[];
    if (a === b) continue;
    const before = new Map(a.map((e) => [keyOf(c, e), e]));
    const after = new Set<string>();
    for (const e of b) {
      const k = keyOf(c, e);
      after.add(k);
      if (before.get(k) !== e) push(c, "upsert", e);
    }
    for (const k of before.keys()) if (!after.has(k)) push(c, "remove", k);
  }
  if (prev.vaultCategories !== next.vaultCategories) {
    for (const ws in next.vaultCategories)
      if (prev.vaultCategories[ws] !== next.vaultCategories[ws]) push("vaultCategories", "upsert", { ws, names: next.vaultCategories[ws] });
    for (const ws in prev.vaultCategories) if (!(ws in next.vaultCategories)) push("vaultCategories", "remove", ws);
  }
  return p;
}

export interface Visibility {
  teams: Set<string>;
  ws: Set<string>;
  users: Set<string>;
}

export function visibilityFor(s: Data, userId: string): Visibility {
  const teams = new Set(s.memberships.filter((m) => m.userId === userId).map((m) => m.teamId));
  const users = new Set([userId, ...s.memberships.filter((m) => teams.has(m.teamId)).map((m) => m.userId)]);
  return { teams, ws: new Set([...teams, personalWs(userId)]), users };
}

export function canSee(coll: Coll, e: any, v: Visibility, userId: string): boolean {
  switch (coll) {
    case "users": return v.users.has(e.id);
    case "teams": return v.teams.has(e.id);
    case "memberships":
    case "invites": return v.teams.has(e.teamId);
    case "notifications":
    case "inbox": return e.userId === userId;
    case "vaultCategories": return v.ws.has(e.ws);
    default: return v.ws.has(e.workspaceId);
  }
}

/** Everything one user is allowed to see. */
export function snapshotFor(s: Data, userId: string): Data {
  const v = visibilityFor(s, userId);
  const rec = <T>(c: RecordColl) =>
    Object.fromEntries(Object.entries(s[c] as Record<string, T>).filter(([, e]) => canSee(c, e, v, userId))) as Record<string, T>;
  const arr = <T>(c: ArrayColl) => (s[c] as T[]).filter((e) => canSee(c, e, v, userId));
  return {
    users: rec("users"), teams: rec("teams"), projects: rec("projects"), tasks: rec("tasks"), vault: rec("vault"),
    memberships: arr("memberships"), activity: arr<ActivityEvent>("activity").slice(0, 600),
    notifications: arr<AppNotification>("notifications").slice(0, 300), announcements: arr("announcements"),
    inbox: arr("inbox"), invites: arr("invites"),
    vaultCategories: Object.fromEntries(Object.entries(s.vaultCategories).filter(([ws]) => v.ws.has(ws))),
  };
}

/** Narrows a global patch to what `userId` may see (removals judged against the previous state). */
export function patchFor(patch: Patch, prev: Data, next: Data, userId: string): Patch {
  const vNext = visibilityFor(next, userId);
  const vPrev = visibilityFor(prev, userId);
  const out: Patch = { upsert: {}, remove: {} };
  for (const [c, list] of Object.entries(patch.upsert) as [Coll, any[]][]) {
    const seen = list.filter((e) => canSee(c, e, vNext, userId));
    if (seen.length) out.upsert[c] = seen;
  }
  for (const [c, keys] of Object.entries(patch.remove) as [Coll, string[]][]) {
    const was = keys.filter((k) => {
      if (c === "vaultCategories") return vPrev.ws.has(k);
      const e = RECORD_COLLS.includes(c as RecordColl) ? (prev as any)[c][k] : (prev as any)[c].find((x: any) => keyOf(c, x) === k);
      return e && canSee(c, e, vPrev, userId);
    });
    if (was.length) out.remove[c] = was;
  }
  return out;
}

const SORT_DESC: Partial<Record<ArrayColl, true>> = { activity: true, notifications: true, announcements: true, inbox: true };

/** Applies a patch to a (draft) data object. Idempotent. */
export function applyPatch(s: Data, patch: Patch) {
  for (const [c, list] of Object.entries(patch.upsert) as [Coll, any[]][]) {
    if (c === "vaultCategories") {
      for (const e of list) s.vaultCategories[e.ws] = e.names;
    } else if ((RECORD_COLLS as readonly string[]).includes(c)) {
      for (const e of list) (s as any)[c][e.id] = e;
    } else {
      const arr = (s as any)[c] as any[];
      for (const e of list) {
        const k = keyOf(c, e);
        const i = arr.findIndex((x) => keyOf(c, x) === k);
        if (i >= 0) arr[i] = e;
        else arr.unshift(e);
      }
      if (SORT_DESC[c as ArrayColl]) arr.sort((x, y) => (y.at > x.at ? 1 : y.at < x.at ? -1 : 0));
    }
  }
  for (const [c, keys] of Object.entries(patch.remove) as [Coll, string[]][]) {
    if (c === "vaultCategories") for (const k of keys) delete s.vaultCategories[k];
    else if ((RECORD_COLLS as readonly string[]).includes(c)) for (const k of keys) delete (s as any)[c][k];
    else {
      const drop = new Set(keys);
      (s as any)[c] = ((s as any)[c] as any[]).filter((x) => !drop.has(keyOf(c, x)));
    }
  }
}

/** Users whose visible set changes because of membership edits — they get a full snapshot. */
export function membershipAffected(patch: Patch, prev: Data, next: Data): Set<string> {
  const teams = new Set<string>();
  for (const m of patch.upsert.memberships ?? []) teams.add(m.teamId);
  for (const k of patch.remove.memberships ?? []) teams.add(k.split(":")[0]);
  for (const k of patch.remove.teams ?? []) teams.add(k);
  const users = new Set<string>();
  for (const m of [...prev.memberships, ...next.memberships]) if (teams.has(m.teamId)) users.add(m.userId);
  return users;
}
