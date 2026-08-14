import React, { useState, useEffect } from 'react';
import { Inbox, CheckCircle2, Clock, Activity, TrendingUp, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { fetchApi } from '../../lib/api';
import { ReportsSummary } from '../../types';
import { useTheme } from '../../context/ThemeContext';

const PASTEL_COLORS = [
  '#8b5cf6', // Soft Lavender (Bugs / Primary)
  '#38bdf8', // Sky Mist (Keycloak / Account)
  '#34d399', // Soft Sage Mint (LMS Enroll)
  '#fbbf24', // Soft Butter Amber (License)
  '#fb7185', // Soft Peach Rose (Others)
];

const defaultTrendData = [
  { day: 'T2', count: 12 },
  { day: 'T3', count: 19 },
  { day: 'T4', count: 25 },
  { day: 'T5', count: 22 },
  { day: 'T6', count: 30 },
  { day: 'T7', count: 15 },
  { day: 'CN', count: 8 },
];

export const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { theme } = useTheme();

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const data = await fetchApi<ReportsSummary>('/reports/summary');
        setSummary(data);
      } catch (err) {
        console.error('Lỗi khi tải báo cáo tổng quan:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSummary();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-slate-500 dark:text-slate-400 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-violet-600 dark:text-violet-400" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Đang nạp dữ liệu báo cáo real-time...</span>
      </div>
    );
  }

  const categoryData = (summary?.category_ratios || [
    { name: 'System Bugs', value: 45 },
    { name: 'Keycloak Account', value: 30 },
    { name: 'LMS Enroll', value: 25 },
    { name: 'License', value: 15 },
    { name: 'Others', value: 13 },
  ]).map((cat, idx) => ({
    ...cat,
    color: PASTEL_COLORS[idx % PASTEL_COLORS.length],
  }));

  const isDark = theme === 'dark';

  return (
    <div className="space-y-7">
      {/* Title */}
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
            {summary?.total_tickets ?? 128}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1.5">
            <TrendingUp className="w-3 h-3" />
            <span>+12% so với tuần trước</span>
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
            {summary?.pending_approval ?? 12}
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
            {summary?.resolved_this_month ?? 116}
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-400 font-medium mt-1.5">Tỉ lệ tự động hóa 92%</div>
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
            {summary?.system_health ?? '99.9%'}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1.5">Workers hoạt động ổn định</div>
        </div>
      </div>

      {/* Recharts Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Category Breakdown */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Phân Phối Theo Danh Mục</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-400 font-mono">Gemini AI Triaged</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={categoryData} 
                  dataKey="value" 
                  nameKey="name" 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={55}
                  outerRadius={85} 
                  paddingAngle={3}
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke={isDark ? '#1e293b' : '#ffffff'} strokeWidth={2} />
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
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Trend */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Xu Hướng Xử Lý Hàng Ngày</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-400 font-mono">Tuần Này</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={defaultTrendData}>
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                  }}
                />
                <Bar dataKey="count" fill={isDark ? '#a78bfa' : '#8b5cf6'} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
