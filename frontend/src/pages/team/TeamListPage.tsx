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

// ── Uniform avatar color ───────────────────────────────────────────────────
function roleAvatarColor(_employeeType: string): { bg: string; color: string } {
  return { bg: "#EEF9F7", color: "#3D9E8E" };
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

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
    const avatarStyle = roleAvatarColor(m.employeeType);
    return (
      <div className="mobile-card">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }} onClick={() => navigate(`/team/${m.id}/patients`)}>
          {/* Avatar circle */}
          <div
            className="avatar-circle"
            style={{ background: avatarStyle.bg, color: avatarStyle.color, fontSize: 14, fontWeight: 700 }}
          >
            {initials(m.name)}
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div className="mobile-card-title" style={{ flex: 1, marginRight: 8 }}>{m.name}</div>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 9999,
                background: "#EEF9F7",
                color: "#3D9E8E",
              }}>
                {m.employeeType}
              </span>
            </div>
            <div className="mobile-card-subtitle">{m.employeeCode}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: m.isActive ? "#10B981" : "#94A3B8",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, color: m.isActive ? "#10B981" : "#94A3B8", fontWeight: 600 }}>
                {m.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid #EEF2F7" }}>
          <button
            style={{ flex: 2, padding: "8px 12px", borderRadius: 8, border: "none", background: "#3D9E8E", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            onClick={() => navigate(`/team/${m.id}/patients`)}
          >
            View Patients
          </button>
          <button
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #DC2626", background: "#FEF2F2", color: "#DC2626", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </button>
        </div>
        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete Team Member"
          message={`Are you sure you want to delete ${m.name}? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={async () => { await handleDelete(m.id); setShowDeleteConfirm(false); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
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
  toolbar:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  count:      { fontSize: 13, color: "#94A3B8", fontWeight: 500 },
  primaryBtn: { height: 40, padding: "0 20px", background: "#3D9E8E", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  error:      { color: "#DC2626", background: "#FEE2E2", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13, border: "1px solid #FECACA" },
  muted:      { color: "#94A3B8", fontSize: 13 },
};
