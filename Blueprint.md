# 📄 SAO CHÉP TOÀN BỘ NỘI DUNG DƯỚI ĐÂY NÉM VÀO ANTIGRAVITY

```markdown
# 🚀 PROJECT BLUEPRINT: PYTHAVERSE CENTRAL ADMIN & AUTOMATION HUB
> **Version:** 1.0.0 (Production Blueprint)
> **Architecture:** Single Page Application (PWA + Telegram Mini App) + Python AI Brain + Supabase Engine
> **Core Concept:** Multi-channel Unified Inbox + Gemini AI Triage + Human-in-the-Loop Approval + Cloud Bot Execution

---

## 🤖 AGENT SKILL INVOCATIONS (INSTRUCTIONS FOR AI AGENT)
When parsing this blueprint, Antigravity AI MUST invoke the following internal specialized skills:
- `@architect`: Review system flow, state management, and async worker architecture.
- `@database-specialist`: Apply Supabase PostgreSQL 16 schema, RLS policies, and index optimizations.
- `@frontend-developer`: Build React 19 + TypeScript 5 + Tailwind CSS 4 + Lucide React components (PWA & Telegram Mini App ready).
- `@backend-developer`: Construct Python 3.11 FastAPI server, Gmail API listener, Keycloak REST API, and GitHub Issue Dispatcher.
- `@security-auditor`: Enforce strict OAuth2 `@dtt.vn` domain whitelist, Fine-Grained GitHub PAT scoping, and Human-In-The-Loop safety guards.

---

## 🛠️ 1. TECH STACK SPECIFICATION (STABLE LATEST VERSIONS)

To prevent syntax conflicts, breaking changes, and deprecated API calls, all code generated MUST strictly adhere to these specific stable library versions:

### Frontend & Mobile UI Stack
- **Node.js**: `20.x LTS` / `22.x LTS`
- **React**: `19.0.0` (Use React 19 Hooks standard)
- **Vite**: `6.2.x` (Build tool & Dev server)
- **TypeScript**: `5.7.x` (Strict Type Safety enabled)
- **Tailwind CSS**: `4.0.x` (Use new `@import "tailwindcss";` v4 syntax)
- **Lucide React**: `0.475.x` (UI Icons)
- **SheetJS (`xlsx`)**: `0.18.5` (Client-side Excel parsing & exporting)
- **Supabase JS Client**: `@supabase/supabase-js: ^2.48.x`
- **Recharts**: `2.15.x` (Dashboard KPI Data Visualization)

### Backend & AI Automation Brain
- **Python Runtime**: `3.11.9` or `3.12.x`
- **FastAPI**: `0.115.x` (Async Web Framework)
- **Pydantic**: `2.10.x` (Strict Data Validation)
- **google-genai**: `1.2.x` / `google-generativeai: ^0.8.4` (Gemini API SDK with Model Fallback)
- **python-keycloak**: `5.1.x` (Keycloak Admin REST API integration)
- **playwright**: `1.50.x` (Headless browser automation fallback for LMS/PLearn)
- **PyJWT / google-auth-oauthlib**: Latest stable (OAuth2 Gmail Workspace authentication)

---

## 📊 2. DATABASE SCHEMA (SUPABASE POSTGRESQL 16)

Antigravity `@database-specialist` MUST generate and apply the following DDL script:

```sql
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
```

---

## 🧭 3. MODULE & MENU STRUCTURE (FRONTEND UI/UX)

The Single Page Application MUST be structured with the following routes & sub-modules:

### Menu 1: Executive Dashboard (`/dashboard`)
- Real-time KPI Cards: Total Pending Tickets, Tasks Awaiting Approval, System Health, Monthly Resolved.
- Recharts Visualization: Category Breakdown, Channel Source Ratio (Gmail vs Form vs OS Ticket), Daily Resolution Trend.

### Menu 2: Unified Inbox Feed (`/unified-inbox`)
- Tabs: `All` | `🐛 System Bugs` | `🔑 Keycloak/Account` | `🎓 LMS Enroll` | `📜 License` | `📌 Others`
- Search & Date Range Picker.
- AI Triage Card Component: Displays Gemini summary, extracted entity badges, confidence score, and suggested action button.

### Menu 3: Task Management & Approval Hub (`/task-management`)
- Kanban & Table Dual-View.
- **Human-In-The-Loop Approval Modal**: Shows proposed bot payload (e.g., target user, password, Keycloak Realm, or GitHub Issue title/body).
- Actions: `[✅ Approve & Run Worker]` | `[✏️ Edit Payload]` | `[❌ Reject Task]`.

### Menu 4: GitHub Issue Dispatcher (`/github-reporter`)
- Form to draft GitHub Issues targeting Private Repositories.
- AI Auto-Fill feature: Transforms user bug reports into structured Markdown following custom templates.
- One-click submit calling GitHub REST API (`POST /repos/{owner}/{repo}/issues`).

### Menu 5: Bot Command & Execution Center (`/bot-commander`)
- Real-time worker status (Keycloak API worker, LMS Playwright worker, Gmail Sync worker).
- Execution Logs terminal view with retry trigger button (`POST /api/v1/tasks/{id}/retry`).

### Menu 6: Analytics & Custom XLSX Exporter (`/reports-export`)
- Template selector (mapping Supabase fields to Excel columns).
- Date range filter.
- Client-side export using `SheetJS` (`xlsx`) with custom styling, custom filenames, and auto-download.

---

## 🔄 4. END-TO-END AUTOMATION WORKFLOW

```text
[Gmail Workspace @dtt.vn / Google Form / OS Ticket]
                        │
                        ▼
            [FastAPI Gmail Cron / Webhook]
                        │
                        ▼
       [Gemini AI Engine (Auto-Fallback Models)]
  (Categorizes, Summarizes, Generates Execution Payload)
                        │
                        ▼
            [Saved to Supabase Database]
                        │
                        ▼
       [Telegram Bot Sends Push Notification Alert]
                        │
                        ▼
    [Human-in-the-Loop Web Portal Control Hub]
        (Review & Edit JSON Payload)
                        │
                        │ (User Confirms / Approves)
                        ▼
          [Python Worker Execution]
  ├── Keycloak API -> Reset / Disable / Update
  ├── Playwright Headless -> Enroll LMS Course
  └── GitHub API -> Create Issue in Private Repo
                        │
                        ▼
      [Status Updated in Supabase & User Notified]
```

---

## 🔒 5. SECURITY & ETHICAL SAFEGUARDS

1. **OAuth2 Strict Domain Whitelist**: Frontend and Backend MUST reject any authenticated user whose email does NOT match the owner's specific Google Workspace email.
2. **GitHub PAT Scope Minimization**: Use a GitHub Fine-Grained Personal Access Token restricted strictly to `Issues: Read & Write` on target private repositories.
3. **Human-In-The-Loop Enforcement**: No destructive action (Keycloak password reset, account disable, GitHub issue creation) shall execute without explicit approval status `approval_status = 'approved'`.
4. **API Credential Isolation**: All credentials (`GEMINI_API_KEY`, `KEYCLOAK_ADMIN_PASS`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_PAT`) MUST be stored in environment variables (`.env` for local, Render.com Env Vars for cloud).

---

## 🚀 6. STEP-BY-STEP AGENT IMPLEMENTATION TASK LIST

Antigravity AI Agent shall execute implementation in these chronological steps:

- [ ] **Step 1:** Initialize Supabase DB using the provided PostgreSQL DDL script.
- [ ] **Step 2:** Scaffold React 19 + Vite 6 + Tailwind CSS 4 frontend with the specified menu routes.
- [ ] **Step 3:** Build FastAPI backend in Python 3.11 with Gmail API reader, Keycloak REST API wrapper (`python-keycloak`), and GitHub Issue creation endpoint.
- [ ] **Step 4:** Integrate Gemini AI engine with fallback model list (`gemini-3.7-flash`, `gemini-3.6-flash`, etc.).
- [ ] **Step 5:** Setup Telegram Bot notification push alert with Inline Keyboard approval buttons.
- [ ] **Step 6:** Implement Client-Side XLSX Exporter using SheetJS (`xlsx`) in the Reports module.
- [ ] **Step 7:** Run TypeScript linting (`npm run lint`) and Python type check (`mypy`) to ensure zero syntax/type errors.
```
