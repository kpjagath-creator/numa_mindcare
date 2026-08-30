// Authenticated user's own "Change Password" screen.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import { useToast } from "../../components/ui/Toast";
import * as authApi from "../../api/auth";

interface FormValues {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [values, setValues] = useState<FormValues>({ current_password: "", new_password: "", confirm_password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(field: keyof FormValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (error) setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (values.new_password.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (values.new_password !== values.confirm_password) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await authApi.changePassword(values.current_password, values.new_password, values.confirm_password);
      showToast("Password changed successfully.", "success");
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Failed to change password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout title="Change Password">
      <div style={s.card}>
        <h2 style={s.heading}>Change Password</h2>
        {error && <p style={s.apiError}>{error}</p>}
        <form onSubmit={handleSubmit} noValidate>
          <div style={s.stack}>
            <Field label="Current Password *">
              <input
                type="password"
                style={s.input}
                value={values.current_password}
                onChange={(e) => handleChange("current_password", e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New Password *">
              <input
                type="password"
                style={s.input}
                value={values.new_password}
                onChange={(e) => handleChange("new_password", e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm New Password *">
              <input
                type="password"
                style={s.input}
                value={values.confirm_password}
                onChange={(e) => handleChange("confirm_password", e.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <div style={s.actions}>
            <button type="button" style={s.cancelBtn} onClick={() => navigate("/")}>
              Cancel
            </button>
            <button type="submit" style={s.submitBtn} disabled={submitting}>
              {submitting ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Saving…
                </span>
              ) : "Change Password"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
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
  card: { background: "#fff", borderRadius: 12, padding: 28, maxWidth: 420, boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)", border: "1px solid #ddd5cb" },
  heading: { marginTop: 0, marginBottom: 22, fontSize: 14, fontWeight: 700, color: "#0F172A" },
  apiError: { color: "#b91c1c", background: "#fee2e2", padding: "9px 13px", borderRadius: 6, marginBottom: 18, fontSize: 12 },
  stack: { display: "flex", flexDirection: "column", gap: 18, marginBottom: 24 },
  input: { padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#0F172A", outline: "none", background: "#fdfbf9", width: "100%", boxSizing: "border-box" },
  actions: { display: "flex", gap: 10, justifyContent: "flex-end" },
  cancelBtn: { padding: "8px 18px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer", color: "#64748b" },
  submitBtn: { padding: "8px 20px", border: "none", borderRadius: 6, background: "#3D9E8E", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
};
