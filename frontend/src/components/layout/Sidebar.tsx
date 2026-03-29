// Sidebar navigation — SVG line-icons, 240px expanded / 64px icon-only at ≤1024px.

import { NavLink } from "react-router-dom";

// ── SVG line icons (Lucide-style) ─────────────────────────────────────────────
function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function IconPatients() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconTeam() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IconSchedule() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <line x1="8" y1="14" x2="8" y2="14" strokeWidth="2.5"/>
      <line x1="12" y1="14" x2="12" y2="14" strokeWidth="2.5"/>
    </svg>
  );
}

function IconBilling() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

const links = [
  { to: "/",         label: "Dashboard", Icon: IconDashboard, end: true  },
  { to: "/patients", label: "Patients",  Icon: IconPatients,  end: false },
  { to: "/team",     label: "Team",      Icon: IconTeam,      end: false },
  { to: "/schedule", label: "Schedule",  Icon: IconSchedule,  end: false },
  { to: "/billing",  label: "Billing",   Icon: IconBilling,   end: false },
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
          <button onClick={onClose} style={s.closeBtn} aria-label="Close menu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* Divider */}
      <div style={s.divider} />

      {/* Nav */}
      <nav style={{ padding: "8px 0", flex: 1 }}>
        {links.map(({ to, label, Icon, end }) => (
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
            {({ isActive }) => (
              <>
                <span style={{ ...s.iconWrap, color: isActive ? "#fff" : "rgba(255,255,255,0.55)" }}>
                  <Icon />
                </span>
                <span className="sidebar-label" style={{ ...s.label, color: isActive ? "#fff" : "rgba(255,255,255,0.65)" }}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

const s: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 240,
    minHeight: "100vh",
    background: "linear-gradient(170deg, #0D3D36 0%, #1A5C52 55%, #2E7D70 100%)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    boxShadow: "2px 0 16px rgba(0,0,0,0.15)",
  },
  brandArea: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "20px 16px 18px",
    minHeight: 56,
  },
  logoWrap: {
    width: 32, height: 32,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.15)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  logo: { width: 26, height: 26, objectFit: "contain" },
  brandText: {
    color: "#d4ede8",
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
    flex: 1,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.7)",
    cursor: "pointer",
    padding: "4px",
    display: "flex",
    alignItems: "center",
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
    gap: 10,
    padding: "10px 12px",
    margin: "2px 10px",
    borderRadius: 10,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
    transition: "background 0.14s ease",
    position: "relative",
  },
  inactiveLink: {
    background: "transparent",
  },
  activeLink: {
    background: "rgba(255,255,255,0.16)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
  },
  iconWrap: { display: "flex", alignItems: "center", flexShrink: 0, width: 20 },
  label: { fontSize: 14, fontWeight: 500, letterSpacing: "0.01em" },
};
