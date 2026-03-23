// Schedule list page — all therapy sessions with filters and add modal.

import { useState, useEffect, useCallback } from "react";
import Layout from "../../components/layout/Layout";
import AddSessionModal from "../../components/schedule/AddSessionModal";
import SessionsTable from "../../components/schedule/SessionsTable";
import ClinicalNotesPanel from "../../components/schedule/ClinicalNotesPanel";
import SkeletonTable from "../../components/ui/SkeletonTable";
import EmptyState from "../../components/ui/EmptyState";
import type { TherapySession, PaginationMeta, Patient, TeamMember, PaymentStatus } from "../../types/index";
import { listSessions, cancelSession, completeSession, deleteSession, rescheduleSession, markNoShow, updatePaymentStatus } from "../../api/therapySessions";
import { listPatients } from "../../api/patients";
import { listTeamMembers } from "../../api/teamMembers";
import { useToast } from "../../components/ui/Toast";
import { useIsMobile } from "../../hooks/useIsMobile";

const LIMIT = 50;

type SortKey = "startTime" | "patientName" | "therapistName" | "status" | "paymentStatus";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    upcoming:    { bg: "#e0f2fe", color: "#0369a1" },
    completed:   { bg: "#dcfce7", color: "#166534" },
    cancelled:   { bg: "#fee2e2", color: "#991b1b" },
    no_show:     { bg: "#fef9c3", color: "#854d0e" },
    rescheduled: { bg: "#f3e8ff", color: "#6b21a8" },
  };
  const c = colors[status] ?? { bg: "#f1f5f9", color: "#64748b" };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: c.bg, color: c.color }}>
      {status.replace("_", " ")}
    </span>
  );
}

function PaymentPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    paid:    { bg: "#dcfce7", color: "#166534" },
    unpaid:  { bg: "#fee2e2", color: "#991b1b" },
    partial: { bg: "#fef9c3", color: "#854d0e" },
  };
  const c = colors[status] ?? { bg: "#f1f5f9", color: "#64748b" };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: c.bg, color: c.color }}>
      {status}
    </span>
  );
}

export default function ScheduleListPage() {
  const isMobile = useIsMobile();
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, limit: LIMIT, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [notesSession, setNotesSession] = useState<TherapySession | null>(null);

  // Filters
  const [patientFilter, setPatientFilter] = useState("");
  const [therapistFilter, setTherapistFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "upcoming" | "completed" | "cancelled" | "no_show" | "rescheduled">();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);

  // Mobile filter toggle
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("startTime");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Dropdown data for filters
  const [patients, setPatients] = useState<Patient[]>([]);
  const [therapists, setTherapists] = useState<TeamMember[]>([]);

  useEffect(() => {
    void listPatients({ limit: 200 }).then((r) => setPatients(r.patients)).catch(() => {});
    void listTeamMembers().then(setTherapists).catch(() => {});
  }, []);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listSessions({
        page,
        limit: LIMIT,
        patient_id: patientFilter ? parseInt(patientFilter, 10) : undefined,
        therapist_id: therapistFilter ? parseInt(therapistFilter, 10) : undefined,
        date: dateFilter || undefined,
        status: statusFilter || undefined,
      });
      setSessions(result.sessions);
      setPagination(result.pagination);
    } catch {
      setError("Failed to load sessions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page, patientFilter, therapistFilter, dateFilter, statusFilter]);

  useEffect(() => { void fetchSessions(); }, [fetchSessions]);

  async function handleCancel(id: number, reason: string) {
    try { await cancelSession(id, reason); void fetchSessions(); showToast("Session cancelled.", "success"); }
    catch { showToast("Failed to cancel session.", "error"); }
  }

  async function handleComplete(id: number, charges?: number) {
    try { await completeSession(id, charges); void fetchSessions(); showToast("Session marked completed.", "success"); }
    catch { showToast("Failed to complete session.", "error"); }
  }

  async function handleDelete(id: number) {
    try { await deleteSession(id); void fetchSessions(); showToast("Session deleted.", "success"); }
    catch { showToast("Failed to delete session.", "error"); }
  }

  async function handleReschedule(id: number, payload: { session_date: string; start_time: string; duration_mins: number; notes?: string }) {
    try { await rescheduleSession(id, payload); void fetchSessions(); showToast("Session rescheduled.", "success"); }
    catch { showToast("Failed to reschedule session.", "error"); }
  }

  async function handleNoShow(id: number, no_show_fee?: number) {
    try { await markNoShow(id, no_show_fee); void fetchSessions(); showToast("Session marked as no-show.", "success"); }
    catch { showToast("Failed to mark no-show.", "error"); }
  }

  async function handlePaymentStatusChange(id: number, payment_status: PaymentStatus, changed_by_name: string) {
    try { await updatePaymentStatus(id, payment_status, changed_by_name); void fetchSessions(); showToast("Payment status updated.", "success"); }
    catch { showToast("Failed to update payment status.", "error"); }
  }

  function resetFilters() {
    setPatientFilter(""); setTherapistFilter(""); setDateFilter(""); setStatusFilter(undefined); setPage(1);
  }

  const totalPages = Math.ceil(pagination.total / LIMIT);
  const hasFilters = patientFilter || therapistFilter || dateFilter || statusFilter;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const sortedSessions = [...sessions].sort((a, b) => {
    let av: string, bv: string;
    if (sortKey === "startTime") { av = a.startTime; bv = b.startTime; }
    else if (sortKey === "patientName") { av = a.patient.name; bv = b.patient.name; }
    else if (sortKey === "therapistName") { av = a.therapist.name; bv = b.therapist.name; }
    else if (sortKey === "status") { av = a.status; bv = b.status; }
    else { av = a.paymentStatus; bv = b.paymentStatus; }
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  // ── Mobile render ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <Layout title="Schedule">
        {/* Mobile toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "#8a96a3" }}>
            {!loading && `${pagination.total} session${pagination.total !== 1 ? "s" : ""}`}
          </span>
          <button
            style={{ padding: "6px 12px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer", color: "#64748b" }}
            onClick={() => setShowFilters((v) => !v)}
          >
            {showFilters ? "Hide filters" : "Filters"}{hasFilters ? " •" : ""}
          </button>
        </div>

        {/* Collapsible filter section */}
        {showFilters && (
          <div style={{ background: "#fff", borderRadius: 10, padding: 12, marginBottom: 12, border: "1px solid #ede7df" }}>
            {/* Status chips */}
            <div className="mobile-filter-row">
              {(["", "upcoming", "completed", "cancelled", "no_show", "rescheduled"] as const).map((st) => (
                <button
                  key={st || "all"}
                  className={`mobile-filter-chip${(statusFilter ?? "") === st ? " active" : ""}`}
                  onClick={() => { setStatusFilter((st || undefined) as any); setPage(1); }}
                >
                  {st === "" ? "All" : st.replace("_", " ")}
                </button>
              ))}
            </div>
            <select
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 13, marginBottom: 8, background: "#fff" }}
              value={patientFilter}
              onChange={(e) => { setPatientFilter(e.target.value); setPage(1); }}
            >
              <option value="">All patients</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 13, marginBottom: 8, background: "#fff" }}
              value={therapistFilter}
              onChange={(e) => { setTherapistFilter(e.target.value); setPage(1); }}
            >
              <option value="">All therapists</option>
              {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input
              type="date"
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 13, background: "#fff" }}
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
            />
            {hasFilters && (
              <button
                style={{ marginTop: 8, padding: "6px 12px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer", color: "#8a96a3", width: "100%" }}
                onClick={resetFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {error && <p style={s.errorMsg}>{error}</p>}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: 90, background: "#e2e8f0", borderRadius: 12, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon="📅"
            title="No sessions found"
            subtitle={hasFilters ? "Try adjusting your filters." : "Schedule your first therapy session."}
            actionLabel={hasFilters ? undefined : "+ Add Schedule"}
            onAction={hasFilters ? undefined : () => setShowModal(true)}
          />
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedSessions.map((sess) => (
                <div key={sess.id} className="mobile-card">
                  <div className="mobile-card-header">
                    <div>
                      <div className="mobile-card-title">{sess.patient.name}</div>
                      <div className="mobile-card-subtitle">{sess.therapist.name}</div>
                    </div>
                    <StatusPill status={sess.status} />
                  </div>
                  <div className="mobile-card-meta">
                    <span>{fmtDateTime(sess.startTime)}</span>
                    <PaymentPill status={sess.paymentStatus} />
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

        {/* FAB */}
        <button
          className="fab"
          onClick={() => setShowModal(true)}
          title="Add new session"
        >
          +
        </button>

        {showModal && (
          <AddSessionModal
            onClose={() => setShowModal(false)}
            onCreated={() => { setShowModal(false); void fetchSessions(); }}
          />
        )}

        {notesSession && (
          <ClinicalNotesPanel
            sessionId={notesSession.id}
            patientName={notesSession.patient.name}
            sessionDate={notesSession.startTime}
            onClose={() => setNotesSession(null)}
          />
        )}
      </Layout>
    );
  }

  // ── Desktop render ─────────────────────────────────────────────────────────
  return (
    <Layout title="Schedule">
      {/* ── Toolbar ── */}
      <div style={s.topBar}>
        <span style={s.count}>
          {!loading && `${pagination.total} session${pagination.total !== 1 ? "s" : ""}`}
        </span>
        <button style={s.primaryBtn} onClick={() => setShowModal(true)}>+ Add Schedule</button>
      </div>

      {/* ── Filters ── */}
      <div style={s.filters}>
        <select style={s.filterSelect} value={patientFilter} onChange={(e) => { setPatientFilter(e.target.value); setPage(1); }}>
          <option value="">All patients</option>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select style={s.filterSelect} value={therapistFilter} onChange={(e) => { setTherapistFilter(e.target.value); setPage(1); }}>
          <option value="">All therapists</option>
          {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <input
          type="date"
          style={s.filterInput}
          value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
          title="Filter by date"
        />

        <select style={s.filterSelect} value={statusFilter ?? ""} onChange={(e) => { setStatusFilter((e.target.value || undefined) as any); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
          <option value="rescheduled">Rescheduled</option>
        </select>

        {hasFilters && (
          <button style={s.clearBtn} onClick={resetFilters}>Clear filters</button>
        )}
      </div>

      {error && <p style={s.errorMsg}>{error}</p>}

      {loading ? (
        <SkeletonTable columns={8} rows={5} />
      ) : (
        <>
          {sessions.length === 0 ? (
            <EmptyState
              icon="📅"
              title="No sessions found"
              subtitle={hasFilters ? "Try adjusting your filters." : "Schedule your first therapy session."}
              actionLabel={hasFilters ? undefined : "+ Add Schedule"}
              onAction={hasFilters ? undefined : () => setShowModal(true)}
            />
          ) : (
            <>
              {/* Sort bar */}
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                {([
                  ["startTime", "Date/Time"],
                  ["patientName", "Patient"],
                  ["therapistName", "Therapist"],
                  ["status", "Status"],
                  ["paymentStatus", "Payment"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => toggleSort(key)}
                    style={{
                      padding: "4px 10px", fontSize: 11, border: "1px solid #ddd5cb",
                      borderRadius: 5, background: sortKey === key ? "#2d6b5f" : "#fff",
                      color: sortKey === key ? "#fff" : "#64748b", cursor: "pointer", fontWeight: 500,
                    }}
                  >
                    {label} {sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                ))}
              </div>

              <SessionsTable
                sessions={sortedSessions}
                onCancel={handleCancel}
                onComplete={handleComplete}
                onDelete={handleDelete}
                onReschedule={handleReschedule}
                onNoShow={handleNoShow}
                onPaymentStatusChange={handlePaymentStatusChange}
                onNotes={(session) => setNotesSession(session)}
              />

              {totalPages > 1 && (
                <div style={s.pager}>
                  <button style={s.pageBtn} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
                  <span style={s.muted}>Page {page} of {totalPages}</span>
                  <button style={s.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showModal && (
        <AddSessionModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); void fetchSessions(); }}
        />
      )}

      {notesSession && (
        <ClinicalNotesPanel
          sessionId={notesSession.id}
          patientName={notesSession.patient.name}
          sessionDate={notesSession.startTime}
          onClose={() => setNotesSession(null)}
        />
      )}
    </Layout>
  );
}

const s: Record<string, React.CSSProperties> = {
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  count: { fontSize: 12, color: "#8a96a3" },
  primaryBtn: { padding: "7px 16px", background: "#2d6b5f", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  filters: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18, alignItems: "center" },
  filterSelect: { padding: "6px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", background: "#fff" },
  filterInput: { padding: "6px 11px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", background: "#fff" },
  clearBtn: { padding: "6px 12px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", fontSize: 12, cursor: "pointer", color: "#8a96a3" },
  errorMsg: { color: "#b91c1c", background: "#fee2e2", padding: "9px 14px", borderRadius: 6, marginBottom: 14, fontSize: 12 },
  muted: { color: "#8a96a3", fontSize: 12 },
  pager: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 20 },
  pageBtn: { padding: "5px 13px", border: "1px solid #ddd5cb", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 12, color: "#1a2535" },
};
