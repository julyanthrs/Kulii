import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Moon, Sun } from "lucide-react";
import { useDB } from "../store/db";
import { Scene } from "../components/shell/Shell";
import { Avatar } from "../components/ui";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../data/seed";
import { cx } from "../lib/utils";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ id: "", password: "", name: "", email: "", username: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const login = useDB((s) => s.login);
  const register = useDB((s) => s.register);
  const theme = useDB((s) => s.theme);
  const setTheme = useDB((s) => s.setTheme);
  const nav = useNavigate();

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setErr("");
    const res = await fn();
    setBusy(false);
    if (res) return setErr(res);
    nav("/");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === "login") return void run(() => login(f.id, f.password));
    if (f.password.length < 8) return setErr("Password needs at least 8 characters");
    void run(() => register({ name: f.name.trim(), email: f.email.trim(), username: f.username.trim().replace(/^@/, ""), password: f.password }));
  };

  return (
    <>
      <Scene />
      <div className="login-wrap">
        <div className="login-card glass">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 26 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="brand-mark" />
              <b style={{ fontSize: 15, letterSpacing: "-0.01em" }}>Kulii</b>
            </div>
            <div className="seg sm">
              <button className={cx(theme === "light" && "on")} onClick={() => setTheme("light")} aria-label="Light"><Sun size={12} /></button>
              <button className={cx(theme === "dark" && "on")} onClick={() => setTheme("dark")} aria-label="Dark"><Moon size={12} /></button>
            </div>
          </div>

          <h1 className="page-title">{mode === "login" ? "Welcome back" : "Create your workspace"}</h1>
          <p className="page-sub" style={{ marginBottom: 20 }}>
            {mode === "login" ? "Sign in to your tasks, teams and Vault." : "A personal workspace is created for you automatically."}
          </p>

          <form className="stack" onSubmit={submit}>
            {mode === "register" && (
              <>
                <input className="input" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus required />
                <div className="field-row">
                  <input className="input" placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" />
                  <input className="input" placeholder="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required autoComplete="username" />
                </div>
              </>
            )}
            {mode === "login" && (
              <input className="input" placeholder="Email or username" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} autoFocus autoComplete="username" required />
            )}
            <input className="input" placeholder={mode === "login" ? "Password" : "Password (8+ characters)"} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
              autoComplete={mode === "login" ? "current-password" : "new-password"} required />
            {err && <div className="card-meta" style={{ color: "var(--danger)" }}>{err}</div>}
            <button className="btn primary" style={{ height: 40 }} type="submit" disabled={busy}>
              {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"} {!busy && <ArrowRight size={14} />}
            </button>
          </form>

          <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
            <span className="card-meta">{mode === "login" ? "New here?" : "Already have an account?"}</span>
            <button className="btn sm ghost" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>

          {mode === "login" && (
            <>
              <div className="divider" style={{ margin: "18px 0 12px" }} />
              <div className="label" style={{ marginBottom: 8 }}>Sample accounts</div>
              <div className="stack" style={{ gap: 2 }}>
                {DEMO_ACCOUNTS.slice(0, 5).map((u) => (
                  <button key={u.id} className="list-row clickable" style={{ width: "100%", textAlign: "left" }} disabled={busy}
                    onClick={() => void run(() => login(u.username, DEMO_PASSWORD))}>
                    <Avatar user={u} size={28} />
                    <div className="grow">
                      <div style={{ fontWeight: 500 }}>{u.name}</div>
                      <div className="card-meta">{u.title}</div>
                    </div>
                    <ArrowRight size={14} className="faint" />
                  </button>
                ))}
              </div>
              <div className="card-meta" style={{ marginTop: 10 }}>Sample accounts use the password “{DEMO_PASSWORD}”.</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
