import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import { LandingPage } from './features/landing/LandingPage';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { UnifiedInboxPage } from './features/inbox/UnifiedInboxPage';
import { TaskManagementPage } from './features/tasks/TaskManagementPage';
import { GithubReporterPage } from './features/github/GithubReporterPage';
import { BotCommanderPage } from './features/bots/BotCommanderPage';
import { ReportsExportPage } from './features/reports/ReportsExportPage';
import { SiteMonitorPage } from './features/monitor/SiteMonitorPage';
import { ProfileSettingsPage } from './features/profile/ProfileSettingsPage';
import { Loader2 } from 'lucide-react';
import { AutomationStudioPage } from './features/studio/AutomationStudioPage';
import { CoursesManagerPage } from './features/courses/CoursesManagerPage';

const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-3 transition-colors">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600 dark:text-violet-400" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Đang xác thực phiên làm việc...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout />;
};

const AppContent: React.FC = () => {
  const { theme } = useTheme();

  return (
    <>
      <Toaster
        richColors
        position="top-right"
        theme={theme}
        closeButton
      />
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Admin Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/inbox" element={<UnifiedInboxPage />} />
            <Route path="/tasks" element={<TaskManagementPage />} />
            <Route path="/github" element={<GithubReporterPage />} />
            <Route path="/bots" element={<BotCommanderPage />} />
            <Route path="/reports" element={<ReportsExportPage />} />
            <Route path="/monitor" element={<SiteMonitorPage />} />
            <Route path="/profile" element={<ProfileSettingsPage />} />
            <Route path="/studio" element={<AutomationStudioPage />} />
            <Route path="/courses" element={<CoursesManagerPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
