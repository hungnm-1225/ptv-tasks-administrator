import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Zap,
  ArrowRight,
  Github,
  Linkedin,
  Facebook,
  Mail,
  Globe,
  Bot,
  Inbox,
  CheckSquare,
  UserCheck,
  Code2,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { authorConfig } from '../../config/authorConfig';
import { useAuth } from '../../context/AuthContext';

export const LandingPage: React.FC = () => {
  const { user } = useAuth();

  const getSocialIcon = (iconName: string) => {
    switch (iconName) {
      case 'github':
        return <Github className="w-4 h-4" />;
      case 'linkedin':
        return <Linkedin className="w-4 h-4" />;
      case 'facebook':
        return <Facebook className="w-4 h-4" />;
      case 'mail':
        return <Mail className="w-4 h-4" />;
      default:
        return <Globe className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans selection:bg-purple-500/20 selection:text-purple-200">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#0b0f19]/80 backdrop-blur-xl px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-300 shadow-sm transition-transform group-hover:scale-105">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <span className="font-bold text-slate-100 text-sm tracking-tight">PTV Tasks Administrator</span>
              <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded-full uppercase">
                Enterprise Hub
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
            <a href="#features" className="hover:text-slate-200 transition-colors">Tính Năng Cốt Lõi</a>
            <a href="#author" className="hover:text-slate-200 transition-colors">Chủ Quyền Tác Giả</a>
            <a href="#techstack" className="hover:text-slate-200 transition-colors">Tech Stack</a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                to="/dashboard"
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-xl transition shadow-sm"
              >
                <UserCheck className="w-4 h-4" />
                <span>Vào Trang Admin</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-2 px-4 py-2 bg-[#18223a] hover:bg-[#202d4d] border border-slate-700/60 text-slate-200 hover:text-white text-xs font-medium rounded-xl transition shadow-sm"
              >
                <Lock className="w-3.5 h-3.5 text-purple-300" />
                <span>Đăng Nhập Admin</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 px-6 max-w-5xl mx-auto text-center space-y-7">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-300 text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Tự Động Hóa Quản Trị Tác Vụ Nội Bộ Pythaverse</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-100 max-w-4xl mx-auto leading-[1.15]">
          Central Admin & Automation Hub Được Tối Ưu Bởi{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-indigo-200 to-sky-300">
            Gemini AI Engine
          </span>
        </h1>

        <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed font-normal">
          Hợp nhất luồng yêu cầu từ Gmail Workspace, Google Form và OS Ticket. Tự động phân loại, tóm tắt và kích hoạt các Bot Worker thực thi (Keycloak API, Playwright LMS, GitHub Issue) thông qua cổng phê duyệt Human-in-the-Loop.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
          {user ? (
            <Link
              to="/dashboard"
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition shadow-sm"
            >
              <span>Truy Cập Dashboard Quản Trị</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition shadow-sm"
            >
              <span>Đăng Nhập Ngay Bằng Google</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
          <a
            href="#author"
            className="flex items-center gap-2 px-6 py-3 bg-[#131b2e] border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-medium rounded-xl transition"
          >
            <span>Thông Tin Tác Giả Dự Án</span>
          </a>
        </div>

        {/* Feature Bento Cards Grid */}
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-14 text-left">
          <div className="surface-card p-6 rounded-2xl space-y-3.5 hover:border-slate-700/80 transition">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 flex items-center justify-center">
              <Inbox className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">Unified Inbox Feed</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tự động gom tất cả yêu cầu từ Gmail, Google Form & OS Ticket về 1 feed duy nhất. Gemini AI trích xuất tham số và phân loại tự động.
            </p>
          </div>

          <div className="surface-card p-6 rounded-2xl space-y-3.5 hover:border-slate-700/80 transition">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">Human-in-the-Loop Hub</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Đảm bảo an toàn tuyệt đối. Mọi tác vụ bot can thiệp hệ thống (Keycloak REST, LMS Playwright, GitHub Issue) đều cần Admin duyệt JSON payload trước khi chạy.
            </p>
          </div>

          <div className="surface-card p-6 rounded-2xl space-y-3.5 hover:border-slate-700/80 transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">Cloud Worker Dispatcher</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Hệ thống Cloud Worker Python 3.11 chạy ngầm 24/7 với khả năng retry tự động và live execution terminal console.
            </p>
          </div>
        </div>
      </section>

      {/* 📌 AUTHOR OWNERSHIP SECTION (ĐÁNH DẤU CHỦ QUYỀN DỰ ÁN CÁ NHÂN) */}
      <section id="author" className="py-16 px-6 max-w-5xl mx-auto border-t border-slate-800/80">
        <div className="text-center space-y-2.5 mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium rounded-full">
            <UserCheck className="w-3.5 h-3.5" />
            <span>Thông Tin Tác Giả & Chủ Quyền Dự Án</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-100">Project Creator & Maintainer</h2>
          <p className="text-xs text-slate-400 max-w-xl mx-auto">
            Dự án cá nhân này được thiết kế và phát triển bởi {authorConfig.name}. Tất cả các liên kết mạng xã hội dưới đây đều có thể click trực tiếp.
          </p>
        </div>

        <div className="surface-card p-7 sm:p-9 rounded-2xl border border-slate-800/80 max-w-3xl mx-auto">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-7">
            {/* Avatar */}
            <div className="relative shrink-0">
              <img
                src={authorConfig.avatarUrl}
                alt={authorConfig.name}
                className="w-28 h-28 object-cover rounded-2xl border border-slate-700/80 shadow-md"
              />
            </div>

            {/* Content Details */}
            <div className="space-y-4 text-center md:text-left flex-1">
              <div>
                <h3 className="text-xl font-bold text-slate-100 flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                  <span>{authorConfig.name}</span>
                  <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-medium rounded-full">
                    Project Author
                  </span>
                </h3>
                <p className="text-xs font-medium text-purple-300 mt-1">{authorConfig.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {authorConfig.organization} • {authorConfig.location}
                </p>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-[#0b0f19] p-3.5 rounded-xl border border-slate-800/80">
                {authorConfig.bio}
              </p>

              {/* Clickable Social Media Links */}
              <div>
                <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Liên Kết Mạng Xã Hội Tác Giả:
                </div>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  {authorConfig.socials.map((s, idx) => (
                    <a
                      key={idx}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-1.5 bg-[#18223a] border border-slate-700/60 hover:border-purple-500/30 text-slate-300 hover:text-purple-200 text-xs font-medium rounded-xl transition"
                    >
                      {getSocialIcon(s.iconName)}
                      <span>{s.name}</span>
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Code Customization Note Box */}
          <div className="mt-7 pt-5 border-t border-slate-800/80 flex items-start gap-3 text-xs text-slate-400 bg-[#0b0f19] p-3.5 rounded-xl border border-slate-800">
            <Code2 className="w-4 h-4 text-purple-300 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-purple-200">💡 Hướng Dẫn Tự Chỉnh Sửa Thông Tin Tác Giả:</span>
              <p className="mt-1 leading-relaxed text-slate-300">
                Để thay đổi Họ Tên, Bio, Avatar và các đường dẫn mạng xã hội của Anh, hãy chỉnh sửa file{' '}
                <code className="text-purple-300 font-mono">frontend/src/config/authorConfig.ts</code>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack Grid */}
      <section id="techstack" className="py-14 px-6 max-w-5xl mx-auto border-t border-slate-800/80">
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-xl font-bold text-slate-100">Modern Architecture & Tech Stack</h2>
          <p className="text-xs text-slate-400">Các công nghệ cốt lõi được tích hợp trong hệ thống</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-2xl mx-auto">
          {authorConfig.projectInfo.techStack.map((tech, idx) => (
            <span
              key={idx}
              className="px-3.5 py-1.5 bg-[#131b2e] border border-slate-800/80 rounded-xl text-xs font-medium text-slate-300 hover:text-purple-200 hover:border-purple-500/30 transition"
            >
              ⚡ {tech}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-800/80 text-center text-xs text-slate-400 space-y-1.5">
        <div>
          © 2026 <strong>{authorConfig.name}</strong> • {authorConfig.projectInfo.name} ({authorConfig.projectInfo.version})
        </div>
        <div>
          Xây dựng bằng React 19, FastAPI 0.115 & Supabase Database.
        </div>
      </footer>
    </div>
  );
};
