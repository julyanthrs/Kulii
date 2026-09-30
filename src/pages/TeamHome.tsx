import { useEffect, useMemo } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, CircleDot, Copy, FolderKanban, LogOut, Megaphone, Settings, Trash2, UserPlus, Users } from "lucide-react";
import { useDB } from "../store/db";
import { projectStats, usePerm, useWsMembers, useWsProjects, useWsTasks, workload } from "../store/hooks";
import { useUI } from "../store/ui";
import { ago, firstName, isOverdue } from "../lib/utils";
import { Avatar, Bar, Empty, Page } from "../components/ui";
import { WsBadge } from "../components/icons";
import { ROLE_LABEL } from "../lib/permissions";

export default function TeamHome() {
  const { teamId = "" } = useParams();
  const team = useDB((s) => s.teams[teamId]);
  const activeWs = useDB((s) => s.activeWs);
  const setActiveWs = useDB((s) => s.setActiveWs);
  const perm = usePerm(teamId);
  const members = useWsMembers(teamId);
  const tasks = useWsTasks(teamId);
  const projects = useWsProjects(teamId);
  const users = useDB((s) => s.users);
  const activity = useDB((s) => s.activity);
  const announcements = useDB((s) => s.announcements);
  const deleteAnnouncement = useDB((s) => s.deleteAnnouncement);
  const leaveTeam = useDB((s) => s.leaveTeam);
  const setInvite = useUI((s) => s.setInvite);
  const toast = useUI((s) => s.toast);
  const openTask = useUI((s) => s.openTask);
  const nav = useNavigate();

  useEffect(() => {
    if (team && perm.role && activeWs !== teamId) setActiveWs(teamId);
  }, [team, perm.role, activeWs, teamId, setActiveWs]);

  const counts = useMemo(() => ({
    open: tasks.filter((t) => t.status !== "done").length,
    review: tasks.filter((t) => t.status === "review").length,
    overdue: tasks.filter((t) => isOverdue(t.dueDate, t.status)).length,
    done: tasks.filter((t) => t.status === "done").length,
  }), [tasks]);

  if (!team || !perm.role) return <Navigate to="/teams" replace />;
  const feed = activity.filter((a) => a.workspaceId === teamId).slice(0, 14);
  const anns = announcements.filter((a) => a.workspaceId === teamId);

  return (
    <Page
      crumbs={<><Link to="/teams">Teams</Link><ChevronRight size={11} /><span>{team.name}</span></>}
      title={
        <span className="row" style={{ gap: 12 }}>
          <WsBadge icon={team.icon} color={team.color} size={36} />
          {team.name}
        </span>
      }
      sub={`${team.category} · ${members.length} members · You're ${ROLE_LABEL[perm.role].toLowerCase()}`}
      actions={
        <>
          <button className="btn ghost" onClick={() => { navigator.clipboard?.writeText(team.code); toast("Team code copied"); }}>
            <Copy size={13} /> <span className="num">{team.code}</span>
          </button>
          <Link to={`/teams/${teamId}/members`} className="btn"><Users size={14} /> Members</Link>
          {perm.can("team.settings") && <Link to="/settings?tab=team" className="btn"><Settings size={14} /> Settings</Link>}
          {perm.can("member.invite") && <button className="btn primary" onClick={() => setInvite(teamId)}><UserPlus size={14} /> Invite</button>}
        </>
      }
    >
      <div className="team-grid">
        <section className="card" style={{ gridArea: "about" }}>
          <div className="card-title" style={{ marginBottom: 8 }}>About</div>
          <p className="muted" style={{ fontSize: 13 }}>{team.description || "No description yet."}</p>
          <div className="stat-row">
            <div><span className="big-num" style={{ fontSize: 24 }}>{counts.open}</span><span className="card-meta"><CircleDot size={11} /> open</span></div>
            <div><span className="big-num" style={{ fontSize: 24 }}>{counts.review}</span><span className="card-meta"><CheckCircle2 size={11} /> in review</span></div>
            <div><span className="big-num" style={{ fontSize: 24, color: counts.overdue ? "var(--danger)" : undefined }}>{counts.overdue}</span><span className="card-meta"><AlertTriangle size={11} /> overdue</span></div>
            <div><span className="big-num" style={{ fontSize: 24 }}>{counts.done}</span><span className="card-meta">completed</span></div>
          </div>
        </section>

        <section className="card" style={{ gridArea: "ann" }}>
          <div className="card-head"><div className="card-title"><Megaphone size={14} /> Announcements</div></div>
          {anns.length === 0 && <Empty title="No announcements" />}
          <div className="stack" style={{ gap: 10 }}>
            {anns.slice(0, 3).map((a) => (
              <div key={a.id} className="row" style={{ alignItems: "flex-start" }}>
                <Avatar user={users[a.authorId]} size={22} />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{a.important && <span className="chip important" style={{ marginRight: 6 }}>Important</span>}{a.title}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{a.body}</div>
                  <div className="card-meta">{firstName(users[a.authorId]?.name ?? "")} · {ago(a.at)}</div>
                </div>
                {perm.can("announce.create") && (
                  <button className="icon-btn sm" aria-label="Delete announcement" onClick={() => deleteAnnouncement(a.id)}><Trash2 size={13} /></button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ gridArea: "mem" }}>
          <div className="card-head">
            <Link to={`/teams/${teamId}/members`} className="card-title"><Users size={14} /> Workload</Link>
            <span className="card-meta">active tasks</span>
          </div>
          <div className="stack" style={{ gap: 2 }}>
            {members.map(({ user, role }) => {
              const l = workload(user.id, tasks);
              return (
                <div key={user.id} className="list-row" style={{ padding: "5px 6px" }}>
                  <Avatar user={user} size={24} presence />
                  <div className="grow">
                    <div className="ellipsis" style={{ fontWeight: 500 }}>{user.name}</div>
                    <div className="card-meta">{ROLE_LABEL[role]}</div>
                  </div>
                  <div style={{ width: 80 }}><Bar value={l.active / 10} /></div>
                  <span className="num card-meta" style={{ width: 16, textAlign: "right" }}>{l.active}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card" style={{ gridArea: "proj" }}>
          <div className="card-head">
            <Link to="/projects" className="card-title"><FolderKanban size={14} /> Projects</Link>
          </div>
          {projects.length === 0 && <Empty title="No projects yet" />}
          {projects.map((p) => {
            const s = projectStats(p, tasks);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="list-row" style={{ display: "block" }}>
                <div className="row"><b className="grow ellipsis" style={{ fontWeight: 500 }}>{p.name}</b><span className="card-meta num">{s.pct}%</span></div>
                <div style={{ marginTop: 6 }}><Bar value={s.pct / 100} accent /></div>
              </Link>
            );
          })}
        </section>

        <section className="card" style={{ gridArea: "act" }}>
          <div className="card-head">
            <Link to="/activity" className="card-title">Activity</Link>
          </div>
          {feed.map((a) => (
            <div key={a.id} className="list-row clickable" style={{ padding: "5px 6px", alignItems: "flex-start" }} onClick={() => a.taskId && openTask(a.taskId)}>
              <Avatar user={users[a.actorId]} size={20} />
              <div className="grow" style={{ fontSize: 12.5 }}>
                <b style={{ fontWeight: 600 }}>{firstName(users[a.actorId]?.name ?? "")}</b> <span className="muted">{a.text}</span>
                <div className="card-meta">{ago(a.at)}</div>
              </div>
            </div>
          ))}
        </section>
      </div>
      <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
        <button className="btn ghost danger" onClick={() => {
          if (!confirm(`Leave ${team.name}?`)) return;
          const err = leaveTeam(teamId);
          toast(err ?? `You left ${team.name}`);
          if (!err) nav("/teams");
        }}>
          <LogOut size={13} /> Leave team
        </button>
      </div>
    </Page>
  );
}
