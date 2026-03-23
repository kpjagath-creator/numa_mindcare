// Patient list page — searchable, filterable, paginated table of all patients.

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import PatientTable from "../../components/patients/PatientTable";
import PatientStatusBadge from "../../components/patients/PatientStatusBadge";
import SkeletonTable from "../../components/ui/SkeletonTable";
import EmptyState from "../../components/ui/EmptyState";
import type { Patient, PaginationMeta } from "../../types/index";
import { PATIENT_STATUSES, STATUS_LABELS } from "../../constants/statuses";
import { listPatients, deletePatient } from "../../api/patients";
import { useIsMobile } from "../../hooks/useIsMobile";

const LIMIT = 20;

export default function PatientListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

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

  // ── Mobile render ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <Layout title="Patients">
        {/* Mobile search bar */}
        <input
          className="mobile-search-bar"
          placeholder="Search name or mobile…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />

        {/* Status filter chips */}
        <div className="mobile-filter-row">
          <button
            className={`mobile-filter-chip${statusFilter === "" ? " active" : ""}`}
            onClick={() => { setStatusFilter(""); setPage(1); }}
          >
            All
          </button>
          {PATIENT_STATUSES.map((st) => (
            <button
              key={st}
              className={`mobile-filter-chip${statusFilter === st ? " active" : ""}`}
              onClick={() => { setStatusFilter(st); setPage(1); }}
            >
              {STATUS_LABELS[st]}
            </button>
          ))}
        </div>

        {error && <p style={s.error}>{error}</p>}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ height: 80, background: "#e2e8f0", borderRadius: 12, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : patients.length === 0 ? (
          <EmptyState
            icon="👤"
            title="No patients yet"
            subtitle="Register your first patient to get started."
            actionLabel="Register Patient"
            onAction={() => navigate("/patients/new")}
          />
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {patients.map((p) => (
                <div
                  key={p.id}
                  className="mobile-card"
                  onClick={() => navigate(`/patients/${p.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="mobile-card-header">
                    <div>
                      <div className="mobile-card-title">{p.name}</div>
                      <div className="mobile-card-subtitle">{p.mobile}</div>
                    </div>
                    <PatientStatusBadge status={p.currentStatus} />
                  </div>
                  <div className="mobile-card-meta">
                    <span>#{p.patientNumber}</span>
                    {p.therapist && <span>{p.therapist.name}</span>}
                    {p.age && <span>{p.age} yrs</span>}
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div style={s.pager}>
                <button style={s.pageBtn} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
                <span style={s.muted}>Page {page} of {totalPages}</span>
                <button style={s.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
              </div>
            )}
          </>
        )}

        {/* FAB for new patient */}
        <button
          className="fab"
          onClick={() => navigate("/patients/new")}
          title="Register new patient"
        >
          +
        </button>
      </Layout>
    );
  }

  // ── Desktop render ─────────────────────────────────────────────────────────
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
