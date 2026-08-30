// Top bar — page title with subtle shadow, plus the signed-in user menu.

import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

interface Props { title?: string; onMenuClick?: () => void; }

function getTodayLabel(): string {
  return new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function initialsOf(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function TopBar({ title }: Props) {
  const isDashboard = !title || title === "Dashboard";
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header style={s.bar}>
      <div>
        <span style={s.title}>{title ?? "Numa Mindcare"}</span>
        {isDashboard && (
          <div style={s.subtitle}>Today, {getTodayLabel()}</div>
        )}
      </div>

      {user && (
        <div style={s.userMenuWrap} ref={menuRef}>
          <button
            style={s.avatarBtn}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Account menu"
          >
            {initialsOf(user.name)}
          </button>
          {menuOpen && (
            <>
              <div style={s.menuBackdrop} onClick={() => setMenuOpen(false)} />
              <div style={s.menu}>
                <div style={s.menuHeader}>
                  <div style={s.menuName}>{user.name}</div>
                  <div style={s.menuRole}>{user.role}</div>
                </div>
                <button
                  style={s.menuItem}
                  onClick={() => { setMenuOpen(false); navigate("/change-password"); }}
                >
                  Change Password
                </button>
                <button style={{ ...s.menuItem, color: "#b91c1c" }} onClick={handleLogout}>
                  Log Out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}

const s: Record<string, React.CSSProperties> = {
  bar: {
    height: 56,
    background: "#ffffff",
    borderBottom: "1px solid #E8EDF2",
    boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 28px",
    gap: 10,
    flexShrink: 0,
    zIndex: 10,
    position: "relative",
  },
  title: {
    fontWeight: 700,
    fontSize: 18,
    color: "#0F172A",
    letterSpacing: "-0.02em",
    display: "block",
  },
  subtitle: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: 500,
    marginTop: 1,
  },
  userMenuWrap: { position: "relative" },
  avatarBtn: {
    width: 34, height: 34, borderRadius: "50%",
    background: "#3D9E8E", color: "#fff",
    border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  menuBackdrop: { position: "fixed", inset: 0, zIndex: 90 },
  menu: {
    position: "absolute", top: 44, right: 0, zIndex: 100,
    background: "#fff", borderRadius: 10, minWidth: 190,
    boxShadow: "0 4px 14px rgba(0,0,0,0.12)", border: "1px solid #E8EDF2",
    overflow: "hidden",
  },
  menuHeader: { padding: "12px 14px", borderBottom: "1px solid #E8EDF2" },
  menuName: { fontSize: 13, fontWeight: 700, color: "#0F172A" },
  menuRole: { fontSize: 11, color: "#94A3B8", textTransform: "capitalize", marginTop: 2 },
  menuItem: {
    display: "block", width: "100%", textAlign: "left",
    padding: "10px 14px", background: "none", border: "none",
    fontSize: 12.5, color: "#0F172A", cursor: "pointer",
  },
};
