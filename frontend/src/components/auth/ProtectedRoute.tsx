// Gate for authenticated (and optionally permission-scoped) routes.
//
// Unauthenticated → /login. Authenticated but missing a required permission
// → redirected to the dashboard rather than a bare "403" page, since with a
// single admin role today that path is unreachable in practice; it still
// exists so a future restricted role degrades gracefully instead of
// rendering a page it has no data for.

import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import Spinner from "../ui/Spinner";

interface Props {
  children: ReactNode;
  permission?: string;
}

export default function ProtectedRoute({ children, permission }: Props) {
  const { user, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
