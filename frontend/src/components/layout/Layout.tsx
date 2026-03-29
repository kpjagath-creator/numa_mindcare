// Root layout shell.

import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import MobileBottomNav from "./MobileBottomNav";
import { useIsMobile } from "../../hooks/useIsMobile";

interface Props { children: ReactNode; title?: string; }

export default function Layout({ children, title }: Props) {
  const isMobile = useIsMobile();

  return (
    <div style={s.shell}>
      <Sidebar />
      <div style={s.main}>
        <TopBar title={title} onMenuClick={() => {}} />
        <div style={{ ...s.content, paddingBottom: isMobile ? "80px" : "28px" }}>
          <div className="page-fade">{children}</div>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell:   { display: "flex", minHeight: "100vh", background: "#F7F2EC", width: "100%" },
  main:    { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  content: { flex: 1, padding: "24px 28px", overflowY: "auto" },
};
