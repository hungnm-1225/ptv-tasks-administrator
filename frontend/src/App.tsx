import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { LandingPage } from './features/landing/LandingPage';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { UnifiedInboxPage } from './features/inbox/UnifiedInboxPage';
import { TaskManagementPage } from './features/tasks/TaskManagementPage';
import { GithubReporterPage } from './features/github/GithubReporterPage';
import { BotCommanderPage } from './features/bots/BotCommanderPage';
import { ReportsExportPage } from './features/reports/ReportsExportPage';
import { TelegramAppPage } from './features/telegram/TelegramAppPage';
import { Loader2 } from 'lucide-react';

const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        <span className="text-xs font-medium text-slate-400">Đang xác thực phiên làm việc...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <Toaster 
        richColors 
        position="top-right" 
        theme="dark" 
        closeButton 
        toastOptions={{
          style: {
            background: '#131b2e',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#f8fafc',
            fontSize: '13px',
          }
        }}
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
            <Route path="/telegram" element={<TelegramAppPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
