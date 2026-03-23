// Top bar — page title with subtle shadow.

interface Props { title?: string; onMenuClick?: () => void; }

export default function TopBar({ title }: Props) {
  return (
    <header style={s.bar}>
      <span style={s.title}>{title ?? "Numa Mindcare"}</span>
    </header>
  );
}

const s: Record<string, React.CSSProperties> = {
  bar: {
    height: 50,
    background: "#ffffff",
    boxShadow: "0 1px 0 rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)",
    display: "flex",
    alignItems: "center",
    padding: "0 24px",
    gap: 10,
    flexShrink: 0,
    zIndex: 10,
    position: "relative",
  },
  title: {
    fontWeight: 600,
    fontSize: 13,
    color: "#1a2535",
    letterSpacing: "0.01em",
  },
};
