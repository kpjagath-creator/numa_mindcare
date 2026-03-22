// Team list page — loads and displays all team members in a table.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import TeamTable from "../../components/team/TeamTable";
import SkeletonTable from "../../components/ui/SkeletonTable";
import EmptyState from "../../components/ui/EmptyState";
import type { TeamMember } from "../../types/index";
import { listTeamMembers, deleteTeamMember } from "../../api/teamMembers";

export default function TeamListPage() {
  const navigate = useNavigate();
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
