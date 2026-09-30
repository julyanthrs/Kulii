import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, LogOut, Moon, RotateCcw, Sun, Trash2 } from "lucide-react";
import { useDB } from "../store/db";
import { useActiveWorkspace, useMe, usePerm } from "../store/hooks";
import { useUI } from "../store/ui";
import { cx } from "../lib/utils";
import { Avatar, Page, Toggle, presenceLabel } from "../components/ui";
import { TEAM_COLORS, TEAM_ICONS, WsBadge } from "../components/icons";
import type { Availability } from "../data/types";
import { ROLE_LABEL } from "../lib/permissions";

const ACCENTS = [
  { name: "Sage", c: "#3FAF5A" },
  { name: "Graphite", c: "#5C5A55" },
  { name: "Harbor", c: "#4F7CAC" },
  { name: "Amber", c: "#C98A2E" },
  { name: "Clay", c: "#B8654A" },
  { name: "Plum", c: "#8B6A9E" },
];

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const ws = useActiveWorkspace();
  const tab = params.get("tab") ?? "profile";
  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "appearance", label: "Appearance" },
    ...(ws.team ? [{ id: "team", label: `Team · ${ws.name}` }] : []),
    { id: "data", label: "Account" },
  ];
  return (
    <Page title="Settings" sub="Personal preferences apply everywhere; team settings apply to everyone in the team.">
      <div className="settings">
        <nav className="settings-nav">
          {tabs.map((t) => (
            <button key={t.id} className={cx("settings-tab", tab === t.id && "on")} onClick={() => setParams({ tab: t.id })}>{t.label}</button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === "profile" && <Profile />}
          {tab === "appearance" && <Appearance />}
          {tab === "team" && ws.team && <TeamSettings />}
          {tab === "data" && <DataSettings />}
        </div>
      </div>
    </Page>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card settings-section">
      <div style={{ marginBottom: 14 }}>
        <div className="card-title" style={{ fontSize: 13.5 }}>{title}</div>
        {sub && <div className="card-meta" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </section>
  );
}

function Profile() {
  const me = useMe();
  const updateProfile = useDB((s) => s.updateProfile);
  const toast = useUI((s) => s.toast);
  const [f, setF] = useState({ name: me.name, title: me.title, email: me.email, username: me.username });
  useEffect(() => setF({ name: me.name, title: me.title, email: me.email, username: me.username }), [me.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Section title="Profile" sub="How teammates see you.">
        <div className="row" style={{ gap: 14, marginBottom: 14 }}>
          <Avatar user={me} size={56} presence />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{me.name}</div>
            <div className="card-meta">@{me.username}</div>
          </div>
        </div>
        <div className="field-row">
          <label className="field"><span>Full name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field"><span>Title</span><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="field"><span>Email</span><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="field"><span>Username</span><input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn primary" onClick={() => { updateProfile(f); toast("Profile saved"); }}>Save changes</button>
        </div>
      </Section>
      <Section title="Availability" sub="Shown next to your avatar across teams.">
        <div className="row wrap" style={{ gap: 6 }}>
          {(Object.keys(presenceLabel) as Availability[]).map((a) => (
            <button key={a} className={cx("chip-btn", me.availability === a && "active")} onClick={() => updateProfile({ availability: a })}>{presenceLabel[a]}</button>
          ))}
        </div>
      </Section>
    </>
  );
}

function Appearance() {
  const theme = useDB((s) => s.theme);
  const setTheme = useDB((s) => s.setTheme);
  const accent = useDB((s) => s.accent);
  const setAccent = useDB((s) => s.setAccent);
  return (
    <>
      <Section title="Theme" sub="Both themes keep the same frosted material.">
        <div className="theme-pick">
          {(["light", "dark"] as const).map((t) => (
            <button key={t} className={cx("theme-card", t, theme === t && "on")} onClick={() => setTheme(t)}>
              <span className="theme-preview"><i /><i /><i /></span>
              <span className="row" style={{ gap: 6 }}>{t === "light" ? <Sun size={13} /> : <Moon size={13} />}{t === "light" ? "Light" : "Dark"}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Accent color" sub="One restrained accent is used for progress, toggles and completion.">
        <div className="row wrap" style={{ gap: 10 }}>
          {ACCENTS.map((a) => (
            <button key={a.c} className={cx("accent-pick", accent === a.c && "on")} onClick={() => setAccent(a.c)} aria-label={a.name}>
              <span style={{ background: a.c }}>{accent === a.c && <Check size={13} color="#fff" />}</span>
              <small>{a.name}</small>
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

function TeamSettings() {
  const ws = useActiveWorkspace();
  const team = ws.team!;
  const perm = usePerm();
  const updateTeam = useDB((s) => s.updateTeam);
  const deleteTeam = useDB((s) => s.deleteTeam);
  const leaveTeam = useDB((s) => s.leaveTeam);
  const toast = useUI((s) => s.toast);
  const nav = useNavigate();
  const canEdit = perm.can("team.settings");
  const [f, setF] = useState({ name: team.name, description: team.description, category: team.category });
  useEffect(() => setF({ name: team.name, description: team.description, category: team.category }), [team.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Section title="Team profile" sub={canEdit ? "Visible to all members." : `Only owners can change team settings — you're ${ROLE_LABEL[ws.role].toLowerCase()}.`}>
        <div className="row" style={{ gap: 14, marginBottom: 14 }}>
          <WsBadge icon={team.icon} color={team.color} size={52} />
          <div className="stack grow" style={{ gap: 8 }}>
            <input className="input" disabled={!canEdit} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input className="input" disabled={!canEdit} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Category" />
          </div>
        </div>
        <textarea className="textarea" disabled={!canEdit} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        {canEdit && (
          <>
            <div className="label" style={{ margin: "14px 0 6px" }}>Icon</div>
            <div className="row wrap" style={{ gap: 4 }}>
              {Object.entries(TEAM_ICONS).filter(([k]) => k !== "user").map(([k, I]) => (
                <button key={k} className={cx("icon-btn solid", team.icon === k && "picked")} onClick={() => updateTeam(team.id, { icon: k })} aria-label={k}><I size={15} /></button>
              ))}
            </div>
            <div className="label" style={{ margin: "14px 0 6px" }}>Color</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {TEAM_COLORS.map((c) => (
                <button key={c} className={cx("swatch", team.color === c && "picked")} style={{ background: c }} onClick={() => updateTeam(team.id, { color: c })} aria-label={c} />
              ))}
            </div>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn primary" disabled={!f.name.trim()} onClick={() => { updateTeam(team.id, { ...f, name: f.name.trim() }); toast("Team updated"); }}>Save changes</button>
            </div>
          </>
        )}
      </Section>
      <Section title="Permissions">
        <label className="row" style={{ justifyContent: "space-between" }}>
          <span>
            <div style={{ fontWeight: 500 }}>Members can create tasks</div>
            <div className="card-meta">When off, only owners and admins can add tasks.</div>
          </span>
          <Toggle on={team.membersCanCreateTasks} disabled={!canEdit} onChange={(v) => updateTeam(team.id, { membersCanCreateTasks: v })} label="Members can create tasks" />
        </label>
      </Section>
      <Section title="Danger zone">
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn danger" onClick={() => {
            if (!confirm(`Leave ${team.name}?`)) return;
            const err = leaveTeam(team.id);
            toast(err ?? `You left ${team.name}`);
            if (!err) nav("/teams");
          }}><LogOut size={13} /> Leave team</button>
          {perm.can("team.delete") && (
            <button className="btn danger" onClick={() => {
              if (prompt(`Type "${team.name}" to permanently delete this team and all its tasks, projects and Vault links.`) !== team.name) return;
              deleteTeam(team.id);
              toast("Team deleted");
              nav("/teams");
            }}><Trash2 size={13} /> Delete team</button>
          )}
        </div>
      </Section>
    </>
  );
}

function DataSettings() {
  const logout = useDB((s) => s.logout);
  const live = useDB((s) => s.live);
  const resync = useDB((s) => s.resync);
  const toast = useUI((s) => s.toast);
  const nav = useNavigate();
  return (
    <>
      <Section title="Sync" sub="Your workspace is stored on the server and updates live across every signed-in device.">
        <div className="row">
          <span className={cx("sync-pill", live && "on")}><i />{live ? "Live" : "Offline — reconnecting"}</span>
          <div className="grow" />
          <button className="btn" onClick={() => void resync().then(() => toast("Synced with the server"))}><RotateCcw size={13} /> Sync now</button>
        </div>
      </Section>
      <Section title="Session">
        <button className="btn" onClick={() => void logout().then(() => nav("/login"))}><LogOut size={13} /> Log out</button>
      </Section>
    </>
  );
}
