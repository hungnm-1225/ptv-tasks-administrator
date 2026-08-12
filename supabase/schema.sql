-- =============================================================================
-- PTV-TASKS-ADMINISTRATOR – Pythaverse Central Admin & Automation Hub
-- Database Schema (Supabase PostgreSQL 16)
-- Version: 1.0.0 | Date: 2026-08-12
-- =============================================================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SECTION 1: ENUM TYPES
-- =============================================================================

-- Nguồn gốc ticket đến từ kênh nào
CREATE TYPE ticket_source AS ENUM (
    'gmail',          -- Email từ Gmail Workspace @dtt.vn
    'google_form',    -- Form Google Forms
    'osticket'        -- Hệ thống OS Ticket
);

-- Phân loại yêu cầu của ticket
CREATE TYPE ticket_category AS ENUM (
    'bug',              -- Báo lỗi hệ thống
    'account_keycloak', -- Yêu cầu liên quan tài khoản Keycloak
    'lms_enroll',       -- Ghi danh khóa học LMS / PLearn
    'license',          -- Yêu cầu liên quan giấy phép
    'other'             -- Các yêu cầu khác
);

-- Mức độ ưu tiên xử lý
CREATE TYPE ticket_priority AS ENUM (
    'critical', -- Ưu tiên cao – cần xử lý ngay
    'normal'    -- Ưu tiên thường
);

-- Vòng đời trạng thái của ticket
CREATE TYPE ticket_status AS ENUM (
    'pending',     -- Mới nhận, chờ xử lý
    'approved',    -- Đã phê duyệt để tự động hóa
    'processing',  -- Bot worker đang thực thi
    'completed',   -- Đã hoàn thành
    'dismissed'    -- Đã bác bỏ / huỷ
);

-- Loại Bot Worker thực thi tự động hóa
CREATE TYPE bot_type AS ENUM (
    'keycloak_api',         -- Keycloak Admin REST API (reset pass, tạo user, vô hiệu hóa)
    'lms_playwright',       -- Playwright headless để ghi danh LMS / PLearn
    'github_issue_creator', -- GitHub REST API tạo Issue trong Private Repo
    'google_doc_comment'    -- Ghi comment vào Google Docs
);

-- Trạng thái phê duyệt Human-in-the-Loop
CREATE TYPE approval_status AS ENUM (
    'pending',  -- Chờ admin phê duyệt
    'approved', -- Đã được phê duyệt → trigger worker
    'rejected'  -- Bị từ chối
);

-- =============================================================================
-- SECTION 2: TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLE 1: inbox_tickets – Unified Inbox (tất cả ticket từ mọi kênh)
-- -----------------------------------------------------------------------------
CREATE TABLE inbox_tickets (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    source          ticket_source NOT NULL,
    source_id       VARCHAR(255),                -- ID gốc của email/form/osticket
    sender_email    VARCHAR(255) NOT NULL,        -- Email người gửi yêu cầu
    submitter_name  VARCHAR(255),                -- Tên người gửi (nếu có)
    subject         TEXT,                        -- Tiêu đề email / yêu cầu
    raw_content     TEXT NOT NULL,               -- Nội dung gốc đầy đủ
    ai_summary      TEXT,                        -- Tóm tắt do Gemini AI tạo
    category        ticket_category DEFAULT 'other',
    priority        ticket_priority DEFAULT 'normal',
    status          ticket_status   DEFAULT 'pending',
    metadata        JSONB           DEFAULT '{}'::jsonb, -- Dữ liệu bổ sung tùy nguồn
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE inbox_tickets IS 'Unified Inbox: Tổng hợp tất cả yêu cầu từ Gmail, Google Form và OS Ticket';
COMMENT ON COLUMN inbox_tickets.ai_summary IS 'Tóm tắt tự động do Gemini AI Engine tạo ra';
COMMENT ON COLUMN inbox_tickets.metadata IS 'JSONB lưu thông tin bổ sung: thread_id, form_response_id, osticket_id, ...';

-- -----------------------------------------------------------------------------
-- TABLE 2: bot_automation_tasks – Automation Queue (Human-in-the-Loop)
-- -----------------------------------------------------------------------------
CREATE TABLE bot_automation_tasks (
    id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id        UUID          REFERENCES inbox_tickets(id) ON DELETE CASCADE,
    bot_type         bot_type      NOT NULL,
    payload_data     JSONB         NOT NULL,          -- Tham số thực thi của bot (JSON)
    approval_status  approval_status DEFAULT 'pending',
    execution_status VARCHAR(50)   DEFAULT 'queued',  -- queued | running | success | failed
    execution_logs   TEXT,                            -- Log chi tiết của lần chạy
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at      TIMESTAMP WITH TIME ZONE         -- Thời điểm worker bắt đầu chạy
);

COMMENT ON TABLE bot_automation_tasks IS 'Hàng đợi tác vụ tự động hóa – yêu cầu phê duyệt Human-in-the-Loop trước khi thực thi';
COMMENT ON COLUMN bot_automation_tasks.payload_data IS 'JSON payload cho bot: { action, username, realm } hoặc { owner, repo, title, body }';
COMMENT ON COLUMN bot_automation_tasks.execution_status IS 'Trạng thái vận hành: queued | running | success | failed | retrying';

-- -----------------------------------------------------------------------------
-- TABLE 3: templates_config – Custom Templates Configuration
-- -----------------------------------------------------------------------------
CREATE TABLE templates_config (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_key     VARCHAR(100) UNIQUE NOT NULL,  -- Định danh duy nhất, e.g. 'github_issue_bug'
    name             VARCHAR(255) NOT NULL,          -- Tên hiển thị
    content_markdown TEXT         NOT NULL,          -- Nội dung template dạng Markdown
    fields_mapping   JSONB        DEFAULT '[]'::jsonb, -- Ánh xạ trường dữ liệu sang cột DB/Excel
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE templates_config IS 'Cấu hình template tùy chỉnh cho GitHub Issues và XLSX Export Reports';
COMMENT ON COLUMN templates_config.template_key IS 'Ví dụ: github_issue_bug, github_issue_feature, xlsx_monthly_report, xlsx_bot_executions';
COMMENT ON COLUMN templates_config.fields_mapping IS 'Mảng JSON mô tả ánh xạ: [{ db_field, xlsx_column, label, format }]';

-- =============================================================================
-- SECTION 3: INDEXES (Tối ưu hiệu năng truy vấn)
-- =============================================================================

-- Inbox Tickets – truy vấn theo status và category rất thường xuyên
CREATE INDEX idx_tickets_status    ON inbox_tickets(status);
CREATE INDEX idx_tickets_category  ON inbox_tickets(category);
CREATE INDEX idx_tickets_priority  ON inbox_tickets(priority);
CREATE INDEX idx_tickets_source    ON inbox_tickets(source);
CREATE INDEX idx_tickets_email     ON inbox_tickets(sender_email);
CREATE INDEX idx_tickets_created   ON inbox_tickets(created_at DESC);

-- Bot Tasks – truy vấn theo approval và execution status thường xuyên
CREATE INDEX idx_tasks_approval    ON bot_automation_tasks(approval_status);
CREATE INDEX idx_tasks_execution   ON bot_automation_tasks(execution_status);
CREATE INDEX idx_tasks_ticket_id   ON bot_automation_tasks(ticket_id);
CREATE INDEX idx_tasks_bot_type    ON bot_automation_tasks(bot_type);
CREATE INDEX idx_tasks_created     ON bot_automation_tasks(created_at DESC);

-- =============================================================================
-- SECTION 4: ROW LEVEL SECURITY (RLS) – Whitelist Admin @dtt.vn Only
-- =============================================================================

ALTER TABLE inbox_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_automation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_config    ENABLE ROW LEVEL SECURITY;

-- Chính sách: Chỉ admin được xác thực từ domain @dtt.vn mới có quyền truy cập
-- Áp dụng cho Supabase Auth JWT với email claim

CREATE POLICY "admin_dtt_vn_only" ON inbox_tickets
    FOR ALL
    USING (
        (auth.jwt() ->> 'email') LIKE '%@dtt.vn'
    );

CREATE POLICY "admin_dtt_vn_only" ON bot_automation_tasks
    FOR ALL
    USING (
        (auth.jwt() ->> 'email') LIKE '%@dtt.vn'
    );

CREATE POLICY "admin_dtt_vn_only" ON templates_config
    FOR ALL
    USING (
        (auth.jwt() ->> 'email') LIKE '%@dtt.vn'
    );

-- =============================================================================
-- SECTION 5: TRIGGERS – Auto-update updated_at
-- =============================================================================

-- Function tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger cho inbox_tickets
CREATE TRIGGER trg_inbox_tickets_updated_at
    BEFORE UPDATE ON inbox_tickets
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SECTION 6: SAMPLE SEED DATA (Dev only – xóa trước khi production)
-- =============================================================================

-- INSERT INTO templates_config (template_key, name, content_markdown, fields_mapping)
-- VALUES
-- (
--     'github_issue_bug',
--     'Bug Report Template',
--     '### Mô Tả Sự Cố\n{{description}}\n\n### Môi Trường\n{{environment}}\n\n### Các Bước Tái Hiện\n{{steps}}',
--     '[{"db_field": "subject", "label": "Tiêu đề"}, {"db_field": "raw_content", "label": "Nội dung"}]'
-- ),
-- (
--     'xlsx_monthly_report',
--     'Báo Cáo Tháng',
--     '',
--     '[{"db_field": "id", "xlsx_column": "A", "label": "Ticket ID"}, {"db_field": "sender_email", "xlsx_column": "B", "label": "Email"}, {"db_field": "category", "xlsx_column": "C", "label": "Phân loại"}, {"db_field": "status", "xlsx_column": "D", "label": "Trạng thái"}, {"db_field": "created_at", "xlsx_column": "E", "label": "Ngày tạo", "format": "date"}]'
-- );

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
