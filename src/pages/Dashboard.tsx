import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDays, format, isSameDay, isToday, startOfDay } from "date-fns";
import {
  Activity as ActivityIcon,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  FolderKanban,
  Inbox,
  Library,
  ListChecks,
  Megaphone,
  Plus,
  Sun,
  Users,
  Zap,
} from "lucide-react";
import { useDB } from "../store/db";
import {
  projectStats,
  useActiveWorkspace,
  useMe,
  usePerm,
  useVisibleWsIds,
  useWorkspaces,
  useWsId,
  useWsMembers,
  useWsProjects,
  useWsTasks,
  workload,
} from "../store/hooks";
import { useUI } from "../store/ui";
import { ago, cx, domainOf, firstName, isOverdue, PRIORITY_RANK } from "../lib/utils";
import { Avatar, AvatarStack, Bar, Empty, Modal, Ring, Segmented, presenceLabel } from "../components/ui";
import { QuickAdd, TaskRow } from "../components/task/TaskBits";
import { ServiceIcon, WsBadge } from "../components/icons";
import type { Task } from "../data/types";
import { ROLE_LABEL } from "../lib/permissions";

const byDue = (a: Task, b: Task) =>
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];

export default function Dashboard() {
  const ws = useActiveWorkspace();
  const wsId = useWsId();
  const personal = !ws.team;
  const setNewTask = useUI((s) => s.setNewTask);
  const perm = usePerm();

  return (
    <div className="page">
      <div className="page-head">
        <div className="row" style={{ gap: 12 }}>
          <WsBadge icon={ws.icon} color={ws.color} size={34} />
          <div>
            <h1 className="page-title" style={{ fontSize: 20 }}>{personal ? "Personal overview" : ws.name}</h1>
            <div className="page-sub" style={{ marginTop: 1 }}>
              {format(new Date(), "EEEE, MMMM d")}
              {!personal && ` · ${ROLE_LABEL[ws.role]}`}
            </div>
          </div>
        </div>
        <div className="page-actions">
          {!personal && (
            <Link to={`/teams/${ws.id}`} className="btn ghost">
              <Users size={14} /> Team
            </Link>
          )}
          <Link to="/tasks?view=board" className="btn ghost">
            <ListChecks size={14} /> Board
          </Link>
          <button className="btn primary" onClick={() => setNewTask({})} disabled={!perm.can("task.create")} title={perm.can("task.create") ? undefined : perm.why("task.create")}>
            <Plus size={14} /> Task
          </button>
        </div>
      </div>
      <div className="page-body">
        <div className={cx("widget-grid dash", personal ? "dash-personal" : "dash-team")} key={wsId}>
          <TodayWidget />
          <ProgressWidget />
          {personal ? <InboxWidget /> : <MembersWidget />}
          {personal ? <TeamsWidget /> : <AnnouncementWidget />}
          <UpcomingWidget />
          <MyTasksWidget />
          <DeadlinesWidget />
          <ProjectsWidget />
          <ActivityWidget />
          <QuickAddWidget />
          <PinnedVaultWidget />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Today ---------------- */

function TodayWidget() {
  const tasks = useWsTasks();
  const me = useMe();
  const personal = !useActiveWorkspace().team;
  const list = useMemo(() => {
    const endToday = startOfDay(addDays(new Date(), 1)).getTime();
    return tasks
      .filter((t) => t.status !== "done" && t.dueDate && new Date(t.dueDate).getTime() < endToday && (personal || t.assigneeIds.includes(me.id)))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byDue(a, b));
  }, [tasks, me.id, personal]);
  const overdue = list.filter((t) => isOverdue(t.dueDate, t.status) && !isToday(new Date(t.dueDate!))).length;
  const doneToday = tasks.filter((t) => t.completedAt && isToday(new Date(t.completedAt))).length;

  return (
    <section className="card" style={{ gridArea: "today" }}>
      <div className="card-head">
        <div className="card-title"><Sun size={14} /> Today</div>
        <span className="card-meta">{doneToday} done</span>
      </div>
      <div className="row" style={{ alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span className="big-num">{list.length}</span>
        <span className="muted">
          task{list.length === 1 ? "" : "s"} today{overdue ? ` · ` : ""}
          {overdue > 0 && <span style={{ color: "var(--danger)" }}>{overdue} overdue</span>}
        </span>
      </div>
      <div className="w-body">
        {list.length === 0 ? (
          <Empty icon={<Sun size={20} />} title="Nothing due today">Enjoy the calm.</Empty>
        ) : (
          list.slice(0, 6).map((t) => <TaskRow key={t.id} task={t} />)
        )}
      </div>
    </section>
  );
}

/* ---------------- Progress (ring with up/down cycling) ---------------- */

function ProgressWidget() {
  const projects = useWsProjects();
  const tasks = useWsTasks();
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const stats = projects.map((p) => ({ p, ...projectStats(p, tasks) }));
  const cur = stats[Math.min(i, stats.length - 1)];
  const overall = tasks.length ? tasks.filter((t) => t.status === "done").length / tasks.length : 0;

  return (
    <section className="card" style={{ gridArea: "prog" }}>
      <div className="card-head">
        <div className="card-title"><Zap size={14} /> Progress</div>
        <span className="card-meta num">{Math.round(overall * 100)}% overall</span>
      </div>
      {!cur ? (
        <Empty title="No projects yet" />
      ) : (
        <div className="row" style={{ flex: 1, gap: 14, minHeight: 0 }}>
          <button className="grow" style={{ textAlign: "left", minWidth: 0 }} onClick={() => nav(`/projects/${cur.p.id}`)}>
            <div className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{cur.p.name}</div>
            <div className="big-num" style={{ margin: "8px 0 4px" }}>{cur.pct}%</div>
            <div className="card-meta num">{cur.done} / {cur.total} tasks</div>
          </button>
          <Ring value={cur.pct / 100} size={78} stroke={7} />
          <div className="stack" style={{ gap: 6 }}>
            <button className="icon-btn sm solid" aria-label="Previous project" onClick={() => setI((i - 1 + stats.length) % stats.length)}><ChevronUp size={14} /></button>
            <button className="icon-btn sm solid" aria-label="Next project" onClick={() => setI((i + 1) % stats.length)}><ChevronDown size={14} /></button>
          </div>
        </div>
      )}
      {stats.length > 1 && (
        <div className="row" style={{ justifyContent: "center", gap: 4, marginTop: 6 }}>
          {stats.map((s, j) => (
            <i key={s.p.id} className="pager-dot" style={{ opacity: j === i ? 1 : 0.3 }} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- Members (expand to workload) ---------------- */

function MembersWidget() {
  const members = useWsMembers();
  const tasks = useWsTasks();
  const [open, setOpen] = useState(false);
  const online = members.filter((m) => m.user.availability === "available" || m.user.availability === "busy").length;
  return (
    <>
      <button className="card hover" style={{ gridArea: "mem", display: "flex", flexDirection: "column" }} onClick={() => setOpen(true)}>
        <div className="card-head">
          <div className="card-title"><Users size={14} /> Team</div>
        </div>
        <div className="grow" />
        <AvatarStack users={members.map((m) => m.user)} max={4} size={30} />
        <div className="row" style={{ alignItems: "baseline", gap: 6, marginTop: 10 }}>
          <span className="big-num" style={{ fontSize: 26 }}>{online}</span>
          <span className="muted">active</span>
        </div>
        <div className="card-meta">{members.length} members · view workload</div>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Team workload" sub="Informational — you always choose who to assign.">
        <div className="stack" style={{ gap: 2 }}>
          {members.map(({ user, role }) => {
            const l = workload(user.id, tasks);
            return (
              <div key={user.id} className="list-row">
                <Avatar user={user} size={30} presence />
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>{user.name}</div>
                  <div className="card-meta">{user.title} · {ROLE_LABEL[role]} · {presenceLabel[user.availability]}</div>
                </div>
                <div style={{ width: 110 }}>
                  <Bar value={l.active / 10} />
                  <div className="card-meta num" style={{ marginTop: 4 }}>{l.active} active · {l.dueSoon} this week</div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
}

/* ---------------- Announcements ---------------- */

function AnnouncementWidget() {
  const wsId = useWsId();
  const all = useDB((s) => s.announcements);
  const users = useDB((s) => s.users);
  const add = useDB((s) => s.addAnnouncement);
  const perm = usePerm();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", body: "", important: false });
  const list = all.filter((a) => a.workspaceId === wsId);
  const a = list[0];
  return (
    <section className="card" style={{ gridArea: "ann" }}>
      <div className="card-head">
        <div className="card-title"><Megaphone size={14} /> Announcements</div>
        {perm.can("announce.create") && (
          <button className="icon-btn sm" aria-label="New announcement" onClick={() => setOpen(true)}><Plus size={14} /></button>
        )}
      </div>
      {!a ? (
        <Empty title="No announcements" />
      ) : (
        <div className="w-body">
          {a.important && <span className="chip important">Important</span>}
          <div style={{ fontWeight: 600, fontSize: 14, margin: "6px 0 4px", lineHeight: 1.3 }}>{a.title}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{a.body}</div>
          <div className="row card-meta" style={{ marginTop: 8 }}>
            <Avatar user={users[a.authorId]} size={16} /> {firstName(users[a.authorId]?.name ?? "")} · {ago(a.at)}
            {list.length > 1 && <span style={{ marginLeft: "auto" }}>+{list.length - 1} earlier</span>}
          </div>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New announcement"
        footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={!f.title.trim()} onClick={() => { add(wsId, f.title.trim(), f.body.trim(), f.important); setOpen(false); setF({ title: "", body: "", important: false }); }}>Post</button></>}>
        <div className="stack">
          <input className="input" autoFocus placeholder="Headline" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <textarea className="textarea" placeholder="Details" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <label className="row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={f.important} onChange={(e) => setF({ ...f, important: e.target.checked })} /> Mark as important
          </label>
        </div>
      </Modal>
    </section>
  );
}

/* ---------------- Personal: inbox & teams ---------------- */

function InboxWidget() {
  const me = useMe();
  const count = useDB((s) => s.inbox.filter((i) => i.userId === me.id).length);
  const addInbox = useDB((s) => s.addInbox);
  const [v, setV] = useState("");
  return (
    <section className="card" style={{ gridArea: "mem" }}>
      <div className="card-head">
        <Link to="/inbox" className="card-title"><Inbox size={14} /> Inbox</Link>
      </div>
      <div className="grow" />
      <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
        <span className="big-num">{count}</span>
        <span className="muted">to triage</span>
      </div>
      <input className="input" style={{ marginTop: 10, height: 30, borderRadius: 999 }} placeholder="Capture…" value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { addInbox(v.trim()); setV(""); } }} />
    </section>
  );
}

function TeamsWidget() {
  const list = useWorkspaces().filter((w) => w.team);
  const tasks = useDB((s) => s.tasks);
  const me = useMe();
  const setActiveWs = useDB((s) => s.setActiveWs);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of Object.values(tasks)) if (!t.deletedAt && t.status !== "done" && t.assigneeIds.includes(me.id)) c[t.workspaceId] = (c[t.workspaceId] ?? 0) + 1;
    return c;
  }, [tasks, me.id]);
  return (
    <section className="card" style={{ gridArea: "ann" }}>
      <div className="card-head">
        <Link to="/teams" className="card-title"><Users size={14} /> My teams</Link>
        <span className="card-meta">{list.length}</span>
      </div>
      <div className="w-body">
        {list.map((w) => (
          <button key={w.id} className="list-row clickable" style={{ width: "100%", padding: "5px 6px" }} onClick={() => setActiveWs(w.id)}>
            <WsBadge icon={w.icon} color={w.color} size={22} />
            <span className="grow ellipsis" style={{ textAlign: "left", fontWeight: 500 }}>{w.name}</span>
            <span className="card-meta num">{counts[w.id] ?? 0} open</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Upcoming (week strip) ---------------- */

function UpcomingWidget() {
  const tasks = useWsTasks();
  const [sel, setSel] = useState(0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i));
  const open = tasks.filter((t) => t.status !== "done" && t.dueDate);
  const onDay = (d: Date) => open.filter((t) => isSameDay(new Date(t.dueDate!), d)).sort(byDue);
  const list = onDay(days[sel]);
  return (
    <section className="card" style={{ gridArea: "up" }}>
      <div className="card-head">
        <Link to="/calendar" className="card-title"><CalendarDays size={14} /> Upcoming</Link>
        <span className="card-meta">{format(days[sel], "EEE, MMM d")}</span>
      </div>
      <div className="week-strip">
        {days.map((d, i) => {
          const n = onDay(d).length;
          return (
            <button key={i} className={cx("week-day", i === sel && "on")} onClick={() => setSel(i)}>
              <span className="card-meta">{format(d, "EEEEE")}</span>
              <b className="num">{format(d, "d")}</b>
              <span className="row" style={{ gap: 2, height: 4 }}>
                {Array.from({ length: Math.min(n, 3) }).map((_, j) => <i key={j} className="mini-dot" />)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="w-body" style={{ marginTop: 6 }}>
        {list.length === 0 ? <div className="card-meta" style={{ padding: "8px 4px" }}>Nothing due.</div> : list.map((t) => <TaskRow key={t.id} task={t} dense />)}
      </div>
    </section>
  );
}

/* ---------------- My tasks ---------------- */

function MyTasksWidget() {
  const tasks = useWsTasks();
  const me = useMe();
  const [tab, setTab] = useState<"open" | "done">("open");
  const mine = tasks.filter((t) => t.assigneeIds.includes(me.id));
  const list = (tab === "open" ? mine.filter((t) => t.status !== "done").sort(byDue) : mine.filter((t) => t.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")));
  return (
    <section className="card" style={{ gridArea: "mine" }}>
      <div className="card-head">
        <Link to="/tasks" className="card-title"><ListChecks size={14} /> My tasks</Link>
        <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: "open", label: `Open ${mine.filter((t) => t.status !== "done").length}` }, { value: "done", label: "Done" }]} />
      </div>
      <div className="w-body">
        {list.length === 0 ? <Empty title={tab === "open" ? "You're all clear" : "Nothing completed yet"} /> : list.slice(0, 8).map((t) => <TaskRow key={t.id} task={t} />)}
      </div>
    </section>
  );
}

/* ---------------- Deadlines ---------------- */

function DeadlinesWidget() {
  const tasks = useWsTasks();
  const groups = useMemo(() => {
    const today = startOfDay(new Date());
    const upcoming = tasks.filter((t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) >= addDays(today, 1)).sort(byDue);
    const map = new Map<string, Task[]>();
    for (const t of upcoming) {
      const d = startOfDay(new Date(t.dueDate!));
      const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
      const key = diff === 1 ? "Tomorrow" : diff < 7 ? format(d, "EEEE") : format(d, "MMM d");
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map.entries()].slice(0, 6);
  }, [tasks]);
  const openTask = useUI((s) => s.openTask);
  return (
    <section className="card" style={{ gridArea: "dead" }}>
      <div className="card-head">
        <div className="card-title"><Clock size={14} /> Deadlines</div>
      </div>
      <div className="w-body">
        {groups.length === 0 && <Empty title="No upcoming deadlines" />}
        {groups.map(([day, list]) => (
          <button key={day} className="deadline-row" onClick={() => openTask(list[0].id)} title={list.map((t) => t.title).join("\n")}>
            <span style={{ fontWeight: 500 }}>{day}</span>
            <span className="grow ellipsis card-meta" style={{ textAlign: "left" }}>{list[0].title}{list.length > 1 ? ` +${list.length - 1}` : ""}</span>
            <span className="count num">{list.length}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Projects ---------------- */

function ProjectsWidget() {
  const projects = useWsProjects();
  const tasks = useWsTasks();
  return (
    <section className="card" style={{ gridArea: "proj" }}>
      <div className="card-head">
        <Link to="/projects" className="card-title"><FolderKanban size={14} /> Projects</Link>
        <span className="card-meta">{projects.length} active</span>
      </div>
      <div className="w-body stack" style={{ gap: 4 }}>
        {projects.length === 0 && <Empty title="No projects" />}
        {projects.map((p) => {
          const s = projectStats(p, tasks);
          return (
            <Link key={p.id} to={`/projects/${p.id}`} className="list-row" style={{ display: "block", padding: "7px 8px" }}>
              <div className="row">
                <span className="grow ellipsis" style={{ fontWeight: 500 }}>{p.name}</span>
                <span className="card-meta num">{s.done} / {s.total}</span>
              </div>
              <div style={{ marginTop: 6 }}><Bar value={s.pct / 100} /></div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Activity ---------------- */

function ActivityWidget() {
  const wsId = useWsId();
  const visible = useVisibleWsIds();
  const personal = !useActiveWorkspace().team;
  const activity = useDB((s) => s.activity);
  const users = useDB((s) => s.users);
  const teams = useDB((s) => s.teams);
  const openTask = useUI((s) => s.openTask);
  const list = activity.filter((a) => (personal ? visible.has(a.workspaceId) : a.workspaceId === wsId)).slice(0, 12);
  return (
    <section className="card" style={{ gridArea: "act" }}>
      <div className="card-head">
        <Link to="/activity" className="card-title"><ActivityIcon size={14} /> Recent activity</Link>
      </div>
      <div className="w-body">
        {list.length === 0 && <Empty title="Quiet so far" />}
        {list.map((a) => (
          <div key={a.id} className={cx("list-row", a.taskId && "clickable")} style={{ padding: "5px 6px", alignItems: "flex-start" }} onClick={() => a.taskId && openTask(a.taskId)}>
            <Avatar user={users[a.actorId]} size={20} />
            <div className="grow" style={{ fontSize: 12.5, lineHeight: 1.35 }}>
              <b style={{ fontWeight: 600 }}>{firstName(users[a.actorId]?.name ?? "Someone")}</b> <span className="muted">{a.text}</span>
              <div className="card-meta">
                {ago(a.at)}
                {personal && !a.workspaceId.startsWith("p:") && ` · ${teams[a.workspaceId]?.name ?? ""}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Quick add ---------------- */

function QuickAddWidget() {
  const wsId = useWsId();
  return (
    <section className="card" style={{ gridArea: "quick", justifyContent: "center" }}>
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div className="card-title"><Plus size={14} /> Quick add</div>
        <span className="card-meta hide-md">try “!high #design tomorrow”</span>
      </div>
      <QuickAdd wsId={wsId} placeholder="Add task and press Enter" />
    </section>
  );
}

/* ---------------- Pinned vault (dock row) ---------------- */

function PinnedVaultWidget() {
  const wsId = useWsId();
  const vault = useDB((s) => s.vault);
  const pinned = Object.values(vault).filter((v) => v.workspaceId === wsId && v.pinned && !v.deletedAt).slice(0, 4);
  return (
    <section className="card" style={{ gridArea: "vault", justifyContent: "center" }}>
      <div className="card-head" style={{ marginBottom: 8 }}>
        <Link to="/vault" className="card-title"><Library size={14} /> Vault</Link>
        <span className="card-meta">Pinned</span>
      </div>
      {pinned.length === 0 ? (
        <Link to="/vault" className="card-meta">Pin links in the Vault to see them here.</Link>
      ) : (
        <div className="vault-dock">
          {pinned.map((v) => (
            <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="vault-dock-item" title={`${v.title} — ${domainOf(v.url)}`}>
              <ServiceIcon url={v.url} size={32} />
              <span className="ellipsis">{v.title}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
