// frontend/src/features/github/GithubReporterPage.tsx
import React, { useState, useEffect, useRef } from 'react';
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
  Wrench,
  Paperclip,
  Image as ImageIcon,
  FileCode,
  UploadCloud,
  X,
  Copy
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { GithubIssueResponse, InboxTicket } from '../../types';
import { toast } from 'sonner';

interface UploadedMediaItem {
  filename: string;
  url: string;
  isImage: boolean;
}

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

// 🔥 BỘ RENDER MARKDOWN CHUẨN GITHUB (GFM RENDERER TÍCH HỢP)
const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  if (!content.trim()) {
    return <div className="text-ink-2 italic text-xs py-8 text-center">Chưa có nội dung để xem trước...</div>;
  }

  // Parse inline styles: bold, inline code, links
  const renderInline = (text: string) => {
    // Regex bắt link [text](url)
    const parts = text.split(/(\[.*?\]\(.*?\)|\*\*.*?\*\*|`.*?`)/g);

    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-bold text-primary dark:text-ink">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={index} className="px-1.5 py-0.5 mx-0.5 rounded-md bg-paper-2 dark:bg-ink text-accent dark:text-accent font-mono text-[11px] border border-rule dark:border-ink">
            {part.slice(1, -1)}
          </code>
        );
      }
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        return (
          <a key={index} href={linkMatch[2]} target="_blank" rel="noreferrer" className="text-accent dark:text-accent underline hover:text-accent font-medium inline-flex items-center gap-0.5">
            <span>{linkMatch[1]}</span>
            <ExternalLink className="w-2.5 h-2.5 inline" />
          </a>
        );
      }
      return part;
    });
  };

  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  lines.forEach((line, idx) => {
    // Xử lý Code Block (``` ... ```)
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        renderedElements.push(
          <div key={`code-${idx}`} className="my-3 rounded-xl bg-ink text-ink p-3.5 font-mono text-xs overflow-x-auto border border-ink shadow-inner">
            <pre>{codeBlockContent.join('\n')}</pre>
          </div>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }

    // Xử lý Ảnh Markdown: ![alt](url) hoặc - ![alt](url)
    const imgMatch = line.trim().match(/^-?\s*!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      const altText = imgMatch[1] || 'Hình ảnh bằng chứng';
      const imgUrl = imgMatch[2];
      renderedElements.push(
        <div key={idx} className="my-3.5 space-y-1.5">
          <div className="p-1 bg-paper-2 dark:bg-ink border border-rule dark:border-ink rounded-2xl overflow-hidden shadow-xs inline-block max-w-full">
            <img
              src={imgUrl}
              alt={altText}
              className="max-h-96 max-w-full rounded-xl object-contain hover:scale-[1.01] transition-transform cursor-pointer"
              onClick={() => window.open(imgUrl, '_blank')}
            />
          </div>
          <div className="text-[11px] text-ink-2 flex items-center gap-1.5 font-mono">
            <ImageIcon className="w-3 h-3 text-mint" />
            <span>{altText}</span>
            <a href={imgUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              [Mở tab mới]
            </a>
          </div>
        </div>
      );
      return;
    }

    // Tiêu đề ###
    if (line.startsWith('### ')) {
      renderedElements.push(
        <h3 key={idx} className="text-base font-bold text-primary dark:text-ink mt-4 mb-2 pb-1 border-b border-rule dark:border-ink">
          {renderInline(line.replace('### ', ''))}
        </h3>
      );
      return;
    }

    // Tiêu đề ##
    if (line.startsWith('## ')) {
      renderedElements.push(
        <h2 key={idx} className="text-lg font-bold text-primary dark:text-ink mt-5 mb-2.5 pb-1 border-b border-rule dark:border-ink">
          {renderInline(line.replace('## ', ''))}
        </h2>
      );
      return;
    }

    // Đường kẻ ngang ---
    if (line.trim() === '---' || line.trim() === '***') {
      renderedElements.push(<hr key={idx} className="my-4 border-rule dark:border-ink" />);
      return;
    }

    // Blockquote >
    if (line.startsWith('> ')) {
      renderedElements.push(
        <blockquote key={idx} className="my-2 pl-3 py-1 border-l-4 border-accent bg-accent-soft/50 dark:bg-accent-soft/20 text-primary dark:text-ink rounded-r-lg text-xs italic">
          {renderInline(line.replace('> ', ''))}
        </blockquote>
      );
      return;
    }

    // Danh sách gạch đầu dòng -
    if (line.trim().startsWith('- ')) {
      renderedElements.push(
        <div key={idx} className="flex items-start gap-2 my-1 text-xs text-primary dark:text-ink">
          <span className="text-accent font-bold mt-0.5">•</span>
          <div className="flex-1 leading-relaxed">{renderInline(line.trim().replace('- ', ''))}</div>
        </div>
      );
      return;
    }

    // Danh sách số 1. 2.
    const numMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      renderedElements.push(
        <div key={idx} className="flex items-start gap-2 my-1 text-xs text-primary dark:text-ink">
          <span className="text-accent dark:text-accent font-bold font-mono text-[11px]">{numMatch[1]}.</span>
          <div className="flex-1 leading-relaxed">{renderInline(numMatch[2])}</div>
        </div>
      );
      return;
    }

    // Dòng trống
    if (!line.trim()) {
      renderedElements.push(<div key={idx} className="h-2" />);
      return;
    }

    // Đoạn văn thông thường
    renderedElements.push(
      <p key={idx} className="text-xs text-primary dark:text-ink leading-relaxed my-1">
        {renderInline(line)}
      </p>
    );
  });

  return <div className="space-y-0.5 font-sans">{renderedElements}</div>;
};

export const GithubReporterPage: React.FC = () => {
  const location = useLocation();
  const incomingTicket = (location.state as { ticket?: InboxTicket })?.ticket;

  const [repo, setRepo] = useState<string>('PTV-TechHub/Pythaverse2026');
  const [title, setTitle] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [qaNotes, setQaNotes] = useState<string>('');
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(['nguyenthetrung5-PTV', 'thetrungdtt']);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(['bug']);
  const [priority, setPriority] = useState<string>('Urgent');
  const [system, setSystem] = useState<string>('Workspace');

  // Media / Attachments State
  const [attachments, setAttachments] = useState<UploadedMediaItem[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [aiGenerating, setAiGenerating] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Nhận diện Ticket truyền từ Inbox sang & tự động trích xuất attachments sẵn có
  useEffect(() => {
    if (incomingTicket) {
      setTitle(`### [BUG][${priority.toUpperCase()}] ${incomingTicket.subject}`);

      // Gợi ý hệ thống theo category
      if (incomingTicket.category === 'account_keycloak') setSystem('Keycloak (Auth IDP)');
      else if (incomingTicket.category === 'lms_enroll') setSystem('PLearn (LMS)');
      else if (
        incomingTicket.subject?.toLowerCase().includes('companion') ||
        incomingTicket.subject?.toLowerCase().includes('leanbot')
      ) {
        setSystem('Leanbot / Hardware');
      }

      if (incomingTicket.source === 'google_form' && !selectedLabels.includes('from-feedback')) {
        setSelectedLabels((prev) => [...prev, 'from-feedback']);
      }

      // Trích xuất đính kèm có sẵn từ ticket
      const ticketAtts: any[] = incomingTicket.attachments || incomingTicket.metadata?.attachments || [];
      if (ticketAtts.length > 0) {
        const mapped: UploadedMediaItem[] = ticketAtts.map((att) => ({
          filename: att.filename || 'attachment',
          url: att.url,
          isImage: /\.(png|jpg|jpeg|gif|webp)$/i.test(att.filename || att.url)
        }));
        setAttachments(mapped);
      }
    }
  }, [incomingTicket]);

  const toggleAssignee = (username: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]
    );
  };

  const toggleLabel = (labelName: string) => {
    setSelectedLabels((prev) =>
      prev.includes(labelName) ? prev.filter((l) => l !== labelName) : [...prev, labelName]
    );
  };

  // 🔥 UPLOAD TRỰC TIẾP LÊN SUPABASE STORAGE
  const uploadFileToSupabase = async (file: File): Promise<UploadedMediaItem> => {
    const isImage = file.type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name);
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `github/${Date.now()}_${cleanName}`;

    const { error } = await supabase.storage
      .from('ticket-attachments')
      .upload(filePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: true
      });

    if (error) throw error;

    const { data } = supabase.storage.from('ticket-attachments').getPublicUrl(filePath);
    return {
      filename: file.name,
      url: data.publicUrl,
      isImage
    };
  };

  // 🔥 CHÈN CÚ PHÁP MARKDOWN VÀO VỊ TRÍ CON TRỎ TRONG TEXTAREA
  const insertMarkdownAtCursor = (markdownText: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setBody((prev) => (prev ? `${prev}\n\n${markdownText}` : markdownText));
      return;
    }

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const textBefore = body.substring(0, startPos);
    const textAfter = body.substring(endPos, body.length);

    const newBody = `${textBefore}${markdownText}${textAfter}`;
    setBody(newBody);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(startPos + markdownText.length, startPos + markdownText.length);
    }, 50);
  };

  // 🔥 BẮT SỰ KIỆN PASTE (CTRL + V) TỪ FASTSTONE CAPTURE / CLIPBOARD
  const handlePasteOnEditor = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardItems = e.clipboardData?.items;
    if (!clipboardItems) return;

    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        setUploadingMedia(true);
        const toastId = toast.loading('Đang upload ảnh chụp FastStone lên Cloud...');

        try {
          const uploaded = await uploadFileToSupabase(file);
          setAttachments((prev) => [...prev, uploaded]);

          const imageMarkdown = `\n![${uploaded.filename}](${uploaded.url})\n`;
          insertMarkdownAtCursor(imageMarkdown);

          toast.success('Đã chèn ảnh chụp màn hình vào Markdown!', { id: toastId });
        } catch (err) {
          console.error(err);
          toast.error('Lỗi upload ảnh clipboard: ' + (err as Error).message, { id: toastId });
        } finally {
          setUploadingMedia(false);
        }
        break;
      }
    }
  };

  // 🔥 CHỌN TỆP ĐÍNH KÈM THỦ CÔNG
  const handleManualFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingMedia(true);
    const toastId = toast.loading(`Đang tải lên ${files.length} tệp đính kèm...`);

    try {
      const newItems: UploadedMediaItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const uploaded = await uploadFileToSupabase(file);
        newItems.push(uploaded);

        if (uploaded.isImage) {
          insertMarkdownAtCursor(`\n![${uploaded.filename}](${uploaded.url})\n`);
        } else {
          insertMarkdownAtCursor(`\n- [📄 ${uploaded.filename}](${uploaded.url})\n`);
        }
      }

      setAttachments((prev) => [...prev, ...newItems]);
      toast.success(`Đã đính kèm thành công ${newItems.length} tệp!`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Lỗi upload tệp: ' + (err as Error).message, { id: toastId });
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== index));
    toast.info('Đã gỡ tệp khỏi danh sách quản lý.');
  };

  // 🔥 GỌI GEMINI AI TẠO TEMPLATE CHUẨN CLAUDE CODE
  const handleAiAutoFill = async () => {
    setAiGenerating(true);
    try {
      const payload = {
        ticket_id: incomingTicket?.source_id || '',
        subject: incomingTicket?.subject || title.replace(/^###\s*\[BUG\]\[\w+\]\s*/i, '').trim() || 'Sự cố hệ thống',
        raw_content: incomingTicket?.raw_content || incomingTicket?.ai_summary || body || title,
        source: incomingTicket?.source || 'osticket',
        sender: incomingTicket?.sender_email || incomingTicket?.submitter_name || 'hung.nguyenmanh@dtt.vn',
        impacted_system: system,
        priority: priority,
        qa_notes: qaNotes,
        attachments: attachments.map((a) => ({ filename: a.filename, url: a.url }))
      };

      const res = await fetchApi<{ title: string; body: string }>('/github/ai-generate-template', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res?.title) setTitle(res.title);
      if (res?.body) setBody(res.body);

      toast.success('Gemini đã soạn Bug Report chuẩn dữ liệu thực tế cho Claude Code!');
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
          labels: selectedLabels,
          ticket_id: incomingTicket?.id
        })
      });

      if (res.status === 'success' && res.issue_url) {
        toast.success(
          <div className="space-y-1">
            <div className="font-bold">Đã tạo GitHub Issue #{res.issue_number} thành công!</div>
            <a
              href={res.issue_url}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline text-xs flex items-center gap-1"
            >
              <span>Mở Issue trên GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        );
        setTitle('');
        setBody('');
        setQaNotes('');
        setAttachments([]);
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
    <div className="space-y-6 w-full pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            GitHub Issue Dispatcher
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            Soạn thảo và điều phối Bug Report chuẩn QA DTT vào Private Repository{' '}
            <code className="text-accent dark:text-accent-2 font-mono font-semibold">
              PTV-TechHub/Pythaverse2026
            </code>
            .
          </p>
        </div>
      </div>

      {/* Banner thông báo nếu nhận từ Ticket */}
      {incomingTicket && (
        <div className="p-4 rounded-2xl bg-accent-soft/80 dark:bg-accent-soft/30 border border-rule dark:border-ink/50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 text-xs text-accent dark:text-accent">
            <TicketIcon className="w-4 h-4 text-accent dark:text-accent shrink-0" />
            <span>
              Đang tạo Bug Report từ Ticket: <strong className="font-semibold">{incomingTicket.subject}</strong> (
              {incomingTicket.source.toUpperCase()})
            </span>
          </div>
          <span className="px-2 py-0.5 bg-accent-soft/80 dark:bg-accent-soft/20 text-accent dark:text-accent text-[10px] font-bold rounded-md uppercase">
            Auto Context & Media Loaded
          </span>
        </div>
      )}

      {/* Form Container */}
      <form
        onSubmit={handleSubmit}
        className="bg-paper dark:bg-ink p-6 sm:p-7 rounded-2xl border border-rule dark:border-ink/60 space-y-5 shadow-xs"
      >
        {/* Row 1: Target Repo */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-primary dark:text-ink">Target Repository</label>
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="w-full bg-paper-2 dark:bg-ink border border-rule dark:border-ink rounded-xl p-2.5 text-xs font-mono text-primary dark:text-ink outline-none focus:border-accent"
          />
        </div>

        {/* Row 2: Metadata Config (Priority, System, Assignees) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-paper-2/80 dark:bg-ink/60 border border-rule/60 dark:border-ink/50">
          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-ink dark:text-ink-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-rose" />
              <span>Mức Độ Ưu Tiên</span>
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-paper dark:bg-ink border border-rule dark:border-ink rounded-lg p-2 text-xs text-primary dark:text-ink outline-none cursor-pointer"
            >
              <option value="Urgent">🔥 Urgent</option>
              <option value="High">🔴 High</option>
              <option value="Medium">🟡 Medium</option>
              <option value="Low">🟢 Low</option>
            </select>
          </div>

          {/* System */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-ink dark:text-ink-2 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-accent" />
              <span>Hệ Thống Bị Lỗi</span>
            </label>
            <select
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              className="w-full bg-paper dark:bg-ink border border-rule dark:border-ink rounded-lg p-2 text-xs text-primary dark:text-ink outline-none cursor-pointer font-medium"
            >
              {IMPACTED_SYSTEMS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Assignees Selection */}
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-[11px] font-semibold text-ink dark:text-ink-2 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-accent" />
              <span>Người phụ trách:</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_ASSIGNEES.map((a) => {
                const isSelected = selectedAssignees.includes(a.username);
                return (
                  <button
                    key={a.username}
                    type="button"
                    onClick={() => toggleAssignee(a.username)}
                    className={`px-2 py-1 rounded-md text-[11px] font-mono flex items-center gap-1 border transition cursor-pointer ${isSelected
                      ? 'bg-primary text-accent-ink border-primary shadow-2xs font-semibold'
                      : 'bg-paper dark:bg-ink text-ink dark:text-ink border-rule dark:border-ink'
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
          <label className="text-[11px] font-semibold text-ink dark:text-ink-2 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-mint" />
            <span>Nhãn phân loại:</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_LABELS.map((l) => {
              const isSelected = selectedLabels.includes(l.name);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleLabel(l.name)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium border flex items-center gap-1 transition cursor-pointer ${isSelected
                    ? 'bg-ink text-accent-ink dark:bg-paper dark:text-primary border-ink shadow-2xs font-semibold'
                    : 'bg-paper dark:bg-ink text-ink dark:text-ink border-rule dark:border-ink'
                    }`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                  <span>{l.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 🎯 Ô NHẬP GHI CHÚ KHẢO SÁT & TELEMETRY CỦA QA */}
        <div className="space-y-1.5 p-4 rounded-xl bg-amber-soft/60 dark:bg-amber-soft/20 border border-amber-soft/70 dark:border-amber-soft/40">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-amber dark:text-amber flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-amber" />
              <span>Ghi chú Telemetry / Error Log Thực Tế:</span>
            </label>
            <span className="text-[10px] text-amber dark:text-amber">
              Cung cấp mã lỗi, HTTP status, endpoint để Claude Code đọc
            </span>
          </div>
          <input
            type="text"
            placeholder="VD: Moodle API trả về 403 Forbidden ở endpoint enrol_manual_enrol_users / Payload request: {user_id: 123}..."
            value={qaNotes}
            onChange={(e) => setQaNotes(e.target.value)}
            className="w-full bg-paper dark:bg-ink border border-amber dark:border-amber rounded-lg p-2.5 text-xs text-primary dark:text-ink outline-none focus:border-amber placeholder-ink-2"
          />
        </div>

        {/* 📎 KHU VỰC QUẢN LÝ TỆP ĐÍNH KÈM & HÌNH ẢNH */}
        <div className="space-y-2 p-4 rounded-xl bg-paper-2 dark:bg-ink/60 border border-rule dark:border-ink">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary dark:text-ink">
              <Paperclip className="w-4 h-4 text-accent" />
              <span>Tệp Đính Kèm & Ảnh Lỗi ({attachments.length}):</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.log,.txt,.json,.md,.pdf"
                onChange={handleManualFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingMedia}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-soft hover:bg-accent-soft text-accent dark:bg-accent-soft/60 dark:text-accent border border-rule dark:border-ink rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
              >
                {uploadingMedia ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                <span>Đính Kèm Tệp / Ảnh</span>
              </button>
            </div>
          </div>

          <p className="text-[11px] text-ink-2 dark:text-ink-2">
            💡 <strong>Mẹo hay:</strong> Bạn có thể chụp ảnh màn hình bằng FastStone rồi bấm <strong>Ctrl + V</strong> trực tiếp vào ô soạn thảo Markdown bên dưới để chèn ảnh tự động!
          </p>

          {/* Danh sách tệp đã đính kèm */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-rule/60 dark:border-ink/50">
              {attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-paper dark:bg-ink border border-rule dark:border-ink rounded-lg text-xs shadow-2xs group"
                >
                  {file.isImage ? (
                    <ImageIcon className="w-3.5 h-3.5 text-mint" />
                  ) : (
                    <FileCode className="w-3.5 h-3.5 text-accent" />
                  )}
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary dark:text-ink hover:text-accent truncate max-w-[180px]"
                  >
                    {file.filename}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(idx)}
                    className="text-ink-2 hover:text-rose transition p-0.5 rounded cursor-pointer"
                    title="Xóa tệp này"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Nút AI Soạn Thảo */}
        <button
          type="button"
          onClick={handleAiAutoFill}
          disabled={aiGenerating}
          className="w-full py-3 bg-primary hover:bg-primary active:bg-primary text-accent-ink text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
        >
          {aiGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Gemini Đang Tổng Hợp Telemetry Logs & Tạo Bug Template Cho Claude Code...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-accent-ink" />
              <span>AI Soạn Bug Report Chuẩn Telemetry (Dành Riêng Cho Claude Code)</span>
            </>
          )}
        </button>

        {/* Title Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-primary dark:text-ink">Tiêu Đề Issue (Title)</label>
          <input
            type="text"
            placeholder="### [BUG][URGENT] Mô tả ngắn gọn sự cố..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-paper-2 dark:bg-ink border border-rule dark:border-ink rounded-xl p-3 text-xs font-medium text-primary dark:text-ink outline-none focus:border-accent"
          />
        </div>

        {/* Body Editor with Tabs (Write / Preview) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-primary dark:text-ink">
              Nội Dung Chi Tiết (Markdown)
            </label>
            <div className="flex bg-paper-2 dark:bg-ink/60 p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => setActiveTab('write')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${activeTab === 'write'
                  ? 'bg-paper dark:bg-ink text-accent dark:text-accent font-semibold shadow-xs'
                  : 'text-ink-2 dark:text-ink-2'
                  }`}
              >
                <Edit3 className="w-3 h-3" />
                <span>Soạn Thảo (Hỗ trợ Ctrl+V ảnh)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${activeTab === 'preview'
                  ? 'bg-paper dark:bg-ink text-accent dark:text-accent font-semibold shadow-xs'
                  : 'text-ink-2 dark:text-ink-2'
                  }`}
              >
                <Eye className="w-3 h-3" />
                <span>Xem Trước Render</span>
              </button>
            </div>
          </div>

          {activeTab === 'write' ? (
            <textarea
              ref={textareaRef}
              rows={14}
              placeholder="Nội dung Markdown mô tả chi tiết các bước tái hiện, telemetry logs... Bạn có thể bấm Ctrl+V để dán ảnh trực tiếp vào đây."
              value={body}
              onPaste={handlePasteOnEditor}
              onChange={(e) => setBody(e.target.value)}
              className="w-full bg-paper-2 dark:bg-ink border border-rule dark:border-ink rounded-xl p-3.5 text-xs font-mono text-primary dark:text-ink outline-none focus:border-accent leading-relaxed"
            />
          ) : (
            <div className="w-full bg-paper-2 dark:bg-ink/80 border border-rule dark:border-ink rounded-2xl p-5 min-h-64 shadow-inner overflow-x-auto">
              <MarkdownRenderer content={body} />
            </div>
          )}
        </div>

        {/* Submit Button - Primary CTA */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 bg-accent text-accent-ink hover:bg-accent active:bg-accent disabled:opacity-50 text-xs font-bold rounded-xl transition shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer"
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
