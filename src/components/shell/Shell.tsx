import { useEffect, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  FolderKanban,
  History,
  Home,
  Inbox,
  Library,
  ListChecks,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { useDB } from "../../store/db";
import { useActiveWorkspace, useMe, useWorkspaces } from "../../store/hooks";
import { useUI } from "../../store/ui";
import { cx, firstName } from "../../lib/utils";
import { Avatar, Menu, MenuItem, presenceColor, presenceLabel } from "../ui";
import { WsBadge } from "../icons";
import { ROLE_LABEL } from "../../lib/permissions";
import type { Availability } from "../../data/types";

const NAV = [
  { to: "/tasks", label: "My Tasks", icon: ListChecks },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/vault", label: "Vault", icon: Library },
  { to: "/inbox", label: "Inbox", icon: Inbox },
];

export function Scene() {
  return (
    <div className="scene" aria-hidden>
      <i className="s1" />
      <i className="s2" />
      <i className="s3" />
      <i className="s4" />
      <i className="s5" />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const setPalette = useUI((s) => s.setPalette);
  const location = useLocation();
  const activeWs = useDB((s) => s.activeWs);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette]);

  const section = location.pathname.split("/")[1] || "home";

  return (
    <>
      <Scene />
      <div className="shell">
        <TopBar />
        <Dock />
        <main className="main">
          <div className="main-panel glass">
            <div className="ws-fade" key={`${activeWs}:${section}`}>
              {children}
            </div>
          </div>
        </main>
      </div>
      <MobileNav />
    </>
  );
}

/* ---------------- Top bar ---------------- */

function TopBar() {
  const me = useMe();
  const theme = useDB((s) => s.theme);
  const setTheme = useDB((s) => s.setTheme);
  const setPalette = useUI((s) => s.setPalette);
  const setNotifications = useUI((s) => s.setNotifications);
  const notifications = useDB((s) => s.notifications);
  const unread = notifications.filter((n) => n.userId === me.id && !n.read).length;

  return (
    <header className="topbar">
      <div className="topbar-pill glass-float">
        <ProfileMenu>
          {(p) => (
            <button ref={p.ref} onClick={p.onClick} className="welcome" aria-label="Profile menu">
              <Avatar user={me} size={40} presence />
              <span className="hide-sm">
                Welcome, <b>{firstName(me.name)}</b>
              </span>
            </button>
          )}
        </ProfileMenu>

        <button className="cmd-field" onClick={() => setPalette(true)} aria-label="Search">
          <i className="orb" />
          <span>Search tasks, projects, people…</span>
          <span className="kbd hide-sm">Ctrl K</span>
        </button>

        <div className="topbar-right">
          <WorkspaceMenu />
          <div className="seg hide-md" role="group" aria-label="Theme">
            <button className={cx(theme === "light" && "on")} onClick={() => setTheme("light")}>
              <Sun size={13} /> Light
            </button>
            <button className={cx(theme === "dark" && "on")} onClick={() => setTheme("dark")}>
              <Moon size={13} /> Dark
            </button>
          </div>
        </div>
      </div>
      <button
        className="icon-btn lg glass-float"
        style={{ width: 54, height: 54, position: "relative" }}
        onClick={() => setNotifications(true)}
        aria-label="Notifications"
        data-tip="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className="num"
            style={{
              position: "absolute", top: 9, right: 9, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999,
              background: "var(--p-urgent)", color: "#fff", fontSize: 9.5, fontWeight: 700, display: "grid", placeItems: "center",
              boxShadow: "0 0 0 2px var(--glass-strong)",
            }}
          >
            {unread}
          </span>
        )}
      </button>
    </header>
  );
}

function WorkspaceMenu() {
  const active = useActiveWorkspace();
  const list = useWorkspaces();
  const setActiveWs = useDB((s) => s.setActiveWs);
  const setCreateTeam = useUI((s) => s.setCreateTeam);
  const setJoinTeam = useUI((s) => s.setJoinTeam);
  return (
    <Menu
      width={240}
      trigger={(p) => (
        <button ref={p.ref} onClick={p.onClick} className="btn" style={{ height: 38, paddingLeft: 6, gap: 8 }} aria-label="Switch workspace">
          <WsBadge icon={active.icon} color={active.color} size={26} />
          <span className="hide-sm ellipsis" style={{ maxWidth: 120 }}>{active.name}</span>
          <ChevronDown size={14} className="muted" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-label">Workspaces</div>
          {list.map((w) => (
            <MenuItem
              key={w.id}
              icon={<WsBadge icon={w.icon} color={w.color} size={20} />}
              end={w.id === active.id ? <Check size={14} /> : w.team ? ROLE_LABEL[w.role] : "Private"}
              onClick={() => {
                setActiveWs(w.id);
                close();
              }}
            >
              {w.name}
            </MenuItem>
          ))}
          <div className="menu-sep" />
          <MenuItem icon={<Plus size={15} />} onClick={() => { setCreateTeam(true); close(); }}>Create team</MenuItem>
          <MenuItem icon={<LogIn size={15} />} onClick={() => { setJoinTeam(true); close(); }}>Join with code</MenuItem>
        </>
      )}
    </Menu>
  );
}

export function ProfileMenu({ children, align = "start" }: { children: (p: { ref: React.RefObject<any>; onClick: (e: React.MouseEvent) => void }) => ReactNode; align?: "start" | "end" }) {
  const me = useMe();
  const live = useDB((s) => s.live);
  const updateProfile = useDB((s) => s.updateProfile);
  const logout = useDB((s) => s.logout);
  const nav = useNavigate();
  return (
    <Menu width={260} align={align} trigger={children}>
      {(close) => (
        <>
          <div className="row" style={{ padding: "8px 9px 10px" }}>
            <Avatar user={me} size={34} presence />
            <div className="grow">
              <div style={{ fontWeight: 600 }} className="ellipsis">{me.name}</div>
              <div className="card-meta ellipsis">{me.email}</div>
            </div>
            <span className={cx("sync-pill", live && "on")} title={live ? "Changes sync in real time" : "Reconnecting to the server…"}>
              <i />{live ? "Live" : "Offline"}
            </span>
          </div>
          <div className="row" style={{ padding: "0 6px 6px", gap: 4 }}>
            {(Object.keys(presenceLabel) as Availability[]).map((a) => (
              <button
                key={a}
                className={cx("chip-btn", me.availability === a && "active")}
                style={{ height: 24, padding: "0 7px", fontSize: 10.5 }}
                onClick={() => updateProfile({ availability: a })}
              >
                <i className="pdot" style={{ background: presenceColor[a] }} />
                {presenceLabel[a]}
              </button>
            ))}
          </div>
          <div className="menu-sep" />
          <MenuItem icon={<History size={15} />} onClick={() => { nav("/activity"); close(); }}>Activity</MenuItem>
          <MenuItem icon={<Archive size={15} />} onClick={() => { nav("/archive"); close(); }}>Archive</MenuItem>
          <MenuItem icon={<Trash2 size={15} />} onClick={() => { nav("/archive?tab=trash"); close(); }}>Trash</MenuItem>
          <MenuItem icon={<Settings size={15} />} onClick={() => { nav("/settings"); close(); }}>Settings</MenuItem>
          <div className="menu-sep" />
          <MenuItem icon={<LogOut size={15} />} onClick={() => { close(); void logout().then(() => nav("/login")); }}>Log out</MenuItem>
        </>
      )}
    </Menu>
  );
}

/* ---------------- Dock ---------------- */

function Dock() {
  const me = useMe();
  const setPalette = useUI((s) => s.setPalette);
  const inboxCount = useDB((s) => s.inbox.filter((i) => i.userId === me.id).length);
  const location = useLocation();
  const homeActive = location.pathname === "/";
  return (
    <nav className="dock-wrap" aria-label="Main">
      <NavLink to="/" className={cx("dock-home glass-float")} aria-label="Home" data-tip="Overview" data-tip-side="right">
        <span className={cx("dock-btn", homeActive && "active")}>
          <Home size={17} />
        </span>
      </NavLink>
      <div className="dock glass-float">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => cx("dock-btn", isActive && "active")}
            aria-label={n.label}
            data-tip={n.label}
            data-tip-side="right"
          >
            <n.icon size={17} strokeWidth={1.8} />
            {n.to === "/inbox" && inboxCount > 0 && <i className="dot" />}
          </NavLink>
        ))}
        <span className="dock-sep" />
        <button className="dock-btn" onClick={() => setPalette(true)} aria-label="Search" data-tip="Search  Ctrl K" data-tip-side="right">
          <Search size={17} strokeWidth={1.8} />
        </button>
        <NavLink to="/settings" className={({ isActive }) => cx("dock-btn", isActive && "active")} aria-label="Settings" data-tip="Settings" data-tip-side="right">
          <Settings size={17} strokeWidth={1.8} />
        </NavLink>
        <ProfileMenu>
          {(p) => (
            <button ref={p.ref} onClick={p.onClick} className="dock-btn" aria-label="Profile" data-tip="Profile" data-tip-side="right">
              <Avatar user={me} size={26} />
            </button>
          )}
        </ProfileMenu>
      </div>
    </nav>
  );
}

/* ---------------- Mobile bottom navigation ---------------- */

function MobileNav() {
  const setPalette = useUI((s) => s.setPalette);
  const items = [{ to: "/", label: "Home", icon: Home }, ...NAV.slice(0, 4), { to: "/vault", label: "Vault", icon: Library }];
  return (
    <nav className="mobile-nav glass-float" aria-label="Mobile">
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => cx("dock-btn", isActive && "active")} aria-label={n.label}>
          <n.icon size={18} />
        </NavLink>
      ))}
      <button className="dock-btn" onClick={() => setPalette(true)} aria-label="Search">
        <Search size={18} />
      </button>
    </nav>
  );
}
