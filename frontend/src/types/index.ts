export type TicketSource = 'gmail' | 'google_form' | 'osticket';
export type TicketCategory = 'bug' | 'account_keycloak' | 'lms_enroll' | 'license' | 'other';
export type TicketPriority = 'critical' | 'normal';
export type TicketStatus = 'pending' | 'approved' | 'processing' | 'completed' | 'dismissed';

export interface InboxTicket {
  id: string;
  source: TicketSource;
  source_id?: string;
  sender_email: string;
  submitter_name?: string;
  subject?: string;
  raw_content: string;
  ai_summary?: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type BotType = 'keycloak_api' | 'lms_playwright' | 'github_issue_creator' | 'google_doc_comment';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface BotAutomationTask {
  id: string;
  ticket_id?: string;
  bot_type: BotType;
  payload_data: Record<string, any>;
  approval_status: ApprovalStatus;
  execution_status: string;
  execution_logs?: string;
  created_at: string;
  executed_at?: string;
}

export interface TemplateConfig {
  id: string;
  template_key: string;
  name: string;
  content_markdown: string;
  fields_mapping: Array<Record<string, any>>;
  updated_at: string;
}
