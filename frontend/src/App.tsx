import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AssistantProvider } from './context/AssistantContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RoleProtectedRoute } from './auth/RoleProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

import { LoginPage } from './pages/Login/LoginPage';
import { AdminDashboard } from './pages/Dashboard/AdminDashboard';
import { EmployeeDashboard } from './pages/Dashboard/EmployeeDashboard';
import { AttendancePage } from './pages/Attendance/AttendancePage';
import { ReportsPage } from './pages/Reports/ReportsPage';
import { EmployeesPage } from './pages/Employees/EmployeesPage';
import { ViolationsPage } from './pages/Violations/ViolationsPage';
import { ProfilePage } from './pages/Profile/ProfilePage';
import { LeavesPage } from './pages/Leaves/LeavesPage';

const DashboardRouter: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === 'ADMIN') {
    return <AdminDashboard />;
  }
  return <EmployeeDashboard />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AssistantProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardRouter />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="leaves" element={<LeavesPage />} />
            <Route path="profile" element={<ProfilePage />} />

            {/* Admin-only Routes */}
            <Route
              path="employees"
              element={
                <RoleProtectedRoute allowedRoles={['ADMIN']}>
                  <EmployeesPage />
                </RoleProtectedRoute>
              }
            />
            <Route
              path="reports"
              element={
                <RoleProtectedRoute allowedRoles={['ADMIN']}>
                  <ReportsPage />
                </RoleProtectedRoute>
              }
            />
            <Route
              path="violations"
              element={
                <RoleProtectedRoute allowedRoles={['ADMIN']}>
                  <ViolationsPage />
                </RoleProtectedRoute>
              }
            />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </AssistantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
