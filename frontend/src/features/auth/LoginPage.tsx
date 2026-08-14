import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, ShieldCheck, ArrowRight, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { toast } from 'sonner';

export const LoginPage: React.FC = () => {
  const { user, signInWithGoogle } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      toast.error('Lỗi khởi động Google SSO: ' + (err as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center p-6 relative transition-colors duration-200">
      {/* Top controls */}
      <div className="absolute top-6 right-6 flex items-center gap-3">
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? 'Chuyển sang Giao diện Tối' : 'Chuyển sang Giao diện Sáng'}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 transition shadow-2xs"
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4 text-slate-700 hover:text-violet-600 transition-colors" />
          ) : (
            <Sun className="w-4 h-4 text-amber-300 hover:text-amber-200 transition-colors" />
          )}
        </button>

        <Link
          to="/"
          className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 font-medium transition"
        >
          ← Về Trang Chủ
        </Link>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200/80 dark:border-slate-700/60 shadow-lg space-y-6">
        {/* Brand Icon */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 flex items-center justify-center shadow-xs">
            <Zap className="w-6 h-6 fill-current" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Pythaverse Admin SSO</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hệ thống Quản trị & Tự Động Hóa Tác Vụ Tập Trung
          </p>
        </div>

        {/* Domain Whitelist Notice */}
        <div className="p-3.5 bg-sky-50 text-sky-800 border border-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 rounded-2xl text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>Yêu Cầu Tài Khoản Doanh Nghiệp</span>
          </div>
          <p className="text-[11px] text-sky-700 dark:text-sky-300/90 leading-relaxed">
            Chỉ chấp nhận tài khoản Google Workspace thuộc miền <strong className="font-semibold">@dtt.vn</strong> (Quản trị viên: hung.nguyenmanh@dtt.vn).
          </p>
        </div>

        {/* Google SSO Button */}
        <button
          onClick={handleLogin}
          className="w-full py-3 px-4 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-300/80 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-3 transition shadow-xs"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Đăng nhập bằng Google Workspace</span>
        </button>

        <div className="text-center pt-2">
          <Link
            to="/"
            className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
          >
            ← Quay lại trang giới thiệu
          </Link>
        </div>
      </div>
    </div>
  );
};
