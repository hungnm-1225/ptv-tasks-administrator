// frontend/src/features/github/GithubReporterPage.tsx
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Github,
  Sparkles,
  Send,
  Loader2,
  Users,
  Tag,
  AlertCircle,
  Layers,
  Eye,
  Edit3,
  Check,
  ExternalLink,
  Ticket as TicketIcon
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { GithubIssueResponse, InboxTicket } from '../../types';
import { toast } from 'sonner';

const AVAILABLE_ASSIGNEES = [
  { username: 'nguyenthetrung5-PTV', label: 'nguyenthetrung5-PTV (AI Coder)' },
  { username: 'thetrungdtt', label: 'thetrungdtt (AI Lead)' },
];

const AVAILABLE_LABELS = [
  { id: 'bug', name: 'bug' },
  { id: 'from-feedback', name: 'from-feedback' },
  { id: 'enhancement', name: 'enhancement' },
  { id: 'documentation', name: 'documentation' },
  { id: 'feedback-digest', name: 'feedback-digest' },
];

const IMPACTED_SYSTEMS = [
  'Workspace',
  'PLearn (LMS)',
  'PGit (git.pythaverse.space)',
  'Keycloak (Auth IDP)',
  'Leanbot / Hardware',
  'PContest',
  'Support Helpdesk',
];

export const GithubReporterPage: React.FC = () => {
  const location = useLocation();
  const incomingTicket = (location.state as { ticket?: InboxTicket })?.ticket;

  const [repo, setRepo] = useState<string>('PTV-TechHub/Pythaverse2026');
  const [title, setTitle] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(['nguyenthetrung5-PTV', 'thetrungdtt']);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(['bug']);
  const [priority, setPriority] = useState<string>('Urgent');
  const [system, setSystem] = useState<string>('Workspace');

  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [aiGenerating, setAiGenerating] = useState<boolean>(false);

  // Tự động nhận diện Ticket truyền từ Inbox sang
  useEffect(() => {
    if (incomingTicket) {
      const isFeedback = incomingTicket.source === 'google_form';
      if (isFeedback && !selectedLabels.includes('from-feedback')) {
        setSelectedLabels(prev => [...prev, 'from-feedback']);
      }

      const rawText = incomingTicket.ai_summary || incomingTicket.raw_content || incomingTicket.subject;
      generateTemplateFromText(rawText, incomingTicket.subject);
    }
  }, [incomingTicket]);

  const toggleAssignee = (username: string) => {
    setSelectedAssignees(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
  };

  const toggleLabel = (labelName: string) => {
    setSelectedLabels(prev =>
      prev.includes(labelName) ? prev.filter(l => l !== labelName) : [...prev, labelName]
    );
  };

  const generateTemplateFromText = (rawNote: string, subjectTitle?: string) => {
    const issueTitle = subjectTitle ? `### [BUG][${priority.toUpperCase()}] ${subjectTitle}` : `### [BUG][${priority.toUpperCase()}] ${rawNote.slice(0, 80)}`;
    const reporter = incomingTicket ? `${incomingTicket.submitter_name || incomingTicket.sender_email} (Qua Hùng QA)` : 'Hùng QA';
    const evidenceLink = incomingTicket?.doc_url || (incomingTicket ? `https://support.pythaverse.space/scp/tickets.php?id=${incomingTicket.source_id}` : 'Support Ticket / Google Form');

    const formattedTemplate = `### [BUG][${priority.toUpperCase()}] ${subjectTitle || rawNote.slice(0, 80)}

**📌 MÔ TẢ TỔNG QUAN (METADATA)**
- **Người báo cáo (Reported By):** ${reporter}
- **Mức độ ưu tiên (Priority/Severity):** [${priority}]
- **Vai trò bị ảnh hưởng (Affected Roles):** [Admin / Partner / School / Teacher / Student]
- **Hệ thống liên quan (Impacted System):** [${system}]

---

**🌐 MÔI TRƯỜNG & ĐƯỜNG DẪN (ENVIRONMENT & ABSOLUTE URLS)**
- **URL bị lỗi (Absolute URL):** \`https://pythaverse.space\`
- **So sánh Môi trường (QA vs Prod):**
  - **Môi trường QA (\`qa.pythaverse.space\`):** [Bị lỗi]
  - **Môi trường Production (\`pythaverse.space\`):** [Bị lỗi]

---

**📝 ĐIỀU KIỆN TIÊN QUYẾT & DỮ LIỆU TEST (PREREQUISITES & TEST DATA)**
- **Tài khoản test (Credentials):** \`hung.nguyenmanh@dtt.vn\`
- **Định danh thực thể:** School_ID, Course_ID (nếu có)
- **Link báo cáo từ người dùng (User Report Link):** ${evidenceLink}

---

**👣 CÁC BƯỚC TÁI HIỆN (STEPS TO REPRODUCE)**
1. Đăng nhập vào hệ thống với vai trò tương ứng tại \`https://pythaverse.space\`.
2. Điều hướng đến phân hệ **${system}**.
3. Thực hiện thao tác gây lỗi.
4. Quan sát phản hồi của giao diện.

---

**⚖️ KẾT QUẢ THỰC TẾ VS MONG ĐỢI (EXPECTED VS ACTUAL)**
- **Kết quả mong đợi (Expected Results):** Hệ thống xử lý mượt mà, trả về dữ liệu chuẩn xác, giao diện hiển thị đúng thiết kế.
- **Kết quả thực tế (Actual Results):** ${rawNote}

---

**🔍 BẰNG CHỨNG KỸ THUẬT (TECHNICAL EVIDENCE & LOGS)**
- **HTTP Status Code:** 500 Internal Server Error / 400 Bad Request
- **API Endpoint:** \`https://pythaverse.space/api/v1/...\`
- **Payload gửi đi (Request Payload):** 
\`\`\`json
{
  "system": "${system}",
  "details": "${rawNote.slice(0, 100)}"
}
\`\`\``;

    setTitle(issueTitle);
    setBody(formattedTemplate);
  };

  const handleAiAutoFill = () => {
    const rawNote = title.replace(/^###\s*\[BUG\]\[\w+\]\s*/i, '').trim() ||
      "Người dùng báo lỗi không tạo được Order và License bị hết hạn trước ngày quy định trên Workspace";
    generateTemplateFromText(rawNote);
    toast.success('Đã tự động điền mẫu Bug Report chuẩn QA DTT!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error('Vui lòng nhập đầy đủ tiêu đề và nội dung Markdown!');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetchApi<GithubIssueResponse>('/github/create-issue', {
        method: 'POST',
        body: JSON.stringify({
          repo,
          title,
          body,
          assignees: selectedAssignees,
          labels: selectedLabels
        }),
      });

      if (res.status === 'success' && res.issue_url) {
        toast.success(
          <div className="space-y-1">
            <div className="font-bold">Đã tạo GitHub Issue #{res.issue_number} thành công!</div>
            <a href={res.issue_url} target="_blank" rel="noreferrer" className="text-violet-400 underline text-xs flex items-center gap-1">
              <span>Mở Issue trên GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        );
        setTitle('');
        setBody('');
      } else {
        toast.error(`Lỗi từ GitHub API: ${res.message || 'Không thể tạo issue'}`);
      }
    } catch (err) {
      toast.error('Lỗi gửi GitHub Issue: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5 tracking-tight">
          <Github className="w-5 h-5 text-slate-800 dark:text-slate-200" />
          <span>GitHub Issue Dispatcher</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Soạn thảo và điều phối Bug Report chuẩn QA DTT vào Private Repository <code className="text-violet-600 dark:text-violet-400 font-mono font-semibold">PTV-TechHub/Pythaverse2026</code>.
        </p>
      </div>

      {/* Banner thông báo nếu nhận từ Ticket */}
      {incomingTicket && (
        <div className="p-4 rounded-2xl bg-violet-50/80 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-violet-900 dark:text-violet-200">
            <TicketIcon className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
            <span>Đang tạo Bug Report từ Ticket: <strong className="font-semibold">{incomingTicket.subject}</strong> ({incomingTicket.source.toUpperCase()})</span>
          </div>
          <span className="px-2 py-0.5 bg-violet-200/80 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300 text-[10px] font-bold rounded-md uppercase">
            Auto Context Loaded
          </span>
        </div>
      )}

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-6 sm:p-7 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-5 shadow-xs">

        {/* Row 1: Target Repo & AI Generate Button */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Target Repository</label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500"
            />
          </div>

          <button
            type="button"
            onClick={handleAiAutoFill}
            disabled={aiGenerating}
            className="w-full py-2.5 px-4 bg-violet-50 hover:bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25 border border-violet-200/80 dark:border-violet-500/30 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
          >
            {aiGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                <span>AI Đang Soạn Mẫu...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span>AI Soạn Mẫu Chuẩn QA DTT</span>
              </>
            )}
          </button>
        </div>

        {/* Row 2: Metadata Config (Priority, System, Assignees) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/50">

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>Mức Độ Ưu Tiên</span>
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-800 dark:text-slate-200 outline-none"
            >
              <option value="Urgent">🔥 Urgent</option>
              <option value="High">🔴 High</option>
              <option value="Medium">🟡 Medium</option>
              <option value="Low">🟢 Low</option>
            </select>
          </div>

          {/* System */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-sky-500" />
              <span>Hệ Thống Bị Lỗi</span>
            </label>
            <select
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-800 dark:text-slate-200 outline-none"
            >
              {IMPACTED_SYSTEMS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Assignees Selection */}
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-violet-500" />
              <span>Gán Người Phụ Trách (Assignees)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_ASSIGNEES.map(a => {
                const isSelected = selectedAssignees.includes(a.username);
                return (
                  <button
                    key={a.username}
                    type="button"
                    onClick={() => toggleAssignee(a.username)}
                    className={`px-2 py-1 rounded-md text-[11px] font-mono flex items-center gap-1 border transition cursor-pointer ${isSelected
                      ? 'bg-violet-600 text-white border-violet-600 shadow-2xs font-semibold'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                    <span>{a.username}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Labels Selection */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-emerald-500" />
            <span>Nhãn (Labels)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_LABELS.map(l => {
              const isSelected = selectedLabels.includes(l.name);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLabel(l.name)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border flex items-center gap-1 transition cursor-pointer ${isSelected
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 shadow-2xs font-semibold'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                  <span>{l.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tiêu Đề Issue (Title)</label>
          <input
            type="text"
            placeholder="### [BUG][URGENT] Mô tả ngắn gọn sự cố..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500"
          />
        </div>

        {/* Body Editor with Tabs (Write / Preview) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Nội Dung Markdown (Issue Body)</label>
            <div className="flex bg-slate-100 dark:bg-slate-700/60 p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => setActiveTab('write')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${activeTab === 'write'
                  ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 font-semibold shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
                  }`}
              >
                <Edit3 className="w-3 h-3" />
                <span>Soạn Thảo</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${activeTab === 'preview'
                  ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 font-semibold shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
                  }`}
              >
                <Eye className="w-3 h-3" />
                <span>Xem Trước</span>
              </button>
            </div>
          </div>

          {activeTab === 'write' ? (
            <textarea
              rows={12}
              placeholder="Nội dung Markdown mô tả chi tiết các bước tái hiện, môi trường..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-xs font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500 leading-relaxed"
            />
          ) : (
            <div className="w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs text-slate-800 dark:text-slate-200 min-h-64 whitespace-pre-wrap font-sans leading-relaxed">
              {body ? body : <span className="text-slate-400 italic">Chưa có nội dung xem trước...</span>}
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang gửi Issue tới GitHub REST API...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Gửi Issue Tới GitHub REST API Ngay</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};