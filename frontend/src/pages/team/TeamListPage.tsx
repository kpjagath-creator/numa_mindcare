// Team list page — loads and displays all team members in a table.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import TeamTable from "../../components/team/TeamTable";
import SkeletonTable from "../../components/ui/SkeletonTable";
import EmptyState from "../../components/ui/EmptyState";
import type { TeamMember } from "../../types/index";
import { listTeamMembers, deleteTeamMember } from "../../api/teamMembers";
import { useIsMobile } from "../../hooks/useIsMobile";

export default function TeamListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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
    } catch {
      setError("Failed to delete team member. Please try again.");
    }
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
              <div
                key={m.id}
                className="mobile-card"
                onClick={() => navigate(`/team/${m.id}/patients`)}
                style={{ cursor: "pointer" }}
              >
                <div className="mobile-card-header">
                  <div>
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
                  <span>{m.isActive ? "Active" : "Inactive"}</span>
                  <span style={{ color: "#2d6b5f", fontWeight: 600 }}>View patients →</span>
                </div>
              </div>
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
