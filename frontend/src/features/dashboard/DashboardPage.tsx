import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox,
  Clock,
  CheckCircle2,
  Activity,
  TrendingUp,
  AlertCircle,
  PieChart as PieIcon,
  BarChart3,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { ReportsSummary } from '../../types';
import { useTheme } from '../../context/ThemeContext';

// Enterprise Pastel Palette đồng bộ với màu hệ thống
const CHART_PALETTE = [
  '#38BDF8', // sky-400
  '#34D399', // emerald-400
  '#FBBF24', // amber-400
  '#F87171', // rose-400
  '#818CF8', // indigo-400
  '#A78BFA', // purple-400
  '#FB923C', // orange-400
];

export type TimeRangeOption = '7d' | '30d' | 'this_month';

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
  // 1. State Quản trị dữ liệu & Time Range đồng bộ toàn trang
  const initialCache = useMemo(() => getDashboardCache(), []);
  const [summary, setSummary] = useState<ReportsSummary | null>(initialCache);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(!initialCache);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Time Range thống nhất cho toàn bộ Dashboard
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('7d');

  // Hover states cho Interactive Charts
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // 2. ⚡ SWR FETCH: Đồng bộ toàn bộ KPI & Charts theo Time Range
  const fetchDashboardData = useCallback(async (range: TimeRangeOption) => {
    if (!summary) setIsInitialLoading(true);
    setIsRefreshing(true);

    try {
      // Gọi API Backend FastAPI với tham số đồng bộ
      const data = await fetchApi<ReportsSummary>(
        `/reports/summary?cat_range=${range}&trend_range=${range}`
      );
      setDashboardCache(data);
      setSummary(data);
    } catch (err) {
      console.error('Lỗi khi tải báo cáo tổng quan:', err);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [summary]);

  useEffect(() => {
    fetchDashboardData(timeRange);
  }, [timeRange, fetchDashboardData]);

  const handleTimeRangeChange = (newRange: TimeRangeOption) => {
    if (newRange === timeRange) return;
    setTimeRange(newRange);
  };

  // 3. Chuẩn bị Dữ liệu cho Donut Chart
  const categories = useMemo(() => {
    const rawCats = summary?.category_ratios || [];
    const totalCount = rawCats.reduce((acc, cur) => acc + (cur.value || 0), 0);

    return rawCats.map((cat, idx) => {
      const count = cat.value || 0;
      const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
      return {
        id: `cat-${idx}`,
        name: cat.name,
        count,
        percentage,
        color: CHART_PALETTE[idx % CHART_PALETTE.length],
      };
    });
  }, [summary?.category_ratios]);

  const totalCategoryCount = useMemo(
    () => categories.reduce((sum, item) => sum + item.count, 0),
    [categories]
  );
  const totalCategoryPercentage = useMemo(
    () => categories.reduce((sum, item) => sum + item.percentage, 0),
    [categories]
  );
  const activeCategory = useMemo(
    () => categories.find((c) => c.id === hoveredCategoryId) || null,
    [categories, hoveredCategoryId]
  );

  // SVG Donut Math calculations
  const donutSize = 220;
  const donutCenter = donutSize / 2;
  const outerRadius = 88;
  const innerRadius = 58;

  let cumulativeAngle = -90;
  const donutSlices = useMemo(() => {
    return categories.map((cat) => {
      const angle = (cat.percentage / (totalCategoryPercentage || 100)) * 360;
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + angle;
      cumulativeAngle = endAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = donutCenter + outerRadius * Math.cos(startRad);
      const y1 = donutCenter + outerRadius * Math.sin(startRad);
      const x2 = donutCenter + outerRadius * Math.cos(endRad);
      const y2 = donutCenter + outerRadius * Math.sin(endRad);

      const x3 = donutCenter + innerRadius * Math.cos(endRad);
      const y3 = donutCenter + innerRadius * Math.sin(endRad);
      const x4 = donutCenter + innerRadius * Math.cos(startRad);
      const y4 = donutCenter + innerRadius * Math.sin(startRad);

      const largeArc = angle > 180 ? 1 : 0;

      const pathData = [
        `M ${x1} ${y1}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
        'Z',
      ].join(' ');

      return {
        ...cat,
        pathData,
      };
    });
  }, [categories, totalCategoryPercentage]);

  // 4. Chuẩn bị Dữ liệu cho Daily Trend Bar Chart
  const dailyTrends = useMemo(() => {
    return (summary?.daily_trends || []).map((d) => ({
      shortDate: d.day,
      received: d.incoming ?? 0,
      resolved: d.resolved ?? 0,
    }));
  }, [summary?.daily_trends]);

  const maxTrendValue = useMemo(() => {
    return Math.max(...dailyTrends.map((d) => Math.max(d.received, d.resolved, 1)), 16);
  }, [dailyTrends]);

  const yMax = Math.ceil(maxTrendValue / 4) * 4;
  const yTicks = [yMax, (yMax * 3) / 4, (yMax * 2) / 4, yMax / 4, 0];

  /* =========================================================================
     SKELETON VIEW KHI CHƯA CÓ DỮ LIỆU CACHE BAN ĐẦU
     ========================================================================= */
  if (isInitialLoading && !summary) {
    return (
      <div id="skeleton-dashboard-container" className="space-y-6 animate-pulse">
        {/* Title Skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-56 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-96 max-w-full rounded bg-slate-200/70 dark:bg-slate-800/60" />
          </div>
        </div>

        {/* 4 Bento KPI Cards Skeletons */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex flex-col justify-between rounded-[20px] border border-slate-200/70 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <div className="h-3.5 w-24 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="my-4">
                <div className="h-8 w-16 rounded-md bg-slate-200 dark:bg-slate-800" />
              </div>
              <div className="h-3.5 w-32 rounded bg-slate-200/70 dark:bg-slate-800/60" />
            </div>
          ))}
        </div>

        {/* 2 Main Charts Bento Grid Skeleton */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-[20px] border border-slate-200/70 bg-white p-6 shadow-xs lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div className="h-4 w-44 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-7 w-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="mt-8 grid grid-cols-1 items-center gap-6 sm:grid-cols-2">
              <div className="flex items-center justify-center">
                <div className="h-44 w-44 rounded-full border-8 border-slate-200 dark:border-slate-800" />
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-slate-200 dark:bg-slate-800" />
                      <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
                    </div>
                    <div className="h-3 w-8 rounded bg-slate-200 dark:bg-slate-800" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200/70 bg-white p-6 shadow-xs lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div className="h-4 w-48 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-7 w-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="mt-8 flex h-48 items-end justify-between gap-3 px-4 pb-4">
              {[35, 30, 60, 75, 90, 50, 20].map((height, idx) => (
                <div key={idx} className="flex flex-1 items-end justify-center gap-1">
                  <div
                    className="w-3.5 rounded-t bg-slate-200 dark:bg-slate-800"
                    style={{ height: `${height}%` }}
                  />
                  <div
                    className="w-3.5 rounded-t bg-slate-200/60 dark:bg-slate-800/60"
                    style={{ height: `${Math.max(10, height * 0.3)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================================
     MAIN EXECUTIVE DASHBOARD RENDER
     ========================================================================= */
  return (
    <motion.div
      id="executive-dashboard-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* 1. Header Bar với Live Sync Status */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
            Executive Dashboard
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-500 sm:text-sm dark:text-slate-400">
            Tổng quan chỉ số KPI và trạng thái tự động hóa hệ thống real-time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isRefreshing && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="font-semibold">Đang cập nhật...</span>
            </div>
          )}

          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/60 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-xs dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span>Pythaverse Live Sync</span>
          </span>
        </div>
      </div>

      {/* 2. Bento Grid: 4 Top KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Cell 1: Ticket Chờ Xử Lý — Sky Theme */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="group relative flex flex-col justify-between rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              TICKET CHỜ XỬ LÝ
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100/80 text-sky-700 transition-transform duration-200 group-hover:scale-105 dark:bg-sky-950/60 dark:text-sky-400">
              <Inbox className="h-5 w-5" />
            </div>
          </div>

          <div className="my-3">
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
              {summary?.total_tickets ?? 0}
            </div>
          </div>

          <div className="flex items-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-2.5 py-1 text-xs font-bold text-emerald-600 shadow-2xs dark:bg-slate-800 dark:text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>{summary?.weekly_trend_text ?? '+0% so với tuần trước'}</span>
            </div>
          </div>
        </motion.div>

        {/* Cell 2: Chờ Phê Duyệt — Amber Theme */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="group relative flex flex-col justify-between rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              CHỜ PHÊ DUYỆT
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100/80 text-amber-700 transition-transform duration-200 group-hover:scale-105 dark:bg-amber-950/60 dark:text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>

          <div className="my-3">
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
              {summary?.pending_approval ?? 0}
            </div>
          </div>

          <div className="flex items-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              <span className="truncate">Human-in-the-Loop required</span>
            </div>
          </div>
        </motion.div>

        {/* Cell 3: Đã Giải Quyết — Emerald Theme */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="group relative flex flex-col justify-between rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              ĐÃ GIẢI QUYẾT
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100/80 text-emerald-700 transition-transform duration-200 group-hover:scale-105 dark:bg-emerald-950/60 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          <div className="my-3">
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
              {summary?.resolved_this_month ?? 0}
            </div>
          </div>

          <div className="flex items-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <span>Tỉ lệ tự động hóa: <strong>{summary?.automation_rate ?? 92}%</strong></span>
            </div>
          </div>
        </motion.div>

        {/* Cell 4: System Health — Indigo / Rose Theme */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.2 }}
          className="group relative flex flex-col justify-between rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
              SYSTEM HEALTH
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100/80 text-indigo-700 transition-transform duration-200 group-hover:scale-105 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Activity className="h-5 w-5" />
            </div>
          </div>

          <div className="my-3">
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
              {summary?.system_health ?? '100%'}
            </div>
          </div>

          <div className="flex items-center">
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold truncate ${summary?.system_health === '100%'
                ? 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-amber-100/80 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
            >
              <span className="truncate">
                {(summary as any)?.system_health_subtext ?? '10/10 Sites & Workers tối ưu (24h)'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* 3. Bento Grid: 2 Core Charts (Donut & Grouped Bar Chart) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* === DONUT CHART: PHÂN PHỐI THEO DANH MỤC === */}
        <div
          id="card-category-distribution"
          className="flex flex-col justify-between rounded-[20px] border border-slate-200/80 bg-white p-6 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900 lg:col-span-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100/80 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                <PieIcon className="h-4 w-4 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-xs font-bold tracking-wider text-slate-800 uppercase dark:text-slate-100">
                  PHÂN PHỐI THEO DANH MỤC
                </h3>
                <p className="text-[11px] font-medium text-slate-400">Tỉ trọng các nhóm yêu cầu tiếp nhận</p>
              </div>
            </div>

            {/* Time range selector đồng bộ */}
            <div className="flex items-center rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-slate-700/80 dark:bg-slate-800/80">
              {(
                [
                  { key: '7d', label: '7 ngày' },
                  { key: '30d', label: '30 ngày' },
                  { key: 'this_month', label: 'Tháng này' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTimeRangeChange(tab.key)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${timeRange === tab.key
                    ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 items-center gap-6 md:grid-cols-12">
            <div className="relative flex items-center justify-center md:col-span-6">
              {categories.length === 0 ? (
                <div className="flex h-52 w-52 items-center justify-center text-xs text-slate-400 font-medium">
                  Chưa có dữ liệu danh mục
                </div>
              ) : (
                <svg
                  viewBox={`0 0 ${donutSize} ${donutSize}`}
                  className="h-52 w-52 overflow-visible transition-transform duration-300"
                >
                  {donutSlices.map((slice) => {
                    const isHovered = hoveredCategoryId === slice.id;
                    return (
                      <path
                        key={slice.id}
                        d={slice.pathData}
                        fill={slice.color}
                        stroke={isDark ? '#0F172A' : '#ffffff'}
                        strokeWidth={isHovered ? 2 : 1}
                        className="cursor-pointer transition-all duration-200"
                        style={{
                          transformOrigin: `${donutCenter}px ${donutCenter}px`,
                          transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                          opacity: hoveredCategoryId && !isHovered ? 0.45 : 1,
                        }}
                        onMouseEnter={() => setHoveredCategoryId(slice.id)}
                        onMouseLeave={() => setHoveredCategoryId(null)}
                      />
                    );
                  })}
                </svg>
              )}

              {/* Center Donut Label */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <AnimatePresence mode="wait">
                  {activeCategory ? (
                    <motion.div
                      key={activeCategory.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="px-2"
                    >
                      <span className="text-xl font-extrabold text-slate-800 dark:text-white font-mono">
                        {activeCategory.percentage}%
                      </span>
                      <p className="max-w-[90px] truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {activeCategory.name}
                      </p>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {activeCategory.count} tkts
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="total"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                    >
                      <span className="text-2xl font-black text-slate-900 tracking-tight dark:text-white font-mono">
                        {totalCategoryCount}
                      </span>
                      <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                        TỔNG TICKET
                      </p>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        100% tỷ lệ
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Legend List */}
            <div className="space-y-2.5 md:col-span-6">
              {categories.map((cat) => {
                const isHovered = hoveredCategoryId === cat.id;
                return (
                  <div
                    key={cat.id}
                    onMouseEnter={() => setHoveredCategoryId(cat.id)}
                    onMouseLeave={() => setHoveredCategoryId(null)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-xs transition-all ${isHovered
                      ? 'border-slate-300 bg-slate-100/90 shadow-2xs dark:border-slate-700 dark:bg-slate-800'
                      : 'border-slate-100 bg-slate-50/50 hover:bg-slate-100/60 dark:border-slate-800/80 dark:bg-slate-800/40 dark:hover:bg-slate-800/70'
                      }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span
                        className="h-3 w-3 rounded-md shrink-0 shadow-2xs"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span
                        className={`font-semibold truncate transition-colors ${isHovered
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-700 dark:text-slate-200'
                          }`}
                      >
                        {cat.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="rounded-lg border border-slate-200/80 bg-white px-2 py-0.5 text-xs font-bold text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 font-mono">
                        {cat.percentage}%
                      </span>
                      <span className="hidden w-12 text-right text-[11px] font-medium text-slate-400 sm:inline-block font-mono">
                        {cat.count} tkts
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* === BAR CHART: XU HƯỚNG XỬ LÝ HÀNG NGÀY === */}
        <div
          id="card-daily-trend"
          className="flex flex-col justify-between rounded-[20px] border border-slate-200/80 bg-white p-6 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900 lg:col-span-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100/80 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400">
                <BarChart3 className="h-4 w-4 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-xs font-bold tracking-wider text-slate-800 uppercase dark:text-slate-100">
                  XU HƯỚNG XỬ LÝ HÀNG NGÀY
                </h3>
                <p className="text-[11px] font-medium text-slate-400">Số lượng ticket tiếp nhận và đã xử lý</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 text-xs font-bold text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-sky-400" />
                  <span>Tiếp nhận</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-emerald-400" />
                  <span>Đã giải quyết</span>
                </div>
              </div>

              {/* Time range selector đồng bộ */}
              <div className="flex items-center rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-slate-700/80 dark:bg-slate-800/80">
                {(
                  [
                    { key: '7d', label: '7 ngày' },
                    { key: '30d', label: '30 ngày' },
                    { key: 'this_month', label: 'Tháng này' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTimeRangeChange(tab.key)}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${timeRange === tab.key
                      ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex-1">
            <div className="relative h-56 w-full">
              {/* Y-axis Ticks & Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pr-2">
                {yTicks.map((tick, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 text-right font-mono text-[10px] text-slate-400">
                      {tick}
                    </span>
                    <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                  </div>
                ))}
              </div>

              {/* Trend Bars */}
              <div className="absolute inset-y-0 left-8 right-0 flex items-end justify-between px-2 pt-4 pb-6">
                {dailyTrends.length === 0 ? (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-400 font-medium">
                    Chưa có dữ liệu xu hướng trong khoảng thời gian này
                  </div>
                ) : (
                  dailyTrends.map((item, index) => {
                    const receivedHeight = yMax > 0 ? (item.received / yMax) * 100 : 0;
                    const resolvedHeight = yMax > 0 ? (item.resolved / yMax) * 100 : 0;
                    const isHovered = hoveredTrendIndex === index;

                    return (
                      <div
                        key={`${item.shortDate}-${index}`}
                        className="group relative flex h-full flex-1 flex-col items-center justify-end px-1 sm:px-2"
                        onMouseEnter={() => setHoveredTrendIndex(index)}
                        onMouseLeave={() => setHoveredTrendIndex(null)}
                      >
                        {/* Hover Tooltip Card */}
                        {isHovered && (
                          <div className="absolute -top-14 z-20 whitespace-nowrap rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-md backdrop-blur-xs dark:border-slate-700 dark:bg-slate-800/95">
                            <div className="font-semibold text-slate-800 dark:text-white">
                              {item.shortDate}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                              <span className="text-sky-600 dark:text-sky-400 font-medium">
                                Nhận: <strong>{item.received}</strong>
                              </span>
                              <span className="text-slate-300 dark:text-slate-600">|</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                Giải quyết: <strong>{item.resolved}</strong>
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Dual Bar (Received vs Resolved) */}
                        <div className="flex h-full items-end gap-1 sm:gap-1.5">
                          <div className="flex h-full items-end">
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${receivedHeight}%` }}
                              transition={{ duration: 0.4, delay: index * 0.03 }}
                              className={`w-3 sm:w-4 rounded-t-sm transition-all ${isHovered
                                ? 'bg-sky-500 shadow-xs'
                                : 'bg-sky-400 hover:bg-sky-500'
                                }`}
                              style={{ minHeight: item.received > 0 ? '4px' : '0px' }}
                            />
                          </div>

                          <div className="flex h-full items-end">
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${resolvedHeight}%` }}
                              transition={{ duration: 0.4, delay: index * 0.03 }}
                              className={`w-3 sm:w-4 rounded-t-sm transition-all ${isHovered
                                ? 'bg-emerald-500 shadow-xs'
                                : 'bg-emerald-400 hover:bg-emerald-500'
                                }`}
                              style={{ minHeight: item.resolved > 0 ? '4px' : '0px' }}
                            />
                          </div>
                        </div>

                        {/* Date Label */}
                        <div className="absolute -bottom-5 text-center">
                          <span
                            className={`text-[10px] transition-colors ${isHovered
                              ? 'font-bold text-slate-800 dark:text-white'
                              : 'font-medium text-slate-400'
                              }`}
                          >
                            {item.shortDate}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};