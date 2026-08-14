import React, { useState } from 'react';
import { FileSpreadsheet, Download, Calendar, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

export const ReportsExportPage: React.FC = () => {
  const [template, setTemplate] = useState<string>('monthly_summary');

  const handleExportXlsx = () => {
    try {
      // Client-side Excel export using SheetJS (xlsx)
      const sampleData = [
        { TicketID: '123e4567-e89b', Source: 'gmail', Category: 'account_keycloak', Status: 'completed', Date: '2026-08-10' },
        { TicketID: '987f6543-a21b', Source: 'google_form', Category: 'lms_enroll', Status: 'completed', Date: '2026-08-11' },
        { TicketID: '456a7890-c34d', Source: 'osticket', Category: 'bug', Status: 'approved', Date: '2026-08-12' },
      ];

      const worksheet = XLSX.utils.json_to_sheet(sampleData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Báo Cáo Task');
      
      const fileName = `Pythaverse_Report_${template}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Đã xuất báo cáo Excel thành công: [${fileName}]`);
    } catch (err) {
      toast.error('Lỗi khi xuất file Excel: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2.5 tracking-tight">
          <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
          <span>Analytics & Custom XLSX Exporter</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Xuất dữ liệu thống kê từ Supabase ra file Excel (.xlsx) chuẩn thiết kế với SheetJS phía client.
        </p>
      </div>

      {/* Exporter Controls */}
      <div className="surface-card p-6 sm:p-7 rounded-2xl border border-slate-800/80 space-y-5 shadow-sm">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-purple-300" />
            <span>Chọn Template Xuất Dữ Liệu</span>
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-purple-500/40 cursor-pointer"
          >
            <option value="monthly_summary" className="bg-[#131b2e]">Báo Cáo Tổng Hợp Ticket Tháng 8/2026</option>
            <option value="bot_executions" className="bg-[#131b2e]">Báo Cáo Nhật Ký Chạy Bot Worker</option>
            <option value="keycloak_users" className="bg-[#131b2e]">Danh Sách Cấp Tài Khoản Keycloak</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-300" />
              <span>Từ Ngày</span>
            </label>
            <input
              type="date"
              defaultValue="2026-08-01"
              className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-purple-500/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-300" />
              <span>Đến Ngày</span>
            </label>
            <input
              type="date"
              defaultValue="2026-08-14"
              className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-purple-500/40"
            />
          </div>
        </div>

        <button
          onClick={handleExportXlsx}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition shadow-sm flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          <span>Tải Xuất File Excel (.xlsx) Ngay</span>
        </button>
      </div>
    </div>
  );
};
