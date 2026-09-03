-- =============================================================================
-- PTV-TASKS-ADMINISTRATOR – Pythaverse Central Admin & Automation Hub
-- Complete Database Schema (Supabase PostgreSQL 16 - 16 Tables & Policies)
-- Author: Nguyễn Mạnh Hùng (Lead AI Engineer & Automation Architect)
-- Version: 2.5.0 Enterprise | Updated: 2026-09-03
-- =============================================================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SECTION 1: ENUM TYPES
-- =============================================================================

CREATE TYPE ticket_source AS ENUM ('gmail', 'google_form', 'osticket');
CREATE TYPE ticket_category AS ENUM ('bug', 'account_keycloak', 'lms_enroll', 'license', 'other');
CREATE TYPE ticket_priority AS ENUM ('critical', 'normal');
CREATE TYPE ticket_status AS ENUM ('pending', 'approved', 'processing', 'completed', 'dismissed');
CREATE TYPE bot_type AS ENUM (
    'keycloak_api', 
    'workspace_rpa', 
    'lms_playwright', 
    'lms_git_provisioning', 
    'github_issue_creator', 
    'google_doc_comment', 
    'feedback_doc_triage'
);
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

-- =============================================================================
-- SECTION 2: TABLES DEFINITIONS (16 TABLES)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. UNIFIED INBOX & AUTOMATION QUEUE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inbox_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source ticket_source NOT NULL,
    source_id VARCHAR(255),
    sender_email VARCHAR(255) NOT NULL,
    submitter_name VARCHAR(255),
    subject TEXT,
    raw_content TEXT NOT NULL,
    ai_summary TEXT,
    category ticket_category DEFAULT 'other',
    priority ticket_priority DEFAULT 'normal',
    status ticket_status DEFAULT 'pending',
    country VARCHAR(100),
    doc_url TEXT,
    ticket_timestamp VARCHAR(100),
    attachments JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_automation_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES inbox_tickets(id) ON DELETE CASCADE,
    bot_type bot_type NOT NULL,
    payload_data JSONB NOT NULL,
    approval_status approval_status DEFAULT 'pending',
    execution_status VARCHAR(50) DEFAULT 'queued', -- queued | running | waiting_poll | success | failed
    execution_logs TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS templates_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    content_markdown TEXT NOT NULL,
    fields_mapping JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. HIERARCHY & ENCRYPTED CREDENTIALS VAULT
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100),
    role_type VARCHAR(50) NOT NULL, -- distributor | partner | school
    parent_id UUID REFERENCES workspace_organizations(id) ON DELETE SET NULL,
    country VARCHAR(100) DEFAULT 'Vietnam',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_credentials_vault (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES workspace_organizations(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL,
    encrypted_password TEXT NOT NULL, -- Encrypted via Fernet (VAULT_SECRET_KEY)
    role VARCHAR(50) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. SCANNER CACHE & DUAL COURSE CATALOGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_contracts_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id VARCHAR(100) NOT NULL,
    distributor_name VARCHAR(255),
    distributor_code VARCHAR(50),
    partner_name VARCHAR(255),
    partner_code VARCHAR(50),
    contract_type VARCHAR(50) DEFAULT 'PRT',
    total_licenses INT DEFAULT 0,
    status VARCHAR(50),
    raw_data JSONB DEFAULT '{}'::jsonb,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_orders_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(100) NOT NULL,
    partner_name VARCHAR(255),
    school_name VARCHAR(255),
    distributor_code VARCHAR(50),
    order_date TIMESTAMP WITH TIME ZONE,
    total_licenses INT DEFAULT 0,
    status VARCHAR(50),
    raw_data JSONB DEFAULT '{}'::jsonb,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id INT NOT NULL,
    category VARCHAR(100) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    lms_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lms_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id INT NOT NULL,
    category VARCHAR(100) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    lms_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. SITE HEALTH & CI/CD CONFIGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_monitor_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id VARCHAR(100) NOT NULL,
    role_label VARCHAR(100) NOT NULL,
    username VARCHAR(255) NOT NULL,
    encrypted_password TEXT NOT NULL,
    expected_path TEXT DEFAULT '/',
    is_active BOOLEAN DEFAULT TRUE,
    last_status VARCHAR(50) DEFAULT 'PENDING',
    last_latency_ms INT DEFAULT 0,
    last_checked_at TIMESTAMP WITH TIME ZONE,
    details TEXT
);

CREATE TABLE IF NOT EXISTS site_downtime_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id VARCHAR(100) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_s INT DEFAULT 0,
    is_ongoing BOOLEAN DEFAULT TRUE,
    http_code INT,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS site_deploy_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL, -- vercel | render
    target_id VARCHAR(255) NOT NULL,
    encrypted_api_token TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5. KANBAN WORK BOARD
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_boards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    background_url TEXT,
    overlay_color VARCHAR(50) DEFAULT '#0f172a',
    overlay_opacity FLOAT DEFAULT 0.6,
    column_opacity FLOAT DEFAULT 0.85,
    card_opacity FLOAT DEFAULT 0.95,
    is_default BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    categories JSONB DEFAULT '["Dev", "Bug", "Automation", "Ops", "Design"]'::jsonb,
    priorities JSONB DEFAULT '[{"key": "low", "label": "Thấp", "color": "emerald"}, {"key": "medium", "label": "Vừa", "color": "amber"}, {"key": "high", "label": "Cao", "color": "rose"}]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_board_columns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id UUID REFERENCES work_boards(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    color VARCHAR(50) DEFAULT '#8b5cf6',
    column_type VARCHAR(50) NOT NULL, -- backlog | todo | in_progress | review | done | abort | custom
    order_index INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS work_board_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id UUID REFERENCES work_boards(id) ON DELETE CASCADE,
    column_id UUID REFERENCES work_board_columns(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(50) DEFAULT 'low',
    category VARCHAR(100) DEFAULT 'Khác',
    color VARCHAR(50) DEFAULT '#8b5cf6',
    assigned_name VARCHAR(255) DEFAULT 'Hùng Nguyễn Mạnh',
    assigned_email VARCHAR(255) DEFAULT 'hung.nguyenmanh@dtt.vn',
    due_date TIMESTAMP WITH TIME ZONE,
    subtasks JSONB DEFAULT '[]'::jsonb,
    order_index INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- SECTION 3: INDEXES (Tối ưu hiệu năng truy vấn)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_tickets_status       ON inbox_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_category     ON inbox_tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_priority     ON inbox_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_source       ON inbox_tickets(source);
CREATE INDEX IF NOT EXISTS idx_tickets_email        ON inbox_tickets(sender_email);
CREATE INDEX IF NOT EXISTS idx_tickets_created      ON inbox_tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_approval       ON bot_automation_tasks(approval_status);
CREATE INDEX IF NOT EXISTS idx_tasks_execution      ON bot_automation_tasks(execution_status);
CREATE INDEX IF NOT EXISTS idx_tasks_ticket_id      ON bot_automation_tasks(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tasks_bot_type       ON bot_automation_tasks(bot_type);
CREATE INDEX IF NOT EXISTS idx_tasks_created        ON bot_automation_tasks(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_board_cards_board    ON work_board_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_board_cards_column   ON work_board_cards(column_id);
CREATE INDEX IF NOT EXISTS idx_board_columns_board  ON work_board_columns(board_id);
CREATE INDEX IF NOT EXISTS idx_boards_deleted       ON work_boards(is_deleted);

CREATE INDEX IF NOT EXISTS idx_ws_org_parent        ON workspace_organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_ws_org_code          ON workspace_organizations(code);
CREATE INDEX IF NOT EXISTS idx_ws_vault_org         ON workspace_credentials_vault(org_id);

CREATE INDEX IF NOT EXISTS idx_ws_contracts_type    ON workspace_contracts_cache(contract_type);
CREATE INDEX IF NOT EXISTS idx_ws_contracts_dist    ON workspace_contracts_cache(distributor_code);
CREATE INDEX IF NOT EXISTS idx_ws_contracts_id      ON workspace_contracts_cache(contract_id);
CREATE INDEX IF NOT EXISTS idx_ws_orders_dist       ON workspace_orders_cache(distributor_code);
CREATE INDEX IF NOT EXISTS idx_ws_orders_id         ON workspace_orders_cache(order_id);

-- =============================================================================
-- SECTION 4: ROW LEVEL SECURITY (RLS) – Whitelist Admin @dtt.vn Only
-- =============================================================================

ALTER TABLE inbox_tickets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_automation_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_credentials_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_contracts_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_orders_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_courses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_courses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_monitor_credentials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_downtime_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_deploy_configs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_boards                ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_board_columns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_board_cards           ENABLE ROW LEVEL SECURITY;

DO $$ 
DECLARE
    t text;
    tables text[] := ARRAY[
        'inbox_tickets', 'bot_automation_tasks', 'templates_config',
        'workspace_organizations', 'workspace_credentials_vault',
        'workspace_contracts_cache', 'workspace_orders_cache',
        'workspace_courses', 'lms_courses',
        'site_monitor_credentials', 'site_downtime_events', 'site_deploy_configs',
        'work_boards', 'work_board_columns', 'work_board_cards'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS "admin_dtt_vn_only" ON %I;
            CREATE POLICY "admin_dtt_vn_only" ON %I
                FOR ALL
                USING ((auth.jwt() ->> ''email'') LIKE ''%%@dtt.vn'');
        ', t, t);
    END LOOP;
END $$;

-- =============================================================================
-- SECTION 5: TRIGGERS – Auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inbox_tickets_updated_at ON inbox_tickets;
CREATE TRIGGER trg_inbox_tickets_updated_at
    BEFORE UPDATE ON inbox_tickets
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_work_boards_updated_at ON work_boards;
CREATE TRIGGER trg_work_boards_updated_at
    BEFORE UPDATE ON work_boards
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_work_board_cards_updated_at ON work_board_cards;
CREATE TRIGGER trg_work_board_cards_updated_at
    BEFORE UPDATE ON work_board_cards
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
