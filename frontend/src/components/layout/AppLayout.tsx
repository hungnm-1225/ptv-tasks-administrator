// frontend/src/components/layout/AppLayout.tsx
import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../common/Sidebar';
import { Header } from '../common/Header';

interface AppLayoutProps {
  children?: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const location = useLocation();
  const isFullBleedPage = location.pathname.startsWith('/board');

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 selection:bg-indigo-500/20 selection:text-indigo-600 dark:selection:text-indigo-300">
      {/* Sidebar with Mobile Drawer support */}
      <Sidebar isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header onToggleMobileNav={() => setIsMobileNavOpen((prev) => !prev)} isMobileNavOpen={isMobileNavOpen} />
        {/* Page Main Content Area */}
        <main
          className={`flex-1 w-full ${
            isFullBleedPage
              ? 'p-0 max-w-none flex flex-col overflow-hidden h-[calc(100vh-4rem)]'
              : 'p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-[1600px] mx-auto'
          }`}
        >
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};
