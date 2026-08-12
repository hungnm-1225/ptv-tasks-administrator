import React, { useState } from 'react';
import { FileSpreadsheet, Download, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

export const ReportsExportPage: React.FC = () => {
  const [template, setTemplate] = useState<string>('monthly_summary');

  const handleExportXlsx = () => {
    // Client-side Excel export using SheetJS (xlsx)
    const sampleData = [
      { TicketID: '123e4567-e89b', Source: 'gmail', Category: 'account_keycloak', Status: 'completed', Date: '2026-08-10' },
      { TicketID: '987f6543-a21b', Source: 'google_form', Category: 'lms_enroll', Status: 'completed', Date: '2026-08-11' },
      { TicketID: '456a7890-c34d', Source: 'osticket', Category: 'bug', Status: 'approved', Date: '2026-08-12' },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Báo Cáo Task');
    XLSX.writeFile(workbook, `Pythaverse_Report_${template}_20260812.xlsx`);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
          <span>Analytics & Custom XLSX Exporter</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Xuất dữ liệu thống kê từ Supabase ra file Excel (.xlsx) chuẩn thiết kế với SheetJS phía client.
        </p>
      </div>

      {/* Exporter Controls */}
      <div className="glass-panel p-6 rounded-xl border border-slate-800 space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-300">Chọn Template Xuất Dữ Liệu</label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
          >
            <option value="monthly_summary">Báo Cáo Tổng Hợp Ticket Tháng 8/2026</option>
            <option value="bot_executions">Báo Cáo Nhật Ký Chạy Bot Worker</option>
            <option value="keycloak_users">Danh Sách Cấp Tài Khoản Keycloak</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Từ Ngày</label>
            <input
              type="date"
              defaultValue="2026-08-01"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Đến Ngày</label>
            <input
              type="date"
              defaultValue="2026-08-12"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 outline-none"
            />
          </div>
        </div>

        <button
          onClick={handleExportXlsx}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          <span>Tải Xuất File Excel (.xlsx) Ngay</span>
        </button>
      </div>
    </div>
  );
};
