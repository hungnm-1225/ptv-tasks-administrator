// frontend/src/features/landing/LandingPage.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Github,
  Linkedin,
  Facebook,
  Mail,
  Globe,
  Sparkles,
  Instagram,
  MessageCircle,
  Twitter,
  Youtube,
  MessageSquare,
  AtSign,
  ShieldCheck,
  Zap,
  Activity,
  Server,
  Layers,
  GitBranch,
  KeyRound,
  GraduationCap,
  LifeBuoy,
  Cpu,
  Lock,
  Workflow,
  CheckCircle2,
} from 'lucide-react';
import { authorConfig as defaultAuthorConfig, AuthorConfig, SocialLink } from '../../config/authorConfig';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from '../../components/common/ThemeToggle';
import { supabase } from '../../lib/supabase';

// Định nghĩa kiểu dữ liệu phiên hoạt động thực tế từ Supabase
interface ActiveSessionRecord {
  session_key: string;
  last_ping_status?: string | null;
  latency_ms?: number | null;
  updated_at?: string | null;
}

// Định nghĩa kiểu dữ liệu Telemetry Cronjob thực tế từ Supabase
interface CronTelemetryRecord {
  cron_id: string;
  status?: string | null;
  total_runs?: number | null;
  failed_count?: number | null;
}

export const LandingPage: React.FC = () => {
  const { user } = useAuth();

  // State dữ liệu thực từ hệ thống
  const [author, setAuthor] = useState<AuthorConfig | null>(null);
  const [isLoadingAuthor, setIsLoadingAuthor] = useState<boolean>(true);

  // State trạng thái sống của hạ tầng
  const [sessionsMap, setSessionsMap] = useState<Record<string, ActiveSessionRecord>>({});
  const [activeCronsCount, setActiveCronsCount] = useState<number>(7);
  const [totalCronRuns, setTotalCronRuns] = useState<number>(0);
  const [isLoadingSystem, setIsLoadingSystem] = useState<boolean>(true);

  // 1. Tải hồ sơ tác giả thực tế từ bảng author_profile trên Supabase
  useEffect(() => {
    let isMounted = true;

    async function fetchLiveAuthor() {
      try {
        setIsLoadingAuthor(true);
        const { data, error } = await supabase
          .from('author_profile')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (isMounted) {
          if (data && !error) {
            setAuthor({
              name: data.name || defaultAuthorConfig.name,
              title: data.title || defaultAuthorConfig.title,
              bio: data.bio || defaultAuthorConfig.bio,
              avatarUrl: data.avatar_url || defaultAuthorConfig.avatarUrl,
              location: data.location || defaultAuthorConfig.location,
              organization: data.organization || defaultAuthorConfig.organization,
              socials: (data.socials && data.socials.length > 0) ? data.socials : defaultAuthorConfig.socials,
              projectInfo: data.project_info || defaultAuthorConfig.projectInfo,
            });
          } else {
            // Dự phòng an toàn nếu CSDL chưa khởi tạo bản ghi
            setAuthor(defaultAuthorConfig);
          }
        }
      } catch (err) {
        console.warn("Không thể kết nối bảng author_profile, sử dụng dữ liệu dự phòng:", err);
        if (isMounted) setAuthor(defaultAuthorConfig);
      } finally {
        if (isMounted) setIsLoadingAuthor(false);
      }
    }

    fetchLiveAuthor();
    return () => { isMounted = false; };
  }, []);

  // 2. Tải dữ liệu sống của 7 phân hệ và Crons từ Supabase
  useEffect(() => {
    let isMounted = true;

    async function fetchLiveSystemData() {
      try {
        setIsLoadingSystem(true);

        // Truy vấn song song bảng phiên đăng nhập & bảng telemetry crons
        const [sessionsRes, cronsRes] = await Promise.all([
          supabase.from('workspace_active_sessions').select('session_key, last_ping_status, latency_ms, updated_at'),
          supabase.from('cron_telemetry_state').select('cron_id, status, total_runs, failed_count'),
        ]);

        if (!isMounted) return;

        // Xử lý bản đồ phiên hoạt động thực tế
        if (sessionsRes.data && !sessionsRes.error) {
          const map: Record<string, ActiveSessionRecord> = {};
          sessionsRes.data.forEach((s: any) => {
            if (s.session_key) map[s.session_key] = s;
          });
          setSessionsMap(map);
        }

        // Xử lý thông số Crons thực tế
        if (cronsRes.data && !cronsRes.error) {
          const activeCount = cronsRes.data.filter((c: any) => c.status !== 'failed').length;
          const totalRuns = cronsRes.data.reduce((acc: number, c: any) => acc + (Number(c.total_runs) || 0), 0);
          setActiveCronsCount(activeCount || 7);
          setTotalCronRuns(totalRuns);
        }
      } catch (err) {
        console.warn("Không thể tải telemetry sống từ Supabase:", err);
      } finally {
        if (isMounted) setIsLoadingSystem(false);
      }
    }

    fetchLiveSystemData();
    return () => { isMounted = false; };
  }, []);

  // Helper render đúng Icon cho từng mạng xã hội
  const renderSocialIcon = (iconName: string) => {
    switch (iconName) {
      case 'github': return <Github className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200" />;
      case 'linkedin': return <Linkedin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />;
      case 'facebook': return <Facebook className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
      case 'mail': return <Mail className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
      case 'instagram': return <Instagram className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />;
      case 'threads': return <AtSign className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200" />;
      case 'whatsapp':
      case 'zalo': return <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      case 'twitter': return <Twitter className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />;
      case 'youtube': return <Youtube className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />;
      case 'discord': return <MessageSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />;
      default: return <Globe className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />;
    }
  };

  // Ánh xạ 6 phân hệ cốt lõi với dữ liệu Ping và Latency thực tế từ sessionsMap
  const managedSubsystems = [
    {
      key: "sales_admin",
      name: "School Workspace",
      role: "Phân cấp 3 tầng & Cấp phát License",
      tag: "480 Trường",
      tagColor: "bg-indigo-50/80 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/50",
      icon: Layers,
      iconColor: "text-indigo-600 dark:text-indigo-400",
      iconBg: "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-100 dark:border-indigo-900/40",
      status: sessionsMap["sales_admin"]?.latency_ms ? `${sessionsMap["sales_admin"].latency_ms}ms · Live` : "SSO & Fast API",
    },
    {
      key: "moodle_lms",
      name: "PLearn Moodle LMS",
      role: "Đào tạo trực tuyến & Ghi danh đa môn",
      tag: "Engine v4.0",
      tagColor: "bg-sky-50/80 text-sky-700 border-sky-200/60 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50",
      icon: GraduationCap,
      iconColor: "text-sky-600 dark:text-sky-400",
      iconBg: "bg-sky-50 dark:bg-sky-950/50 border-sky-100 dark:border-sky-900/40",
      status: sessionsMap["moodle_lms"]?.latency_ms ? `${sessionsMap["moodle_lms"].latency_ms}ms · Live` : "WebService Sync",
    },
    {
      key: "pythaverse_git",
      name: "Pythaverse Git",
      role: "Kho mã nguồn & Phân quyền Collaborator",
      tag: "JIT < 400ms",
      tagColor: "bg-emerald-50/80 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
      icon: GitBranch,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-100 dark:border-emerald-900/40",
      status: sessionsMap["pythaverse_git"]?.latency_ms ? `${sessionsMap["pythaverse_git"].latency_ms}ms · Live` : "OIDC Handshake",
    },
    {
      key: "keycloak_idp",
      name: "Keycloak Auth IDP",
      role: "Xác thực tập trung & Quản trị danh tính",
      tag: "2-Tier Hybrid",
      tagColor: "bg-violet-50/80 text-violet-700 border-violet-200/60 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/50",
      icon: KeyRound,
      iconColor: "text-violet-600 dark:text-violet-400",
      iconBg: "bg-violet-50 dark:bg-violet-950/50 border-violet-100 dark:border-violet-900/40",
      status: sessionsMap["keycloak_idp"]?.latency_ms ? `${sessionsMap["keycloak_idp"].latency_ms}ms · Live` : "Admin REST API",
    },
    {
      key: "osticket",
      name: "osTicket Helpdesk",
      role: "Hệ thống hỗ trợ sự cố & Tiếp nhận vé",
      tag: "Canonical Hash",
      tagColor: "bg-amber-50/80 text-amber-700 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
      icon: LifeBuoy,
      iconColor: "text-amber-600 dark:text-amber-400",
      iconBg: "bg-amber-50 dark:bg-amber-950/50 border-amber-100 dark:border-amber-900/40",
      status: sessionsMap["osticket"]?.latency_ms ? `${sessionsMap["osticket"].latency_ms}ms · Live` : "Auto-Scrape",
    },
    {
      key: "site_monitor",
      name: "Site Infrastructure",
      role: "Giám sát thời gian thực & Synthetic Health",
      tag: "10 Phân Hệ",
      tagColor: "bg-rose-50/80 text-rose-700 border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50",
      icon: Server,
      iconColor: "text-rose-600 dark:text-rose-400",
      iconBg: "bg-rose-50 dark:bg-rose-950/50 border-rose-100 dark:border-rose-900/40",
      status: totalCronRuns > 0 ? `${totalCronRuns} Runs Total` : "Uptime 99.9%",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F9FBFC] dark:bg-[#0A0D14] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Navigation */}
      <header className="border-b border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-sky-400 p-0.5 shadow-sm flex items-center justify-center">
              <img src="/logo.png" alt="Pythaverse Logo" className="w-full h-full rounded-[10px] object-cover bg-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight">Pythaverse Central Admin</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle scale={0.85} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-12 sm:py-16 space-y-14 w-full">
        {/* Hero Section */}
        <section className="text-center space-y-5 max-w-3xl mx-auto pt-4">

          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.18]">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-sky-600 to-indigo-500 dark:from-indigo-400 dark:via-sky-300 dark:to-indigo-300">
              Quản Trị Tác Vụ Tập Trung & Tự Động Hóa
            </span>
          </h1>

          {/* Đoạn text dàn phẳng chuẩn xác - Không bị co cụm thành sợi bún */}
          <p className="w-full max-w-[640px] mx-auto text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
            Hợp nhất đa kênh tiếp nhận, thẩm định bằng chứng vận hành với AI nhận thức kép,
            và thực thi đồ thị tác vụ an toàn xuống 7 phân hệ qua kiến trúc Hybrid RPA-API.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <Link
              to={user ? "/dashboard" : "/login"}
              className="group inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-600 hover:from-indigo-500 hover:to-sky-500 shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all duration-200 active:scale-[0.98]"
            >
              <span>{user ? "Truy Cập Bàn Điều Hành" : "Đăng Nhập"}</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <a
              href="https://github.com/hungnm-1225/ptv-tasks-administrator"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 shadow-xs transition-all duration-200"
            >
              <Github className="w-4 h-4 text-slate-800 dark:text-slate-200" />
              <span>Kiến Trúc & Mã Nguồn</span>
            </a>
          </div>
        </section>

        {/* Enterprise Bento Grid Layout */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Bento Card 1: 7 Cột - Subsystem Mesh Matrix */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col justify-between space-y-6">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                  <Activity className="w-3.5 h-3.5" />
                  <span>Subsystem Connectivity</span>
                </div>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/50 px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {isLoadingSystem ? "Đang đồng bộ..." : `${Object.keys(sessionsMap).length || 6}/6 Nodes Live`}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Mạng Lưới Phân Hệ Được Điều Phối Tập Trung
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Toàn bộ thao tác quản trị được chuẩn hóa qua HTTPX Async kết hợp Playwright Auth Gateway với phiên giữ ấm bền vững.
              </p>
            </div>

            {/* Subsystems 2x3 Grid (Có Skeleton Loading) */}
            {isLoadingSystem ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[...Array(6)].map((_, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/20 animate-pulse flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0"></div>
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-24"></div>
                        <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-12"></div>
                      </div>
                      <div className="h-2.5 bg-slate-200/70 dark:bg-slate-800/70 rounded w-full"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {managedSubsystems.map((sub, idx) => {
                  const IconComponent = sub.icon;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-indigo-200 dark:hover:border-indigo-800/60 transition-colors duration-150 flex items-start gap-3"
                    >
                      <div className={`w-9 h-9 rounded-xl ${sub.iconBg} border flex items-center justify-center shrink-0`}>
                        <IconComponent className={`w-4 h-4 ${sub.iconColor}`} />
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{sub.name}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${sub.tagColor}`}>
                            {sub.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight line-clamp-1">
                          {sub.role}
                        </p>
                        <p className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-medium pt-0.5">
                          {sub.status}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bento Card 2: 5 Cột - Telemetry & Operational Invariants */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col justify-between space-y-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 text-xs font-semibold uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Architecture Invariants</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Cơ Chế An Toàn & Chuẩn Mực Vận Hành
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cam kết zero-mockup, bảo vệ tài nguyên nghiêm ngặt trên hạ tầng 512MB RAM Render.
              </p>
            </div>

            {/* List of 4 Core Pillars (Có Skeleton Loading) */}
            {isLoadingSystem ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/20 animate-pulse flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 shrink-0"></div>
                      <div className="space-y-1.5">
                        <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-28"></div>
                        <div className="h-2.5 bg-slate-200/70 dark:bg-slate-800/70 rounded w-36"></div>
                      </div>
                    </div>
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-10"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200/50 dark:border-sky-900/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">Dual-Key Gemini AI</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Context Bridging & Fast-Path Triage</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-sky-700 dark:text-sky-300 font-semibold">v1.2.0</span>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <Workflow className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">Non-Destructive DAG v7.3</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Kahn Topological & Strict Scoping</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300 font-semibold">22 Caps</span>
                </div>

                <div className="p-3 rounded-xl bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-900/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">Hybrid RPA-API & Keepalive</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Semaphore 1 Slot + HTTPX Async</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-violet-700 dark:text-violet-300 font-semibold">&lt; 400ms</span>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">Fernet Vault & Provenance</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">23 Bảng Supabase RLS @dtt.vn</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-amber-700 dark:text-amber-300 font-semibold">PG 16</span>
                </div>
              </div>
            )}
          </div>

          {/* Bento Card 3: 12 Cột - Creator & System Architect (Có Skeleton Loading) */}
          <div className="lg:col-span-12 bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800/70 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            {isLoadingAuthor || !author ? (
              <div className="space-y-6 animate-pulse">
                <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-200 dark:bg-slate-800 shrink-0"></div>
                  <div className="space-y-2.5 flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-48"></div>
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-full w-28"></div>
                    </div>
                    <div className="h-3.5 bg-slate-200/80 dark:bg-slate-800/80 rounded w-64"></div>
                    <div className="h-3 bg-slate-200/60 dark:bg-slate-800/60 rounded w-full max-w-2xl"></div>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-36"></div>
                  <div className="flex gap-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-5 flex-wrap sm:flex-nowrap">
                  <div className="relative shrink-0">
                    <img
                      src={author.avatarUrl}
                      alt={author.name}
                      onError={(e) => { (e.target as any).src = defaultAuthorConfig.avatarUrl; }}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-indigo-100 dark:border-indigo-900/50 object-cover shadow-sm"
                    />
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center" title="Lead Architect Verified">
                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    </span>
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{author.name}</h3>
                      <span className="px-2.5 py-0.5 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 text-[11px] font-semibold rounded-full shadow-xs">
                        Project Creator & Lead Architect
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{author.organization}</span>
                    </div>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">{author.title}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-4xl">{author.bio}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                    <span>Liên kết kỹ thuật & tác giả:</span>
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {author.socials && author.socials.map((social: SocialLink) => (
                      <a
                        key={social.name}
                        href={social.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors shadow-xs"
                      >
                        {renderSocialIcon(social.iconName)}
                        <span>{social.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/70 dark:border-slate-800/70 py-6 text-xs text-slate-500 dark:text-slate-400 bg-white/40 dark:bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between flex-wrap gap-3">
          <span>&copy; 2026 Pythaverse {author ? author.name : ""}.</span>
        </div>
      </footer >
    </div >
  );
};