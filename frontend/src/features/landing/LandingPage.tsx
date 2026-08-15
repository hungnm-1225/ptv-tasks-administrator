import React from 'react';
import { Link } from 'react-router-dom';
import {
  Zap,
  Bot,
  ArrowRight,
  Inbox,
  CheckSquare,
  Github,
  Sparkles,
  ExternalLink,
  Mail,
  Sun,
  Moon
} from 'lucide-react';
import { authorConfig } from '../../config/authorConfig';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export const LandingPage: React.FC = () => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Header */}
      <header className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Pythaverse Logo" className="w-8 h-8 rounded-xl" />
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm tracking-tight">Pythaverse Admin</span>
              <span className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold uppercase tracking-wider ml-1.5 hidden sm:inline">Hub</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              title={theme === 'light' ? 'Chuyển sang Giao diện Tối' : 'Chuyển sang Giao diện Sáng'}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 transition shadow-2xs"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-slate-700 hover:text-violet-600 transition-colors" />
              ) : (
                <Sun className="w-4 h-4 text-amber-300 hover:text-amber-200 transition-colors" />
              )}
            </button>

            {user ? (
              <Link
                to="/dashboard"
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition shadow-xs"
              >
                <span>Vào Trang Quản Trị</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition shadow-xs"
              >
                <span>Đăng Nhập SSO</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-16 sm:py-24 space-y-16">
        <div className="text-center space-y-5 max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200/80 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 text-xs font-semibold shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            <span>Enterprise Automation & Triage Hub</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
            Quản Trị Tác Vụ Tập Trung & Tự Động Hóa Thông Minh
          </h1>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
            Hợp nhất mọi luồng tiếp nhận từ Gmail Workspace, Google Form và OS Ticket vào một nguồn cấp dữ liệu duy nhất.
            Gemini AI tự động phân loại, tóm tắt và đề xuất nhân sự với cơ chế phê duyệt Human-in-the-Loop an toàn.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to={user ? "/dashboard" : "/login"}
              className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition shadow-sm"
            >
              <span>{user ? "Truy Cập Dashboard" : "Bắt Đầu Ngay Với Google SSO"}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/hungnm-1225/ptv-tasks-administrator"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition shadow-2xs"
            >
              <Github className="w-4 h-4" />
              <span>Xem Mã Nguồn GitHub</span>
            </a>
          </div>
        </div>

        {/* Feature Cards Grid (Bento Grid) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Feature 1 */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 border border-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 flex items-center justify-center shadow-xs">
              <Inbox className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Unified Inbox Feed</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
              Đồng bộ dữ liệu đa kênh từ Gmail API, Google Sheets phản hồi và Playwright OS Ticket cào dữ liệu theo thời gian thực.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-700 border border-violet-200/80 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Gemini AI Triage Engine</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
              Tự động phân loại danh mục, tóm tắt 2 câu tiếng Việt và đề xuất nhân sự dựa trên Knowledge Base phân quyền.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 flex items-center justify-center shadow-xs">
              <CheckSquare className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Human-in-the-Loop Guard</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
              Kiểm duyệt và chỉnh sửa payload JSON trước khi khởi chạy Cloud Worker gọi Keycloak REST API hay Playwright LMS.
            </p>
          </div>
        </div>

        {/* Author Ownership Section */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm max-w-3xl mx-auto space-y-6">
          <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
            <img
              src={authorConfig.avatarUrl}
              alt={authorConfig.name}
              className="w-16 h-16 rounded-2xl border border-violet-500/30 object-cover shadow-sm"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{authorConfig.name}</h3>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 text-[10px] font-semibold rounded-full">
                  Project Creator
                </span>
              </div>
              <p className="text-xs text-violet-600 dark:text-violet-400 font-medium">{authorConfig.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-normal">{authorConfig.bio}</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between flex-wrap gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Kết nối trực tiếp:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {authorConfig.socials.map((social) => {
                const Icon = social.iconName === 'github' ? Github : social.iconName === 'mail' ? Mail : ExternalLink;
                return (
                  <a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-900 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200 transition shadow-2xs"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{social.name}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between flex-wrap gap-2">
          <span>&copy; 2026 Pythaverse Education. Thiết kế bởi <strong>{authorConfig.name}</strong>.</span>
          <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">Domain Whitelist: @dtt.vn</span>
        </div>
      </footer>
    </div>
  );
};
