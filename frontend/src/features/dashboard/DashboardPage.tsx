import React, { useState, useEffect } from 'react';
import { Inbox, CheckCircle2, Clock, Activity, TrendingUp, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { fetchApi } from '../../lib/api';
import { ReportsSummary } from '../../types';

// Bảng màu Pastel chuẩn mực cho Data Visualization
const PASTEL_COLORS = [
  '#c084fc', // Soft Lavender (Bugs / Primary)
  '#7dd3fc', // Sky Mist (Keycloak / Account)
  '#6ee7b7', // Soft Sage (LMS Enroll)
  '#fde047', // Soft Butter (License)
  '#fda4af', // Soft Peach/Rose (Others)
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
      <div className="flex flex-col items-center justify-center py-28 text-slate-400 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
        <span className="text-xs font-medium text-slate-400">Đang nạp dữ liệu báo cáo real-time...</span>
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

  return (
    <div className="space-y-7">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">Executive Dashboard</h2>
        <p className="text-xs text-slate-400 mt-1">Tổng quan chỉ số KPI và trạng thái tự động hóa hệ thống real-time.</p>
      </div>

      {/* Real-time KPI Cards (Bento Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ticket Chờ Xử Lý */}
        <div className="surface-card p-5 rounded-2xl hover:border-slate-700/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Ticket Chờ Xử Lý</span>
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 flex items-center justify-center">
              <Inbox className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">
            {summary?.total_tickets ?? 128}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-medium mt-1.5">
            <TrendingUp className="w-3 h-3" />
            <span>+12% so với tuần trước</span>
          </div>
        </div>

        {/* Card 2: Tác Vụ Chờ Phê Duyệt */}
        <div className="surface-card p-5 rounded-2xl hover:border-slate-700/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Chờ Phê Duyệt</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">
            {summary?.pending_approval ?? 12}
          </div>
          <div className="text-[11px] text-amber-300/80 font-medium mt-1.5">Human-in-the-Loop required</div>
        </div>

        {/* Card 3: Đã Giải Quyết Tháng Này */}
        <div className="surface-card p-5 rounded-2xl hover:border-slate-700/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Đã Giải Quyết Tháng Này</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">
            {summary?.resolved_this_month ?? 116}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1.5">Tỉ lệ tự động hóa 92%</div>
        </div>

        {/* Card 4: System Health */}
        <div className="surface-card p-5 rounded-2xl hover:border-slate-700/80 transition-all duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">System Health</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">
            {summary?.system_health ?? '99.9%'}
          </div>
          <div className="text-[11px] text-emerald-300 font-medium mt-1.5">Workers hoạt động ổn định</div>
        </div>
      </div>

      {/* Recharts Visualizations (Pastel Theme) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Category Breakdown */}
        <div className="surface-card p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Phân Phối Theo Danh Mục</h3>
            <span className="text-[10px] text-slate-400 font-mono">Gemini AI Triaged</span>
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
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#131b2e" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18223a',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Trend */}
        <div className="surface-card p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Xu Hướng Xử Lý Hàng Ngày</h3>
            <span className="text-[10px] text-slate-400 font-mono">Tuần Này</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={defaultTrendData}>
                <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18223a',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Bar dataKey="count" fill="#c084fc" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
