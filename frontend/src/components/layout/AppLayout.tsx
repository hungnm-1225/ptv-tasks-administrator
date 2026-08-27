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
    <div className="flex min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 selection:bg-indigo-500/20 selection:text-indigo-600 dark:selection:text-indigo-300">
      {/* Sidebar with Mobile Drawer support */}
      <Sidebar isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header onToggleMobileNav={() => setIsMobileNavOpen((prev) => !prev)} isMobileNavOpen={isMobileNavOpen} />
        {/* Page entrance animation */}
        <main className="p-4 sm:p-6 lg:p-8 flex-1 overflow-y-auto w-full mx-auto max-w-[1600px]">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};
