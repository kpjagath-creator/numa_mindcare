// Sidebar navigation with gradient background and animated active indicator.

import { NavLink } from "react-router-dom";

const links = [
  { to: "/",        label: "Dashboard", icon: "📊", end: true  },
  { to: "/patients",label: "Patients",  icon: "👤", end: false },
  { to: "/team",    label: "Team",      icon: "🧑‍⚕️", end: false },
  { to: "/schedule",label: "Schedule",  icon: "📅", end: false },
  { to: "/billing", label: "Billing",   icon: "₹",  end: false },
];

interface Props { onClose?: () => void; }

export default function Sidebar({ onClose }: Props) {
  return (
    <aside className="layout-sidebar" style={s.sidebar}>
      {/* Brand */}
      <div style={s.brandArea}>
        <div style={s.logoWrap}>
          <img
            src="/logo.png"
            alt="Numa"
            style={s.logo}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        <span className="brand-text" style={s.brandText}>Numa Mindcare</span>
        {onClose && (
          <button onClick={onClose} style={s.closeBtn} aria-label="Close menu">✕</button>
        )}
      </div>

      {/* Divider */}
      <div style={s.divider} />

      {/* Nav */}
      <nav style={{ padding: "6px 0", flex: 1 }}>
        {links.map(({ to, label, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            style={({ isActive }) => ({
              ...s.link,
              ...(isActive ? s.activeLink : s.inactiveLink),
            })}
          >
            <span style={s.icon}>{icon}</span>
            <span className="sidebar-label" style={s.label}>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={s.footer}>
        <span className="brand-text" style={s.footerText}>v1.0</span>
      </div>
    </aside>
  );
}

const s: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 172,
    minHeight: "100vh",
    background: "linear-gradient(170deg, #1a4a41 0%, #256057 55%, #2d6b5f 100%)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    boxShadow: "2px 0 12px rgba(0,0,0,0.12)",
  },
  brandArea: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "18px 16px 16px",
  },
  logoWrap: {
    width: 32, height: 32,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.12)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  logo: { width: 26, height: 26, objectFit: "contain" },
  brandText: {
    color: "#d4ede8",
    fontWeight: 700,
    fontSize: 13,
    lineHeight: 1.3,
    letterSpacing: "0.01em",
    flex: 1,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
    cursor: "pointer",
    padding: "2px 4px",
    lineHeight: 1,
    flexShrink: 0,
  },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.08)",
    margin: "0 12px 6px",
  },
  link: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "9px 12px",
    margin: "1px 8px",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 12.5,
    fontWeight: 500,
    transition: "background 0.14s ease, color 0.14s ease",
    position: "relative",
  },
  inactiveLink: {
    color: "#8bbcb4",
  },
  activeLink: {
    background: "rgba(255,255,255,0.14)",
    color: "#ffffff",
    fontWeight: 600,
    boxShadow: "inset 3px 0 0 #7adece",
  },
  icon: { fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 },
  label: { fontSize: 12.5 },
  footer: {
    padding: "12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  footerText: { fontSize: 10, color: "rgba(255,255,255,0.25)" },
};
