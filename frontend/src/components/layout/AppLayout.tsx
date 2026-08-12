import React, { useState } from 'react';
import { Sidebar } from '../common/Sidebar';
import { Header } from '../common/Header';

interface AppLayoutProps {
  children: (activeTab: string) => React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="p-6 flex-1 overflow-y-auto">{children(activeTab)}</main>
      </div>
    </div>
  );
};
