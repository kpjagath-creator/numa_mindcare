// Add team member page — validated form that POSTs to /api/v1/team-members.
// On success, navigates back to the team list.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import { createTeamMember } from "../../api/teamMembers";
import type { EmployeeType } from "../../types/index";

function getAdminName(): string {
  try {
    const stored = localStorage.getItem("admin_name");
    if (stored) return stored;
  } catch {}
  return "Admin";
}

function setAdminName(name: string) {
  try { localStorage.setItem("admin_name", name); } catch {}
}

interface FormValues {
  name: string;
  employee_type: EmployeeType | "";
}

interface FormErrors {
  name?: string;
  employee_type?: string;
}

function validate(v: FormValues): FormErrors {
  const errs: FormErrors = {};
  if (!v.name.trim()) errs.name = "Name is required.";
  if (!v.employee_type) errs.employee_type = "Employee type is required.";
  return errs;
}

export default function AddTeamMemberPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>({ name: "", employee_type: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [adminName] = useState(() => getAdminName());

  function handleChange(field: keyof FormValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    setApiError(null);
    try {
      await createTeamMember({
        name: values.name.trim(),
        employee_type: values.employee_type as EmployeeType,
      });
      navigate("/team");
    } catch {
      setApiError("Failed to add team member. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout title="Add Team Member">
      <div style={s.card}>
        <h2 style={s.heading}>New Team Member</h2>
        {apiError && <p style={s.apiError}>{apiError}</p>}
        <form onSubmit={handleSubmit} noValidate>
          <div style={s.stack}>
            <Field label="Full Name *" error={errors.name}>
              <input
                style={s.input}
                value={values.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Dr. Meera Nair"
              />
            </Field>
            <Field label="Employee Type *" error={errors.employee_type}>
              <select
                style={s.select}
                value={values.employee_type}
                onChange={(e) => handleChange("employee_type", e.target.value)}
              >
                <option value="">Select a type…</option>
                <option value="psychologist">Psychologist</option>
                <option value="psychiatrist">Psychiatrist</option>
              </select>
            </Field>
          </div>
          <div style={s.actions}>
            <button type="button" style={s.cancelBtn} onClick={() => navigate("/team")}>
              Cancel
            </button>
            <button type="submit" style={s.submitBtn} disabled={submitting}>
              {submitting ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Adding…
                </span>
              ) : "Add Team Member"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{label}</label>
      {children}
      {error && <span style={{ fontSize: 11, color: "#b91c1c" }}>{error}</span>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: { background: "#fff", borderRadius: 12, padding: 28, maxWidth: 480, boxShadow: "0 1px 2px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)", border: "1px solid #ddd5cb" },
  heading: { marginTop: 0, marginBottom: 22, fontSize: 14, fontWeight: 700, color: "#1a2535" },
  apiError: { color: "#b91c1c", background: "#fee2e2", padding: "9px 13px", borderRadius: 6, marginBottom: 18, fontSize: 12 },
  stack: { display: "flex", flexDirection: "column", gap: 18, marginBottom: 24 },
  input: { padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", outline: "none", background: "#fdfbf9" },
  select: { padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", background: "#fdfbf9", cursor: "pointer" },
  actions: { display: "flex", gap: 10, justifyContent: "flex-end" },
  cancelBtn: { padding: "8px 18px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer", color: "#64748b" },
  submitBtn: { padding: "8px 20px", border: "none", borderRadius: 6, background: "#2d6b5f", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
};
