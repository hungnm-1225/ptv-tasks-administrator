// frontend/src/features/landing/LandingPage.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  ArrowRight,
  Inbox,
  CheckSquare,
  Github,
  Linkedin,
  Facebook,
  Mail,
  Globe,
  Sparkles,
  Sun,
  Moon,
  Instagram,
  MessageCircle,
  Twitter,
  Youtube,
  MessageSquare,
  AtSign,
  ShieldCheck,
  Zap,
  Activity,
  Code2,
  CheckCircle2,
} from 'lucide-react';
import { authorConfig as defaultAuthorConfig } from '../../config/authorConfig';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from '../../components/common/ThemeToggle';
import { supabase } from '../../lib/supabase';

export const LandingPage: React.FC = () => {
  const { user } = useAuth();

  // State lưu thông tin tác giả, khởi tạo mặc định bằng authorConfig
  const [author, setAuthor] = useState(defaultAuthorConfig);

  // Đồng bộ thông tin động từ Supabase
  useEffect(() => {
    async function fetchDynamicAuthor() {
      try {
        const { data, error } = await supabase
          .from('author_profile')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data && !error) {
          setAuthor({
            name: data.name || defaultAuthorConfig.name,
            title: data.title || defaultAuthorConfig.title,
            bio: data.bio || defaultAuthorConfig.bio,
            avatarUrl: data.avatar_url || defaultAuthorConfig.avatarUrl,
            location: data.location || defaultAuthorConfig.location,
            organization: data.organization || defaultAuthorConfig.organization,
            socials: data.socials && data.socials.length > 0 ? data.socials : defaultAuthorConfig.socials,
            projectInfo: data.project_info || defaultAuthorConfig.projectInfo,
          });
        }
      } catch (err) {
        console.warn("Không thể tải thông tin tác giả từ DB, chuyển sang dùng authorConfig mặc định:", err);
      }
    }

    fetchDynamicAuthor();
  }, []);

  // Helper render đúng Icon cho từng mạng xã hội
  const renderSocialIcon = (iconName: string) => {
    switch (iconName) {
      case 'github': return <Github className="w-3.5 h-3.5 text-slate-900 dark:text-white" />;
      case 'linkedin': return <Linkedin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />;
      case 'facebook': return <Facebook className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
      case 'mail': return <Mail className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
      case 'instagram': return <Instagram className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />;
      case 'threads': return <AtSign className="w-3.5 h-3.5 text-slate-900 dark:text-white" />;
      case 'whatsapp':
      case 'zalo': return <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      case 'twitter': return <Twitter className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />;
      case 'youtube': return <Youtube className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
      case 'discord': return <MessageSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
      default: return <Globe className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Sticky Header */}
      <header className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Pythaverse Logo" className="w-8 h-8 rounded-xl shadow-xs" />
            <div>
              <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight">Pythaverse Admin</span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider ml-1.5 hidden sm:inline">Hub</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <ThemeToggle scale={0.82} />

            {user ? (
              <Link
                to="/dashboard"
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-semibold rounded-xl transition-all shadow-xs"
              >
                <span>Vào Trang Quản Trị</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs shadow-indigo-600/20"
              >
                <span>Đăng Nhập SSO</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-12 sm:py-20 space-y-16">
        {/* Hero Section */}
        <div className="text-center space-y-5 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 text-xs font-semibold shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Enterprise Automation & Triage Hub</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
            Quản Trị Tác Vụ Tập Trung & Tự Động Hóa Thông Minh
          </h1>

          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
            Hợp nhất mọi luồng tiếp nhận từ Gmail Workspace, Google Form và OS Ticket vào một nguồn cấp dữ liệu duy nhất.
            Gemini AI tự động phân loại, tóm tắt và đề xuất nhân sự với cơ chế phê duyệt Human-in-the-Loop an toàn.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              to={user ? "/dashboard" : "/login"}
              className="flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-semibold rounded-xl transition-all shadow-xs"
            >
              <span>{user ? "Truy Cập Dashboard" : "Bắt Đầu Ngay Với Google SSO"}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/hungnm-1225/ptv-tasks-administrator"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800/80 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl transition-all shadow-xs"
            >
              <Github className="w-4 h-4" />
              <span>Xem Mã Nguồn GitHub</span>
            </a>
          </div>
        </div>

        {/* Asymmetric Bento Grid 2 Rows */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Card 1: 3 Cột (Hero Feature: AI Triage Engine 3 Bước) */}
          <div className="md:col-span-3 bento-card p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50 flex items-center justify-center shadow-xs">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI Triage Engine</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Luồng xử lý 3 bước tự động</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                <span>Live Active</span>
              </div>
            </div>

            {/* 3 Steps Pipeline Visualization */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Inbox className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>1. Ingest Feed</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  Đồng bộ Gmail, Google Sheets & Playwright OS Ticket.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-800/40 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>2. Gemini Triage</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  Phân loại danh mục, tóm tắt và tự động gán nhân sự.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/40 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>3. Human Gate</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  Duyệt payload an toàn trước khi khởi chạy Cloud Worker.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: 2 Cột (Human-in-the-Loop Interactive Preview) */}
          <div className="md:col-span-2 bento-card p-6 sm:p-7 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50 flex items-center justify-center shadow-xs">
                    <CheckSquare className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Human-in-the-Loop Guard</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Kiểm soát an toàn tuyệt đối</p>
                  </div>
                </div>
              </div>

              {/* Mini Payload JSON Preview */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1 overflow-hidden">
                <div className="flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-800/80 pb-1 mb-1">
                  <span className="flex items-center gap-1"><Code2 className="w-3 h-3 text-indigo-400" /> payload_preview.json</span>
                  <span className="text-emerald-400 font-bold">READY</span>
                </div>
                <p className="text-slate-400"><span className="text-indigo-400">"target":</span> "workspace_license_rpa"</p>
                <p className="text-slate-400"><span className="text-indigo-400">"school":</span> "THPT Chuyên Hà Nội - Amsterdam"</p>
                <p className="text-slate-400"><span className="text-indigo-400">"status":</span> <span className="text-amber-400">"waiting_approval"</span></p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Cần phê duyệt quản trị
              </span>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">100% An Toàn</span>
            </div>
          </div>

          {/* Card 3: Full-width Dưới (Creator Card Nguyễn Mạnh Hùng) */}
          <div className="md:col-span-5 bento-card p-7 sm:p-8 space-y-6">
            <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
              <img
                src={author.avatarUrl}
                alt={author.name}
                onError={(e) => { (e.target as any).src = defaultAuthorConfig.avatarUrl; }}
                className="w-20 h-20 rounded-2xl border-2 border-slate-200/80 dark:border-slate-700/80 object-cover shadow-sm shrink-0"
              />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{author.name}</h3>
                  <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 text-[11px] font-semibold rounded-full shadow-xs">
                    Project Creator
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Lead AI Engineer & Automation Architect</span>
                </div>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">{author.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-4xl">{author.bio}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Kết nối trực tiếp với tác giả:</span>
              <div className="flex items-center gap-2 flex-wrap">
                {author.socials && author.socials.map((social) => (
                  <a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors shadow-xs"
                  >
                    {renderSocialIcon(social.iconName)}
                    <span>{social.name}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between flex-wrap gap-2">
          <span>&copy; 2026 Pythaverse Education. Thiết kế & phát triển bởi <strong>{author.name}</strong>.</span>
          <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">Domain Whitelist: @dtt.vn</span>
        </div>
      </footer>
    </div>
  );
};
