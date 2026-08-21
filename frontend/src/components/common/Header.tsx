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
  Sparkles,
  Menu,
  X,
  Zap,
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
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || 'Admin User';
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
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md transition-all duration-500">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-300">
            <Loader2 className="w-10 h-10 text-violet-600 animate-spin" />
            <p className="text-slate-600 dark:text-slate-300 font-medium text-xs">Đang đăng xuất an toàn...</p>
          </div>
        </div>
      )}

      <header className="h-16 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 transition-colors duration-200">
        {/* Left Side: Mobile Hamburger & Quick Context */}
        <div className="flex items-center gap-3">
          {/* Mobile Hamburger Button */}
          <button
            onClick={onToggleMobileNav}
            aria-label="Toggle mobile menu"
            className="lg:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            {isMobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Quick Context Badge */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-violet-50 dark:bg-violet-950/40 border border-violet-200/60 dark:border-violet-800/40 rounded-xl shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 truncate max-w-[150px] sm:max-w-none">
              Pythaverse Automation Center
            </span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Link to Studio */}
          <Link
            to="/studio"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Studio</span>
          </Link>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4 text-slate-700 hover:text-violet-600" />
            ) : (
              <Sun className="w-4 h-4 text-amber-300 hover:text-amber-200" />
            )}
          </button>

          {/* Profile Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`flex items-center gap-2 sm:gap-3 pl-2 pr-1.5 py-1 rounded-xl transition-all duration-200 border border-transparent cursor-pointer ${
                isDropdownOpen
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-8 h-8 rounded-full border border-violet-500/30 object-cover shadow-2xs"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 flex items-center justify-center font-semibold text-xs">
                  <User className="w-4 h-4" />
                </div>
              )}

              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                  {userName}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-400 truncate max-w-[130px]">
                  {userEmail}
                </div>
              </div>

              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${
                  isDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl py-2 z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 sm:hidden">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{userName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{userEmail}</p>
                </div>

                <Link
                  to="/profile"
                  className="flex items-center gap-3 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <Settings className="w-4 h-4" />
                  Thông tin tài khoản
                </Link>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800"></div>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors font-medium cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
};