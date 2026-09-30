import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, ListChecks, Mail, MoreHorizontal, Search, ShieldCheck, UserMinus, UserPlus, X } from "lucide-react";
import { useDB } from "../store/db";
import { useActiveWorkspace, useMe, usePerm, useWsMembers, useWsTasks, workload } from "../store/hooks";
import { useUI } from "../store/ui";
import { ago, dueLabel } from "../lib/utils";
import { Avatar, Bar, Empty, Menu, MenuItem, Page, presenceLabel } from "../components/ui";
import { ROLE_DESC, ROLE_LABEL } from "../lib/permissions";
import type { Role } from "../data/types";

export default function Members() {
  const params = useParams();
  const active = useActiveWorkspace();
  const teamId = params.teamId ?? (active.team ? active.id : "");
  const team = useDB((s) => s.teams[teamId]);
  const activeWs = useDB((s) => s.activeWs);
  const setActiveWs = useDB((s) => s.setActiveWs);
  const members = useWsMembers(teamId);
  const tasks = useWsTasks(teamId);
  const invites = useDB((s) => s.invites.filter((i) => i.teamId === teamId));
  const changeRole = useDB((s) => s.changeRole);
  const removeMember = useDB((s) => s.removeMember);
  const cancelInvite = useDB((s) => s.cancelInvite);
  const setInvite = useUI((s) => s.setInvite);
  const toast = useUI((s) => s.toast);
  const perm = usePerm(teamId);
  const me = useMe();
  const nav = useNavigate();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (team && perm.role && activeWs !== teamId) setActiveWs(teamId);
  }, [team, perm.role, activeWs, teamId, setActiveWs]);

  if (!team || !perm.role) return <Navigate to="/teams" replace />;

  const list = members.filter(({ user }) => `${user.name} ${user.username} ${user.title}`.toLowerCase().includes(q.toLowerCase()));
  const roleOptions: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

  return (
    <Page
      crumbs={<><Link to="/teams">Teams</Link><ChevronRight size={11} /><Link to={`/teams/${teamId}`}>{team.name}</Link><ChevronRight size={11} /><span>Members</span></>}
      title="Members"
      sub={`${members.length} people in ${team.name}`}
      actions={
        <>
          <div className="search-field" style={{ width: 200 }}>
            <Search size={14} />
            <input className="input" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {perm.can("member.invite") && <button className="btn primary" onClick={() => setInvite(teamId)}><UserPlus size={14} /> Invite</button>}
        </>
      }
    >
      <div className="member-grid">
        {list.map(({ user, role }) => {
          const l = workload(user.id, tasks);
          const soon = tasks
            .filter((t) => t.assigneeIds.includes(user.id) && t.status !== "done" && t.dueDate)
            .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
          const isMe = user.id === me.id;
          return (
            <div key={user.id} className="card member-card">
              <div className="row" style={{ alignItems: "flex-start" }}>
                <Avatar user={user} size={40} presence />
                <div className="grow">
                  <div className="row" style={{ gap: 6 }}>
                    <b className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</b>
                    {isMe && <span className="chip">You</span>}
                  </div>
                  <div className="card-meta">{user.title} · {presenceLabel[user.availability]}</div>
                </div>
                <Menu
                  width={220}
                  trigger={(p) => <button ref={p.ref} onClick={p.onClick} className="icon-btn sm" aria-label="Member options"><MoreHorizontal size={16} /></button>}
                >
                  {(close) => (
                    <>
                      <MenuItem icon={<ListChecks size={14} />} onClick={() => { nav(`/tasks?view=list&scope=everyone&assignee=${user.id}`); close(); }}>View assigned tasks</MenuItem>
                      {perm.can("member.role") && !isMe && (
                        <>
                          <div className="menu-label">Change role</div>
                          {roleOptions.map((r) => (
                            <MenuItem key={r} icon={<ShieldCheck size={14} />} end={r === role ? "Current" : undefined} title={ROLE_DESC[r]}
                              onClick={() => { changeRole(teamId, user.id, r); toast(`${user.name} is now ${ROLE_LABEL[r].toLowerCase()}`); close(); }}>
                              {ROLE_LABEL[r]}
                            </MenuItem>
                          ))}
                        </>
                      )}
                      {perm.can("member.remove") && !isMe && role !== "OWNER" && (
                        <>
                          <div className="menu-sep" />
                          <MenuItem danger icon={<UserMinus size={14} />} onClick={() => {
                            close();
                            if (confirm(`Remove ${user.name} from ${team.name}?`)) { removeMember(teamId, user.id); toast(`${user.name} removed`); }
                          }}>Remove from team</MenuItem>
                        </>
                      )}
                    </>
                  )}
                </Menu>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <span className={`role-pill role-${role.toLowerCase()}`}>{ROLE_LABEL[role]}</span>
                <div className="grow" />
                <span className="num" style={{ fontWeight: 600 }}>{l.active}</span>
                <span className="card-meta">active</span>
                <span className="num" style={{ fontWeight: 600, marginLeft: 6 }}>{l.dueSoon}</span>
                <span className="card-meta">due this week</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <Bar value={l.active / 10} />
              </div>
              <div className="card-meta ellipsis" style={{ marginTop: 8 }}>
                {soon ? <>Next: <span style={{ color: "var(--text)" }}>{soon.title}</span> · {dueLabel(soon.dueDate)}</> : "No upcoming deadlines"}
              </div>
            </div>
          );
        })}
      </div>
      {list.length === 0 && <Empty title="No one matches that search" />}

      {invites.length > 0 && (
        <>
          <div className="label" style={{ margin: "20px 4px 8px" }}>Pending invites</div>
          <div className="card" style={{ padding: 6 }}>
            {invites.map((i) => (
              <div key={i.id} className="list-row">
                <Mail size={15} className="muted" />
                <span className="grow">{i.target}</span>
                <span className="chip">{ROLE_LABEL[i.role]}</span>
                <span className="card-meta">{ago(i.at)}</span>
                {perm.can("member.invite") && (
                  <button className="icon-btn sm" aria-label="Cancel invite" onClick={() => cancelInvite(i.id)}><X size={13} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
