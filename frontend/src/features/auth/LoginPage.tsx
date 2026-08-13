import React, { useState } from 'react';
import { ShieldCheck, Zap, ArrowLeft, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface LoginPageProps {
  onNavigateToHome: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigateToHome }) => {
  const { signInWithGoogle } = useAuth();
  const [loggingIn, setLoggingIn] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoggingIn(true);
    setErrorMsg(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
      setErrorMsg('Đăng nhập thất bại. Vui lòng kiểm tra lại cấu hình Supabase Auth Google Provider.');
      setLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Left Navigation back to Home */}
      <button
        onClick={onNavigateToHome}
        className="absolute top-6 left-6 flex items-center gap-2 px-3.5 py-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Về Trang Chủ</span>
      </button>

      {/* Main Login Card */}
      <div className="glass-panel p-8 rounded-3xl border border-slate-800/90 w-full max-w-md space-y-6 shadow-2xl relative z-10">
        {/* Header Logo & Title */}
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center text-white mx-auto shadow-lg shadow-indigo-500/25">
            <Zap className="w-6 h-6 fill-current" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-100">Đăng Nhập Admin System</h2>
            <p className="text-xs text-slate-400 mt-1">Pythaverse Central Admin & Automation Hub</p>
          </div>
        </div>

        {/* Security Domain Whitelist Badge */}
        <div className="bg-emerald-950/40 border border-emerald-500/30 p-3.5 rounded-xl flex items-center gap-3 text-xs text-emerald-300">
          <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400" />
          <div className="leading-snug">
            <strong>Bảo Mật Domain:</strong> Chỉ các tài khoản Google thuộc domain <code className="bg-emerald-900/60 px-1 py-0.5 rounded text-emerald-200">@dtt.vn</code> được cấp quyền truy cập Admin Hub.
          </div>
        </div>

        {errorMsg && (
          <div className="bg-rose-950/60 border border-rose-500/30 p-3 rounded-xl text-xs text-rose-300 text-center">
            {errorMsg}
          </div>
        )}

        {/* Exclusive Google Login Button */}
        <div className="space-y-3 pt-2">
          <button
            onClick={handleGoogleLogin}
            disabled={loggingIn}
            className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs rounded-xl transition shadow-xl flex items-center justify-center gap-3 disabled:opacity-70"
          >
            {loggingIn ? (
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                <span>Đăng Nhập Bằng Google OAuth</span>
              </>
            )}
          </button>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-slate-800/80 text-center text-[11px] text-slate-500 space-y-1">
          <div className="flex items-center justify-center gap-1">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Supabase Authentication SSO Service</span>
          </div>
          <div>Phiên bản 1.0.0 • Protected Admin Portal</div>
        </div>
      </div>
    </div>
  );
};
