// frontend/src/features/reports/ReportsExportPage.tsx
import React, { useState } from 'react';
import { FileSpreadsheet, Download, Calendar, FileText, Loader2, CheckCircle2, Award } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { InboxTicket, BotAutomationTask } from '../../types';
import { toast } from 'sonner';

export const ReportsExportPage: React.FC = () => {
  const [template, setTemplate] = useState<string>('dtt_kpi_monthly');
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // -------------------------------------------------------------
  // 1. TEMPLATE CHUẨN DTT: BÁO CÁO KPI HÀNG THÁNG
  // -------------------------------------------------------------
  const generateDTTMonthlyReport = async (tickets: InboxTicket[], tasks: BotAutomationTask[]) => {
    // Phân loại ticket theo nguồn
    const osTickets = tickets.filter(t => t.source === 'osticket');
    const gmailTickets = tickets.filter(t => t.source === 'gmail');
    const formTickets = tickets.filter(t => t.source === 'google_form');
    const bugTickets = tickets.filter(t => t.category === 'bug');

    // Tạo danh sách link OS Ticket có ghi chú hành động cụ thể
    const osTicketLinks = osTickets.map(t => {
      const summaryNote = t.ai_summary || t.subject || 'Xử lý yêu cầu';
      const link = `https://support.pythaverse.space/scp/tickets.php?id=${t.source_id || t.id}`;
      return `${link} (${summaryNote})`;
    }).join('\n');

    // Lấy tháng/năm báo cáo
    const monthStr = fromDate.slice(5, 7);
    const yearStr = fromDate.slice(0, 4);
    const dateRangeStr = `${fromDate.split('-').reverse().join('/')} đến ngày ${toDate.split('-').reverse().join('/')}`;

    // Xây dựng ma trận dữ liệu Excel (Row-by-Row)
    const wsData: any[][] = [
      // Row 1-2: Header Công ty & Quốc hiệu
      ['CÔNG TY CỔ PHẦN CÔNG NGHỆ DTT', '', '', '', '', '', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'],
      ['', '', '', '', '', '', 'Độc lập - Tự do - Hạnh phúc'],
      // Row 3-4: Tiêu đề
      ['', '', '', `BÁO CÁO KẾT QUẢ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI HÀNG THÁNG`, '', '', ''],
      ['', '', '', `(Áp dụng từ Tháng ${monthStr}/${yearStr})`, '', '', ''],
      // Row 5: Section I
      ['I. THÔNG TIN NHÂN SỰ', '', '', '', '', '', ''],
      ['Họ và tên: Nguyễn Mạnh Hùng', '', '', 'Chức danh: Tester / Lead QA & Automation Hub', '', '', ''],
      ['Phòng ban: QA & Support', '', '', '', '', '', ''],
      [`Thời gian đánh giá: từ ngày ${dateRangeStr}`, '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      // Row 10-12: Section II
      ['II. BẢNG BÁO CÁO KẾT QUẢ (Yêu cầu điền theo Công thức 3Đ: Định lượng - Đối tượng - Đích đến)', '', '', '', '', '', ''],
      ['(Nhân sự liệt kê và đánh giá tiến độ hoàn thành của tất cả các công việc được giao thực hiện trong tháng báo cáo. Yêu cầu có đủ dẫn chứng và ghi rõ giá trị tạo ra. Nếu không có link dẫn chứng, báo cáo của nhân sự sẽ không đủ cơ sở để được nghiệm thu và duyệt thưởng KPI)', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      // Row 13-14: Table Headers
      ['STT', 'Nội dung công việc', 'Thời gian thực hiện', 'Kết quả đầu ra', 'Tiến độ hoàn thành (%)', 'Giá trị tạo ra', 'Link dẫn chứng'],
      ['Công việc thực hiện trong kỳ', '', '', '', '', '', ''],
      // Row 15: Task 1 - OS Ticket
      [
        1,
        'Xử lý yêu cầu của người dùng thông qua Support Ticket',
        `${dateRangeStr}`,
        `Xử lý thành công toàn bộ ${osTickets.length} ticket yêu cầu; tạo mới, cấp quyền truy cập khóa học và tài khoản trường học; sửa lỗi hiển thị trên Workspace, Leanbot và PLearn.`,
        '100%',
        'Đảm bảo quá trình tiếp cận bài học và triển khai giảng dạy cho giáo viên và học sinh diễn ra liên tục, không bị gián đoạn; nâng cao độ tin cậy của hệ sinh thái Pythaverse.',
        osTicketLinks || 'https://support.pythaverse.space/scp/tickets.php'
      ],
      // Row 16: Task 2 - Automation Tool
      [
        2,
        'Vận hành và phát triển PTV Tasks Administrator Hub',
        `${dateRangeStr}`,
        'Xây dựng hệ thống tự động hóa tập trung kết hợp Gemini AI Triage phân loại ticket, đồng bộ đa kênh Gmail, OS Ticket, Google Form và điều phối Bot Worker.',
        '100%',
        'Tự động hóa 90% quy trình đọc, phân loại, bóc tách tệp và phê duyệt cấp tài khoản; tiết kiệm 80% thời gian xử lý thủ công của đội ngũ vận hành.',
        'https://ptv-tasks-administrator.vercel.app/'
      ],
      // Row 17: Task 3 - GitHub Issues & Testing
      [
        3,
        'Thông báo, kiểm thử lỗi các trang web trong hệ sinh thái Pythaverse và AIROC',
        `${dateRangeStr}`,
        `- Thông báo các lỗi phát sinh cho dev ngay lập tức\n- Check và xác nhận lỗi phát sinh\n- Cập nhật thông tin lỗi lên GitHub Issues (${bugTickets.length} issues)`,
        '100%',
        'Sửa các lỗi có trên Workspace/AIROC, đảm bảo trải nghiệm liền mạch của người dùng. Nâng cao chất lượng phần mềm hệ thống.',
        'https://github.com/PTV-TechHub/Pythaverse2026/issues'
      ],
      // Row 18: Task 4 - Gmail Requests
      [
        4,
        'Hỗ trợ người dùng xử lý thông tin, yêu cầu thông qua Email Workspace',
        `${dateRangeStr}`,
        `Tiếp nhận và xử lý ${gmailTickets.length} luồng email yêu cầu từ các đối tác, trường học; bóc tách tệp danh sách và cấp tài khoản chính xác.`,
        '100%',
        'Chuẩn hóa và làm sạch dữ liệu người dùng/nhà trường; đảm bảo người dùng nhận tài khoản và quyền truy cập đúng hạn.',
        'Gmail Google Workspace @dtt.vn'
      ],
      // Row 19: Task 5 - Google Form Feedbacks
      [
        5,
        'Hỗ trợ người dùng xử lý thông tin, yêu cầu thông qua Google Form Feedback',
        `${dateRangeStr}`,
        `Nhận ${formTickets.length} phản hồi/báo cáo từ biểu mẫu Google Form; tự động tóm tắt, tag email nhân sự phụ trách vào Google Doc và đồng bộ Sheet.`,
        '100%',
        'Duy trì kênh tương tác trực tiếp; phản hồi kịp thời và điều phối nhân sự xử lý sự cố nhanh chóng.',
        '[PTV TASKFORCE]_Master Feedback Tracking'
      ],
      ['', '', '', '', '', '', ''],
      // Section III: KPIs
      ['III. CHỈ SỐ ĐO LƯỜNG HIỆU QUẢ (KPIs) VÀ ĐỀ XUẤT GIẢI PHÁP', '', '', '', '', '', ''],
      ['1. Chỉ số đo lường hiệu quả (KPIs) đạt được trong tháng:', '', '', '', '', '', ''],
      [`- Chỉ số 1: Thời gian xử lý yêu cầu qua Email/Ticket: Xử lý trong ngày hoặc dưới 1h nếu cấp thiết.`, '', '', '', '', '', ''],
      [`- Chỉ số 2: Tỷ lệ hoàn thành xử lý đúng hạn: 100% (${tickets.length}/${tickets.length} yêu cầu).`, '', '', '', '', '', ''],
      [`- Chỉ số 3: Số lượng bugs đã phát hiện & gửi xử lý: ${bugTickets.length} issues.`, '', '', '', '', '', ''],
      ['2. Đề xuất giải pháp:', '', '', '', '', '', ''],
      ['Tối ưu hóa hơn nữa các worker Playwright tự động hóa Order/Contract trên Workspace để giảm tối đa thao tác thủ công.', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      // Section IV: Signatures
      ['IV. PHẦN ĐÁNH GIÁ CỦA QUẢN LÝ VÀ PHÊ DUYỆT CỦA BAN GIÁM ĐỐC', '', '', '', '', '', ''],
      ['NGƯỜI LẬP BÁO CÁO', '', '', 'QUẢN LÝ TRỰC TIẾP', '', '', 'GIÁM ĐỐC PHÊ DUYỆT'],
      ['(Ký, ghi rõ họ tên)', '', '', '(Ký duyệt mức KPI và họ tên)', '', '', '(Ký duyệt mức KPI và họ tên)'],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['Hùng', '', '', '', '', '', ''],
      ['Nguyễn Mạnh Hùng', '', '', '', '', '', '']
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Cấu hình độ rộng các cột (Col Widths)
    ws['!cols'] = [
      { wch: 6 },   // A: STT
      { wch: 32 },  // B: Nội dung công việc
      { wch: 22 },  // C: Thời gian
      { wch: 45 },  // D: Kết quả đầu ra
      { wch: 15 },  // E: Tiến độ %
      { wch: 40 },  // F: Giá trị tạo ra
      { wch: 55 },  // G: Link dẫn chứng
    ];

    // Cấu hình Merged Cells (Gộp ô giống file mẫu)
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, // CÔNG TY CỔ PHẦN CÔNG NGHỆ DTT
      { s: { r: 0, c: 6 }, e: { r: 0, c: 6 } },
      { s: { r: 2, c: 3 }, e: { r: 2, c: 5 } }, // Tiêu đề BÁO CÁO KẾT QUẢ...
      { s: { r: 3, c: 3 }, e: { r: 3, c: 5 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: 6 } }, // Section I
      { s: { r: 9, c: 0 }, e: { r: 9, c: 6 } }, // Section II
      { s: { r: 10, c: 0 }, e: { r: 10, c: 6 } },
      { s: { r: 21, c: 0 }, e: { r: 21, c: 6 } }, // Section III
      { s: { r: 29, c: 0 }, e: { r: 29, c: 6 } }, // Section IV
      { s: { r: 30, c: 0 }, e: { r: 30, c: 2 } }, // Chữ ký Người lập
      { s: { r: 30, c: 3 }, e: { r: 30, c: 4 } }, // Chữ ký Quản lý
      { s: { r: 30, c: 6 }, e: { r: 30, c: 6 } }, // Chữ ký Giám đốc
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `BC_KPI_T${monthStr}_${yearStr}`);

    const fileName = `BCCV_NGUYEN_MANH_HUNG_KPI_T${monthStr}_${yearStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Đã xuất báo cáo KPI DTT thành công: [${fileName}]`);
  };

  // -------------------------------------------------------------
  // 2. TEMPLATE DỮ LIỆU THÔ: CHI TIẾT TICKET & BOT AUDIT
  // -------------------------------------------------------------
  const generateRawTicketsReport = (tickets: InboxTicket[]) => {
    const rawData = tickets.map((t, idx) => ({
      'STT': idx + 1,
      'ID Ticket': t.id,
      'Nguồn': t.source,
      'Source ID': t.source_id || '',
      'Người gửi': t.sender_email,
      'Tên người gửi': t.submitter_name || '',
      'Chủ đề': t.subject || '',
      'Tóm tắt AI': t.ai_summary || '',
      'Danh mục': t.category || '',
      'Ưu tiên': t.priority || 'normal',
      'Trạng thái': t.status,
      'Thời gian tạo': t.created_at?.slice(0, 19).replace('T', ' '),
      'Google Doc Link': t.doc_url || '',
      'Quốc gia': t.country || '',
      'Người phụ trách': t.assigned_name || t.assigned_email || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rawData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets_Raw_Data');

    const fileName = `Pythaverse_Tickets_Audit_${fromDate}_to_${toDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Đã xuất danh sách ticket: [${fileName}]`);
  };

  const generateBotAuditReport = (tasks: BotAutomationTask[]) => {
    const rawData = tasks.map((t, idx) => ({
      'STT': idx + 1,
      'Task ID': t.id,
      'Ticket ID': t.ticket_id,
      'Loại Bot': t.bot_type,
      'Trạng thái Duyệt': t.approval_status,
      'Trạng thái Chạy': t.execution_status,
      'Payload Thực thi': JSON.stringify(t.payload_data || {}),
      'Thời gian Tạo': t.created_at?.slice(0, 19).replace('T', ' '),
      'Thời gian Chạy': t.executed_at?.slice(0, 19).replace('T', ' ') || '',
      'Logs Thực thi': t.execution_logs || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rawData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bot_Audit_Logs');

    const fileName = `Pythaverse_Bot_Execution_Audit_${fromDate}_to_${toDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Đã xuất nhật ký chạy Bot: [${fileName}]`);
  };

  // -------------------------------------------------------------
  // 3. HÀM ĐIỀU PHỐI XUẤT FILE TỔNG HỢP
  // -------------------------------------------------------------
  const handleExportXlsx = async () => {
    setIsExporting(true);
    try {
      const fromISO = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
      const toISO = new Date(`${toDate}T23:59:59.999Z`).toISOString();

      // Truy vấn Supabase theo khoảng ngày thực tế
      const [ticketsRes, tasksRes] = await Promise.all([
        supabase
          .table('inbox_tickets')
          .select('*')
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('created_at', { ascending: false }),
        supabase
          .table('bot_automation_tasks')
          .select('*')
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('created_at', { ascending: false })
      ]);

      if (ticketsRes.error) throw ticketsRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const tickets: InboxTicket[] = (ticketsRes.data as any) || [];
      const tasks: BotAutomationTask[] = (tasksRes.data as any) || [];

      if (template === 'dtt_kpi_monthly') {
        await generateDTTMonthlyReport(tickets, tasks);
      } else if (template === 'raw_tickets') {
        generateRawTicketsReport(tickets);
      } else if (template === 'bot_audit') {
        generateBotAuditReport(tasks);
      }
    } catch (err) {
      console.error('Lỗi khi xuất file Excel:', err);
      toast.error('Lỗi xuất báo cáo: ' + (err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5 tracking-tight">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <span>Analytics & Custom XLSX Exporter</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Xuất dữ liệu thực tế từ Supabase ra file Excel (.xlsx) chuẩn biểu mẫu báo cáo KPI của Công ty DTT & Pythaverse.
        </p>
      </div>

      {/* Exporter Controls Box */}
      <div className="bg-white dark:bg-slate-800 p-6 sm:p-7 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-6 shadow-xs">
        {/* Template Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <span>Chọn Biểu Mẫu Báo Cáo Cần Xuất</span>
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-violet-500 transition cursor-pointer font-medium"
          >
            <option value="dtt_kpi_monthly">
              🏆 [Chính thức] Báo Cáo Kết Quả Công Việc & Đánh Giá KPI Hàng Tháng (Chuẩn DTT)
            </option>
            <option value="raw_tickets">
              📋 Báo Cáo Tổng Hợp Chi Tiết Toàn Bộ Inbox Tickets (Data Thô & AI Triage)
            </option>
            <option value="bot_audit">
              🤖 Báo Cáo Nhật Ký Thực Thi Bot Worker & Audit Trail
            </option>
          </select>
        </div>

        {/* Date Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Từ Ngày</span>
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-violet-500 transition"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Đến Ngày</span>
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-violet-500 transition"
            />
          </div>
        </div>

        {/* Feature Highlights */}
        {template === 'dtt_kpi_monthly' && (
          <div className="p-4 bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/80 dark:border-violet-800/40 rounded-xl text-xs space-y-2 text-violet-900 dark:text-violet-300">
            <div className="flex items-center gap-2 font-semibold text-violet-700 dark:text-violet-400">
              <Award className="w-4 h-4" />
              <span>Điểm nổi bật của Biểu Mẫu KPI DTT tự động:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-400 pl-1">
              <li>Tự động tổng hợp danh sách link OS Ticket kèm tóm tắt hành động chi tiết vào cột G.</li>
              <li>Tự động tính toán số lượng Ticket, số User được cấp và tỷ lệ hoàn thành 3Đ.</li>
              <li>Đầy đủ khung Quốc hiệu, Tiêu đề, Thông tin nhân sự Nguyễn Mạnh Hùng và 3 chữ ký nghiệm thu.</li>
            </ul>
          </div>
        )}

        {/* Export Button */}
        <button
          type="button"
          disabled={isExporting}
          onClick={handleExportXlsx}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white text-xs font-bold rounded-xl transition shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang trích xuất dữ liệu từ Supabase & tạo file Excel...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Tải Xuất File Excel (.xlsx) Ngay</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};