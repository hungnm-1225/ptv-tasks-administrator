import React from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { UnifiedInboxPage } from './features/inbox/UnifiedInboxPage';
import { TaskManagementPage } from './features/tasks/TaskManagementPage';
import { GithubReporterPage } from './features/github/GithubReporterPage';
import { BotCommanderPage } from './features/bots/BotCommanderPage';
import { ReportsExportPage } from './features/reports/ReportsExportPage';
import { TelegramAppPage } from './features/telegram/TelegramAppPage';

export const App: React.FC = () => {
  return (
    <AppLayout>
      {(activeTab) => {
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
      }}
    </AppLayout>
  );
};

export default App;
