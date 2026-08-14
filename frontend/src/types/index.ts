
export type TicketCategory = 'bug' | 'account_keycloak' | 'lms_enroll' | 'license' | 'other';
export type TicketPriority = 'critical' | 'normal';
export type TicketSource = 'gmail' | 'google_form' | 'osticket';
export type TicketStatus = 'pending' | 'approved' | 'processing' | 'completed' | 'dismissed';

export interface InboxTicket {
  attachments: never[];
  id: string;
  source: TicketSource | string;
  source_id: string;
  sender_email: string;
  submitter_name?: string | null;
  subject: string;
  raw_content: string;
  ai_summary?: string | null;
  category?: string | null;
  priority?: string | null;
  status: TicketStatus | string;

  // 🎯 CÁC TRƯỜNG BỔ SUNG CHO GOOGLE FORM & OS TICKET
  country?: string | null;
  doc_url?: string | null;
  assigned_name?: string | null;
  assigned_email?: string | null;
  assigned_to?: string | null;
  ticket_timestamp?: string | null;

  metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export type BotType = 'keycloak_api' | 'lms_playwright' | 'github_issue_creator' | 'google_doc_comment';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface BotAutomationTask {
  id: string;
  ticket_id: string;
  bot_type: 'keycloak_api' | 'lms_playwright' | 'github_issue_creator' | 'google_doc_comment';
  payload_data: Record<string, any>;
  approval_status: 'pending' | 'approved' | 'rejected';
  execution_status: 'queued' | 'running' | 'success' | 'failed';
  execution_logs?: string;
  created_at: string;
  executed_at?: string;
  inbox_tickets?: InboxTicket;
}

export interface TemplateConfig {
  id: string;
  template_key: string;
  name: string;
  content_markdown: string;
  fields_mapping: Array<Record<string, any>>;
  updated_at: string;
}

export interface CategoryRatio {
  name: string;
  value: number;
}

export interface ReportsSummary {
  total_tickets: number;
  pending_approval: number;
  resolved_this_month: number;
  system_health: string;
  category_ratios: CategoryRatio[];
}

export interface BotWorkersStatusResponse {
  gmail_sync_worker?: string;
  keycloak_api_worker?: string;
  lms_playwright_worker?: string;
  github_dispatcher?: string;
  [key: string]: string | undefined;
}

export interface GithubIssuePayload {
  repo: string;
  title: string;
  body: string;
}

export interface GithubIssueResponse {
  status: string;
  issue_url?: string;
  issue_number?: number;
  message?: string;
}

export interface DailyTrendItem {
  date: string;       // Hiển thị 'DD/MM' (ví dụ: 12/08, 13/08, 14/08)
  received: number;   // Số lượng request tiếp nhận trong ngày
  resolved: number;   // Số lượng request đã xử lý trong ngày
}

export interface CategoryRatio {
  name: string;
  value: number;
}

export interface ReportsSummary {
  total_tickets: number;
  pending_approval: number;
  resolved_this_month: number;
  automation_rate?: string;
  weekly_trend?: string;
  system_health: string;
  category_ratios: CategoryRatio[];
  daily_trend?: DailyTrendItem[];
}