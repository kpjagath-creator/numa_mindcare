// Root application component — configures React Router with all platform routes.

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import LoginPage from "./pages/auth/LoginPage";
import ChangePasswordPage from "./pages/auth/ChangePasswordPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import BillingPage from "./pages/billing/BillingPage";
import PatientListPage from "./pages/patients/PatientListPage";
import RegisterPatientPage from "./pages/patients/RegisterPatientPage";
import PatientProfilePage from "./pages/patients/PatientProfilePage";
import TeamListPage from "./pages/team/TeamListPage";
import AddTeamMemberPage from "./pages/team/AddTeamMemberPage";
import TeamMemberPatientsPage from "./pages/team/TeamMemberPatientsPage";
import ScheduleListPage from "./pages/schedule/ScheduleListPage";

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute permission="analytics:read"><BillingPage /></ProtectedRoute>} />
            <Route path="/patients" element={<ProtectedRoute permission="patients:read"><PatientListPage /></ProtectedRoute>} />
            <Route path="/patients/new" element={<ProtectedRoute permission="patients:create"><RegisterPatientPage /></ProtectedRoute>} />
            <Route path="/patients/:id" element={<ProtectedRoute permission="patients:read"><PatientProfilePage /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute permission="team:read"><TeamListPage /></ProtectedRoute>} />
            <Route path="/team/new" element={<ProtectedRoute permission="team:create"><AddTeamMemberPage /></ProtectedRoute>} />
            <Route path="/team/:id/patients" element={<ProtectedRoute permission="team:read"><TeamMemberPatientsPage /></ProtectedRoute>} />
            <Route path="/schedule" element={<ProtectedRoute permission="sessions:read"><ScheduleListPage /></ProtectedRoute>} />

            {/* Catch-all: redirect unknown routes to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}
