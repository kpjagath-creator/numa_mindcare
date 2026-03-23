// Dashboard — real-time KPI cards, today's sessions, therapist utilisation, referral sources.

import React, { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import { getDashboardStats, DashboardStats } from "../../api/analytics";
import { useIsMobile } from "../../hooks/useIsMobile";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRupees(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 700): number {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (target === 0) { setCurrent(0); return; }
    let start: number | null = null;
    const from = 0;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return current;
}

function StatCard({
  label, value, rawValue, sub, accent,
}: { label: string; value: string | number; rawValue?: number; sub?: string; accent?: "green" | "red" | "default" }) {
  const animated = useCountUp(rawValue ?? 0);
  const accentColor = accent === "green" ? "#2d6b5f" : accent === "red" ? "#c0392b" : "#1a2535";
  const displayValue = rawValue !== undefined ? animated : value;
  return (
    <div style={card}>
      <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accentColor, lineHeight: 1 }}>
        {displayValue}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 5 }}>{sub}</div>
      )}
    </div>
  );
}

function Skeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
      {isMobile ? (
        <>
          <div className="kpi-grid-mobile" style={{ marginBottom: 16 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: 80, background: "#e2e8f0", borderRadius: 10 }} />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 100, background: "#e2e8f0", borderRadius: 10 }} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ ...card, height: 90, background: "#e2e8f0", flex: 1 }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ ...sectionCard, flex: 1.6, height: 220, background: "#e2e8f0" }} />
            <div style={{ ...sectionCard, flex: 1, height: 220, background: "#e2e8f0" }} />
            <div style={{ ...sectionCard, flex: 1, height: 220, background: "#e2e8f0" }} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((e) => setError(e.message ?? "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Dashboard">
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>

      {loading && <Skeleton isMobile={isMobile} />}
      {error && (
        <div style={{ color: "#c0392b", background: "#fdf2f2", padding: "12px 16px", borderRadius: 8, fontSize: 12 }}>
          {error}
        </div>
      )}

      {stats && (
        <>
          {/* ── KPI Row ───────────────────────────────────────────────────── */}
          {isMobile ? (
            /* Mobile: 2x2 grid of KPI cards */
            <div className="kpi-grid-mobile" style={{ marginBottom: 14 }}>
              <StatCard
                label="Active Patients"
                value={stats.totalActivePatients}
                rawValue={stats.totalActivePatients}
                sub={`+${stats.newPatientsThisMonth} new`}
              />
              <StatCard
                label="This Week"
                value={stats.sessionsThisWeek.completed + stats.sessionsThisWeek.upcoming + stats.sessionsThisWeek.cancelled}
                rawValue={stats.sessionsThisWeek.completed + stats.sessionsThisWeek.upcoming + stats.sessionsThisWeek.cancelled}
                sub={`${stats.sessionsThisWeek.completed} done`}
              />
              {(() => {
                const rev = stats.revenueThisMonth;
                const prev = stats.revenueLastMonth;
                const pct = prev > 0 ? Math.round(((rev - prev) / prev) * 100) : null;
                const up = pct !== null && pct >= 0;
                return (
                  <StatCard
                    label="Revenue"
                    value={fmtRupees(rev)}
                    sub={pct !== null ? `${up ? "▲" : "▼"} ${Math.abs(pct)}%` : "No prev data"}
                    accent={pct !== null ? (up ? "green" : "red") : "default"}
                  />
                );
              })()}
              <StatCard
                label="Upcoming"
                value={stats.upcomingThisWeekCount}
                rawValue={stats.upcomingThisWeekCount}
                sub="this week"
              />
            </div>
          ) : (
            /* Desktop: horizontal row */
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <StatCard
                label="Active Patients"
                value={stats.totalActivePatients}
                rawValue={stats.totalActivePatients}
                sub={`+${stats.newPatientsThisMonth} new this month`}
              />
              <StatCard
                label="Sessions This Week"
                value={stats.sessionsThisWeek.completed + stats.sessionsThisWeek.upcoming + stats.sessionsThisWeek.cancelled}
                rawValue={stats.sessionsThisWeek.completed + stats.sessionsThisWeek.upcoming + stats.sessionsThisWeek.cancelled}
                sub={`${stats.sessionsThisWeek.completed} done · ${stats.sessionsThisWeek.cancelled} cancelled`}
              />
              <StatCard
                label="Sessions This Month"
                value={stats.sessionsThisMonth.completed + stats.sessionsThisMonth.upcoming + stats.sessionsThisMonth.cancelled}
                rawValue={stats.sessionsThisMonth.completed + stats.sessionsThisMonth.upcoming + stats.sessionsThisMonth.cancelled}
                sub={`${stats.sessionsThisMonth.completed} done · ${stats.sessionsThisMonth.cancelled} cancelled`}
              />
              {(() => {
                const rev = stats.revenueThisMonth;
                const prev = stats.revenueLastMonth;
                const pct = prev > 0 ? Math.round(((rev - prev) / prev) * 100) : null;
                const up = pct !== null && pct >= 0;
                return (
                  <StatCard
                    label="Revenue This Month"
                    value={fmtRupees(rev)}
                    sub={pct !== null ? `${up ? "▲" : "▼"} ${Math.abs(pct)}% vs last month` : "No data last month"}
                    accent={pct !== null ? (up ? "green" : "red") : "default"}
                  />
                );
              })()}
              <StatCard
                label="Upcoming This Week"
                value={stats.upcomingThisWeekCount}
                rawValue={stats.upcomingThisWeekCount}
                sub="scheduled sessions"
              />
            </div>
          )}

          {/* ── Middle row ───────────────────────────────────────────────── */}
          {isMobile ? (
            /* Mobile: stacked sections */
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

              {/* Today's Sessions — mobile cards */}
              <div style={sectionCard}>
                <div style={sectionTitle}>Today's Sessions</div>
                {stats.upcomingToday.length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: 11, paddingTop: 8 }}>No sessions scheduled for today.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {stats.upcomingToday.map((s) => (
                      <div key={s.id} style={{ padding: "10px 12px", background: "#fdfbf9", borderRadius: 8, border: "1px solid #ede7df" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2535" }}>{s.patientName}</div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.therapistName}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#2d6b5f" }}>{fmtTime(s.startTime)}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{fmtDuration(s.durationMins)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Therapist Utilisation — mobile */}
              <div style={sectionCard}>
                <div style={sectionTitle}>Therapist Activity (This Week)</div>
                {stats.therapistUtilisation.length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: 11, paddingTop: 8 }}>No session data.</div>
                ) : (() => {
                  const max = Math.max(...stats.therapistUtilisation.map((t) => t.sessionsThisWeek), 1);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                      {stats.therapistUtilisation.map((t) => (
                        <div key={t.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                            <span style={{ color: "#334155", fontWeight: 500 }}>{t.name}</span>
                            <span style={{ color: "#64748b" }}>{t.sessionsThisWeek} sessions</span>
                          </div>
                          <div style={{ background: "#e2e8f0", borderRadius: 4, height: 6 }}>
                            <div style={{
                              background: "linear-gradient(90deg, #2d6b5f, #4aa895)",
                              borderRadius: 4,
                              height: 6,
                              width: `${(t.sessionsThisWeek / max) * 100}%`,
                              transition: "width 0.5s ease",
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Referral Sources — mobile */}
              <div style={sectionCard}>
                <div style={sectionTitle}>Referral Sources</div>
                {stats.referralSources.length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: 11, paddingTop: 8 }}>No referral data.</div>
                ) : (() => {
                  const total = stats.referralSources.reduce((s, r) => s + r.count, 0);
                  const colours = ["#2d6b5f", "#4aa895", "#7fd4c4", "#a8e6da", "#c8f0ea", "#ddf6f2"];
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      {stats.referralSources.map((r, i) => {
                        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                        return (
                          <div key={r.source} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: colours[i % colours.length], flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 12, color: "#334155" }}>{r.source}</div>
                            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{r.count}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8", minWidth: 30, textAlign: "right" }}>{pct}%</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            /* Desktop: flex row */
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>

              {/* Today's Sessions */}
              <div style={{ ...sectionCard, flex: "1.6 1 300px" }}>
                <div style={sectionTitle}>Today's Sessions</div>
                {stats.upcomingToday.length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: 11, paddingTop: 8 }}>No sessions scheduled for today.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Patient", "Therapist", "Time", "Duration"].map((h) => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.upcomingToday.map((s) => (
                        <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={td}>{s.patientName}</td>
                          <td style={td}>{s.therapistName}</td>
                          <td style={td}>{fmtTime(s.startTime)}</td>
                          <td style={td}>{fmtDuration(s.durationMins)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Therapist Utilisation */}
              <div style={{ ...sectionCard, flex: "1 1 200px" }}>
                <div style={sectionTitle}>Therapist Activity (This Week)</div>
                {stats.therapistUtilisation.length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: 11, paddingTop: 8 }}>No session data.</div>
                ) : (() => {
                  const max = Math.max(...stats.therapistUtilisation.map((t) => t.sessionsThisWeek), 1);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                      {stats.therapistUtilisation.map((t) => (
                        <div key={t.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                            <span style={{ color: "#334155", fontWeight: 500 }}>{t.name}</span>
                            <span style={{ color: "#64748b" }}>{t.sessionsThisWeek} sessions</span>
                          </div>
                          <div style={{ background: "#e2e8f0", borderRadius: 4, height: 6 }}>
                            <div style={{
                              background: "linear-gradient(90deg, #2d6b5f, #4aa895)",
                              borderRadius: 4,
                              height: 6,
                              width: `${(t.sessionsThisWeek / max) * 100}%`,
                              transition: "width 0.5s ease",
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Referral Sources */}
              <div style={{ ...sectionCard, flex: "1 1 180px" }}>
                <div style={sectionTitle}>Referral Sources</div>
                {stats.referralSources.length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: 11, paddingTop: 8 }}>No referral data.</div>
                ) : (() => {
                  const total = stats.referralSources.reduce((s, r) => s + r.count, 0);
                  const colours = ["#2d6b5f", "#4aa895", "#7fd4c4", "#a8e6da", "#c8f0ea", "#ddf6f2"];
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      {stats.referralSources.map((r, i) => {
                        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                        return (
                          <div key={r.source} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: colours[i % colours.length], flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 11, color: "#334155" }}>{r.source}</div>
                            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{r.count}</div>
                            <div style={{ fontSize: 10, color: "#94a3b8", minWidth: 30, textAlign: "right" }}>{pct}%</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 10,
  padding: "16px 18px",
  flex: "1 1 140px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  minWidth: 140,
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
  padding: "6px 8px",
};
