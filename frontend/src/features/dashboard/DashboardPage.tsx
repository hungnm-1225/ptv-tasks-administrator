// frontend/src/features/dashboard/DashboardPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Inbox, CheckCircle2, Clock, Activity, TrendingUp, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { fetchApi } from '../../lib/api';
import { ReportsSummary } from '../../types';
import { useTheme } from '../../context/ThemeContext';

const PASTEL_COLORS = [
  '#8b5cf6', // Soft Lavender (System Bugs)
  '#38bdf8', // Sky Mist (Keycloak / Account)
  '#34d399', // Soft Sage Mint (LMS Enroll)
  '#fbbf24', // Soft Butter Amber (License)
  '#fb7185', // Soft Peach Rose (Others)
];

type TimeRangeOption = '7d' | '30d' | 'this_month';

export const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [isCatLoading, setIsCatLoading] = useState<boolean>(false);
  const [isTrendLoading, setIsTrendLoading] = useState<boolean>(false);

  const [catRange, setCatRange] = useState<TimeRangeOption>('7d');
  const [trendRange, setTrendRange] = useState<TimeRangeOption>('7d');
  const { theme } = useTheme();

  const isDark = theme === 'dark';

  // Hàm load dữ liệu linh hoạt
  const fetchDashboardData = useCallback(async (
    target: 'all' | 'cat' | 'trend',
    newCatRange: TimeRangeOption,
    newTrendRange: TimeRangeOption
  ) => {
    if (target === 'all') setInitialLoading(true);
    if (target === 'cat') setIsCatLoading(true);
    if (target === 'trend') setIsTrendLoading(true);

    try {
      const data = await fetchApi<ReportsSummary>(
        `/reports/summary?cat_range=${newCatRange}&trend_range=${newTrendRange}`
      );
      setSummary(data);
    } catch (err) {
      console.error('Lỗi khi tải báo cáo tổng quan:', err);
    } finally {
      if (target === 'all') setInitialLoading(false);
      if (target === 'cat') setIsCatLoading(false);
      if (target === 'trend') setIsTrendLoading(false);
    }
  }, []);

  // Lần đầu vào trang
  useEffect(() => {
    fetchDashboardData('all', catRange, trendRange);
  }, [fetchDashboardData]);

  // Xử lý đổi bộ lọc Danh mục
  const handleCatRangeChange = (range: TimeRangeOption) => {
    if (range === catRange) return;
    setCatRange(range);
    fetchDashboardData('cat', range, trendRange);
  };

  // Xử lý đổi bộ lọc Xu hướng
  const handleTrendRangeChange = (range: TimeRangeOption) => {
    if (range === trendRange) return;
    setTrendRange(range);
    fetchDashboardData('trend', catRange, range);
  };

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-500 dark:text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600 dark:text-violet-400" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Đang nạp dữ liệu báo cáo real-time...</span>
      </div>
    );
  }

  const categoryData = (summary?.category_ratios || []).map((cat, idx) => ({
    ...cat,
    color: PASTEL_COLORS[idx % PASTEL_COLORS.length],
  }));

  const dailyTrendData = summary?.daily_trends || [];

  return (
    <div className="space-y-7">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Executive Dashboard</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tổng quan chỉ số KPI và trạng thái tự động hóa hệ thống real-time.</p>
      </div>

      {/* Real-time KPI Cards (Bento Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ticket Chờ Xử Lý */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ticket Chờ Xử Lý</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 border border-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 flex items-center justify-center shadow-xs">
              <Inbox className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-3">
            {summary?.total_tickets ?? 0}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1.5">
            <TrendingUp className="w-3 h-3" />
            <span>{summary?.weekly_trend_text ?? '+0% so với tuần trước'}</span>
          </div>
        </div>

        {/* Card 2: Tác Vụ Chờ Phê Duyệt */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Chờ Phê Duyệt</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 flex items-center justify-center shadow-xs">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-3">
            {summary?.pending_approval ?? 0}
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1.5">Human-in-the-Loop required</div>
        </div>

        {/* Card 3: Đã Giải Quyết Tháng Này */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Đã Giải Quyết Tháng Này</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-3">
            {summary?.resolved_this_month ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1.5">
            Tỉ lệ tự động hóa {summary?.automation_rate ?? 92}%
          </div>
        </div>

        {/* Card 4: System Health */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">System Health</span>
            <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-700 border border-violet-200/80 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 flex items-center justify-center shadow-xs">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-3">
            {summary?.system_health ?? '100%'}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1.5">Workers hoạt động ổn định</div>
        </div>
      </div>

      {/* Recharts Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Category Breakdown Card */}
        <div className="relative bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs space-y-4">
          {/* Loading Overlay riêng cho Category */}
          {isCatLoading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-[2px] z-10 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600 dark:text-violet-400" />
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Đang cập nhật danh mục...</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Phân Phối Theo Danh Mục</h3>
              <span className="text-[10px] text-slate-400 font-mono">Gemini AI Triaged</span>
            </div>
            {/* Bộ lọc riêng Category */}
            <div className="flex bg-slate-100 dark:bg-slate-700/60 p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                disabled={isCatLoading}
                onClick={() => handleCatRangeChange('7d')}
                className={`px-2.5 py-1 rounded-md transition-all ${catRange === '7d'
                  ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 font-semibold shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
              >
                7 ngày
              </button>
              <button
                type="button"
                disabled={isCatLoading}
                onClick={() => handleCatRangeChange('30d')}
                className={`px-2.5 py-1 rounded-md transition-all ${catRange === '30d'
                  ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 font-semibold shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
              >
                30 ngày
              </button>
              <button
                type="button"
                disabled={isCatLoading}
                onClick={() => handleCatRangeChange('this_month')}
                className={`px-2.5 py-1 rounded-md transition-all ${catRange === 'this_month'
                  ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 font-semibold shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
              >
                Tháng này
              </button>
            </div>
          </div>

          <div className="h-64 outline-none select-none">
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
                      stroke={isDark ? '#1e293b' : '#ffffff'}
                      strokeWidth={2}
                      style={{ outline: 'none' }}
                      tabIndex={-1}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    outline: 'none'
                  }}
                  formatter={(value: any, name: any) => [`${value} yêu cầu`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Trend Card */}
        <div className="relative bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs space-y-4">
          {/* Loading Overlay riêng cho Trend */}
          {isTrendLoading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-[2px] z-10 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600 dark:text-violet-400" />
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Đang nạp xu hướng...</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Xu Hướng Xử Lý Hàng Ngày</h3>
              <span className="text-[10px] text-slate-400 font-mono">Tiếp nhận vs Hoàn thành</span>
            </div>
            {/* Bộ lọc riêng Trend */}
            <div className="flex bg-slate-100 dark:bg-slate-700/60 p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                disabled={isTrendLoading}
                onClick={() => handleTrendRangeChange('7d')}
                className={`px-2.5 py-1 rounded-md transition-all ${trendRange === '7d'
                  ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 font-semibold shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
              >
                7 ngày
              </button>
              <button
                type="button"
                disabled={isTrendLoading}
                onClick={() => handleTrendRangeChange('30d')}
                className={`px-2.5 py-1 rounded-md transition-all ${trendRange === '30d'
                  ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 font-semibold shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
              >
                30 ngày
              </button>
              <button
                type="button"
                disabled={isTrendLoading}
                onClick={() => handleTrendRangeChange('this_month')}
                className={`px-2.5 py-1 rounded-md transition-all ${trendRange === 'this_month'
                  ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 font-semibold shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
              >
                Tháng này
              </button>
            </div>
          </div>

          <div className="h-64 outline-none">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                  }}
                  formatter={(val: any, name: any) => [
                    `${val} tickets`,
                    name === 'incoming' ? '📥 Tiếp nhận mới' : '✅ Đã giải quyết'
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
                <Bar
                  dataKey="incoming"
                  name="incoming"
                  fill={isDark ? '#a78bfa' : '#8b5cf6'}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="resolved"
                  name="resolved"
                  fill="#34d399"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};