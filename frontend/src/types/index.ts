// frontend/src/types/index.ts

export type TicketCategory = 'bug' | 'account_keycloak' | 'lms_enroll' | 'license' | 'other';
export type TicketPriority = 'critical' | 'normal';
export type TicketSource = 'gmail' | 'google_form' | 'osticket';
export type TicketStatus = 'pending' | 'approved' | 'processing' | 'completed' | 'dismissed';

export interface InboxTicket {
  attachments: Array<{ filename: string; url: string }> | never[];
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

export type BotType =
  | 'keycloak_api'
  | 'workspace_rpa'
  | 'lms_playwright'
  | 'lms_git_provisioning'
  | 'github_issue_creator'
  | 'google_doc_comment'
  | 'feedback_doc_triage';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ExecutionStatus = 'queued' | 'running' | 'waiting_poll' | 'success' | 'partial_success' | 'failed';

export interface BotAutomationTask {
  id: string;
  ticket_id?: string | null;
  bot_type: BotType | string;
  payload_data: Record<string, any>;
  approval_status: ApprovalStatus;
  execution_status: ExecutionStatus;
  current_step?: string | null;
  steps_timeline?: TaskStepInfo[];
  retry_count?: number;
  last_error_step?: string | null;

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

export interface DailyTrendItem {
  date: string;
  day: string;
  incoming: number;
  resolved: number;
}

export interface ReportsSummary {
  total_tickets: number;
  weekly_trend_text?: string;
  pending_approval: number;
  resolved_this_month: number;
  automation_rate?: number;
  system_health: string;
  category_ratios: CategoryRatio[];
  daily_trends?: DailyTrendItem[];
}

export interface BotWorkersStatusResponse {
  gmail_sync_worker?: string;
  keycloak_api_worker?: string;
  workspace_license_worker?: string;
  lms_git_worker?: string;
  google_doc_triage?: string;
  github_dispatcher?: string;
  [key: string]: string | undefined;
}

export interface TaskStepInfo {
  step_id: string;
  step_name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  output_data?: Record<string, any>;
}

export interface BotTerminalLog {
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'ERROR' | 'SSO_SEEDING' | 'RETRY' | 'CRON';
  worker: string;
  message: string;
  raw_line: string;
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

export interface CourseItem {
  id: string;
  course_id: number;
  category: string;
  course_name: string;
  sku?: string | null;
  lms_url: string;
  created_at?: string;
}

export interface BoardPriorityItem {
  key: string;
  label: string;
  color: string;
}

export interface BoardItem {
  id: string;
  title: string;
  description?: string;
  background_url?: string | null;
  overlay_color?: string;
  overlay_opacity?: number;
  column_opacity?: number;
  card_opacity?: number;
  is_default?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  categories?: string[];
  priorities?: BoardPriorityItem[];
  created_at?: string;
}

export interface BoardColumnItem {
  id: string;
  board_id: string;
  title: string;
  color: string;
  column_type: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'abort' | 'custom';
  order_index: number;
}

export interface BoardSubtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface BoardCardItem {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description?: string;
  priority: string;
  category: string;
  color: string;
  assigned_name?: string;
  assigned_email?: string;
  due_date?: string | null;
  subtasks?: BoardSubtask[];
  order_index?: number;
  created_at?: string;
}

export interface KeycloakActionPayload {
  action: 'reset_password' | 'set_status' | 'verify_email' | 'send_verify_email' | 'delete_user' | 'git_oidc_provision';
  email: string;
  username?: string;
  new_password?: string;
  is_active?: boolean;
}

export interface WorkspaceRpaPayload {
  action:
  | 'pipeline_end_to_end'
  | 'school_create_order'
  | 'partner_approve_school_order'
  | 'partner_create_contract'
  | 'distributor_approve_partner_contract'
  | 'distributor_create_contract'
  | 'admin_approve_distributor_contract'
  | 'bulk_account_creation'
  | 'school_enroll_users';
  school_name?: string;
  school_id?: string;
  distributor_code?: string;
  partner_code?: string;
  order_id?: string;
  contract_id?: string;
  courses?: Array<{ course_id: number; course_name: string; quantity: number; expiry_date: string }>;
  file_url?: string;
  batch_file_path?: string;
  accounts_count?: number;
  run_immediately?: boolean;
}

export interface LmsEnrollPayload {
  action: 'enroll_users_pipeline' | 'modify_user_role' | 'unenrol_users_pipeline';
  course_id: number;
  emails: string[];
  role?: 'student' | 'teacher' | 'manager';
  role_id?: number; // 9: Student, 7: Non-editing teacher, 1: Manager
  end_date?: string; // YYYY-MM-DD
  group_name?: string;
}