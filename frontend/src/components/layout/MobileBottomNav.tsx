// Mobile bottom navigation bar — shown only on mobile (≤640px).

import { NavLink } from "react-router-dom";
import { useIsMobile } from "../../hooks/useIsMobile";

const navItems = [
  {
    to: "/", label: "Dashboard", end: true,
    icon: (filled: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "#3D9E8E" : "none"} stroke={filled ? "#3D9E8E" : "#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    to: "/patients", label: "Patients", end: false,
    icon: (filled: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={filled ? "#3D9E8E" : "#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4" fill={filled ? "#E8F5F3" : "none"}/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    to: "/schedule", label: "Schedule", end: false,
    icon: (filled: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "#E8F5F3" : "none"} stroke={filled ? "#3D9E8E" : "#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    to: "/team", label: "Team", end: false,
    icon: (filled: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={filled ? "#3D9E8E" : "#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4" fill={filled ? "#E8F5F3" : "none"}/>
      </svg>
    ),
  },
  {
    to: "/billing", label: "Billing", end: false,
    icon: (filled: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "#E8F5F3" : "none"} stroke={filled ? "#3D9E8E" : "#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
];

export default function MobileBottomNav() {
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: 64, background: "#ffffff",
      borderTop: "1px solid #E2E8F0",
      boxShadow: "0 -2px 12px rgba(0,0,0,0.06)",
      display: "flex", alignItems: "stretch",
      zIndex: 200,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {navItems.map(({ to, label, end, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          style={({ isActive }) => ({
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            textDecoration: "none",
            color: isActive ? "#3D9E8E" : "#94A3B8",
            fontSize: 10,
            fontWeight: isActive ? 700 : 500,
            paddingTop: 4,
            transition: "color 0.15s ease",
            position: "relative",
          })}
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <div style={{
                  position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                  width: 24, height: 3, borderRadius: "0 0 3px 3px",
                  background: "#3D9E8E",
                }} />
              )}
              {icon(isActive)}
              <span style={{ fontSize: 10, color: isActive ? "#3D9E8E" : "#94A3B8", fontWeight: isActive ? 700 : 400 }}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
