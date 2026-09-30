import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ResetPassword from "./pages/ResetPassword";
import { supabaseConfigured } from "./lib/supabase";
import { Scene } from "./components/shell/Shell";
import { useDB } from "./store/db";
import { useUI } from "./store/ui";
import { AppShell } from "./components/shell/Shell";
import { TaskDrawer } from "./components/task/TaskDrawer";
import {
  CommandPalette,
  CreateTeamModal,
  InviteModal,
  JoinTeamModal,
  NewTaskModal,
  NotificationsPanel,
  Toasts,
} from "./components/overlays/Overlays";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Teams from "./pages/Teams";
import TeamHome from "./pages/TeamHome";
import Members from "./pages/Members";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Calendar from "./pages/Calendar";
import Vault from "./pages/Vault";
import InboxPage from "./pages/Inbox";
import Notifications from "./pages/Notifications";
import Activity from "./pages/Activity";
import ArchivePage from "./pages/Archive";
import Settings from "./pages/Settings";

function ThemeSync() {
  const theme = useDB((s) => s.theme);
  const accent = useDB((s) => s.accent);
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    el.style.setProperty("--accent", accent);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#171715" : "#d8d4cd");
  }, [theme, accent]);
  return null;
}

/** Deep link: /anything?task=<id> opens the task drawer. */
function TaskParam() {
  const [params, setParams] = useSearchParams();
  const openTask = useUI((s) => s.openTask);
  const exists = useDB((s) => !!(params.get("task") && s.tasks[params.get("task")!]));
  useEffect(() => {
    const id = params.get("task");
    if (id && exists) {
      openTask(id);
      params.delete("task");
      setParams(params, { replace: true });
    }
  }, [params, exists, openTask, setParams]);
  return null;
}

const JOIN_KEY = "kulii-join";

/** /join/:code — invite links. Signed-out visitors are sent to login and brought back afterwards. */
function JoinRoute({ authed }: { authed: boolean }) {
  const { code = "" } = useParams();
  const joinTeam = useDB((s) => s.joinTeam);
  const setActiveWs = useDB((s) => s.setActiveWs);
  const toast = useUI((s) => s.toast);
  const nav = useNavigate();
  const started = useRef(false);
  useEffect(() => {
    if (!authed) {
      try { sessionStorage.setItem(JOIN_KEY, code); } catch { /* ignore */ }
      nav("/login", { replace: true });
      return;
    }
    if (started.current) return;
    started.current = true;
    try { sessionStorage.removeItem(JOIN_KEY); } catch { /* ignore */ }
    void joinTeam(code).then((r) => {
      toast(r.message);
      if (r.teamId) {
        setActiveWs(r.teamId);
        nav(`/teams/${r.teamId}`, { replace: true });
      } else nav("/", { replace: true });
    });
  }, [authed, code, joinTeam, nav, setActiveWs, toast]);
  return <Splash text="Joining team…" />;
}

function Splash({ text }: { text: string }) {
  return (
    <>
      <Scene />
      <div className="splash">
        <span className="brand-mark" />
        <span className="card-meta">{text}</span>
      </div>
    </>
  );
}

/** Shown when the build had no Supabase settings — e.g. env vars not added on the hosting provider. */
function NotConfigured() {
  return (
    <>
      <ThemeSync />
      <Scene />
      <div className="login-wrap">
        <div className="login-card glass">
          <span className="brand-mark" style={{ display: "block", marginBottom: 18 }} />
          <h1 className="page-title">Kulii isn't configured yet</h1>
          <p className="page-sub" style={{ margin: "8px 0 14px" }}>
            This build is missing its Supabase settings. Add these environment variables where the site is hosted, then redeploy:
          </p>
          <pre className="config-list">VITE_SUPABASE_URL{"\n"}VITE_SUPABASE_ANON_KEY{"\n"}VITE_API_URL</pre>
          <p className="card-meta">On Vercel: Project → Settings → Environment Variables, then Deployments → Redeploy.</p>
        </div>
      </div>
    </>
  );
}

export default function App() {
  if (!supabaseConfigured) return <NotConfigured />;
  return <ConfiguredApp />;
}

function ConfiguredApp() {
  const status = useDB((s) => s.status);
  const init = useDB((s) => s.init);
  const userExists = useDB((s) => !!(s.currentUserId && s.users[s.currentUserId]));
  const authed = status === "ready" && userExists;
  const recovery = useDB((s) => s.recovery);
  const nav = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    void init();
  }, [init]);

  // Opened a password-reset link → make them choose a new password first.
  useEffect(() => {
    if (recovery && pathname !== "/reset-password") nav("/reset-password", { replace: true });
  }, [recovery, pathname, nav]);

  // Resume an invite link that was opened while signed out.
  useEffect(() => {
    if (!authed) return;
    let code: string | null = null;
    try { code = sessionStorage.getItem(JOIN_KEY); } catch { /* ignore */ }
    if (code) nav(`/join/${code}`, { replace: true });
  }, [authed, nav]);

  if (status === "loading") return (<><ThemeSync /><Splash text="Connecting…" /></>);

  return (
    <>
      <ThemeSync />
      <Routes>
        <Route path="/login" element={authed ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/join/:code" element={<JoinRoute authed={authed} />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/*"
          element={
            authed ? (
              <AppShell>
                <TaskParam />
                <Routes>
                  <Route index element={<Dashboard />} />
                  <Route path="tasks" element={<Tasks />} />
                  <Route path="board" element={<Navigate to="/tasks?view=board" replace />} />
                  <Route path="list" element={<Navigate to="/tasks?view=list" replace />} />
                  <Route path="teams" element={<Teams />} />
                  <Route path="teams/:teamId" element={<TeamHome />} />
                  <Route path="teams/:teamId/members" element={<Members />} />
                  <Route path="members" element={<Members />} />
                  <Route path="projects" element={<Projects />} />
                  <Route path="projects/:projectId" element={<ProjectDetail />} />
                  <Route path="calendar" element={<Calendar />} />
                  <Route path="vault" element={<Vault />} />
                  <Route path="inbox" element={<InboxPage />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="activity" element={<Activity />} />
                  <Route path="archive" element={<ArchivePage />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <TaskDrawer />
                <CommandPalette />
                <NotificationsPanel />
                <CreateTeamModal />
                <JoinTeamModal />
                <InviteModal />
                <NewTaskModal />
              </AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
      <Toasts />
    </>
  );
}
