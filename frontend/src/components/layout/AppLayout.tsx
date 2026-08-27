// frontend/src/components/layout/AppLayout.tsx
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
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-sky-500/20 selection:text-sky-700 dark:selection:text-sky-300">
      {/* Sidebar with Mobile Drawer support */}
      <Sidebar isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header onToggleMobileNav={() => setIsMobileNavOpen((prev) => !prev)} isMobileNavOpen={isMobileNavOpen} />
        {/* Page entrance animation */}
        <main className="p-4 sm:p-6 lg:p-8 flex-1 overflow-y-auto w-full mx-auto max-w-[1600px] bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.06),transparent_28rem)] dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.06),transparent_28rem)]">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};
