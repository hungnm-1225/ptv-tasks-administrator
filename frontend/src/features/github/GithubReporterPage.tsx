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
  Ticket as TicketIcon,
  Wrench
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
  const [qaNotes, setQaNotes] = useState<string>(''); // 🎯 Ghi chú khảo sát của QA
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(['nguyenthetrung5-PTV', 'thetrungdtt']);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(['bug']);
  const [priority, setPriority] = useState<string>('Urgent');
  const [system, setSystem] = useState<string>('Workspace');

  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [aiGenerating, setAiGenerating] = useState<boolean>(false);

  // Nhận diện Ticket truyền từ Inbox sang
  useEffect(() => {
    if (incomingTicket) {
      setTitle(`### [BUG][${priority.toUpperCase()}] ${incomingTicket.subject}`);

      // Đoán hệ thống dựa theo category
      if (incomingTicket.category === 'account_keycloak') setSystem('Keycloak (Auth IDP)');
      else if (incomingTicket.category === 'lms_enroll') setSystem('PLearn (LMS)');
      else if (incomingTicket.subject?.toLowerCase().includes('companion') || incomingTicket.subject?.toLowerCase().includes('leanbot')) {
        setSystem('Leanbot / Hardware');
      }

      if (incomingTicket.source === 'google_form' && !selectedLabels.includes('from-feedback')) {
        setSelectedLabels(prev => [...prev, 'from-feedback']);
      }
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

  // 🔥 GỌI API GEMINI VỚI ĐẦY ĐỦ DOMAIN KNOWLEDGE & QA NOTES
  const handleAiAutoFill = async () => {
    setAiGenerating(true);
    try {
      const payload = {
        ticket_id: incomingTicket?.source_id || '',
        subject: incomingTicket?.subject || title.replace(/^###\s*\[BUG\]\[\w+\]\s*/i, '').trim() || "Sự cố hệ thống",
        raw_content: incomingTicket?.raw_content || incomingTicket?.ai_summary || body || title,
        source: incomingTicket?.source || 'osticket',
        sender: incomingTicket?.sender_email || incomingTicket?.submitter_name || 'hung.nguyenmanh@dtt.vn',
        impacted_system: system,
        priority: priority,
        qa_notes: qaNotes // Gửi kèm ghi chú khảo sát của QA
      };

      const res = await fetchApi<{ title: string; body: string }>('/github/ai-generate-template', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res?.title) setTitle(res.title);
      if (res?.body) setBody(res.body);

      toast.success('Gemini AI đã phân tích kiến trúc & soạn thảo Bug Report chuẩn xác!');
    } catch (err) {
      console.error('Lỗi gọi AI:', err);
      toast.error('Lỗi kết nối Gemini AI: ' + (err as Error).message);
    } finally {
      setAiGenerating(false);
    }
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
        setQaNotes('');
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

        {/* Row 1: Target Repo */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Target Repository</label>
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500"
          />
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
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
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
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-800 dark:text-slate-200 outline-none cursor-pointer font-medium"
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
              <span>Người phụ trách:</span>
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
            <span>Nhãn phân loại:</span>
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

        {/* 🎯 Ô NHẬP GHI CHÚ KHẢO SÁT CỦA QA */}
        <div className="space-y-1.5 p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-amber-600" />
              <span>Ghi chú/Log</span>
            </label>
          </div>
          <input
            type="text"
            placeholder="VD: Đã test: Companion v2.60 lệch với server compiler / Moodle API trả về 403 Forbidden ở endpoint enrol_manual..."
            value={qaNotes}
            onChange={(e) => setQaNotes(e.target.value)}
            className="w-full bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg p-2.5 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-amber-500 placeholder-slate-400"
          />
        </div>

        {/* Nút AI Soạn Thảo */}
        <button
          type="button"
          onClick={handleAiAutoFill}
          disabled={aiGenerating}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
        >
          {aiGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Gemini Đang Kết Hợp Kiến Trúc Pythaverse & Ghi Chú QA...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-violet-200" />
              <span>AI Soạn Mẫu Chuẩn QA DTT (Theo Domain & Ghi Chú)</span>
            </>
          )}
        </button>

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
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Nội Dung Chi Tiết (Markdown)</label>
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
              rows={13}
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