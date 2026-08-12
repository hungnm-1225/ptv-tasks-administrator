import React from 'react';
import { Inbox, CheckCircle2, Clock, Activity, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

const categoryData = [
  { name: 'Bugs', value: 45, color: '#ef4444' },
  { name: 'Keycloak', value: 30, color: '#3b82f6' },
  { name: 'LMS Enroll', value: 25, color: '#10b981' },
  { name: 'License', value: 15, color: '#f59e0b' },
  { name: 'Others', value: 13, color: '#8b5cf6' },
];

const trendData = [
  { day: 'Mon', count: 12 },
  { day: 'Tue', count: 19 },
  { day: 'Wed', count: 25 },
  { day: 'Thu', count: 22 },
  { day: 'Fri', count: 30 },
  { day: 'Sat', count: 15 },
  { day: 'Sun', count: 8 },
];

export const DashboardPage: React.FC = () => {
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
          <div className="text-2xl font-bold text-slate-100 mt-3">24</div>
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
          <div className="text-2xl font-bold text-slate-100 mt-3">8</div>
          <div className="text-[11px] text-amber-400/80 mt-1">Human-in-the-Loop required</div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Đã Giải Quyết Tháng Này</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">128</div>
          <div className="text-[11px] text-slate-400 mt-1">Tỉ lệ tự động hóa 92%</div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>System Health</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">99.9%</div>
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
              <BarChart data={trendData}>
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
