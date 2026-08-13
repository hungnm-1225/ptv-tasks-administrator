import React, { useState } from 'react';
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

const MainContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('landing');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-xs font-medium">Đang xác thực phiên làm việc Supabase...</span>
      </div>
    );
  }

  // Render Public Landing Page
  if (activeTab === 'landing') {
    return (
      <LandingPage
        onNavigateToLogin={() => setActiveTab('login')}
        onNavigateToAdmin={() => setActiveTab('dashboard')}
      />
    );
  }

  // Render Public Login Page
  if (activeTab === 'login') {
    return <LoginPage onNavigateToHome={() => setActiveTab('landing')} />;
  }

  // Protected Admin Routes: If user is not authenticated, prompt Login Page
  if (!user) {
    return <LoginPage onNavigateToHome={() => setActiveTab('landing')} />;
  }

  // Render Protected Admin Modules in AppLayout
  const renderAdminFeature = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage />;
      case 'unified-inbox':
        return <UnifiedInboxPage />;
      case 'task-management':
        return <TaskManagementPage />;
      case 'github-reporter':
        return <GithubReporterPage />;
      case 'bot-commander':
        return <BotCommanderPage />;
      case 'reports-export':
        return <ReportsExportPage />;
      case 'telegram-app':
        return <TelegramAppPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <AppLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderAdminFeature()}
    </AppLayout>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
};

export default App;
