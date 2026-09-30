import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound } from "lucide-react";
import { useDB } from "../store/db";
import { useUI } from "../store/ui";
import { Scene } from "../components/shell/Shell";

/** Landing page for the "reset password" email link. supabase-js signs the user in from the link first. */
export default function ResetPassword() {
  const status = useDB((s) => s.status);
  const updatePassword = useDB((s) => s.updatePassword);
  const toast = useUI((s) => s.toast);
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setErr("Password needs at least 8 characters");
    if (pw !== pw2) return setErr("Passwords don't match");
    setBusy(true);
    const r = await updatePassword(pw);
    setBusy(false);
    if (r) return setErr(r);
    toast("Password updated");
    nav("/", { replace: true });
  };

  return (
    <>
      <Scene />
      <div className="login-wrap">
        <div className="login-card glass">
          <span className="tile" style={{ width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", marginBottom: 14 }}>
            <KeyRound size={20} style={{ color: "var(--accent)" }} />
          </span>
          <h1 className="page-title">Choose a new password</h1>
          {status !== "ready" ? (
            <>
              <p className="page-sub" style={{ margin: "6px 0 18px" }}>This reset link is invalid or has expired. Request a new one from the sign-in page.</p>
              <button className="btn primary" style={{ height: 40, width: "100%" }} onClick={() => nav("/login", { replace: true })}>Back to sign in</button>
            </>
          ) : (
            <form className="stack" onSubmit={submit} style={{ marginTop: 18 }}>
              <input className="input" type="password" placeholder="New password (8+ characters)" autoFocus autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <input className="input" type="password" placeholder="Repeat new password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              {err && <div className="card-meta" style={{ color: "var(--danger)" }}>{err}</div>}
              <button className="btn primary" style={{ height: 40 }} type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save password"} {!busy && <ArrowRight size={14} />}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
