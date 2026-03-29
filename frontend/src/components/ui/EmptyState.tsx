// Empty state illustration with optional CTA.

interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction }: Props) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "56px 24px", textAlign: "center",
    }}>
      <div style={{ fontSize: 44, marginBottom: 14, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 18, maxWidth: 280 }}>{subtitle}</div>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            padding: "0 20px", height: 40, background: "#3D9E8E", color: "#fff", border: "none",
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
