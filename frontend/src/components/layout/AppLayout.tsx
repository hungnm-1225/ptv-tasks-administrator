import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../common/Sidebar';
import { Header } from '../common/Header';

interface AppLayoutProps {
  children?: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-violet-500/20 selection:text-violet-700 dark:selection:text-violet-300 transition-colors duration-200">
      {/* Sidebar with Mobile Drawer support */}
      <Sidebar isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header onToggleMobileNav={() => setIsMobileNavOpen((prev) => !prev)} isMobileNavOpen={isMobileNavOpen} />
        <main className="p-4 sm:p-6 lg:p-8 flex-1 overflow-y-auto w-full mx-auto animate-in fade-in duration-300">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};
