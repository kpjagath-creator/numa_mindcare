// Skeleton loader for table pages — shows animated placeholder rows.

interface Props {
  columns?: number;
  rows?: number;
}

export default function SkeletonTable({ columns = 6, rows = 5 }: Props) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)", border: "1px solid #E8EDF2" }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -600px 0; }
          100% { background-position: 600px 0; }
        }
        .sk-cell {
          height: 12px;
          border-radius: 4px;
          background: linear-gradient(90deg, #f0ebe4 25%, #e6e0d8 50%, #f0ebe4 75%);
          background-size: 1200px 100%;
          animation: shimmer 1.6s infinite linear;
        }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", gap: 16, padding: "10px 14px", background: "#f7f2ec", borderBottom: "1px solid #ede7df" }}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="sk-cell" style={{ flex: i === 0 ? "0 0 80px" : 1, height: 10 }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: 16, padding: "12px 14px", borderBottom: "1px solid #f5f0ea" }}>
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className="sk-cell" style={{ flex: c === 0 ? "0 0 80px" : 1, width: c === columns - 1 ? "60%" : undefined }} />
          ))}
        </div>
      ))}
    </div>
  );
}
