import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, LogOut, MoreHorizontal, Plus, Settings, UserPlus, Users } from "lucide-react";
import { useDB } from "../store/db";
import { useMe, useWorkspaces } from "../store/hooks";
import { useUI } from "../store/ui";
import { AvatarStack, Empty, Menu, MenuItem, Page } from "../components/ui";
import { WsBadge } from "../components/icons";
import { ROLE_LABEL } from "../lib/permissions";

export default function Teams() {
  const list = useWorkspaces().filter((w) => w.team);
  const memberships = useDB((s) => s.memberships);
  const users = useDB((s) => s.users);
  const tasks = useDB((s) => s.tasks);
  const projects = useDB((s) => s.projects);
  const leaveTeam = useDB((s) => s.leaveTeam);
  const setActiveWs = useDB((s) => s.setActiveWs);
  const setCreateTeam = useUI((s) => s.setCreateTeam);
  const setJoinTeam = useUI((s) => s.setJoinTeam);
  const setInvite = useUI((s) => s.setInvite);
  const toast = useUI((s) => s.toast);
  const me = useMe();
  const nav = useNavigate();

  const stats = useMemo(() => {
    const out: Record<string, { open: number; mine: number; projects: number }> = {};
    for (const w of list) out[w.id] = { open: 0, mine: 0, projects: 0 };
    for (const t of Object.values(tasks)) {
      const o = out[t.workspaceId];
      if (!o || t.deletedAt || t.status === "done") continue;
      o.open++;
      if (t.assigneeIds.includes(me.id)) o.mine++;
    }
    for (const p of Object.values(projects)) if (out[p.workspaceId] && !p.archivedAt && !p.deletedAt) out[p.workspaceId].projects++;
    return out;
  }, [list, tasks, projects, me.id]);

  return (
    <Page
      title="Teams"
      sub={`You're in ${list.length} team${list.length === 1 ? "" : "s"}`}
      actions={
        <>
          <button className="btn" onClick={() => setJoinTeam(true)}><LogIn size={14} /> Join team</button>
          <button className="btn primary" onClick={() => setCreateTeam(true)}><Plus size={14} /> Create team</button>
        </>
      }
    >
      {list.length === 0 ? (
        <Empty icon={<Users size={22} />} title="No teams yet">Create a team or join one with a code.</Empty>
      ) : (
        <div className="grid-auto" style={{ ["--min" as string]: "280px" }}>
          {list.map((w) => {
            const members = memberships.filter((m) => m.teamId === w.id).map((m) => users[m.userId]);
            const s = stats[w.id];
            return (
              <div key={w.id} className="card hover team-card" role="button" tabIndex={0}
                onClick={() => { setActiveWs(w.id); nav(`/teams/${w.id}`); }}
                onKeyDown={(e) => e.key === "Enter" && (setActiveWs(w.id), nav(`/teams/${w.id}`))}>
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <WsBadge icon={w.icon} color={w.color} size={42} />
                  <div className="grow" style={{ marginLeft: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }} className="ellipsis">{w.name}</div>
                    <div className="card-meta">{w.team!.category} · {ROLE_LABEL[w.role]}</div>
                  </div>
                  <Menu
                    width={200}
                    trigger={(p) => (
                      <button ref={p.ref} onClick={p.onClick} className="icon-btn sm" aria-label="Team options"><MoreHorizontal size={16} /></button>
                    )}
                  >
                    {(close) => (
                      <>
                        {(w.role === "OWNER" || w.role === "ADMIN") && (
                          <MenuItem icon={<UserPlus size={14} />} onClick={() => { setInvite(w.id); close(); }}>Invite member</MenuItem>
                        )}
                        <MenuItem icon={<Users size={14} />} onClick={() => { setActiveWs(w.id); nav(`/teams/${w.id}/members`); close(); }}>Members</MenuItem>
                        {w.role === "OWNER" && (
                          <MenuItem icon={<Settings size={14} />} onClick={() => { setActiveWs(w.id); nav("/settings?tab=team"); close(); }}>Team settings</MenuItem>
                        )}
                        <div className="menu-sep" />
                        <MenuItem danger icon={<LogOut size={14} />} onClick={() => {
                          close();
                          if (!confirm(`Leave ${w.name}?`)) return;
                          const err = leaveTeam(w.id);
                          toast(err ?? `You left ${w.name}`);
                        }}>Leave team</MenuItem>
                      </>
                    )}
                  </Menu>
                </div>
                <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 14px", minHeight: 36 }}>{w.team!.description || "No description."}</p>
                <div className="row">
                  <AvatarStack users={members} max={5} size={24} />
                  <div className="grow" />
                  <div className="team-stat"><b className="num">{s.projects}</b><span>projects</span></div>
                  <div className="team-stat"><b className="num">{s.open}</b><span>open</span></div>
                  <div className="team-stat"><b className="num">{s.mine}</b><span>mine</span></div>
                </div>
              </div>
            );
          })}
          <button className="card hover team-card add" onClick={() => setCreateTeam(true)}>
            <Plus size={20} />
            <b>New team</b>
            <span className="card-meta">Invite people by email, username, link or code</span>
          </button>
        </div>
      )}
    </Page>
  );
}
