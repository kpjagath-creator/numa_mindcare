// Mobile bottom navigation bar — shown only on mobile (≤640px).

import { NavLink } from "react-router-dom";
import { useIsMobile } from "../../hooks/useIsMobile";

const navItems = [
  { to: "/",         label: "Dashboard", icon: "🏠", end: true  },
  { to: "/patients", label: "Patients",  icon: "👥", end: false },
  { to: "/schedule", label: "Schedule",  icon: "📅", end: false },
  { to: "/team",     label: "Team",      icon: "👤", end: false },
  { to: "/billing",  label: "Billing",   icon: "💰", end: false },
];

export default function MobileBottomNav() {
  const isMobile = useIsMobile();
  if (!isMobile) return null;

  return (
    <nav
      className="mobile-bottom-nav"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        background: "#ffffff",
        borderTop: "1px solid #ddd5cb",
        display: "flex",
        alignItems: "stretch",
        zIndex: 200,
        paddingBottom: "env(safe-area-inset-bottom, 8px)",
      }}
    >
      {navItems.map(({ to, label, icon, end }) => (
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
            gap: 3,
            textDecoration: "none",
            color: isActive ? "#2d6b5f" : "#64748b",
            fontSize: 10,
            fontWeight: isActive ? 700 : 500,
            borderTop: isActive ? "2px solid #2d6b5f" : "2px solid transparent",
            paddingTop: 4,
            transition: "color 0.15s ease",
          })}
        >
          <span style={{ fontSize: 24, lineHeight: 1 }}>{icon}</span>
          <span style={{ fontSize: 10 }}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
