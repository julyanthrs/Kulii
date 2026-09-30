import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  AtSign,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  CircleAlert,
  Copy,
  CornerDownLeft,
  FolderKanban,
  Link2,
  ListChecks,
  Mail,
  Megaphone,
  MessageSquare,
  Plus,
  Search,
  ThumbsUp,
  Undo2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { format } from "date-fns";
import type { AppNotification, Priority, ReminderOffset, Role, Status } from "../../data/types";
import { useDB } from "../../store/db";
import { useMe, usePerm, useVisibleWsIds, useWorkspaces, useWsId, useWsProjects } from "../../store/hooks";
import { useUI } from "../../store/ui";
import { ago, cx, domainOf, firstName, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL } from "../../lib/utils";
import { Avatar, Modal, Segmented } from "../ui";
import { ServiceIcon, TEAM_COLORS, TEAM_ICONS, WsBadge } from "../icons";
import { AssigneePicker } from "../task/TaskBits";
import { ROLE_DESC, ROLE_LABEL } from "../../lib/permissions";

/* ---------------- New task (full form) ---------------- */

export function NewTaskModal() {
  const cfg = useUI((s) => s.newTaskOpen);
  const setNewTask = useUI((s) => s.setNewTask);
  const openTask = useUI((s) => s.openTask);
  const toast = useUI((s) => s.toast);
  const createTask = useDB((s) => s.createTask);
  const wsList = useWorkspaces();
  const activeWsId = useWsId();
  const me = useMe();
  const [ws, setWs] = useState(activeWsId);
  const projects = useWsProjects(ws);
  const perm = usePerm(ws);
  const [f, setF] = useState({
    title: "", description: "", projectId: "", priority: "medium" as Priority, status: "todo" as Status,
    due: "", assigneeIds: [me.id], tags: "", reminder: "none" as ReminderOffset, repeat: "none",
  });

  useEffect(() => {
    if (!cfg) return;
    setWs(activeWsId);
    setF((x) => ({
      ...x, title: "", description: "", tags: "", projectId: cfg.projectId ?? "", status: (cfg.status as Status) ?? "todo",
      due: cfg.dueDate ? format(new Date(cfg.dueDate), "yyyy-MM-dd'T'HH:mm") : "", assigneeIds: [me.id],
    }));
  }, [cfg, activeWsId, me.id]);

  const submit = () => {
    if (!f.title.trim()) return;
    if (!perm.can("task.create")) return toast(perm.why("task.create"));
    const id = createTask({
      title: f.title.trim(), description: f.description, workspaceId: ws, projectId: f.projectId || null, priority: f.priority,
      status: f.status, dueDate: f.due ? new Date(f.due).toISOString() : null, assigneeIds: f.assigneeIds,
      tags: f.tags.split(/[,\s]+/).map((t) => t.replace(/^#/, "")).filter(Boolean), reminder: f.reminder,
      recurrence: f.repeat === "none" ? null : { freq: f.repeat as "daily", interval: 3 },
    });
    setNewTask(null);
    toast("Task created", { label: "Open", run: () => openTask(id) });
  };

  return (
    <Modal
      open={!!cfg}
      onClose={() => setNewTask(null)}
      title="New task"
      wide
      footer={
        <>
          <button className="btn" onClick={() => setNewTask(null)}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={!f.title.trim() || !perm.can("task.create")}>Create task</button>
        </>
      }
    >
      <div className="stack">
        <input className="input" autoFocus placeholder="Task title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && submit()} style={{ height: 40, fontSize: 15, fontWeight: 500 }} />
        <textarea className="textarea" placeholder="Description (optional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="field-row">
          <label className="field">
            <span>Workspace</span>
            <select className="select" value={ws} onChange={(e) => { setWs(e.target.value); setF({ ...f, projectId: "", assigneeIds: [me.id] }); }}>
              {wsList.map((w) => <option key={w.wsId} value={w.wsId}>{w.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Project</span>
            <select className="select" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Due</span>
            <input type="datetime-local" className="input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          </label>
          <div className="field">
            <span>Assignees</span>
            <AssigneePicker wsId={ws} value={f.assigneeIds} onChange={(ids) => setF({ ...f, assigneeIds: ids })} />
          </div>
          <label className="field">
            <span>Priority</span>
            <select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>
              {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Status })}>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Reminder</span>
            <select className="select" value={f.reminder} onChange={(e) => setF({ ...f, reminder: e.target.value as ReminderOffset })}>
              <option value="none">None</option>
              <option value="10m">10 minutes before</option>
              <option value="1h">1 hour before</option>
              <option value="1d">1 day before</option>
            </select>
          </label>
          <label className="field">
            <span>Repeat</span>
            <select className="select" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Tags</span>
          <input className="input" placeholder="design, frontend" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        </label>
        <div className="card-meta">Workload is shown next to each person when assigning. You always make the final call.</div>
      </div>
    </Modal>
  );
}

/* ---------------- Command palette (Ctrl/Cmd + K) ---------------- */

type Result = { id: string; group: string; icon: React.ReactNode; title: string; sub?: string; run: () => void };

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setPalette = useUI((s) => s.setPalette);
  const openTask = useUI((s) => s.openTask);
  const setNewTask = useUI((s) => s.setNewTask);
  const setCreateTeam = useUI((s) => s.setCreateTeam);
  const nav = useNavigate();
  const db = useDB();
  const visible = useVisibleWsIds();
  const workspaces = useWorkspaces();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    if (!open) return [];
    const close = () => setPalette(false);
    const s = q.trim().toLowerCase();
    const match = (...xs: (string | undefined)[]) => !s || xs.some((x) => x?.toLowerCase().includes(s));
    const wsName = (id: string) => (id.startsWith("p:") ? "Personal" : db.teams[id]?.name ?? "");
    const out: Result[] = [];

    if (!s) {
      out.push(
        { id: "a1", group: "Actions", icon: <Plus size={15} />, title: "New task", run: () => { close(); setNewTask({}); } },
        { id: "a2", group: "Actions", icon: <Users size={15} />, title: "Create team", run: () => { close(); setCreateTeam(true); } },
        { id: "a3", group: "Actions", icon: <CalendarClock size={15} />, title: "Open calendar", run: () => { close(); nav("/calendar"); } },
        { id: "a4", group: "Actions", icon: <Link2 size={15} />, title: "Open Vault", run: () => { close(); nav("/vault"); } },
      );
    }
    const tasks = Object.values(db.tasks).filter((t) => visible.has(t.workspaceId) && !t.deletedAt && match(t.title, t.description, ...t.tags));
    for (const t of tasks.slice(0, s ? 8 : 5))
      out.push({ id: t.id, group: "Tasks", icon: <ListChecks size={15} />, title: t.title, sub: `${wsName(t.workspaceId)} · ${STATUS_LABEL[t.status]}`, run: () => { close(); openTask(t.id); } });
    for (const p of Object.values(db.projects).filter((p) => visible.has(p.workspaceId) && !p.deletedAt && match(p.name, p.description)).slice(0, 5))
      out.push({ id: p.id, group: "Projects", icon: <FolderKanban size={15} />, title: p.name, sub: `${wsName(p.workspaceId)}${p.archivedAt ? " · Archived" : ""}`, run: () => { close(); db.setActiveWs(p.workspaceId.startsWith("p:") ? "personal" : p.workspaceId); nav(`/projects/${p.id}`); } });
    if (s) {
      for (const w of workspaces.filter((w) => match(w.name)))
        out.push({ id: `w${w.id}`, group: "Teams", icon: <WsBadge icon={w.icon} color={w.color} size={18} />, title: w.name, sub: "Switch workspace", run: () => { close(); db.setActiveWs(w.id); nav("/"); } });
      const memberIds = new Set(db.memberships.filter((m) => visible.has(m.teamId)).map((m) => m.userId));
      for (const u of Object.values(db.users).filter((u) => memberIds.has(u.id) && match(u.name, u.username, u.title)).slice(0, 5))
        out.push({ id: `u${u.id}`, group: "People", icon: <Avatar user={u} size={18} />, title: u.name, sub: u.title, run: () => { close(); nav(`/tasks?assignee=${u.id}&scope=all`); } });
      for (const v of Object.values(db.vault).filter((v) => visible.has(v.workspaceId) && !v.deletedAt && match(v.title, v.url, v.description, v.category)).slice(0, 5))
        out.push({ id: v.id, group: "Vault", icon: <ServiceIcon url={v.url} size={18} />, title: v.title, sub: domainOf(v.url), run: () => { close(); window.open(v.url, "_blank", "noopener"); } });
      const comments = Object.values(db.tasks)
        .filter((t) => visible.has(t.workspaceId) && !t.deletedAt)
        .flatMap((t) => t.comments.filter((c) => match(c.body)).map((c) => ({ t, c })))
        .slice(0, 4);
      for (const { t, c } of comments)
        out.push({ id: c.id, group: "Comments", icon: <MessageSquare size={15} />, title: c.body, sub: `${firstName(db.users[c.authorId]?.name ?? "")} on ${t.title}`, run: () => { close(); openTask(t.id); } });
    }
    return out;
  }, [open, q, db, visible, workspaces, nav, openTask, setPalette, setNewTask, setCreateTeam]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (!open) return null;
  let lastGroup = "";
  return createPortal(
    <div className="overlay" style={{ placeItems: "start center", paddingTop: "12vh" }} onMouseDown={(e) => e.target === e.currentTarget && setPalette(false)}>
      <div className="modal palette" role="dialog" aria-label="Search">
        <div className="row palette-input">
          <Search size={17} className="muted" />
          <input
            autoFocus
            className="inline-input"
            placeholder="Search tasks, projects, people, links, comments…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              if (e.key === "Enter") results[idx]?.run();
              if (e.key === "Escape") setPalette(false);
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="empty">No results for “{q}”</div>}
          {results.map((r, i) => {
            const head = r.group !== lastGroup ? (lastGroup = r.group) : null;
            return (
              <div key={r.id}>
                {head && <div className="menu-label" style={{ paddingTop: 10 }}>{head}</div>}
                <button data-i={i} className={cx("menu-item", i === idx && "focus")} onMouseMove={() => setIdx(i)} onClick={r.run}>
                  {r.icon}
                  <span className="grow ellipsis">{r.title}</span>
                  {r.sub && <span className="end ellipsis" style={{ maxWidth: 220 }}>{r.sub}</span>}
                  {i === idx && <CornerDownLeft size={12} className="faint" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Notifications ---------------- */

export const NOTIF_ICON: Record<AppNotification["type"], React.ReactNode> = {
  assigned: <UserPlus size={14} />,
  due_soon: <CalendarClock size={14} />,
  overdue: <CircleAlert size={14} />,
  mention: <AtSign size={14} />,
  approved: <ThumbsUp size={14} />,
  changes: <Undo2 size={14} />,
  member: <Users size={14} />,
  project: <FolderKanban size={14} />,
  deadline: <CalendarClock size={14} />,
  review: <CheckCheck size={14} />,
  reminder: <Bell size={14} />,
  announcement: <Megaphone size={14} />,
};

export function NotificationItem({ n, onOpen }: { n: AppNotification; onOpen?: () => void }) {
  const markRead = useDB((s) => s.markRead);
  const setActiveWs = useDB((s) => s.setActiveWs);
  const teams = useDB((s) => s.teams);
  const openTask = useUI((s) => s.openTask);
  const ws = n.workspaceId ? (n.workspaceId.startsWith("p:") ? "Personal" : teams[n.workspaceId]?.name) : null;
  return (
    <button
      className="notif"
      onClick={() => {
        markRead(n.id);
        if (n.workspaceId) setActiveWs(n.workspaceId.startsWith("p:") ? "personal" : n.workspaceId);
        if (n.taskId) openTask(n.taskId);
        onOpen?.();
      }}
    >
      <span className={cx("notif-icon", (n.type === "overdue" || n.type === "changes") && "warn")}>{NOTIF_ICON[n.type]}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <b className="ellipsis">{n.title}</b>
          {!n.read && <i className="unread-dot" />}
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.35, marginTop: 1 }}>{n.body}</div>
        <div className="card-meta" style={{ marginTop: 3 }}>{ago(n.at)}{ws ? ` · ${ws}` : ""}</div>
      </div>
    </button>
  );
}

export function NotificationsPanel() {
  const open = useUI((s) => s.notificationsOpen);
  const setOpen = useUI((s) => s.setNotifications);
  const me = useMe();
  const all = useDB((s) => s.notifications);
  const markAllRead = useDB((s) => s.markAllRead);
  const [filter, setFilter] = useState<"all" | "unread" | "mentions">("all");
  const nav = useNavigate();
  const mine = all.filter((n) => n.userId === me.id);
  const list = mine.filter((n) => (filter === "unread" ? !n.read : filter === "mentions" ? n.type === "mention" : true));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 80 }} onClick={() => setOpen(false)} />
      <div className="notif-panel" role="dialog" aria-label="Notifications">
        <div className="row" style={{ padding: "14px 14px 8px 16px" }}>
          <b className="grow" style={{ fontSize: 14 }}>Notifications</b>
          <button className="btn sm ghost" onClick={markAllRead}><Check size={12} /> Mark all read</button>
          <button className="icon-btn sm" onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button>
        </div>
        <div style={{ padding: "0 14px 8px" }}>
          <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "unread", label: `Unread ${mine.filter((n) => !n.read).length}` }, { value: "mentions", label: "Mentions" }]} />
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 6px 6px" }}>
          {list.length === 0 && <div className="empty"><Bell size={20} /><b>You're all caught up</b></div>}
          {list.slice(0, 40).map((n) => <NotificationItem key={n.id} n={n} onOpen={() => setOpen(false)} />)}
        </div>
        <button className="notif-foot" onClick={() => { setOpen(false); nav("/notifications"); }}>View all notifications</button>
      </div>
    </>,
    document.body,
  );
}

/* ---------------- Teams: create / join / invite ---------------- */

const CATEGORIES = ["Product", "School", "Design", "Engineering", "Marketing", "Research", "Operations", "Personal", "Other"];

export function CreateTeamModal() {
  const open = useUI((s) => s.createTeamOpen);
  const setOpen = useUI((s) => s.setCreateTeam);
  const setJoin = useUI((s) => s.setJoinTeam);
  const setInvite = useUI((s) => s.setInvite);
  const toast = useUI((s) => s.toast);
  const createTeam = useDB((s) => s.createTeam);
  const setActiveWs = useDB((s) => s.setActiveWs);
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", description: "", icon: "rocket", color: TEAM_COLORS[0], category: "Product" });
  useEffect(() => { if (open) setF({ name: "", description: "", icon: "rocket", color: TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)], category: "Product" }); }, [open]);

  const submit = () => {
    if (!f.name.trim()) return;
    const id = createTeam({ ...f, name: f.name.trim() });
    if (!id) return;
    setActiveWs(id);
    setOpen(false);
    toast(`${f.name.trim()} created — you're the owner`, { label: "Invite", run: () => setInvite(id) });
    nav(`/teams/${id}`);
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Create a team"
      sub="You'll become the team's owner."
      footer={
        <>
          <button className="btn ghost" style={{ marginRight: "auto" }} onClick={() => { setOpen(false); setJoin(true); }}>Join with a code instead</button>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn primary" disabled={!f.name.trim()} onClick={submit}>Create team</button>
        </>
      }
    >
      <div className="stack">
        <div className="row" style={{ gap: 12 }}>
          <WsBadge icon={f.icon} color={f.color} size={52} />
          <div className="grow stack" style={{ gap: 8 }}>
            <input className="input" autoFocus placeholder="Team name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />
            <select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <textarea className="textarea" placeholder="What's this team working on?" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="field">
          <span>Icon</span>
          <div className="row wrap" style={{ gap: 4 }}>
            {Object.entries(TEAM_ICONS).filter(([k]) => k !== "user").map(([k, I]) => (
              <button key={k} className={cx("icon-btn solid", f.icon === k && "picked")} onClick={() => setF({ ...f, icon: k })} aria-label={k}>
                <I size={15} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Color</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {TEAM_COLORS.map((c) => (
              <button key={c} className={cx("swatch", f.color === c && "picked")} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function JoinTeamModal() {
  const open = useUI((s) => s.joinTeamOpen);
  const setOpen = useUI((s) => s.setJoinTeam);
  const toast = useUI((s) => s.toast);
  const joinTeam = useDB((s) => s.joinTeam);
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setCode(""); setErr(""); } }, [open]);
  const submit = async () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    const r = await joinTeam(code);
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setOpen(false);
    toast(r.message);
    nav(`/teams/${r.teamId}`);
  };
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Join a team" sub="Paste an invite link or enter a 6-character team code."
      footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={!code.trim() || busy} onClick={submit}>{busy ? "Joining…" : "Join"}</button></>}>
      <input className="input num" autoFocus placeholder="e.g. DSN8M3 or an invite link" value={code} onChange={(e) => { setCode(e.target.value); setErr(""); }}
        onKeyDown={(e) => e.key === "Enter" && submit()} style={{ height: 42, fontSize: 15, letterSpacing: "0.04em" }} />
      {err && <div className="card-meta" style={{ color: "var(--danger)", marginTop: 8 }}>{err}</div>}
      <div className="card-meta" style={{ marginTop: 10 }}>Demo codes: TRK7Q2 · OOP4K9 · DSN8M3 · MKT2P6</div>
    </Modal>
  );
}

export function InviteModal() {
  const teamId = useUI((s) => s.inviteTeamId);
  const setInvite = useUI((s) => s.setInvite);
  const toast = useUI((s) => s.toast);
  const team = useDB((s) => (teamId ? s.teams[teamId] : undefined));
  const invites = useDB((s) => s.invites);
  const inviteMember = useDB((s) => s.inviteMember);
  const cancelInvite = useDB((s) => s.cancelInvite);
  const updateTeam = useDB((s) => s.updateTeam);
  const perm = usePerm(teamId ?? undefined);
  const [mode, setMode] = useState<"email" | "username" | "link">("email");
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  useEffect(() => { if (teamId) { setTarget(""); setRole("MEMBER"); } }, [teamId]);
  if (!team) return null;
  const link = `${location.origin}/join/${team.code}`;
  const pending = invites.filter((i) => i.teamId === team.id);
  const roles: Role[] = perm.role === "OWNER" ? ["ADMIN", "MEMBER", "VIEWER"] : ["MEMBER", "VIEWER"];
  const send = async () => {
    if (!target.trim()) return;
    toast(await inviteMember(team.id, target, role));
    setTarget("");
  };
  const copy = (s: string, what: string) => { navigator.clipboard?.writeText(s); toast(`${what} copied`); };

  return (
    <Modal open={!!teamId} onClose={() => setInvite(null)} title={`Invite to ${team.name}`} sub="New members can be given any role below yours.">
      <Segmented value={mode} onChange={setMode} options={[
        { value: "email", label: "Email", icon: <Mail size={12} /> },
        { value: "username", label: "Username", icon: <AtSign size={12} /> },
        { value: "link", label: "Link & code", icon: <Link2 size={12} /> },
      ]} />
      {mode !== "link" ? (
        <div className="stack" style={{ marginTop: 14 }}>
          <div className="row">
            <input className="input" autoFocus placeholder={mode === "email" ? "name@company.com" : "@username"} value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <select className="select" style={{ width: 120 }} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <button className="btn primary" disabled={!target.trim()} onClick={send}>Invite</button>
          </div>
          <div className="card-meta">{ROLE_DESC[role]}. {mode === "username" ? "Try: maya, alex, daniel, priya." : "Existing accounts join right away; new emails join when they sign up."}</div>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          <div className="field">
            <span>Invite link</span>
            <div className="row">
              <input className="input" readOnly value={link} />
              <button className="btn" onClick={() => copy(link, "Link")}><Copy size={13} /> Copy</button>
            </div>
          </div>
          <div className="field">
            <span>Team code</span>
            <div className="row">
              <div className="team-code num">{team.code}</div>
              <button className="btn" onClick={() => copy(team.code, "Code")}><Copy size={13} /> Copy</button>
              {perm.can("team.settings") && (
                <button className="btn ghost" onClick={() => { const c = Math.random().toString(36).slice(2, 8).toUpperCase(); updateTeam(team.id, { code: c }); toast("Code regenerated"); }}>
                  Regenerate
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <>
          <div className="label" style={{ margin: "18px 0 6px" }}>Pending invites</div>
          {pending.map((i) => (
            <div key={i.id} className="list-row">
              <Mail size={14} className="muted" />
              <span className="grow ellipsis">{i.target}</span>
              <span className="chip">{ROLE_LABEL[i.role]}</span>
              <span className="card-meta">{ago(i.at)}</span>
              <button className="icon-btn sm" aria-label="Cancel invite" onClick={() => cancelInvite(i.id)}><X size={13} /></button>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

/* ---------------- Toasts ---------------- */

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
          {t.action && (
            <button onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
