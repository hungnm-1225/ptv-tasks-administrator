import React from 'react';
import {
  Sparkles,
  ShieldCheck,
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
  FileCode,
  UserCheck,
  Code2,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { authorConfig } from '../../config/authorConfig';
import { useAuth } from '../../context/AuthContext';

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToAdmin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateToLogin,
  onNavigateToAdmin,
}) => {
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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      {/* Background Ambient Blur Blobs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[450px] h-[450px] bg-cyan-500/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 left-1/3 w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Top Header Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <span className="font-bold text-slate-100 text-base tracking-tight">PTV Tasks Administrator</span>
              <span className="ml-2 text-[10px] font-bold px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-full uppercase">
                Enterprise Hub
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-400">
            <a href="#features" className="hover:text-slate-100 transition">Tính Năng Cốt Lõi</a>
            <a href="#architecture" className="hover:text-slate-100 transition">Kiến Trúc Hệ Thống</a>
            <a href="#author" className="hover:text-slate-100 transition">Chủ Quyền Tác Giả</a>
            <a href="#techstack" className="hover:text-slate-100 transition">Tech Stack</a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <button
                onClick={onNavigateToAdmin}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shadow-lg shadow-indigo-600/25"
              >
                <UserCheck className="w-4 h-4" />
                <span>Vào Trang Admin</span>
              </button>
            ) : (
              <button
                onClick={onNavigateToLogin}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-semibold rounded-lg transition shadow-lg shadow-indigo-500/25"
              >
                <Lock className="w-4 h-4" />
                <span>Đăng Nhập Admin (Google)</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 px-6 max-w-7xl mx-auto text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-950/60 border border-indigo-500/30 rounded-full text-indigo-300 text-xs font-semibold shadow-inner">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>Tự Động Hóa Quản Trị Tác Vụ Nội Bộ Pythaverse</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-100 max-w-4xl mx-auto leading-tight">
          Hệ Thống Central Admin & Automation Brain Hỗ Trợ Bởi{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-cyan-300 to-indigo-300">
            Gemini AI Engine
          </span>
        </h1>

        <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
          Hợp nhất luồng yêu cầu từ Gmail Workspace, Google Form và OS Ticket. Tự động phân loại, tóm tắt và kích hoạt các Bot Worker thực thi (Keycloak API, Playwright LMS, GitHub Issue Dispatcher) thông qua cổng phê duyệt Human-in-the-Loop.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          {user ? (
            <button
              onClick={onNavigateToAdmin}
              className="flex items-center gap-2.5 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition shadow-xl shadow-indigo-600/30"
            >
              <span>Truy Cập Dashboard Quản Trị</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onNavigateToLogin}
              className="flex items-center gap-2.5 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition shadow-xl shadow-indigo-600/30"
            >
              <span>Đăng Nhập Ngay Bằng Google</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <a
            href="#author"
            className="flex items-center gap-2 px-6 py-3 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-sm font-semibold rounded-xl transition"
          >
            <span>Thông Tin Tác Giả Dự Án</span>
          </a>
        </div>

        {/* Feature Cards Grid */}
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 text-left">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/90 space-y-3 hover:border-indigo-500/40 transition">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Inbox className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-100">Unified Inbox Feed</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tự động gom tất cả yêu cầu từ Gmail, Google Form & OS Ticket về 1 feed duy nhất. Gemini AI trích xuất tham số và phân loại tự động.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800/90 space-y-3 hover:border-indigo-500/40 transition">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-100">Human-in-the-Loop Hub</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Đảm bảo an toàn tuyệt đối. Mọi tác vụ bot nguy hiểm (Keycloak REST, LMS Playwright, GitHub Issue) phải được Admin duyệt JSON payload trước khi chạy.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800/90 space-y-3 hover:border-indigo-500/40 transition">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-100">Cloud Worker Dispatcher</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Hệ thống các Cloud Worker Python 3.11 chạy ngầm 24/7 với khả năng retry tự động và live execution terminal console.
            </p>
          </div>
        </div>
      </section>

      {/* 📌 AUTHOR OWNERSHIP SECTION (ĐÁNH DẤU CHỦ QUYỀN DỰ ÁN CÁ NHÂN) */}
      <section id="author" className="py-16 px-6 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="text-center space-y-3 mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-950/60 border border-cyan-500/30 text-cyan-400 text-xs font-semibold rounded-full">
            <UserCheck className="w-3.5 h-3.5" />
            <span>Thông Tin Tác Giả & Chủ Quyền Dự Án</span>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-100">Project Creator & Maintainer</h2>
          <p className="text-xs text-slate-400 max-w-xl mx-auto">
            Dự án cá nhân này được thiết kế và phát triển bởi {authorConfig.name}. Tất cả các liên kết mạng xã hội dưới đây đều có thể click trực tiếp.
          </p>
        </div>

        <div className="glass-panel p-8 rounded-3xl border border-indigo-500/30 max-w-4xl mx-auto relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            {/* Avatar */}
            <div className="relative group shrink-0">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-300" />
              <img
                src={authorConfig.avatarUrl}
                alt={authorConfig.name}
                className="relative w-32 h-32 object-cover rounded-2xl border-2 border-slate-700 shadow-xl"
              />
            </div>

            {/* Content Details */}
            <div className="space-y-4 text-center md:text-left flex-1">
              <div>
                <h3 className="text-2xl font-bold text-slate-100 flex flex-wrap items-center justify-center md:justify-start gap-3">
                  <span>{authorConfig.name}</span>
                  <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full">
                    Project Author
                  </span>
                </h3>
                <p className="text-xs font-medium text-cyan-400 mt-1">{authorConfig.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {authorConfig.organization} • {authorConfig.location}
                </p>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                {authorConfig.bio}
              </p>

              {/* Clickable Social Media Links */}
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Liên Kết Mạng Xã Hội Tác Giả (Click để xem):
                </div>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                  {authorConfig.socials.map((s, idx) => (
                    <a
                      key={idx}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 px-3.5 py-2 bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition ${s.colorClass}`}
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
          <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-start gap-3 text-xs text-slate-400 bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/20">
            <Code2 className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-indigo-300">💡 Hướng Dẫn Tự Chỉnh Sửa Thông Tin Tác Giả:</span>
              <p className="mt-1 leading-relaxed text-slate-300">
                Để tự thay đổi Họ Tên, Bio, Avatar và các đường dẫn mạng xã hội của Anh, hãy mở file code{' '}
                <code className="text-cyan-300 font-mono">frontend/src/config/authorConfig.ts</code>. Nơi đó đã ghi sẵn comment giải thích cho từng mục để Anh tự điền thông tin đánh dấu chủ quyền cá nhân!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack Grid */}
      <section id="techstack" className="py-16 px-6 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="text-center space-y-2 mb-10">
          <h2 className="text-2xl font-bold text-slate-100">Modern Architecture & Tech Stack</h2>
          <p className="text-xs text-slate-400">Các công nghệ hàng đầu được tích hợp trong dự án này</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 max-w-3xl mx-auto">
          {authorConfig.projectInfo.techStack.map((tech, idx) => (
            <span
              key={idx}
              className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition"
            >
              ⚡ {tech}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-800/80 text-center text-xs text-slate-500 space-y-2">
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
