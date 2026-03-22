// Root application component — configures React Router with all platform routes.

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./components/ui/Toast";
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
        <Routes>
          <Route path="/"          element={<DashboardPage />} />
          <Route path="/billing"   element={<BillingPage />} />
          <Route path="/patients"  element={<PatientListPage />} />
          <Route path="/patients/new" element={<RegisterPatientPage />} />
          <Route path="/patients/:id" element={<PatientProfilePage />} />
          <Route path="/team"      element={<TeamListPage />} />
          <Route path="/team/new"  element={<AddTeamMemberPage />} />
          <Route path="/team/:id/patients" element={<TeamMemberPatientsPage />} />
          <Route path="/schedule"  element={<ScheduleListPage />} />
          {/* Catch-all: redirect unknown routes to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
