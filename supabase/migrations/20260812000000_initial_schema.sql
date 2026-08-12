-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum Types
CREATE TYPE ticket_source AS ENUM ('gmail', 'google_form', 'osticket');
CREATE TYPE ticket_category AS ENUM ('bug', 'account_keycloak', 'lms_enroll', 'license', 'other');
CREATE TYPE ticket_priority AS ENUM ('critical', 'normal');
CREATE TYPE ticket_status AS ENUM ('pending', 'approved', 'processing', 'completed', 'dismissed');
CREATE TYPE bot_type AS ENUM ('keycloak_api', 'lms_playwright', 'github_issue_creator', 'google_doc_comment');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

-- 1. Unified Inbox Table
CREATE TABLE inbox_tickets (
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
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Automation Tasks Queue Table (Human-in-the-Loop)
CREATE TABLE bot_automation_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES inbox_tickets(id) ON DELETE CASCADE,
    bot_type bot_type NOT NULL,
    payload_data JSONB NOT NULL,
    approval_status approval_status DEFAULT 'pending',
    execution_status VARCHAR(50) DEFAULT 'queued',
    execution_logs TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE
);

-- 3. Custom Templates Configuration
CREATE TABLE templates_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_key VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'github_issue_bug', 'xlsx_monthly_report'
    name VARCHAR(255) NOT NULL,
    content_markdown TEXT NOT NULL,
    fields_mapping JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for Speed
CREATE INDEX idx_tickets_status ON inbox_tickets(status);
CREATE INDEX idx_tickets_category ON inbox_tickets(category);
CREATE INDEX idx_tasks_approval ON bot_automation_tasks(approval_status);

-- Row Level Security (RLS) - Whitelist Admin Only
ALTER TABLE inbox_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_automation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_config ENABLE ROW LEVEL SECURITY;
