// Patient list page — searchable, filterable, paginated table of all patients.

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import PatientTable from "../../components/patients/PatientTable";
import SkeletonTable from "../../components/ui/SkeletonTable";
import EmptyState from "../../components/ui/EmptyState";
import type { Patient, PaginationMeta } from "../../types/index";
import { PATIENT_STATUSES, STATUS_LABELS } from "../../constants/statuses";
import { listPatients, deletePatient } from "../../api/patients";

const LIMIT = 20;

export default function PatientListPage() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: LIMIT, total: 0 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listPatients({ page, limit: LIMIT, search: search.trim() || undefined, status: statusFilter || undefined });
      setPatients(result.patients);
      setPagination(result.pagination);
    } catch {
      setError("Failed to load patients. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { void fetchPatients(); }, [fetchPatients]);

  async function handleDelete(id: number) {
    try {
      await deletePatient(id);
      void fetchPatients();
    } catch {
      setError("Failed to delete patient. Please try again.");
    }
  }

  const totalPages = Math.ceil(pagination.total / LIMIT);

  return (
    <Layout title="Patients">
      {/* ── Toolbar ── */}
      <div style={s.toolbar}>
        <div style={s.filters}>
          <input
            style={s.input}
            placeholder="Search name or mobile…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <select
            style={s.select}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All statuses</option>
            {PATIENT_STATUSES.map((st) => (
              <option key={st} value={st}>{STATUS_LABELS[st]}</option>
            ))}
          </select>
        </div>
        <button style={s.primaryBtn} onClick={() => navigate("/patients/new")}>
          + Register Patient
        </button>
      </div>

      {error && <p style={s.error}>{error}</p>}

      {loading ? (
        <SkeletonTable columns={7} rows={6} />
      ) : (
        <>
          <PatientTable patients={patients} onDelete={handleDelete} />

          {totalPages > 1 && (
            <div style={s.pager}>
              <button style={s.pageBtn} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <span style={s.muted}>Page {page} of {totalPages} — {pagination.total} patients</span>
              <button style={s.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          )}

          {patients.length === 0 && !error && (
            <EmptyState
              icon="👤"
              title="No patients yet"
              subtitle="Register your first patient to get started."
              actionLabel="Register Patient"
              onAction={() => navigate("/patients/new")}
            />
          )}
        </>
      )}
    </Layout>
  );
}

const s: Record<string, React.CSSProperties> = {
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12, flexWrap: "wrap" },
  filters: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: { padding: "7px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, width: 210, color: "#1a2535", outline: "none", background: "#fff" },
  select: { padding: "7px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", background: "#fff", cursor: "pointer" },
  primaryBtn: { padding: "7px 16px", background: "#2d6b5f", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  error: { color: "#b91c1c", background: "#fee2e2", padding: "9px 14px", borderRadius: 6, marginBottom: 14, fontSize: 12 },
  muted: { color: "#8a96a3", fontSize: 12 },
  pager: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 20 },
  pageBtn: { padding: "5px 13px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, color: "#1a2535" },
};
