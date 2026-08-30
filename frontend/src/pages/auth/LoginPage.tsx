// /login — the only route reachable while unauthenticated.

import { useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    const redirectTo = (location.state as any)?.from?.pathname ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate("/", { replace: true });
    } catch {
      // Deliberately generic — never reveal whether the username exists.
      setError("Invalid username or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.brand}>
          <div style={s.logoWrap}>
            <img
              src="/logo.png"
              alt=""
              style={s.logo}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <span style={s.brandText}>Numa Mindcare</span>
        </div>
        <p style={s.subtitle}>Sign in to your account</p>

        {error && <p style={s.apiError}>{error}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div style={s.stack}>
            <Field label="Username">
              <input
                style={s.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                placeholder="admin"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                style={s.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>
          </div>

          <button type="submit" style={s.submitBtn} disabled={submitting}>
            {submitting ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Signing in…
              </span>
            ) : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{label}</label>
      {children}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F7F2EC",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    background: "#fff",
    borderRadius: 14,
    padding: "32px 30px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.06)",
    border: "1px solid #ddd5cb",
  },
  brand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4, justifyContent: "center" },
  logoWrap: {
    width: 36, height: 36,
    borderRadius: "50%",
    background: "linear-gradient(170deg, #0D3D36 0%, #2E7D70 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  logo: { width: 28, height: 28, objectFit: "contain" },
  brandText: { fontWeight: 800, fontSize: 18, color: "#0F172A", letterSpacing: "-0.02em" },
  subtitle: { textAlign: "center", color: "#94A3B8", fontSize: 13, marginTop: 0, marginBottom: 24 },
  apiError: { color: "#b91c1c", background: "#fee2e2", padding: "9px 13px", borderRadius: 6, marginBottom: 18, fontSize: 12 },
  stack: { display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 },
  input: { padding: "10px 12px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 13, color: "#0F172A", outline: "none", background: "#fdfbf9", width: "100%", boxSizing: "border-box" },
  submitBtn: { width: "100%", padding: "10px 18px", border: "none", borderRadius: 6, background: "#3D9E8E", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" },
};
