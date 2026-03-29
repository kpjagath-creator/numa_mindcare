// Patient list page — searchable, filterable, paginated table of all patients.

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/layout/Layout";
import PatientTable from "../../components/patients/PatientTable";
import PatientStatusBadge from "../../components/patients/PatientStatusBadge";
import SkeletonTable from "../../components/ui/SkeletonTable";
import EmptyState from "../../components/ui/EmptyState";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import type { Patient, PaginationMeta } from "../../types/index";
import { PATIENT_STATUSES, STATUS_LABELS } from "../../constants/statuses";
import { listPatients, deletePatient } from "../../api/patients";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useToast } from "../../components/ui/Toast";

const LIMIT = 20;

function avatarColor(_name: string): string {
  return "#3D9E8E";
}
function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function PatientListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { showToast } = useToast();

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
      showToast("Patient deleted.", "success");
    } catch {
      showToast("Failed to delete patient.", "error");
      setError("Failed to delete patient. Please try again.");
    }
  }

  // ── Mobile patient card ────────────────────────────────────────────────────
  function MobilePatientCard({ p }: { p: Patient }) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const color = avatarColor(p.name);

    return (
      <div className="mobile-card">
        <div
          style={{ cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}
          onClick={() => navigate(`/patients/${p.id}`)}
        >
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: color + "22", color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, flexShrink: 0,
          }}>
            {initials(p.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div className="mobile-card-title" style={{ flex: 1, marginRight: 8 }}>{p.name}</div>
              <PatientStatusBadge status={p.currentStatus} />
            </div>
            <div className="mobile-card-subtitle">{p.mobile}</div>
            <div className="mobile-card-meta">
              <span>#{p.patientNumber}</span>
              {p.therapist && <span>{p.therapist.name}</span>}
              {p.age && <span>{p.age} yrs</span>}
              {p.source && <span>{p.source}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid #EEF2F7" }}>
          <button
            style={{ flex: 2, padding: "8px 12px", borderRadius: 8, border: "none", background: "#3D9E8E", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            onClick={() => navigate(`/patients/${p.id}`)}
          >
            View Profile
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
          title="Delete Patient"
          message={`Are you sure you want to delete ${p.name}? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => { await handleDelete(p.id); setShowDeleteConfirm(false); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      </div>
    );
  }

  const totalPages = Math.ceil(pagination.total / LIMIT);

  // ── Mobile render ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <Layout title="Patients">
        {/* Search bar with icon */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <svg
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="mobile-search-bar"
            style={{ paddingLeft: 40 }}
            placeholder="Search name or mobile…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

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
              <div key={i} style={{ height: 90, borderRadius: 14 }} className="skeleton" />
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
                <MobilePatientCard key={p.id} p={p} />
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

        <button className="fab" onClick={() => navigate("/patients/new")} title="Register new patient">+</button>
      </Layout>
    );
  }

  // ── Desktop render ─────────────────────────────────────────────────────────
  return (
    <Layout title="Patients">
      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.filters}>
          {/* Search with icon */}
          <div style={{ position: "relative" }}>
            <svg
              style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              style={s.searchInput}
              placeholder="Search name or mobile…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
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
  toolbar:     { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" },
  filters:     { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  searchInput: { paddingLeft: 34, paddingRight: 12, height: 40, border: "1.5px solid #CBD5E1", borderRadius: 8, fontSize: 13, color: "#0F172A", outline: "none", background: "#fff", width: 220 },
  select:      { height: 40, padding: "0 12px", border: "1.5px solid #CBD5E1", borderRadius: 8, fontSize: 13, color: "#0F172A", background: "#fff", cursor: "pointer" },
  primaryBtn:  { height: 40, padding: "0 20px", background: "#3D9E8E", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const },
  error:       { color: "#DC2626", background: "#FEE2E2", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13, border: "1px solid #FECACA" },
  muted:       { color: "#94A3B8", fontSize: 13 },
  pager:       { display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 20 },
  pageBtn:     { padding: "6px 16px", border: "1.5px solid #CBD5E1", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13, color: "#0F172A" },
};
