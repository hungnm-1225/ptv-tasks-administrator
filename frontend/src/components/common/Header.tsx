// frontend/src/components/common/Header.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  LogOut,
  Settings,
  Loader2,
  Sun,
  Moon,
  ChevronDown,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { toast } from 'sonner';

interface HeaderProps {
  onToggleMobileNav?: () => void;
  isMobileNavOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileNav, isMobileNavOpen = false }) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const userEmail = user?.email || 'admin@dtt.vn';
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || 'Nguyễn Mạnh Hùng';
  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setIsDropdownOpen(false);

    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      await signOut();
      toast.success('Đã đăng xuất thành công!');
    } catch (error) {
      toast.error('Có lỗi khi đăng xuất: ' + (error as Error).message);
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      {isLoggingOut && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/75 dark:bg-slate-950/70 backdrop-blur-md transition-opacity duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95 duration-150">
            <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
            <p className="text-slate-600 dark:text-slate-300 font-medium text-xs">Đang đăng xuất an toàn...</p>
          </div>
        </div>
      )}

      <header className="h-16 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 transition-colors duration-200">
        {/* Left: Mobile Hamburger & Breadcrumb tag */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileNav}
            aria-label="Toggle mobile menu"
            className="lg:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            {isMobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="p-2 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 transition-colors duration-200 cursor-pointer"
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 text-slate-700" />
            ) : (
              <Sun className="w-4 h-4 text-amber-400" />
            )}
          </button>

          {/* Profile Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`flex items-center gap-2 sm:gap-3 pl-2 pr-1.5 py-1 rounded-xl transition-all duration-200 border cursor-pointer ${isDropdownOpen
                ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/60 border-transparent'
                }`}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover shadow-xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 flex items-center justify-center font-semibold text-xs">
                  <User className="w-4 h-4" />
                </div>
              )}

              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[130px]">
                  {userName}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[130px]">
                  {userEmail}
                </div>
              </div>

              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''
                  }`}
              />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xl py-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 sm:hidden">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{userName}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{userEmail}</p>
                </div>

                <Link
                  to="/profile"
                  className="flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <Settings className="w-4 h-4 text-slate-500" />
                  <span>Thông tin tài khoản</span>
                </Link>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800"></div>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors font-medium cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
};
