// Root layout shell.

import { ReactNode, useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

interface Props { children: ReactNode; title?: string; }

export default function Layout({ children, title }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div style={s.shell}>
      <Sidebar />

      {/* Mobile overlay sidebar */}
      {mobileNavOpen && (
        <>
          {/* Backdrop */}
          <div
            style={s.backdrop}
            onClick={() => setMobileNavOpen(false)}
          />
          {/* Slide-out sidebar */}
          <div style={s.overlayPane}>
            <Sidebar onClose={() => setMobileNavOpen(false)} />
          </div>
        </>
      )}

      <div style={s.main}>
        <TopBar title={title} onMenuClick={() => setMobileNavOpen(true)} />
        <div style={s.content}>
          <div className="page-fade">{children}</div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell:   { display: "flex", minHeight: "100vh", background: "#eee8e0", width: "100%" },
  main:    { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  content: { flex: 1, padding: "22px 26px", overflowY: "auto" },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    zIndex: 100,
  },
  overlayPane: {
    position: "fixed",
    top: 0,
    left: 0,
    height: "100vh",
    zIndex: 101,
    width: 210,
  },
};
