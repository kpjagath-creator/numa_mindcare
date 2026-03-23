// Team list page — loads and displays all team members in a table.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import TeamTable from "../../components/team/TeamTable";
import SkeletonTable from "../../components/ui/SkeletonTable";
import EmptyState from "../../components/ui/EmptyState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import type { TeamMember } from "../../types/index";
import { listTeamMembers, deleteTeamMember } from "../../api/teamMembers";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useToast } from "../../components/ui/Toast";

export default function TeamListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { showToast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMembers() {
    setLoading(true);
    setError(null);
    try {
      setMembers(await listTeamMembers());
    } catch {
      setError("Failed to load team members. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadMembers(); }, []);

  async function handleDelete(id: number) {
    try {
      await deleteTeamMember(id);
      void loadMembers();
      showToast("Team member deleted.", "success");
    } catch {
      showToast("Failed to delete team member.", "error");
      setError("Failed to delete team member. Please try again.");
    }
  }

  // ── Mobile team card with actions ──────────────────────────────────────────
  function MobileTeamCard({ m }: { m: TeamMember }) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    return (
      <div className="mobile-card">
        <div className="mobile-card-header" style={{ cursor: "pointer" }} onClick={() => navigate(`/team/${m.id}/patients`)}>
          <div style={{ flex: 1 }}>
            <div className="mobile-card-title">{m.name}</div>
            <div className="mobile-card-subtitle">{m.employeeCode}</div>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
            background: m.employeeType === "psychologist" ? "#e0f2fe" : "#f3e8ff",
            color: m.employeeType === "psychologist" ? "#0369a1" : "#6b21a8",
          }}>
            {m.employeeType}
          </span>
        </div>
        <div className="mobile-card-meta">
          <span>{m.isActive ? "✅ Active" : "❌ Inactive"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0ece6" }}>
          <button
            style={{ flex: 2, padding: "8px 12px", borderRadius: 6, border: "none", background: "#2d6b5f", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            onClick={() => navigate(`/team/${m.id}/patients`)}
          >
            👥 View Patients
          </button>
          <button
            style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #fee2e2", background: "#fff5f5", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            onClick={() => setShowDeleteConfirm(true)}
          >
            🗑 Delete
          </button>
        </div>
        {showDeleteConfirm && (
          <ConfirmDialog
            title="Delete Team Member"
            message={`Are you sure you want to delete ${m.name}? This cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={async () => { await handleDelete(m.id); setShowDeleteConfirm(false); }}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </div>
    );
  }

  // ── Mobile render ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <Layout title="Team">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={s.count}>{loading ? "" : `${members.length} member${members.length !== 1 ? "s" : ""}`}</span>
        </div>

        {error && <p style={s.error}>{error}</p>}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 72, background: "#e2e8f0", borderRadius: 12, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : members.length === 0 ? (
          <EmptyState
            icon="🧑‍⚕️"
            title="No team members yet"
            subtitle="Add your first therapist or psychiatrist."
            actionLabel="Add Team Member"
            onAction={() => navigate("/team/new")}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map((m) => (
              <MobileTeamCard key={m.id} m={m} />
            ))}
          </div>
        )}

        {/* FAB for adding team member */}
        <button
          className="fab"
          onClick={() => navigate("/team/new")}
          title="Add team member"
        >
          +
        </button>
      </Layout>
    );
  }

  // ── Desktop render ─────────────────────────────────────────────────────────
  return (
    <Layout title="Team">
      <div style={s.toolbar}>
        <span style={s.count}>{loading ? "" : `${members.length} member${members.length !== 1 ? "s" : ""}`}</span>
        <button style={s.primaryBtn} onClick={() => navigate("/team/new")}>
          + Add Team Member
        </button>
      </div>

      {error && <p style={s.error}>{error}</p>}
      {loading ? (
        <SkeletonTable columns={5} rows={4} />
      ) : members.length === 0 ? (
        <EmptyState
          icon="🧑‍⚕️"
          title="No team members yet"
          subtitle="Add your first therapist or psychiatrist."
          actionLabel="Add Team Member"
          onAction={() => navigate("/team/new")}
        />
      ) : (
        <TeamTable members={members} onDelete={handleDelete} />
      )}
    </Layout>
  );
}

const s: Record<string, React.CSSProperties> = {
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  count: { fontSize: 12, color: "#8a96a3" },
  primaryBtn: { padding: "7px 16px", background: "#2d6b5f", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  error: { color: "#b91c1c", background: "#fee2e2", padding: "9px 14px", borderRadius: 6, marginBottom: 14, fontSize: 12 },
  muted: { color: "#8a96a3", fontSize: 12 },
};
