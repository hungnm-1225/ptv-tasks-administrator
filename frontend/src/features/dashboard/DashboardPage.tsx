// frontend/src/features/dashboard/DashboardPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Inbox, CheckCircle2, Clock, Activity, TrendingUp, Loader2, Sparkles, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { fetchApi } from '../../lib/api';
import { ReportsSummary } from '../../types';
import { useTheme } from '../../context/ThemeContext';

// Enterprise Pastel Chart Palette — Sky, Emerald, Amber, Rose, Indigo
const CHART_PALETTE = [
  '#38BDF8', // sky-400
  '#34D399', // emerald-400
  '#FBBF24', // amber-400
  '#F87171', // rose-400
  '#818CF8', // indigo-400
];

type TimeRangeOption = '7d' | '30d' | 'this_month';

// ⚡ LẤY BASELINE CACHE TỪ LOCALSTORAGE (HIỂN THỊ NGAY 0MS KHÔNG SPINNER)
const getDashboardCache = (): ReportsSummary | null => {
  try {
    const raw = localStorage.getItem('ptv_dashboard_summary_cache');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const setDashboardCache = (data: ReportsSummary) => {
  try {
    localStorage.setItem('ptv_dashboard_summary_cache', JSON.stringify(data));
  } catch { }
};

export const DashboardPage: React.FC = () => {
  // Khởi tạo state ngay từ localStorage (0ms)
  const initialCache = useMemo(() => getDashboardCache(), []);
  const [summary, setSummary] = useState<ReportsSummary | null>(initialCache);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(!initialCache);

  const [isCatLoading, setIsCatLoading] = useState<boolean>(false);
  const [isTrendLoading, setIsTrendLoading] = useState<boolean>(false);

  const [catRange, setCatRange] = useState<TimeRangeOption>('7d');
  const [trendRange, setTrendRange] = useState<TimeRangeOption>('7d');
  const { theme } = useTheme();

  const isDark = theme === 'dark';

  // ⚡ SWR BACKGROUND REVALIDATION
  const fetchDashboardData = useCallback(async (
    target: 'all' | 'cat' | 'trend',
    newCatRange: TimeRangeOption,
    newTrendRange: TimeRangeOption
  ) => {
    if (target === 'all' && !summary) setIsInitialLoading(true);
    if (target === 'cat') setIsCatLoading(true);
    if (target === 'trend') setIsTrendLoading(true);

    try {
      const data = await fetchApi<ReportsSummary>(
        `/reports/summary?cat_range=${newCatRange}&trend_range=${newTrendRange}`
      );
      setDashboardCache(data);
      setSummary(data);
    } catch (err) {
      console.error('Lỗi khi tải báo cáo tổng quan:', err);
    } finally {
      setIsInitialLoading(false);
      if (target === 'cat') setIsCatLoading(false);
      if (target === 'trend') setIsTrendLoading(false);
    }
  }, [summary]);

  useEffect(() => {
    fetchDashboardData('all', catRange, trendRange);
  }, [fetchDashboardData]);

  const handleCatRangeChange = (range: TimeRangeOption) => {
    if (range === catRange) return;
    setCatRange(range);
    fetchDashboardData('cat', range, trendRange);
  };

  const handleTrendRangeChange = (range: TimeRangeOption) => {
    if (range === trendRange) return;
    setTrendRange(range);
    fetchDashboardData('trend', catRange, range);
  };

  const categoryData = (summary?.category_ratios || []).map((cat, idx) => ({
    ...cat,
    color: CHART_PALETTE[idx % CHART_PALETTE.length],
  }));

  const dailyTrendData = summary?.daily_trends || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Executive Dashboard</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tổng quan chỉ số KPI và trạng thái tự động hóa hệ thống real-time.</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 text-xs font-semibold shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Pythaverse Live Sync</span>
          </span>
        </div>
      </div>

      {/* Bento KPI Matrix — 4×1 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Cell 1: Ticket Chờ Xử Lý — Sky Pastel */}
        <div className="bento-card p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Ticket Chờ Xử Lý</span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50 flex items-center justify-center shadow-xs">
              <Inbox className="w-4.5 h-4.5" />
            </div>
          </div>
          {isInitialLoading && !summary ? (
            <div className="space-y-2 pt-2 animate-pulse">
              <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              <div className="h-3 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight">
                {summary?.total_tickets ?? 0}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{summary?.weekly_trend_text ?? '+0% so với tuần trước'}</span>
              </div>
            </>
          )}
        </div>

        {/* Cell 2: Chờ Phê Duyệt — Warm Amber Pastel */}
        <div className="bento-card p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Chờ Phê Duyệt</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50 flex items-center justify-center shadow-xs">
              <Clock className="w-4.5 h-4.5" />
            </div>
          </div>
          {isInitialLoading && !summary ? (
            <div className="space-y-2 pt-2 animate-pulse">
              <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              <div className="h-3 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight">
                {summary?.pending_approval ?? 0}
              </div>
              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">Human-in-the-Loop required</div>
            </>
          )}
        </div>

        {/* Cell 3: Đã Giải Quyết Tháng Này — Mint / Emerald Pastel */}
        <div className="bento-card p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Đã Giải Quyết Tháng Này</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-4.5 h-4.5" />
            </div>
          </div>
          {isInitialLoading && !summary ? (
            <div className="space-y-2 pt-2 animate-pulse">
              <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              <div className="h-3 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight">
                {summary?.resolved_this_month ?? 0}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Tỉ lệ tự động hóa <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">{summary?.automation_rate ?? 92}%</strong>
              </div>
            </>
          )}
        </div>

        {/* Cell 4: System Health — Indigo / Slate Pastel */}
        <div className="bento-card p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">System Health</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 flex items-center justify-center shadow-xs">
              <Activity className="w-4.5 h-4.5" />
            </div>
          </div>
          {isInitialLoading && !summary ? (
            <div className="space-y-2 pt-2 animate-pulse">
              <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              <div className="h-3 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ) : (
            <>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums tracking-tight">
                {summary?.system_health ?? '100%'}
              </div>
              <div className={`text-xs font-medium truncate ${(summary?.system_health === '100%')
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
                }`}>
                {(summary as any)?.system_health_subtext ?? '10/10 Sites & Workers tối ưu (24h)'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recharts Bento Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Category Breakdown Donut Card */}
        <div className="relative bento-card p-6 space-y-4">
          {isCatLoading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs z-10 rounded-2xl flex flex-col items-center justify-center gap-2 transition-opacity">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Đang cập nhật danh mục...</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Phân Phối Theo Danh Mục</h3>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
              {(['7d', '30d', 'this_month'] as TimeRangeOption[]).map((r) => {
                const active = catRange === r;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={isCatLoading}
                    onClick={() => handleCatRangeChange(r)}
                    className={`px-2.5 py-1 rounded-md transition-all ${active
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    {r === 'this_month' ? 'Tháng này' : r === '7d' ? '7 ngày' : '30 ngày'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-64 outline-none select-none">
            {isInitialLoading && !summary ? (
              <div className="w-full h-full flex items-center justify-center animate-pulse">
                <div className="w-40 h-40 rounded-full border-8 border-slate-200 dark:border-slate-800" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart style={{ outline: 'none' }}>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    label={({ name, percent }: any) => (percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : '')}
                    style={{ outline: 'none' }}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        stroke={isDark ? '#0F172A' : '#FFFFFF'}
                        strokeWidth={2}
                        style={{ outline: 'none' }}
                        tabIndex={-1}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                      border: isDark ? '1px solid #1E293B' : '1px solid #E2E8F0',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: isDark ? '#F1F5F9' : '#0F172A',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                      outline: 'none',
                    }}
                    formatter={(value: any, name: any) => [`${value} yêu cầu`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Daily Trend Bar Card */}
        <div className="relative bento-card p-6 space-y-4">
          {isTrendLoading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs z-10 rounded-2xl flex flex-col items-center justify-center gap-2 transition-opacity">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Đang nạp xu hướng...</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Xu Hướng Xử Lý Hàng Ngày</h3>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
              {(['7d', '30d', 'this_month'] as TimeRangeOption[]).map((r) => {
                const active = trendRange === r;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={isTrendLoading}
                    onClick={() => handleTrendRangeChange(r)}
                    className={`px-2.5 py-1 rounded-md transition-all ${active
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    {r === 'this_month' ? 'Tháng này' : r === '7d' ? '7 ngày' : '30 ngày'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-64 outline-none">
            {isInitialLoading && !summary ? (
              <div className="w-full h-full flex items-end justify-between gap-2 p-4 animate-pulse">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="w-full bg-slate-200 dark:bg-slate-800 rounded-t" style={{ height: `${(i + 2) * 12}%` }} />
                ))}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="day" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                      border: isDark ? '1px solid #1E293B' : '1px solid #E2E8F0',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: isDark ? '#F1F5F9' : '#0F172A',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                    }}
                    formatter={(val: any, name: any) => [
                      `${val} tickets`,
                      name === 'incoming' ? 'Tiếp nhận mới' : 'Đã giải quyết'
                    ]}
                    labelFormatter={(label) => `Ngày ${label}`}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '8px' }}
                    formatter={(val) => (val === 'incoming' ? 'Tiếp nhận' : 'Đã giải quyết')}
                  />
                  {/* Sky (incoming) + Mint / Emerald (resolved) */}
                  <Bar dataKey="incoming" name="incoming" fill="#38BDF8" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="resolved" name="resolved" fill="#34D399" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
