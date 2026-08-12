# 🚀 PTV Tasks Administrator – Pythaverse Central Admin & Automation Hub

> **Phiên bản:** 1.0.0 | **Kiến trúc:** Monorepo (Frontend SPA + Backend FastAPI + Supabase DB)
> **Mục đích:** Đây là tài liệu dành cho AI Coder / Developer mới tiếp cận dự án. Đọc file này là đủ để hiểu và làm việc với toàn bộ hệ thống mà không cần phải đọc từng file source code.

---

## 🧠 Tổng Quan Hệ Thống (Core Concept)

Hệ thống này giải quyết bài toán quản trị nội bộ cho tổ chức Pythaverse (`@dtt.vn`). Luồng chính:

```
[Gmail Workspace @dtt.vn / Google Form / OS Ticket]
    ↓ Webhook/Cron polling
[FastAPI Backend] → [Gemini AI Triage Engine]
    ↓ Phân loại, tóm tắt, đề xuất hành động
[Supabase Database] → [Telegram Bot Push Notification]
    ↓ Admin xem xét
[Human-in-the-Loop Approval via Telegram Mini App / Web SPA]
    ↓ Khi được phê duyệt
[Python Bot Workers: Keycloak API / Playwright LMS / GitHub Issue API]
    ↓
[Cập nhật trạng thái → Supabase & Thông báo Admin]
```

**Nguyên tắc cốt lõi:**
- Không có hành động tự động nguy hiểm nào (reset mật khẩu, ghi danh khóa học, tạo GitHub Issue) được thực thi mà không có `approval_status = 'approved'` từ admin.
- Mọi user phải thuộc domain `@dtt.vn` → Enforced ở cả Frontend (OAuth) và Backend (JWT whitelist check).

---

## 🏗️ Cấu Trúc Thư Mục Monorepo

```
ptv-tasks-administrator/
│
├── .agent/                           # 🤖 Hệ thống Agent & Skill AI (Antigravity framework)
│   ├── agents/                       # Các Agent specialist (.md files)
│   │   ├── frontend-specialist.md    # Quy tắc UI/UX, React, Tailwind
│   │   ├── backend-specialist.md     # Quy tắc API, Python, FastAPI
│   │   ├── database-architect.md     # Quy tắc Supabase, PostgreSQL
│   │   ├── security-auditor.md       # Quy tắc bảo mật OAuth, PAT
│   │   └── orchestrator.md           # Điều phối luồng, kế hoạch
│   └── skills/                       # Kỹ năng tái sử dụng
│
├── backend/                          # 🐍 Python 3.11 FastAPI Automation Brain
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── router.py             # Tổng hợp tất cả v1 routes
│   │   │   └── endpoints/
│   │   │       ├── tickets.py        # POST /tickets (webhook ingestion), GET /tickets
│   │   │       ├── tasks.py          # GET /tasks, PUT /tasks/{id}/approve
│   │   │       ├── bots.py           # GET /bots/status, POST /bots/{id}/retry
│   │   │       ├── github.py         # POST /github/create-issue
│   │   │       └── reports.py        # GET /reports/summary
│   │   ├── core/
│   │   │   ├── config.py             # Pydantic BaseSettings – nạp tất cả env vars
│   │   │   ├── security.py           # JWT decode + @dtt.vn domain whitelist check
│   │   │   ├── gemini.py             # GeminiEngine class – AI Triage + auto fallback
│   │   │   └── supabase.py           # Singleton Supabase Python client
│   │   ├── models/
│   │   │   ├── ticket.py             # Pydantic schemas: TicketCreate, TicketResponse
│   │   │   ├── task.py               # Pydantic schemas: AutomationTaskApprovalUpdate, ...
│   │   │   └── template.py           # Pydantic schemas: TemplateConfigCreate, ...
│   │   ├── services/
│   │   │   ├── gmail_service.py      # Gmail API polling / webhook handler
│   │   │   ├── keycloak_service.py   # python-keycloak Admin REST API wrapper
│   │   │   ├── playwright_service.py # Playwright headless LMS automation
│   │   │   ├── github_service.py     # GitHub REST API issue creator (Fine-Grained PAT)
│   │   │   └── telegram_service.py   # Telegram Bot: push notification + inline approval
│   │   ├── workers/
│   │   │   ├── ticket_processor.py   # Ingest ticket → Gemini triage → Telegram alert
│   │   │   └── bot_executor.py       # Route approved task → correct service worker
│   │   └── main.py                   # FastAPI app entry: CORS, router mounting, healthcheck
│   ├── tests/                        # Pytest test suite (placeholder)
│   ├── requirements.txt              # Python dependencies (pinned versions)
│   ├── .env.example                  # Template env vars cho Backend
│   └── Dockerfile                    # Python 3.11-slim + Playwright Chromium
│
├── frontend/                         # ⚛️ React 19 + Vite 6 + Tailwind CSS v4 SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Header.tsx        # Sticky header: Search bar, Domain badge, User info
│   │   │   │   └── Sidebar.tsx       # Navigation: 7 Menu items + Brand logo
│   │   │   └── layout/
│   │   │       └── AppLayout.tsx     # Root layout: Sidebar + Header + Main content area
│   │   ├── features/                 # Feature-based modules (1 thư mục = 1 menu)
│   │   │   ├── dashboard/
│   │   │   │   └── DashboardPage.tsx # KPI Cards (4) + PieChart + BarChart (Recharts)
│   │   │   ├── inbox/
│   │   │   │   └── UnifiedInboxPage.tsx  # Category tabs + AI Triage Cards + Confidence score
│   │   │   ├── tasks/
│   │   │   │   └── TaskManagementPage.tsx # Task queue table + Approval Modal (JSON editor)
│   │   │   ├── github/
│   │   │   │   └── GithubReporterPage.tsx # Form + AI Auto-Fill + GitHub REST API submit
│   │   │   ├── bots/
│   │   │   │   └── BotCommanderPage.tsx   # Worker status cards + Live terminal log view
│   │   │   ├── reports/
│   │   │   │   └── ReportsExportPage.tsx  # Template selector + Date range + SheetJS export
│   │   │   └── telegram/
│   │   │       └── TelegramAppPage.tsx    # Mobile Telegram Mini App UI preview
│   │   ├── hooks/                    # Custom React Hooks (placeholder – thêm khi cần)
│   │   ├── lib/
│   │   │   ├── supabase.ts           # createClient() – Supabase JS client singleton
│   │   │   └── api.ts                # fetchApi() helper – gọi FastAPI Backend
│   │   ├── types/
│   │   │   └── index.ts              # TypeScript interfaces: InboxTicket, BotAutomationTask, ...
│   │   ├── vite-env.d.ts             # Type definitions cho import.meta.env (VITE_*)
│   │   ├── index.css                 # Tailwind v4: @import "tailwindcss"; + .glass-panel
│   │   ├── App.tsx                   # Root component: switch(activeTab) render 7 pages
│   │   └── main.tsx                  # ReactDOM.createRoot() mount point
│   ├── index.html                    # SPA entry: Font Google Plus Jakarta Sans
│   ├── package.json                  # NPM dependencies (strict versions)
│   ├── tsconfig.json                 # TypeScript 5.7 strict config + vite/client types
│   ├── vite.config.ts                # Vite 6: react plugin + tailwindcss plugin + @ alias
│   └── .env.example                  # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ...
│
├── supabase/
│   └── migrations/
│       └── 20260812000000_initial_schema.sql  # DDL: Enums + 3 Tables + Indexes + RLS
│
├── .gitignore                        # Loại bỏ: node_modules, dist, venv, .env, __pycache__
├── Blueprint.md                      # Tài liệu kỹ thuật gốc (yêu cầu ban đầu)
├── GEMINI.md                         # Quy tắc hành vi Antigravity AI Agent
└── README.md                         # 📌 File này – Bản đồ dự án cho AI Coder
```

---

## 🛠️ Tech Stack Chi Tiết

### Frontend
| Thư Viện | Phiên Bản | Mục Đích |
|---|---|---|
| React | `19.0.0` | Core UI framework (React 19 hooks standard) |
| Vite | `6.2.x` | Build tool & Dev server |
| TypeScript | `5.7.x` | Strict type safety |
| Tailwind CSS | `4.0.x` | Utility-first CSS (`@import "tailwindcss";` – cú pháp v4) |
| Lucide React | `0.475.x` | UI Icon library |
| SheetJS (`xlsx`) | `0.18.5` | Client-side Excel export/import |
| Telegram SDK | `@telegram-apps/sdk-react: ^2.0.0` | Telegram Mini App integration |
| Supabase JS | `@supabase/supabase-js: ^2.48.x` | Realtime DB client |
| Recharts | `2.15.x` | Dashboard KPI charts |

### Backend
| Thư Viện | Phiên Bản | Mục Đích |
|---|---|---|
| Python | `3.11.9` | Runtime |
| FastAPI | `0.115.x` | Async REST API framework |
| Pydantic | `2.10.x` | Strict data validation & schemas |
| google-genai | `1.2.x` | Gemini AI SDK (primary model: `gemini-2.5-flash`) |
| google-generativeai | `^0.8.4` | Fallback Gemini SDK (`gemini-1.5-flash`) |
| python-telegram-bot | `21.10` | Async Bot + Inline Keyboard + JobQueue |
| python-keycloak | `5.1.x` | Keycloak Admin REST API wrapper |
| playwright | `1.50.x` | Headless Chromium cho LMS automation |
| supabase (python) | `2.12.x` | Python Supabase client |
| PyJWT | `2.10.x` | JWT token decode/verify |
| httpx | `0.28.x` | Async HTTP client (GitHub REST API calls) |
| uvicorn | `0.34.x` | ASGI server |

### Database (Supabase PostgreSQL 16)
| Table | Mục Đích |
|---|---|
| `inbox_tickets` | Unified Inbox – lưu tất cả ticket từ Gmail, Google Form, OS Ticket |
| `bot_automation_tasks` | Hàng chờ tác vụ bot – Human-in-the-Loop approval queue |
| `templates_config` | Cấu hình template custom cho GitHub Issues và XLSX export |

#### Enum Types
- `ticket_source`: `gmail` | `google_form` | `osticket`
- `ticket_category`: `bug` | `account_keycloak` | `lms_enroll` | `license` | `other`
- `ticket_priority`: `critical` | `normal`
- `ticket_status`: `pending` | `approved` | `processing` | `completed` | `dismissed`
- `bot_type`: `keycloak_api` | `lms_playwright` | `github_issue_creator` | `google_doc_comment`
- `approval_status`: `pending` | `approved` | `rejected`

---

## 🌐 API Endpoints Backend (FastAPI)

Base URL: `http://localhost:8000/api/v1`

| Method | Endpoint | Mục Đích |
|---|---|---|
| `GET` | `/` | Health check + Project info |
| `GET` | `/health` | Liveness probe cho deployment |
| `POST` | `/tickets/` | Nhận webhook ticket mới → Gemini triage |
| `GET` | `/tickets/` | Lấy danh sách ticket (filter theo status, category) |
| `GET` | `/tasks/` | Lấy danh sách tác vụ bot theo approval_status |
| `PUT` | `/tasks/{id}/approve` | Human-in-the-Loop: phê duyệt / từ chối + trigger worker |
| `GET` | `/bots/status` | Trạng thái real-time của các Workers |
| `POST` | `/bots/{id}/retry` | Trigger retry cho tác vụ thất bại |
| `POST` | `/github/create-issue` | Tạo GitHub Issue trong Private Repo |
| `GET` | `/reports/summary` | Dữ liệu tổng hợp KPI cho Dashboard |

Swagger UI: `http://localhost:8000/docs`

---

## 🖥️ Frontend Routing (7 Menu Modules)

Routing được quản lý bằng state `activeTab` trong `App.tsx` → `AppLayout.tsx` → `Sidebar.tsx`.

| activeTab | Component | Mục Đích |
|---|---|---|
| `dashboard` | `DashboardPage.tsx` | Executive KPI Dashboard + Recharts |
| `unified-inbox` | `UnifiedInboxPage.tsx` | Unified Inbox Feed + AI Triage Cards |
| `task-management` | `TaskManagementPage.tsx` | Task Queue + Human Approval Modal |
| `github-reporter` | `GithubReporterPage.tsx` | GitHub Issue Dispatcher Form |
| `bot-commander` | `BotCommanderPage.tsx` | Bot Workers Status + Terminal Logs |
| `reports-export` | `ReportsExportPage.tsx` | Analytics + XLSX Export (SheetJS) |
| `telegram-app` | `TelegramAppPage.tsx` | Telegram Mini App Mobile View |

---

## 🔐 Kiến Trúc Bảo Mật

1. **Domain Whitelist** (`backend/app/core/security.py`): Mọi JWT token phải chứa email domain `@dtt.vn`. Từ chối `403 Forbidden` nếu không đúng.
2. **Human-in-the-Loop** (`backend/app/workers/bot_executor.py`): Không có worker nào chạy khi `approval_status != 'approved'`.
3. **GitHub PAT Scoping** (`backend/app/services/github_service.py`): Chỉ dùng Fine-Grained PAT với scope `Issues: Read & Write` trên repo chỉ định.
4. **Environment Isolation**: Tất cả credential lưu trong `.env` (local) / Platform Env Vars (cloud Render.com). Không hardcode trong code.

---

## ⚡ Hướng Dẫn Khởi Chạy Development

### Backend (Port 8000)
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate     # Windows
pip install -r requirements.txt
cp .env.example .env        # Điền đầy đủ credentials
uvicorn app.main:app --reload --port 8000
```

### Frontend (Port 5173)
```bash
cd frontend
npm install
cp .env.example .env.local  # Điền VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY
npm run dev
```

### Database Setup (Supabase)
1. Vào Supabase Dashboard → SQL Editor
2. Copy & paste toàn bộ nội dung file `supabase/migrations/20260812000000_initial_schema.sql`
3. Execute → Tất cả bảng, enum, index và RLS policy được tạo tự động

---

## 📦 Biến Môi Trường Cần Thiết

### Backend (`.env`)
```env
PROJECT_NAME="Pythaverse Central Admin & Automation Hub"
ENV="development"
ALLOWED_DOMAIN="dtt.vn"

SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="..."

GEMINI_API_KEY="..."
GEMINI_PRIMARY_MODEL="gemini-2.5-flash"
GEMINI_FALLBACK_MODEL="gemini-1.5-flash"

TELEGRAM_BOT_TOKEN="..."
TELEGRAM_ADMIN_CHAT_ID="..."

KEYCLOAK_SERVER_URL="https://keycloak.example.com"
KEYCLOAK_REALM="master"
KEYCLOAK_ADMIN_USER="admin"
KEYCLOAK_ADMIN_PASS="..."

GITHUB_PAT="github_pat_xxxx"
GITHUB_DEFAULT_OWNER="pythaverse"
GITHUB_DEFAULT_REPO="private-tasks-repo"
```

### Frontend (`.env.local`)
```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="..."
VITE_API_BASE_URL="http://localhost:8000/api/v1"
VITE_ALLOWED_DOMAIN="dtt.vn"
```

---

## 🤖 Hướng Dẫn Cho AI Coder Mới (Quan Trọng)

### Nếu bạn là AI Agent tiếp cận dự án này lần đầu:

1. **Đọc `GEMINI.md`** (root) → Quy tắc hành vi bắt buộc của Antigravity AI
2. **Đọc `Blueprint.md`** (root) → Yêu cầu kỹ thuật gốc và luồng nghiệp vụ
3. **File quan trọng nhất Backend**: `backend/app/core/gemini.py` (AI engine), `backend/app/core/security.py` (domain guard), `backend/app/main.py` (app entry)
4. **File quan trọng nhất Frontend**: `frontend/src/App.tsx` (routing), `frontend/src/types/index.ts` (TypeScript interfaces)
5. **Khi thêm endpoint mới**: Tạo file trong `backend/app/api/v1/endpoints/` → Import và đăng ký tại `backend/app/api/v1/router.py`
6. **Khi thêm menu mới**: Tạo component trong `frontend/src/features/<tên-module>/` → Thêm route vào `App.tsx` → Thêm menu item vào `Sidebar.tsx`
7. **Khi thay đổi DB schema**: Tạo file migration mới trong `supabase/migrations/` với timestamp prefix → Cập nhật `backend/app/models/` và `frontend/src/types/index.ts` cho phù hợp

### Convention Code:
- **Backend**: `Controller (endpoints) → Service → Worker` – Không để business logic trong endpoint
- **Frontend**: `Page Component → Feature-specific sub-components → Common UI components`
- **CSS**: Chỉ dùng Tailwind v4 utility classes + custom `.glass-panel`, `.glass-card` trong `index.css`
- **Màu sắc**: Palette chính: `indigo-600` (primary), `cyan-400` (accent), `slate-950` (bg), `emerald-400` (success), `rose-500` (error)
- **Font**: `Plus Jakarta Sans` (Google Fonts – khai báo trong `index.html`)

> **⚠️ Quy tắc bắt buộc:** Khi AI Coder update/thêm bất kỳ file nào, **BẮT BUỘC cập nhật README.md** để tránh conflict thông tin. README.md là "source of truth" cho kiến trúc hệ thống.

---

## 📋 Lộ Trình Phát Triển (Blueprint Step-by-Step)

- [x] **Step 1**: Khởi tạo Supabase DB với DDL script PostgreSQL 16
- [x] **Step 2**: Scaffold React 19 + Vite 6 + Tailwind CSS v4 (7 menu routes + Telegram Mini App)
- [x] **Step 3**: Xây dựng FastAPI Backend: Gmail reader, Keycloak wrapper, GitHub dispatcher
- [x] **Step 4**: Tích hợp Gemini AI Engine với fallback model list
- [x] **Step 5**: Setup Telegram Bot với Inline Keyboard approval + Mini App link
- [x] **Step 6**: Client-side XLSX Exporter dùng SheetJS
- [ ] **Step 7**: TypeScript linting (`npm run lint`) + Python type check (`mypy`)
- [ ] **Step 8**: Triển khai production (Render.com / Vercel + Supabase Cloud)
- [ ] **Step 9**: Tích hợp thực tế Gmail API OAuth + Keycloak server
- [ ] **Step 10**: E2E Testing với Playwright

---

*README.md này được tự động cập nhật mỗi khi có thay đổi cấu trúc dự án. Last updated: 2026-08-12.*
