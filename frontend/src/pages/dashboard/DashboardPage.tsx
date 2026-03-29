// Dashboard — real-time KPI cards, today's sessions, therapist utilisation, referral sources.

import React, { useEffect, useState } from "react";
import Layout from "../../components/layout/Layout";
import { getDashboardStats, DashboardStats } from "../../api/analytics";
import { useIsMobile } from "../../hooks/useIsMobile";

// ── Uniform teal color for all therapist bars ──────────────────────────────
const THERAPIST_BAR = "linear-gradient(90deg, #3D9E8E, #4BBCAC)";

// ── Uniform teal for all referral source dots ──────────────────────────────
const REFERRAL_DOT = "#3D9E8E";

// ── Uniform KPI accent — teal across all cards ────────────────────────────
const KPI_ACCENT = [
  { accent: "#3D9E8E", bg: "#EEF9F7" },
  { accent: "#3D9E8E", bg: "#EEF9F7" },
  { accent: "#3D9E8E", bg: "#EEF9F7" },
  { accent: "#3D9E8E", bg: "#EEF9F7" },
];

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
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return current;
}

function StatCard({
  label, value, rawValue, sub, accentColor, bgColor, isRevenue,
}: {
  label: string;
  value: string | number;
  rawValue?: number;
  sub?: string;
  accentColor?: string;
  bgColor?: string;
  isRevenue?: boolean;
}) {
  const animated = useCountUp(rawValue ?? 0);
  const displayValue = rawValue !== undefined ? animated : value;
  const numberColor = accentColor ?? "#0F172A";

  return (
    <div style={{
      background: bgColor ?? "#FFFFFF",
      borderRadius: 16,
      padding: "18px 20px",
      flex: "1 1 150px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
      border: "1px solid #E8EDF2",
      borderTop: accentColor ? `3px solid ${accentColor}` : undefined,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: numberColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {displayValue}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}

function Skeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <div>
      {isMobile ? (
        <>
          <div className="kpi-grid-mobile" style={{ marginBottom: 16 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: 80, borderRadius: 14 }} className="skeleton" />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 100, borderRadius: 14 }} className="skeleton" />
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ height: 96, flex: 1, borderRadius: 16 }} className="skeleton" />
            ))}
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ flex: 1.6, height: 240, borderRadius: 16 }} className="skeleton" />
            <div style={{ flex: 1, height: 240, borderRadius: 16 }} className="skeleton" />
            <div style={{ flex: 1, height: 240, borderRadius: 16 }} className="skeleton" />
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
      {loading && <Skeleton isMobile={isMobile} />}
      {error && (
        <div style={{ color: "#DC2626", background: "#FEE2E2", padding: "12px 16px", borderRadius: 10, fontSize: 13, border: "1px solid #FECACA" }}>
          {error}
        </div>
      )}

      {stats && (
        <>
          {/* ── KPI Row ───────────────────────────────────────────────────── */}
          {isMobile ? (
            <div className="kpi-grid-mobile" style={{ marginBottom: 14 }}>
              <StatCard
                label="Active Patients"
                value={stats.totalActivePatients}
                rawValue={stats.totalActivePatients}
                sub={`+${stats.newPatientsThisMonth} new`}
                accentColor={KPI_ACCENT[0].accent}
                bgColor={KPI_ACCENT[0].bg}
              />
              <StatCard
                label="This Week"
                value={stats.sessionsThisWeek.completed + stats.sessionsThisWeek.upcoming + stats.sessionsThisWeek.cancelled}
                rawValue={stats.sessionsThisWeek.completed + stats.sessionsThisWeek.upcoming + stats.sessionsThisWeek.cancelled}
                sub={`${stats.sessionsThisWeek.completed} done`}
                accentColor={KPI_ACCENT[1].accent}
                bgColor={KPI_ACCENT[1].bg}
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
                    accentColor={KPI_ACCENT[2].accent}
                    bgColor={KPI_ACCENT[2].bg}
                    isRevenue
                  />
                );
              })()}
              <StatCard
                label="Upcoming"
                value={stats.upcomingThisWeekCount}
                rawValue={stats.upcomingThisWeekCount}
                sub="this week"
                accentColor={KPI_ACCENT[3].accent}
                bgColor={KPI_ACCENT[3].bg}
              />
            </div>
          ) : (
            /* Desktop: horizontal row */
            <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
              <StatCard
                label="Active Patients"
                value={stats.totalActivePatients}
                rawValue={stats.totalActivePatients}
                sub={`+${stats.newPatientsThisMonth} new this month`}
                accentColor="#3D9E8E"
              />
              <StatCard
                label="Sessions This Week"
                value={stats.sessionsThisWeek.completed + stats.sessionsThisWeek.upcoming + stats.sessionsThisWeek.cancelled}
                rawValue={stats.sessionsThisWeek.completed + stats.sessionsThisWeek.upcoming + stats.sessionsThisWeek.cancelled}
                sub={`${stats.sessionsThisWeek.completed} done · ${stats.sessionsThisWeek.cancelled} cancelled`}
                accentColor="#3D9E8E"
              />
              <StatCard
                label="Sessions This Month"
                value={stats.sessionsThisMonth.completed + stats.sessionsThisMonth.upcoming + stats.sessionsThisMonth.cancelled}
                rawValue={stats.sessionsThisMonth.completed + stats.sessionsThisMonth.upcoming + stats.sessionsThisMonth.cancelled}
                sub={`${stats.sessionsThisMonth.completed} done · ${stats.sessionsThisMonth.cancelled} cancelled`}
                accentColor="#3D9E8E"
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
                    accentColor="#16A34A"
                    isRevenue
                  />
                );
              })()}
              <StatCard
                label="Upcoming This Week"
                value={stats.upcomingThisWeekCount}
                rawValue={stats.upcomingThisWeekCount}
                sub="scheduled sessions"
                accentColor="#3D9E8E"
              />
            </div>
          )}

          {/* ── Middle row ───────────────────────────────────────────────── */}
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Today's Sessions — mobile cards */}
              <div style={sectionCard}>
                <div className="section-label" style={{ marginTop: 0 }}>Today's Sessions</div>
                {stats.upcomingToday.length === 0 ? (
                  <div style={{ color: "#94A3B8", fontSize: 13, paddingTop: 8 }}>No sessions scheduled for today.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {stats.upcomingToday.map((s) => {
                      const isPast = new Date(s.startTime) < new Date();
                      return (
                        <div key={s.id} style={{ padding: "10px 12px", background: "#F8FAFC", borderRadius: 10, border: "1px solid #EEF2F7" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{s.patientName}</div>
                              <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{s.therapistName}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span style={{
                                display: "inline-block",
                                padding: "3px 10px",
                                borderRadius: 9999,
                                fontSize: 12,
                                fontWeight: 700,
                                background: isPast ? "#DCFCE7" : "#EEF9F7",
                                color: isPast ? "#16A34A" : "#3D9E8E",
                              }}>
                                {fmtTime(s.startTime)}
                              </span>
                              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{fmtDuration(s.durationMins)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Therapist Utilisation — mobile */}
              <div style={sectionCard}>
                <div className="section-label" style={{ marginTop: 0 }}>Therapist Activity (This Week)</div>
                {stats.therapistUtilisation.length === 0 ? (
                  <div style={{ color: "#94A3B8", fontSize: 13, paddingTop: 8 }}>No session data.</div>
                ) : (() => {
                  const max = Math.max(...stats.therapistUtilisation.map((t) => t.sessionsThisWeek), 1);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
                      {stats.therapistUtilisation.map((t, i) => (
                        <div key={t.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                            <span style={{ color: "#334155", fontWeight: 500 }}>{t.name}</span>
                            <span style={{ color: "#64748B" }}>{t.sessionsThisWeek} sessions</span>
                          </div>
                          <div style={{ background: "#E8EDF2", borderRadius: 4, height: 7 }}>
                            <div style={{
                              background: THERAPIST_BAR,
                              borderRadius: 4,
                              height: 7,
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
                <div className="section-label" style={{ marginTop: 0 }}>Referral Sources</div>
                {stats.referralSources.length === 0 ? (
                  <div style={{ color: "#94A3B8", fontSize: 13, paddingTop: 8 }}>No referral data.</div>
                ) : (() => {
                  const total = stats.referralSources.reduce((s, r) => s + r.count, 0);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                      {stats.referralSources.map((r, i) => {
                        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                        return (
                          <div key={r.source} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: REFERRAL_DOT, flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 13, color: "#334155" }}>{r.source}</div>
                            <div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>{r.count}</div>
                            <div style={{ fontSize: 12, color: "#94A3B8", minWidth: 34, textAlign: "right" }}>{pct}%</div>
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
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>

              {/* Today's Sessions */}
              <div style={{ ...sectionCard, flex: "1.6 1 300px" }}>
                <div style={sectionTitle}>Today's Sessions</div>
                {stats.upcomingToday.length === 0 ? (
                  <div style={{ color: "#94A3B8", fontSize: 13, paddingTop: 8 }}>No sessions scheduled for today.</div>
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
                        <tr key={s.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
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

              {/* Therapist Utilisation — distinct colors per bar */}
              <div style={{ ...sectionCard, flex: "1 1 200px" }}>
                <div style={sectionTitle}>Therapist Activity (This Week)</div>
                {stats.therapistUtilisation.length === 0 ? (
                  <div style={{ color: "#94A3B8", fontSize: 12, paddingTop: 8 }}>No session data.</div>
                ) : (() => {
                  const max = Math.max(...stats.therapistUtilisation.map((t) => t.sessionsThisWeek), 1);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                      {stats.therapistUtilisation.map((t, i) => (
                        <div key={t.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: "#334155", fontWeight: 500 }}>{t.name}</span>
                            <span style={{ color: "#64748B" }}>{t.sessionsThisWeek} sessions</span>
                          </div>
                          <div style={{ background: "#E8EDF2", borderRadius: 4, height: 7 }}>
                            <div style={{
                              background: THERAPIST_BAR,
                              borderRadius: 4,
                              height: 7,
                              width: `${(t.sessionsThisWeek / max) * 100}%`,
                              transition: "width 0.6s ease",
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Referral Sources — distinct colors */}
              <div style={{ ...sectionCard, flex: "1 1 180px" }}>
                <div style={sectionTitle}>Referral Sources</div>
                {stats.referralSources.length === 0 ? (
                  <div style={{ color: "#94A3B8", fontSize: 12, paddingTop: 8 }}>No referral data.</div>
                ) : (() => {
                  const total = stats.referralSources.reduce((s, r) => s + r.count, 0);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                      {stats.referralSources.map((r, i) => {
                        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
                        return (
                          <div key={r.source} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: REFERRAL_DOT, flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 12, color: "#334155" }}>{r.source}</div>
                            <div style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>{r.count}</div>
                            <div style={{ fontSize: 11, color: "#94A3B8", minWidth: 32, textAlign: "right" }}>{pct}%</div>
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

const sectionCard: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 16,
  padding: "18px 20px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
  border: "1px solid #E8EDF2",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#94A3B8",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 12,
  borderBottom: "1px solid #F1F5F9",
  paddingBottom: 10,
};

const th: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#94A3B8",
  textAlign: "left",
  padding: "4px 8px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const td: React.CSSProperties = {
  fontSize: 13,
  color: "#334155",
  padding: "8px 8px",
};
