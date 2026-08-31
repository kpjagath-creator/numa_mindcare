// Edit team member modal (MEET-01).
//
// Exists because there was no therapist edit flow at all before the Google Calendar integration,
// and therapist records created earlier have no email — an admin needs a way to add one. Scoped
// deliberately to the four editable attributes (name, type, email, active); the employee code is
// system-generated and not editable.
//
// Shared by both the desktop table and the mobile card list in TeamListPage so the two branches
// stay in step (CLAUDE.md rule #2). Follows the existing modal pattern used in SessionsTable —
// same overlay, card, field, and button styling; no new UI primitives.

import { useState } from "react";
import type { EmployeeType, TeamMember } from "../../types/index";

interface Props {
  member: TeamMember;
  onSave: (payload: { name: string; employee_type: EmployeeType; email: string; is_active: boolean }) => Promise<void>;
  onClose: () => void;
}

// Client-side shape check only — the backend's Zod `.email()` is the authoritative validation.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EditTeamMemberModal({ member, onSave, onClose }: Props) {
  const [name, setName] = useState(member.name);
  const [employeeType, setEmployeeType] = useState<EmployeeType>(member.employeeType);
  // Existing records may legitimately have no email — start blank rather than showing "null".
  const [email, setEmail] = useState(member.email ?? "");
  const [isActive, setIsActive] = useState(member.isActive);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) { setError("Name is required."); return; }
    // Email stays optional on edit: an existing therapist without one must remain saveable, so an
    // admin can fix their name or active status without being forced to invent an address.
    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        name: name.trim(),
        employee_type: employeeType,
        email: trimmedEmail,
        is_active: isActive,
      });
    } catch {
      setError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalCard} className="modal-card">
        <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
          Edit Team Member
        </h3>
        <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          {member.employeeCode}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={label}>Full Name *</label>
            <input style={input} value={name} onChange={(e) => { setName(e.target.value); setError(""); }} autoFocus />
          </div>
          <div>
            <label style={label}>Employee Type</label>
            <select
              style={{ ...input, cursor: "pointer" }}
              value={employeeType}
              onChange={(e) => setEmployeeType(e.target.value as EmployeeType)}
            >
              <option value="psychologist">Psychologist</option>
              <option value="psychiatrist">Psychiatrist</option>
            </select>
          </div>
          <div>
            <label style={label}>Email</label>
            <input
              type="email"
              style={input}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="meera.nair@example.com"
            />
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>
              Used to invite this therapist to session calendar events.
            </p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#64748b", cursor: "pointer" }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        </div>

        {error && <p style={{ fontSize: 11, color: "#b91c1c", margin: "8px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button style={cancelBtn} onClick={onClose} disabled={saving}>Back</button>
          <button style={saveBtn} onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
};
const modalCard: React.CSSProperties = {
  background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: 24,
};
const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 };
const input: React.CSSProperties = {
  width: "100%", padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6,
  fontSize: 13, color: "#0F172A", background: "#fdfbf9", boxSizing: "border-box", outline: "none",
};
const cancelBtn: React.CSSProperties = { padding: "7px 16px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer", color: "#64748b" };
const saveBtn: React.CSSProperties = { padding: "7px 16px", border: "none", borderRadius: 6, background: "#3D9E8E", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
