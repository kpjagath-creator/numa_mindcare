// Register patient page — validated form that POSTs to /api/v1/patients.
// On success, navigates to the new patient's profile page.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import { createPatient } from "../../api/patients";
import { listTeamMembers } from "../../api/teamMembers";
import type { TeamMember } from "../../types/index";

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
  mobile: string;
  email: string;
  age: string;
  source: string;
  referred_by: string;
  therapist_id: string;
}

interface FormErrors {
  name?: string;
  mobile?: string;
  email?: string;
  age?: string;
}

const INITIAL: FormValues = { name: "", mobile: "", email: "", age: "", source: "", referred_by: "", therapist_id: "" };

function validate(v: FormValues): FormErrors {
  const errs: FormErrors = {};
  if (!v.name.trim()) errs.name = "Name is required.";
  if (!/^\d{10}$/.test(v.mobile)) errs.mobile = "Mobile must be exactly 10 digits.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.email = "Enter a valid email address.";
  const age = parseInt(v.age, 10);
  if (!v.age || isNaN(age) || age < 1 || age > 120) errs.age = "Age must be a whole number between 1 and 120.";
  return errs;
}

export default function RegisterPatientPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>(INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [therapists, setTherapists] = useState<TeamMember[]>([]);
  const [adminName] = useState(() => getAdminName());

  function handleBlur(field: string) {
    setTouched((t) => ({ ...t, [field]: true }));
    const fieldKey = field as keyof FormErrors;
    const errs = validate(values);
    setErrors((e) => ({ ...e, [fieldKey]: errs[fieldKey] }));
  }

  useEffect(() => {
    void listTeamMembers().then((members) => setTherapists(members.filter((m) => m.isActive))).catch(() => {});
  }, []);

  function handleChange(field: keyof FormValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field as keyof FormErrors]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    setApiError(null);
    try {
      const patient = await createPatient({
        name: values.name.trim(),
        mobile: values.mobile,
        email: values.email.trim(),
        age: parseInt(values.age, 10),
        source: values.source.trim() || undefined,
        referred_by: values.referred_by.trim() || undefined,
        therapist_id: values.therapist_id ? parseInt(values.therapist_id, 10) : undefined,
      });
      navigate(`/patients/${patient.id}`);
    } catch {
      setApiError("Failed to register patient. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout title="Register Patient">
      <div style={s.card}>
        <h2 style={s.heading}>New Patient</h2>
        {apiError && (
          <div style={s.apiError}>{apiError}</div>
        )}
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <Field label="Full Name *" error={touched.name ? errors.name : undefined}>
              <input
                style={{ ...s.input, borderColor: touched.name && errors.name ? "#DC2626" : "#CBD5E1" }}
                value={values.name}
                onChange={(e) => handleChange("name", e.target.value)}
                onBlur={() => handleBlur("name")}
                placeholder="Priya Sharma"
              />
            </Field>
            <Field label="Mobile *" error={touched.mobile ? errors.mobile : undefined}>
              <input
                style={{ ...s.input, borderColor: touched.mobile && errors.mobile ? "#DC2626" : "#CBD5E1" }}
                value={values.mobile}
                onChange={(e) => handleChange("mobile", e.target.value)}
                onBlur={() => handleBlur("mobile")}
                placeholder="9876543210"
                maxLength={10}
              />
            </Field>
            <Field label="Email *" error={touched.email ? errors.email : undefined}>
              <input
                style={{ ...s.input, borderColor: touched.email && errors.email ? "#DC2626" : "#CBD5E1" }}
                type="email"
                value={values.email}
                onChange={(e) => handleChange("email", e.target.value)}
                onBlur={() => handleBlur("email")}
                placeholder="priya@example.com"
              />
            </Field>
            <Field label="Age *" error={touched.age ? errors.age : undefined}>
              <input
                style={{ ...s.input, borderColor: touched.age && errors.age ? "#DC2626" : "#CBD5E1" }}
                type="number"
                min={1}
                max={120}
                value={values.age}
                onChange={(e) => handleChange("age", e.target.value)}
                onBlur={() => handleBlur("age")}
                placeholder="28"
              />
            </Field>
            <Field label="Source">
              <select style={s.select} value={values.source} onChange={(e) => handleChange("source", e.target.value)}>
                <option value="">Select source…</option>
                <option value="Patient referral">Patient referral</option>
                <option value="Doctor referral">Doctor referral</option>
                <option value="Other referral">Other referral</option>
                <option value="Events">Events</option>
              </select>
            </Field>
            <Field label="Referred By">
              <input
                style={s.input}
                value={values.referred_by}
                onChange={(e) => handleChange("referred_by", e.target.value)}
                placeholder="Dr. Anil Kumar"
              />
            </Field>
            <Field label="Assign Therapist (optional)">
              <select style={s.select} value={values.therapist_id} onChange={(e) => handleChange("therapist_id", e.target.value)}>
                <option value="">No therapist assigned</option>
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.employeeType})</option>
                ))}
              </select>
            </Field>
          </div>
          <div style={s.actions}>
            <button type="button" style={s.cancelBtn} onClick={() => navigate("/patients")}>Cancel</button>
            <button type="submit" style={s.submitBtn} disabled={submitting}>
              {submitting ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Registering…
                </span>
              ) : "Register Patient"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>{label}</label>
      {children}
      {error && <span style={{ fontSize: 12, color: "#DC2626" }}>{error}</span>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card:      { background: "#fff", borderRadius: 16, padding: 32, maxWidth: 800, boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)", border: "1px solid #E8EDF2" },
  heading:   { marginTop: 0, marginBottom: 24, fontSize: 18, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em" },
  apiError:  { color: "#DC2626", background: "#FEE2E2", padding: "10px 14px", borderRadius: 8, marginBottom: 20, fontSize: 13, border: "1px solid #FECACA" },
  input:     { height: 44, padding: "0 12px", border: "1.5px solid #CBD5E1", borderRadius: 8, fontSize: 14, color: "#0F172A", outline: "none", width: "100%", background: "#FDFBF8" },
  select:    { height: 44, padding: "0 12px", border: "1.5px solid #CBD5E1", borderRadius: 8, fontSize: 14, color: "#0F172A", background: "#FDFBF8", cursor: "pointer", width: "100%" },
  actions:   { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 },
  cancelBtn: { height: 40, padding: "0 20px", border: "1.5px solid #CBD5E1", borderRadius: 8, background: "#fff", fontSize: 14, cursor: "pointer", color: "#475569", fontWeight: 500 },
  submitBtn: { height: 40, padding: "0 24px", border: "none", borderRadius: 8, background: "#3D9E8E", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" },
};
