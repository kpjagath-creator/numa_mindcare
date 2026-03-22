// Billing page — monthly revenue chart, per-therapist revenue, outstanding sessions.

import { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import { getRevenueStats, RevenueStats, MiniSession } from "../../api/analytics";
import { completeSession } from "../../api/therapySessions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRupees(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function shortMonth(label: string): string {
  // label = "2026-01"
  const [y, m] = label.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#1a2535", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// CSS-only bar chart — no external library
function BarChart({ data }: { data: RevenueStats["monthlyRevenue"] }) {
  const maxRev = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 160, marginTop: 12 }}>
      {data.map((d) => {
        const heightPct = maxRev > 0 ? (d.revenue / maxRev) * 100 : 0;
        return (
          <div key={d.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {d.revenue > 0 && (
              <div style={{ fontSize: 9, color: "#64748b", textAlign: "center" }}>
                {fmtRupees(d.revenue)}
              </div>
            )}
            <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 120 }}>
              <div
                title={`${shortMonth(d.month)}: ${fmtRupees(d.revenue)} (${d.sessionCount} sessions)`}
                style={{
                  background: d.revenue > 0
                    ? "linear-gradient(180deg, #4aa895 0%, #2d6b5f 100%)"
                    : "#e2e8f0",
                  borderRadius: "4px 4px 0 0",
                  height: `${Math.max(heightPct, d.revenue > 0 ? 8 : 2)}%`,
                  transition: "height 0.5s ease",
                  minHeight: 2,
                }}
              />
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center" }}>{shortMonth(d.month)}</div>
            {d.sessionCount > 0 && (
              <div style={{ fontSize: 9, color: "#cbd5e1" }}>{d.sessionCount} sess.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Inline charge input for outstanding sessions ───────────────────────────────

function AddChargeRow({
  session,
  onSaved,
}: {
  session: MiniSession;
  onSaved: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount]   = useState("");
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  async function handleSave() {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { setErr("Enter a valid amount"); return; }
    setSaving(true);
    setErr(null);
    try {
      await completeSession(session.id, parsed);
      onSaved(session.id);
    } catch (e: any) {
      setErr(e.response?.data?.error?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
      <td style={td}>{session.patientName}</td>
      <td style={td}>{session.therapistName}</td>
      <td style={td}>{fmtDate(session.startTime)}</td>
      <td style={td}>{fmtDuration(session.durationMins)}</td>
      <td style={{ ...td, minWidth: 160 }}>
        {editing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>₹</span>
            <input
              autoFocus
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                width: 80, padding: "3px 6px", border: "1px solid #cbd5e1",
                borderRadius: 5, fontSize: 12, outline: "none",
              }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            />
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "3px 10px", background: "#2d6b5f", color: "#fff",
                border: "none", borderRadius: 5, fontSize: 11, cursor: "pointer",
              }}
            >
              {saving ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setErr(null); }}
              style={{
                padding: "3px 8px", background: "#f1f5f9", color: "#64748b",
                border: "none", borderRadius: 5, fontSize: 11, cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: "3px 12px", background: "#fff7ed", color: "#c2410c",
              border: "1px solid #fed7aa", borderRadius: 5, fontSize: 11,
              cursor: "pointer", fontWeight: 600,
            }}
          >
            + Add Charge
          </button>
        )}
        {err && <div style={{ fontSize: 10, color: "#c0392b", marginTop: 2 }}>{err}</div>}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [stats, setStats]       = useState<RevenueStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [outstanding, setOutstanding] = useState<MiniSession[]>([]);

  useEffect(() => {
    getRevenueStats()
      .then((s) => {
        setStats(s);
        setOutstanding(s.outstandingSessions);
      })
      .catch((e) => setError(e.message ?? "Failed to load billing data"))
      .finally(() => setLoading(false));
  }, []);

  function handleChargeSaved(id: number) {
    setOutstanding((prev) => prev.filter((s) => s.id !== id));
    // Refresh full stats silently
    getRevenueStats().then((s) => setStats(s)).catch(() => {});
  }

  if (loading) {
    return (
      <Layout title="Billing">
        <div style={{ color: "#94a3b8", fontSize: 12 }}>Loading billing data…</div>
      </Layout>
    );
  }

  if (error || !stats) {
    return (
      <Layout title="Billing">
        <div style={{ color: "#c0392b", fontSize: 12 }}>{error ?? "Unknown error"}</div>
      </Layout>
    );
  }

  return (
    <Layout title="Billing">
      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <StatCard
          label="Total Revenue"
          value={fmtRupees(stats.totalRevenue)}
          sub="all completed sessions"
        />
        <StatCard
          label="Avg Charge / Session"
          value={stats.averageChargePerSession > 0 ? fmtRupees(stats.averageChargePerSession) : "—"}
          sub={`across ${stats.totalCompletedSessions} completed sessions`}
        />
        <StatCard
          label="Outstanding"
          value={String(outstanding.length)}
          sub="completed sessions missing charge"
        />
      </div>

      {/* ── Monthly chart + Therapist revenue ─────────────────────────── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {/* Chart */}
        <div style={{ ...sectionCard, flex: "1.4 1 280px" }}>
          <div style={sectionTitle}>Monthly Revenue (Last 6 Months)</div>
          <BarChart data={stats.monthlyRevenue} />
        </div>

        {/* Per-therapist */}
        <div style={{ ...sectionCard, flex: "1 1 220px" }}>
          <div style={sectionTitle}>Revenue by Therapist</div>
          {stats.revenueByTherapist.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 11, paddingTop: 8 }}>No completed sessions yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Therapist", "Sessions", "Revenue", "Avg"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.revenueByTherapist.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={td}>{t.name}</td>
                    <td style={td}>{t.sessionCount}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmtRupees(t.revenue)}</td>
                    <td style={{ ...td, color: "#64748b" }}>
                      {t.sessionCount > 0 ? fmtRupees(Math.round(t.revenue / t.sessionCount)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Outstanding sessions ───────────────────────────────────────── */}
      <div style={sectionCard}>
        <div style={sectionTitle}>
          Outstanding Sessions — Add Missing Charges ({outstanding.length})
        </div>
        {outstanding.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 11, paddingTop: 8 }}>
            All completed sessions have charges recorded.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Patient", "Therapist", "Session Date", "Duration", "Action"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outstanding.map((s) => (
                <AddChargeRow key={s.id} session={s} onSaved={handleChargeSaved} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 10,
  padding: "16px 18px",
  flex: "1 1 160px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  minWidth: 160,
};

const sectionCard: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 10,
  padding: "16px 18px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#1a2535",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 10,
  borderBottom: "1px solid #f1f5f9",
  paddingBottom: 8,
};

const th: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#94a3b8",
  textAlign: "left",
  padding: "4px 8px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const td: React.CSSProperties = {
  fontSize: 12,
  color: "#334155",
  padding: "7px 8px",
};
