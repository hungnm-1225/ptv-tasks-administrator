// frontend/src/features/reports/ReportsExportPage.tsx
import React, { useState } from 'react';
import { FileSpreadsheet, Download, Calendar, FileText, CheckCircle2, Loader2, Sparkles, User, Briefcase } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchApi } from '../../lib/api';
import { toast } from 'sonner';

export const ReportsExportPage: React.FC = () => {
  const [template, setTemplate] = useState<string>('kpi_dtt_standard');
  const [fromDate, setFromDate] = useState<string>('2026-08-01');
  const [toDate, setToDate] = useState<string>('2026-08-31');
  const [staffName, setStaffName] = useState<string>('Nguyễn Mạnh Hùng');
  const [staffRole, setStaffRole] = useState<string>('Tester & Automation Lead');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const handleExportXlsx = async () => {
    setIsExporting(true);
    try {
      // 1. Gọi Backend lấy dữ liệu đã được bóc tách và tạo link
      const data = await fetchApi<any>(`/reports/kpi-export-data?from_date=${fromDate}&to_date=${toDate}`);

      const workbook = XLSX.utils.book_new();

      if (template === 'kpi_dtt_standard') {
        // =========================================================================
        // TEMPLATE 1: BÁO CÁO KẾT QUẢ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI HÀNG THÁNG (CHUẨN DTT)
        // =========================================================================
        const fromArr = fromDate.split('-');
        const toArr = toDate.split('-');
        const dateRangeStr = `từ ngày ${fromArr[2]}/${fromArr[1]}/${fromArr[0]} đến ngày ${toArr[2]}/${toArr[1]}/${toArr[0]}`;
        const monthYearStr = `Tháng ${fromArr[1]}/${fromArr[0]}`;

        // Cấu trúc ma trận mảng 2 chiều theo đúng vị trí ô Excel
        const wsData: any[][] = [
          ['CÔNG TY CỔ PHẦN CÔNG NGHỆ DTT', '', '', '', '', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', ''],
          ['', '', '', '', '', 'Độc lập - Tự do - Hạnh phúc', ''],
          ['', '', '', '', '', '', ''],
          ['', '', 'BÁO CÁO KẾT QUẢ CÔNG VIỆC VÀ ĐÁNH GIÁ KPI HÀNG THÁNG', '', '', '', ''],
          ['', '', `(Áp dụng cho ${monthYearStr})`, '', '', '', ''],
          ['', '', '', '', '', '', ''],
          ['I. THÔNG TIN NHÂN SỰ', '', '', '', '', '', ''],
          [`Họ và tên: ${staffName}`, `Chức danh: ${staffRole}`, '', 'Phòng ban: QA & Support', '', `Thời gian đánh giá: ${dateRangeStr}`, ''],
          ['', '', '', '', '', '', ''],
          ['II. BẢNG BÁO CÁO KẾT QUẢ (Yêu cầu điền theo Công thức 3Đ: Định lượng - Đối tượng - Đích đến)', '', '', '', '', '', ''],
          ['(Nhân sự liệt kê và đánh giá tiến độ hoàn thành của tất cả các công việc được giao thực hiện trong tháng báo cáo. Yêu cầu có đủ dẫn chứng và ghi rõ giá trị tạo ra.)', '', '', '', '', '', ''],
          ['STT', 'Nội dung công việc', 'Thời gian thực hiện', 'Kết quả đầu ra', 'Tiến độ hoàn thành (%)', 'Giá trị tạo ra', 'Link dẫn chứng'],

          // Mục 1: Support Ticket
          [
            '1',
            'Xử lý yêu cầu của người dùng thông qua Support Ticket',
            `${fromArr[2]}/${fromArr[1]}-${toArr[2]}/${toArr[1]}/${fromArr[0]}`,
            `Xử lý thành công toàn bộ ${data.total_tickets} ticket tiếp nhận; tạo mới và cấp quyền truy cập khóa học cho học sinh, giáo viên các trường đối tác; sửa lỗi hiển thị trên Workspace, Leanbot và PLearn.`,
            `${data.on_time_rate}%`,
            'Đảm bảo quá trình tiếp cận bài học và triển khai giảng dạy cho học sinh, giáo viên diễn ra liên tục, không bị gián đoạn; nâng cao chất lượng dịch vụ hỗ trợ của hệ sinh thái Pythaverse.',
            data.osticket_evidence
          ],

          // Mục 2: Tooling & Automation Hub
          [
            '2',
            'Phát triển và vận hành Hub Tự Động Hóa & Quản trị trung tâm PTV Tasks Administrator',
            `${fromArr[2]}/${fromArr[1]}-${toArr[2]}/${toArr[1]}/${fromArr[0]}`,
            'Tự động hóa luồng tiếp nhận từ Gmail API, OS Ticket và Google Form; tích hợp Gemini AI Triage phân loại và tóm tắt tự động; cung cấp bộ điều phối Bot Worker thực thi tác vụ.',
            '100%',
            'Tiết kiệm 80% thời gian xử lý thủ công, đảm bảo tính chuẩn xác và bảo mật dữ liệu nhờ cổng kiểm soát Human-in-the-Loop.',
            'Website: https://ptv-tasks-administrator.vercel.app/'
          ],

          // Mục 3: GitHub Bug Dispatching
          [
            '3',
            'Thông báo, kiểm thử và đồng bộ lỗi hệ thống Pythaverse lên GitHub Issues',
            `${fromArr[2]}/${fromArr[1]}-${toArr[2]}/${toArr[1]}/${fromArr[0]}`,
            `- Phát hiện, xác minh và tạo ${data.total_bugs} Bug Issues lên Private Repo cho đội ngũ DEV xử lý.\n- Theo dõi tiến độ fix bug và nghiệm thu kết quả.`,
            '100%',
            'Kịp thời ngăn chặn các lỗi phát sinh ảnh hưởng đến người dùng cuối; tối ưu hóa luồng giao việc giữa QA và DEV.',
            'https://github.com/PTV-TechHub/Pythaverse2026/issues'
          ],

          // Mục 4: Xử lý qua Email Workspace
          [
            '4',
            'Hỗ trợ người dùng xử lý thông tin, yêu cầu thông qua Email Workspace @dtt.vn',
            `${fromArr[2]}/${fromArr[1]}-${toArr[2]}/${toArr[1]}/${fromArr[0]}`,
            'Tiếp nhận các email yêu cầu cấp tài khoản, đổi thông tin trường học; xử lý và phản hồi đúng quy chuẩn.',
            '100%',
            'Chuẩn hóa và làm sạch dữ liệu người dùng/nhà trường; đảm bảo phản hồi email hỗ trợ trong ngày.',
            data.gmail_evidence
          ],

          // Mục 5: Xử lý Google Form Feedback
          [
            '5',
            'Hỗ trợ người dùng xử lý thông tin, phản hồi thông qua Google Form Master Tracking',
            `${fromArr[2]}/${fromArr[1]}-${toArr[2]}/${toArr[1]}/${fromArr[0]}`,
            'Nhận báo cáo góp ý/lỗi từ Google Sheets, tự động gắn tag @mention nhân sự phụ trách vào Google Doc và cập nhật trạng thái To Implement.',
            '100%',
            'Duy trì kênh tương tác trực tiếp, giải quyết kịp thời các vướng mắc của giáo viên và học viên.',
            data.feedback_evidence
          ],

          // Mục 6: Keycloak & License Management
          [
            '6',
            'Quản trị định danh tài khoản qua Keycloak và phân bổ License Workspace',
            `${fromArr[2]}/${fromArr[1]}-${toArr[2]}/${toArr[1]}/${fromArr[0]}`,
            'Thực hiện reset mật khẩu, kích hoạt tài khoản SSO và hỗ trợ các trường tạo Order/Contract phân bổ License truy cập khóa học.',
            '100%',
            'Đảm bảo tính thông suốt của hệ thống đăng nhập tập trung (Single Sign-On) và quyền truy cập khóa học đúng thời hạn.',
            'https://eid.pythaverse.space/auth/admin/master/console/'
          ],

          // Mục 7: Tài liệu & Automation AI
          [
            '7',
            'Nghiên cứu áp dụng Generative AI & RPA tối ưu hóa năng suất vận hành',
            `${fromArr[2]}/${fromArr[1]}-${toArr[2]}/${toArr[1]}/${fromArr[0]}`,
            'Xây dựng Knowledge Base phân quyền tự động, tối ưu hóa các prompt Gemini AI hỗ trợ trích xuất thông tin nhanh chóng.',
            '100%',
            'Nâng cao năng lực tự động hóa của phòng ban QA & Support, chuẩn bị sẵn sàng cho quy mô mở rộng trường học.',
            'https://pythaverse.space'
          ],

          ['', '', '', '', '', '', ''],
          ['III. CHỈ SỐ ĐO LƯỜNG HIỆU QUẢ (KPIs) VÀ ĐỀ XUẤT GIẢI PHÁP', '', '', '', '', '', ''],
          ['1. Chỉ số đo lường hiệu quả (KPIs) đạt được trong tháng:', '', '', '', '', '', ''],
          [`- Chỉ số 1: Thời gian xử lý yêu cầu của người dùng qua Email/Ticket: Xử lý trong ngày hoặc trong 1h nếu yêu cầu cấp thiết`, '', '', '', '', '', ''],
          [`- Chỉ số 2: Tỷ lệ hoàn thành xử lý đúng hạn: ${data.on_time_rate}% (${data.completed_tickets}/${data.total_tickets} yêu cầu)`, '', '', '', '', '', ''],
          [`- Chỉ số 3: Số lượng bugs đã phát hiện và chuyển giao: ${data.total_bugs} bugs/đề xuất`, '', '', '', '', '', ''],
          ['2. Giải pháp cho các vấn đề còn tồn tại:', '', '', '', '', '', ''],
          ['Tăng cường tự động hóa với hệ thống PTV Tasks Administrator để rút ngắn thời gian xử lý các tác vụ cấp tài khoản và đồng bộ hóa báo cáo.', '', '', '', '', '', ''],
          ['', '', '', '', '', '', ''],
          ['IV. PHẦN ĐÁNH GIÁ CỦA QUẢN LÝ VÀ PHÊ DUYỆT CỦA BAN GIÁM ĐỐC', '', '', '', '', '', ''],
          ['Đánh giá Kết quả công việc chính (Trọng số 70%): ........... Điểm', '', '', '', '', '', ''],
          ['Đánh giá Tinh thần trách nhiệm & Phối hợp (Trọng số 30%): ........... Điểm', '', '', '', '', '', ''],
          ['Tổng tỷ lệ hoàn thành KPI trong tháng (%): ............................................', '', '', '', '', '', ''],
          ['', '', '', '', '', '', ''],
          ['NGƯỜI LẬP BÁO CÁO', '', '', 'QUẢN LÝ TRỰC TIẾP', '', 'GIÁM ĐỐC PHÊ DUYỆT', ''],
          ['(Ký, ghi rõ họ tên)', '', '', '(Ký duyệt mức KPI và họ tên)', '', '(Ký duyệt mức KPI và họ tên)', ''],
          ['', '', '', '', '', '', ''],
          ['', '', '', '', '', '', ''],
          [staffName, '', '', '', '', '', '']
        ];

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Thiết lập độ rộng cột (Column Widths)
        ws['!cols'] = [
          { wch: 6 },   // A: STT
          { wch: 32 },  // B: Nội dung công việc
          { wch: 18 },  // C: Thời gian thực hiện
          { wch: 45 },  // D: Kết quả đầu ra
          { wch: 16 },  // E: Tiến độ (%)
          { wch: 40 },  // F: Giá trị tạo ra
          { wch: 65 }   // G: Link dẫn chứng
        ];

        XLSX.utils.book_append_sheet(workbook, ws, `BC ${monthYearStr.replace('/', '.')}`);

      } else if (template === 'raw_tickets') {
        // TEMPLATE 2: DỮ LIỆU TICKET CHI TIẾT
        const rawRows = (data.tickets_raw || []).map((t: any, idx: number) => ({
          STT: idx + 1,
          ID: t.id?.slice(0, 8),
          Nguồn: t.source,
          'Mã Nguồn Gốc': t.source_id,
          'Người Gửi': t.sender_email,
          'Họ Tên': t.submitter_name || '',
          'Tiêu Đề': t.subject,
          'AI Tóm Tắt': t.ai_summary || '',
          'Danh Mục': t.category,
          'Trạng Thái': t.status,
          'Ngày Tạo': t.created_at?.slice(0, 19).replace('T', ' ')
        }));

        const ws = XLSX.utils.json_to_sheet(rawRows);
        XLSX.utils.book_append_sheet(workbook, ws, 'Tickets_Raw');

      } else if (template === 'bot_executions') {
        // TEMPLATE 3: NHẬT KÝ BOT WORKER
        const taskRows = (data.tasks_raw || []).map((task: any, idx: number) => ({
          STT: idx + 1,
          'Task ID': task.id?.slice(0, 8),
          'Bot Type': task.bot_type,
          'Phê Duyệt': task.approval_status,
          'Thực Thi': task.execution_status,
          'Nhật Ký Logs': task.execution_logs || '',
          'Thời Gian Tạo': task.created_at?.slice(0, 19).replace('T', ' ')
        }));

        const ws = XLSX.utils.json_to_sheet(taskRows);
        XLSX.utils.book_append_sheet(workbook, ws, 'Bot_Logs');
      }

      // 3. Tải file về máy tính
      const fileName = `BC_KPI_${staffName.replace(/\s+/g, '_')}_${fromDate}_${toDate}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast.success(`Đã xuất báo cáo thành công: [${fileName}]`);
    } catch (err) {
      console.error('Lỗi xuất báo cáo:', err);
      toast.error('Lỗi khi xuất file Excel: ' + (err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Analytics & Custom XLSX Exporter
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            Tự động tổng hợp dữ liệu tickets, AI triage summary và trích xuất báo cáo đánh giá KPI chuẩn định dạng DTT.
          </p>
        </div>
      </div>

      {/* Exporter Controls Card */}
      <div className="bg-paper p-6 sm:p-7 rounded-2xl border border-rule space-y-6">
        {/* Template Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-accent" />
            <span>Mẫu Báo Cáo Xuất Bản</span>
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full bg-paper-2 border border-rule rounded-xl p-3 text-xs text-primary outline-none focus:border-accent transition-colors cursor-pointer font-medium"
          >
            <option value="kpi_dtt_standard">⭐ Báo Cáo Đánh Giá KPI Hàng Tháng (Chuẩn DTT - Công Thức 3Đ)</option>
            <option value="raw_tickets">📋 Danh Sách Chi Tiết Toàn Bộ Unified Tickets (Kèm AI Summary)</option>
            <option value="bot_executions">🤖 Báo Cáo Lịch Sử Thực Thi & Audit Logs Của Bot Worker</option>
          </select>
        </div>

        {/* Staff Information (Dành cho mẫu KPI) */}
        {template === 'kpi_dtt_standard' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-paper-2 border border-rule">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-accent" />
                <span>Họ và Tên Nhân Sự</span>
              </label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="w-full bg-paper border border-rule rounded-lg p-2.5 text-xs text-primary outline-none focus:border-accent"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-accent" />
                <span>Chức Danh / Vị Trí</span>
              </label>
              <input
                type="text"
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                className="w-full bg-paper border border-rule rounded-lg p-2.5 text-xs text-primary outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {/* Date Range Picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              <span>Từ Ngày</span>
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-paper-2 border border-rule rounded-xl p-2.5 text-xs text-primary outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              <span>Đến Ngày</span>
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-paper-2 border border-rule rounded-xl p-2.5 text-xs text-primary outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Submit Export Button */}
        <button
          type="button"
          onClick={handleExportXlsx}
          disabled={isExporting}
          className="w-full py-3.5 bg-mint hover:bg-mint-soft text-accent-ink text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang tổng hợp dữ liệu & xuất file Excel...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Tải Xuất Báo Cáo Excel (.xlsx) Ngay</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};