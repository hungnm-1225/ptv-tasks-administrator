import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import { Loader2 } from 'lucide-react';

// Lazy load all page components for fast initial load
const LandingPage = lazy(() => import('./features/landing/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('./features/auth/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const UnifiedInboxPage = lazy(() => import('./features/inbox/UnifiedInboxPage').then(m => ({ default: m.UnifiedInboxPage })));
const TaskManagementPage = lazy(() => import('./features/tasks/TaskManagementPage').then(m => ({ default: m.TaskManagementPage })));
const GithubReporterPage = lazy(() => import('./features/github/GithubReporterPage').then(m => ({ default: m.GithubReporterPage })));
const BotCommanderPage = lazy(() => import('./features/bots/BotCommanderPage').then(m => ({ default: m.BotCommanderPage })));
const ReportsExportPage = lazy(() => import('./features/reports/ReportsExportPage').then(m => ({ default: m.ReportsExportPage })));
const SiteMonitorPage = lazy(() => import('./features/monitor/SiteMonitorPage').then(m => ({ default: m.SiteMonitorPage })));
const ProfileSettingsPage = lazy(() => import('./features/profile/ProfileSettingsPage').then(m => ({ default: m.ProfileSettingsPage })));
const AutomationStudioPage = lazy(() => import('./features/studio/AutomationStudioPage').then(m => ({ default: m.AutomationStudioPage })));
const CoursesManagerPage = lazy(() => import('./features/courses/CoursesManagerPage').then(m => ({ default: m.CoursesManagerPage })));
const WorkBoardPage = lazy(() => import('./features/board/WorkBoardPage').then(m => ({ default: m.WorkBoardPage })));

const PageLoadingFallback: React.FC = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center text-ink-2 gap-3">
    <Loader2 className="w-8 h-8 animate-spin text-accent" />
    <span className="text-xs font-medium text-ink-2">Đang tải trang...</span>
  </div>
);

const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-ink-2 gap-3 transition-colors">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <span className="text-xs font-medium text-ink-2">Đang xác thực phiên làm việc...</span>
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
        <Suspense fallback={<PageLoadingFallback />}>
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
              <Route path="/board" element={<WorkBoardPage />} />
              <Route path="/reports" element={<ReportsExportPage />} />
              <Route path="/monitor" element={<SiteMonitorPage />} />
              <Route path="/profile" element={<ProfileSettingsPage />} />
              <Route path="/studio" element={<AutomationStudioPage />} />
              <Route path="/courses" element={<CoursesManagerPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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
