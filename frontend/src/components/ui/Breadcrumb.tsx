// Breadcrumb navigation component.
import { Link } from "react-router-dom";

interface Crumb { label: string; to?: string; }

interface Props { crumbs: Crumb[]; }

export default function Breadcrumb({ crumbs }: Props) {
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 11, color: "#8a96a3" }}>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span style={{ color: "#c8c0b8" }}>›</span>}
          {c.to
            ? <Link to={c.to} style={{ color: "#3D9E8E", textDecoration: "none", fontWeight: 500 }}>{c.label}</Link>
            : <span style={{ color: "#0F172A", fontWeight: 600 }}>{c.label}</span>
          }
        </span>
      ))}
    </nav>
  );
}
