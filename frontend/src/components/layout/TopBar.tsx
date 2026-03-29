// Top bar — page title with subtle shadow.

import React from "react";

interface Props { title?: string; onMenuClick?: () => void; }

function getTodayLabel(): string {
  return new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function TopBar({ title }: Props) {
  const isDashboard = !title || title === "Dashboard";
  return (
    <header style={s.bar}>
      <div>
        <span style={s.title}>{title ?? "Numa Mindcare"}</span>
        {isDashboard && (
          <div style={s.subtitle}>Today, {getTodayLabel()}</div>
        )}
      </div>
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
};
