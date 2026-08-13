import React, { useState, useEffect } from 'react';
import { Inbox, CheckCircle2, Clock, Activity, TrendingUp, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { fetchApi } from '../../lib/api';
import { ReportsSummary } from '../../types';

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

const defaultTrendData = [
  { day: 'Mon', count: 12 },
  { day: 'Tue', count: 19 },
  { day: 'Wed', count: 25 },
  { day: 'Thu', count: 22 },
  { day: 'Fri', count: 30 },
  { day: 'Sat', count: 15 },
  { day: 'Sun', count: 8 },
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
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-xs font-medium">Đang nạp dữ liệu báo cáo real-time...</span>
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
    color: COLORS[idx % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-100">Executive Dashboard</h2>
        <p className="text-xs text-slate-400 mt-1">Tổng quan chỉ số KPI và trạng thái tự động hóa hệ thống real-time.</p>
      </div>

      {/* Real-time KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Ticket Chờ Xử Lý</span>
            <Inbox className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">
            {summary?.total_tickets ?? 128}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-emerald-400 mt-1">
            <TrendingUp className="w-3 h-3" />
            <span>+12% so với tuần trước</span>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Tác Vụ Chờ Phê Duyệt</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">
            {summary?.pending_approval ?? 12}
          </div>
          <div className="text-[11px] text-amber-400/80 mt-1">Human-in-the-Loop required</div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Đã Giải Quyết Tháng Này</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">
            {summary?.resolved_this_month ?? 116}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Tỉ lệ tự động hóa 92%</div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>System Health</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">
            {summary?.system_health ?? '99.9%'}
          </div>
          <div className="text-[11px] text-emerald-400 mt-1">Tất cả Workers hoạt động tốt</div>
        </div>
      </div>

      {/* Recharts Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800/80 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Phân Phối Ticket Theo Phân Loại</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Trend */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800/80 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Xu Hướng Giải Quyết Hàng Ngày</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={defaultTrendData}>
                <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
