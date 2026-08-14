import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, Zap, ArrowLeft, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

export const LoginPage: React.FC = () => {
  const { user, signInWithGoogle, loading: authLoading } = useAuth();
  const [loggingIn, setLoggingIn] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleGoogleLogin = async () => {
    setLoggingIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
      toast.error('Đăng nhập thất bại. Vui lòng kiểm tra lại cấu hình Supabase Google Provider.');
      setLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex items-center justify-center p-6 relative">
      {/* Top Left Navigation back to Home */}
      <Link
        to="/"
        className="absolute top-6 left-6 flex items-center gap-2 px-3.5 py-2 bg-[#131b2e] border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium rounded-xl transition shadow-sm"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Về Trang Chủ</span>
      </Link>

      {/* Main Login Card */}
      <div className="surface-card p-8 rounded-2xl border border-slate-800/80 w-full max-w-md space-y-6 shadow-xl relative z-10">
        {/* Header Logo & Title */}
        <div className="text-center space-y-2.5">
          <div className="w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-300 mx-auto shadow-sm">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">Đăng Nhập Admin System</h2>
            <p className="text-xs text-slate-400 mt-1">Pythaverse Central Admin & Automation Hub</p>
          </div>
        </div>

        {/* Security Domain Whitelist Badge */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-xl flex items-start gap-3 text-xs text-emerald-300">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-semibold text-emerald-200">Bảo Mật Domain:</strong> Chỉ các tài khoản Google thuộc domain <code className="bg-emerald-950/60 px-1 py-0.5 rounded text-emerald-200 font-mono">@dtt.vn</code> được cấp quyền truy cập hệ thống.
          </div>
        </div>

        {/* Exclusive Google Login Button */}
        <div className="space-y-3 pt-1">
          <button
            onClick={handleGoogleLogin}
            disabled={loggingIn || authLoading}
            className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs rounded-xl transition shadow-sm flex items-center justify-center gap-3 disabled:opacity-60"
          >
            {loggingIn ? (
              <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
            ) : (
              <>
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
                <span>Đăng Nhập Bằng Google OAuth</span>
              </>
            )}
          </button>
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-slate-800/80 text-center text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-slate-400" />
            <span>Supabase Authentication SSO Guard</span>
          </div>
          <div>Phiên bản 1.0.0 • Protected Enterprise Portal</div>
        </div>
      </div>
    </div>
  );
};
