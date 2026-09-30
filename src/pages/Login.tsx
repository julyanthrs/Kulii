import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, MailCheck, Moon, Sun } from "lucide-react";
import { useDB } from "../store/db";
import { Scene } from "../components/shell/Shell";
import { cx } from "../lib/utils";

type Mode = "login" | "register" | "forgot" | "sent-confirm" | "sent-reset";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [f, setF] = useState({ email: "", password: "", name: "", username: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const login = useDB((s) => s.login);
  const register = useDB((s) => s.register);
  const sendPasswordReset = useDB((s) => s.sendPasswordReset);
  const theme = useDB((s) => s.theme);
  const setTheme = useDB((s) => s.setTheme);
  const nav = useNavigate();

  const go = (m: Mode) => {
    setMode(m);
    setErr("");
  };

  const signIn = async (email: string, password: string) => {
    setBusy(true);
    setErr("");
    const e = await login(email, password);
    setBusy(false);
    if (e) return setErr(e);
    nav("/");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === "login") return signIn(f.email, f.password);
    setBusy(true);
    setErr("");
    if (mode === "register") {
      if (f.password.length < 8) {
        setBusy(false);
        return setErr("Password needs at least 8 characters");
      }
      const r = await register({ name: f.name, email: f.email, username: f.username, password: f.password });
      setBusy(false);
      if (r.error) return setErr(r.error);
      if (r.needsConfirm) return go("sent-confirm");
      return nav("/");
    }
    if (mode === "forgot") {
      const r = await sendPasswordReset(f.email);
      setBusy(false);
      if (r) return setErr(r);
      go("sent-reset");
    }
  };

  const title = { login: "Welcome back", register: "Create your account", forgot: "Reset your password", "sent-confirm": "Check your email", "sent-reset": "Check your email" }[mode];
  const sub = {
    login: "Sign in to your tasks, teams and Vault.",
    register: "A personal workspace is created for you automatically.",
    forgot: "We'll email you a link to choose a new password.",
    "sent-confirm": `We sent a confirmation link to ${f.email}. Open it to activate your account, then sign in.`,
    "sent-reset": `If an account exists for ${f.email}, a reset link is on its way.`,
  }[mode];

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

          {(mode === "sent-confirm" || mode === "sent-reset") && (
            <span className="tile" style={{ width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", marginBottom: 14 }}>
              <MailCheck size={20} style={{ color: "var(--accent)" }} />
            </span>
          )}
          <h1 className="page-title">{title}</h1>
          <p className="page-sub" style={{ marginBottom: 20 }}>{sub}</p>

          {mode === "sent-confirm" || mode === "sent-reset" ? (
            <button className="btn primary" style={{ height: 40, width: "100%" }} onClick={() => go("login")}>
              <ArrowLeft size={14} /> Back to sign in
            </button>
          ) : (
            <form className="stack" onSubmit={submit}>
              {mode === "register" && (
                <div className="field-row">
                  <input className="input" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus required maxLength={80} />
                  <input className="input" placeholder="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required autoComplete="username" maxLength={30} />
                </div>
              )}
              <input className="input" placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}
                autoFocus={mode !== "register"} autoComplete="email" required />
              {mode !== "forgot" && (
                <input className="input" placeholder={mode === "login" ? "Password" : "Password (8+ characters)"} type="password" value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
              )}
              {mode === "login" && (
                <button type="button" className="card-meta" style={{ alignSelf: "flex-end", marginTop: -4 }} onClick={() => go("forgot")}>
                  Forgot password?
                </button>
              )}
              {err && <div className="card-meta" style={{ color: "var(--danger)" }}>{err}</div>}
              <button className="btn primary" style={{ height: 40 }} type="submit" disabled={busy}>
                {busy ? "One moment…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"}
                {!busy && <ArrowRight size={14} />}
              </button>
            </form>
          )}

          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
              <span className="card-meta">{mode === "login" ? "New here?" : mode === "register" ? "Already have an account?" : "Remembered it?"}</span>
              <button className="btn sm ghost" onClick={() => go(mode === "login" ? "register" : "login")}>
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
