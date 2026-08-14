import React, { useState } from 'react';
import { Github, Sparkles, Send, Loader2 } from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { GithubIssueResponse } from '../../types';
import { toast } from 'sonner';

export const GithubReporterPage: React.FC = () => {
  const [repo, setRepo] = useState<string>('pythaverse/private-tasks-repo');
  const [title, setTitle] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleAiAutoFill = () => {
    setTitle('🐛 [BUG]: Lỗi đồng bộ dữ liệu điểm số giữa LMS và Supabase Engine');
    setBody(
      `### Mô Tả Sự Cố\nPhát hiện lỗi không ghi được record vào bảng \`inbox_tickets\` khi có webhook từ LMS.\n\n### Môi Trường\n- Backend: FastAPI 0.115\n- Database: Supabase PostgreSQL 16\n\n### Các Bước Tái Hiện\n1. Gửi request webhook thử nghiệm từ LMS.\n2. Kiểm tra log backend.`
    );
    toast.success("AI đã tự động soạn thảo mẫu báo cáo Bug chuẩn Markdown");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !body) {
      toast.error('Vui lòng nhập đầy đủ tiêu đề và nội dung Issue!');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetchApi<GithubIssueResponse>('/github/create-issue', {
        method: 'POST',
        body: JSON.stringify({ repo, title, body }),
      });
      toast.success(`Đã tạo GitHub Issue thành công! ${res.issue_url ? `(${res.issue_url})` : ''}`);
      setTitle('');
      setBody('');
    } catch (err) {
      toast.error('Lỗi gửi GitHub Issue: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5 tracking-tight">
          <Github className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          <span>GitHub Issue Dispatcher</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Soạn thảo và gửi GitHub Issue trực tiếp vào Private Repository bằng Fine-Grained PAT.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-6 sm:p-7 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Target Repository</label>
          <button
            type="button"
            onClick={handleAiAutoFill}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 border border-violet-200/80 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 hover:bg-violet-100 text-xs font-medium rounded-xl transition shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            <span>AI Auto-Fill Bug Report</span>
          </button>
        </div>

        <input
          type="text"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500/50"
        />

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Issue Title</label>
          <input
            type="text"
            placeholder="[BUG] / [FEATURE]: Mô tả ngắn gọn..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Issue Body (Markdown)</label>
          <textarea
            rows={8}
            placeholder="Nội dung Markdown mô tả chi tiết..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-900 dark:text-slate-100 outline-none focus:border-violet-500/50 leading-relaxed"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-semibold rounded-xl transition shadow-xs flex items-center justify-center gap-2"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Gửi Issue Tới GitHub REST API</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
