# 🚀 PTV Tasks Administrator – Pythaverse Central Admin & Automation Hub

> **Phiên bản:** 1.0.0 Enterprise Release  
> **Kiến trúc:** Monorepo (Frontend SPA React 19 + Backend FastAPI Python 3.11 + Supabase PostgreSQL 16 & Auth)  
> **Mục đích tài liệu:** Đây là bản đồ kiến trúc toàn diện và tra cứu chi tiết mã nguồn dành cho AI Coder / Developer. Đọc tài liệu này là đủ để nắm bắt 100% cấu trúc, chức năng của từng file, hàm, tham số, cơ sở dữ liệu và luồng nghiệp vụ mà không cần phải duyệt thủ công từng file riêng lẻ.

---

## 📑 Mục Lục
1. [Tổng Quan Hệ Thống & Triết Lý Vận Hành](#1-tổng-quan-hệ-thống--triết-lý-vận-hành)
2. [Sơ Đồ Luồng Tự Động Hóa End-to-End](#2-sơ-đồ-luồng-tự-động-hóa-end-to-end)
3. [Tech Stack & Danh Mục Công Nghệ Chi Tiết](#3-tech-stack--danh-mục-công-nghệ-chi-tiết)
4. [Bản Đồ Thư Mục Toàn Dự Án (Monorepo Map)](#4-bản-đồ-thư-mục-toàn-dự-án-monorepo-map)
5. [Chi Tiết Kiến Trúc Backend (Python 3.11 FastAPI)](#5-chi-tiết-kiến-trúc-backend-python-311-fastapi)
   - [5.1. Entrypoint & Background Scheduler (`backend/app/main.py`)](#51-entrypoint--background-scheduler-backendappmainpy)
   - [5.2. Cấu Hình & Bảo Mật Core (`backend/app/core/`)](#52-cấu-hình--bảo-mật-core-backendappcore)
   - [5.3. Bộ Não Trí Tuệ Nhân Tạo (`backend/app/core/gemini.py` & `knowledge_base.json`)](#53-bộ-não-trí-tuệ-nhân-tạo-backendappcoregeminipy--knowledge_basejson)
   - [5.4. Data Models & Schemas (`backend/app/models/`)](#54-data-models--schemas-backendappmodels)
   - [5.5. Hệ Thống Dịch Vụ Thu Thập & Tác Vụ (`backend/app/services/`)](#55-hệ-thống-dịch-vụ-thu-thập--tác-vụ-backendappservices)
   - [5.6. Workers Điều Phối Thực Thi (`backend/app/workers/`)](#56-workers-điều-phối-thực-thi-backendappworkers)
   - [5.7. REST API Endpoints Chi Tiết (`backend/app/api/v1/`)](#57-rest-api-endpoints-chi-tiết-backendappapiv1)
6. [Chi Tiết Cơ Sở Dữ Liệu Supabase (PostgreSQL 16)](#6-chi-tiết-cơ-sở-dữ-liệu-supabase-postgresql-16)
7. [Chi Tiết Kiến Trúc Frontend (React 19 + TypeScript + Tailwind CSS v4)](#7-chi-tiết-kiến-trúc-frontend-react-19--typescript--tailwind-css-v4)
   - [7.1. Định Tuyến & Quản Lý Phiên (`App.tsx` & `AuthContext.tsx`)](#71-định-tuyến--quản-lý-phiên-appsx--authcontexttsx)
   - [7.2. Cấu Hình Chủ Quyền Tác Giả (`authorConfig.ts`)](#72-cấu-hình-chủ-quyền-tác-giả-authorconfigts)
   - [7.3. Client Utilities & Type Definitions (`lib/` & `types/`)](#73-client-utilities--type-definitions-lib--types)
   - [7.4. Layout & Navigation Components (`components/`)](#74-layout--navigation-components-components)
   - [7.5. Chi Tiết Từng Tính Năng Giao Diện (`features/`)](#75-chi-tiết-từng-tính-năng-giao-diện-features)
8. [Quy Chuẩn Phát Triển & Hướng Dẫn Mở Rộng Cho AI / Developer](#8-quy-chuẩn-phát-triển--hướng-dẫn-mở-rộng-cho-ai--developer)
9. [Biến Môi Trường & Hướng Dẫn Khởi Chạy](#9-biến-môi-trường--hướng-dẫn-khởi-chạy)

---

## 1. Tổng Quan Hệ Thống & Triết Lý Vận Hành

`ptv-tasks-administrator` là nền tảng quản trị và tự động hóa tác vụ tập trung (Central Automation Hub) được thiết kế riêng cho hệ sinh thái tổ chức Pythaverse (`@dtt.vn`).

### Bài toán giải quyết
1. **Phân mảnh kênh tiếp nhận:** Yêu cầu hỗ trợ, báo lỗi, cấp tài khoản đến từ 3 nguồn rời rạc:
   - Hòm thư Gmail Google Workspace (`@dtt.vn`).
   - Biểu mẫu phản hồi Google Form (lưu trữ trên Google Sheets).
   - Hệ thống Helpdesk OS Ticket nội bộ (`support.pythaverse.space`).
2. **Quá tải xử lý thủ công:** Đội ngũ quản trị phải đọc từng email/ticket, phân loại, tìm tài liệu đính kèm, sau đó vào Keycloak reset mật khẩu hoặc vào LMS ghi danh học viên thủ công.
3. **Thiếu cổng kiểm soát an toàn:** Việc tự động hóa hoàn toàn có thể gây nguy cơ nếu AI phân tích sai (ví dụ: reset nhầm tài khoản, tạo sai issue).

### Triết lý cốt lõi (Core Principles)
- **Tập trung hóa (Unified Single Feed):** Mọi yêu cầu từ mọi nguồn đều được kéo về 1 bảng `inbox_tickets` duy nhất.
- **AI Triage & Tự Động Phân Loại:** Gemini AI tự động trích xuất thông tin, tóm tắt 2 câu tiếng Việt, phân loại (`bug`, `account_keycloak`, `lms_enroll`, `license`, `other`) và đề xuất nhân sự phụ trách dựa theo Knowledge Base nội bộ.
- **Human-in-the-Loop (Bắt buộc phê duyệt con người):** Tuyệt đối KHÔNG chạy trực tiếp các hành động can thiệp dữ liệu (Keycloak API, Playwright LMS, GitHub Issue) nếu chưa có trạng thái `approval_status = 'approved'` từ Quản trị viên trên Web SPA hoặc Telegram Mini App.
- **Bảo mật Domain Nghiêm Ngặt:** Chỉ duy nhất tài khoản Google thuộc domain `@dtt.vn` (cụ thể quản trị viên chính `hung.nguyenmanh@dtt.vn`) mới có quyền truy cập vào Admin Portal.

---

## 2. Sơ Đồ Luồng Tự Động Hóa End-to-End

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CÁC KÊNH TIẾP NHẬN ĐẦU VÀO                              │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│    Gmail API (OAuth2)    │  Google Sheets (Form Data)  │    OS Ticket (Playwright)     │
│   - Quét mail chưa đọc   │   - Quét dòng mới chưa gán  │   - Cào ticket Open Queue     │
│   - Bóc tách Attachment  │   - Bóc tách Google Doc URL │   - Bóc tách ID & full thread │
└─────────────┬────────────┴──────────────┬──────────────┴───────────────┬───────────────┘
              │                           │                              │
              │ (Mỗi 3 phút)              │ (Mỗi 5 phút)                 │ (Mỗi 5 phút)
              └───────────────────►───────┴──────────────◄───────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  FastAPI Background Engine            │
                      │  (APScheduler + safe_job_wrapper)     │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  Gemini AI Triage Engine              │
                      │  (Multi-model Fallback: 2.5/1.5/...)  │
                      │  - Tóm tắt tiếng Việt 2 câu           │
                      │  - Gán danh mục chuẩn xác             │
                      │  - Đề xuất người phụ trách            │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  Supabase PostgreSQL 16               │
                      │  - Bảng `inbox_tickets`               │
                      │  - Bucket `ticket-attachments`        │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  Telegram Bot Alert (Optional Push)   │
                      │  - Thông báo yêu cầu duyệt tác vụ     │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  HUMAN-IN-THE-LOOP CONTROL PORTAL     │
                      │  (React 19 SPA / Telegram Mini App)   │
                      │  - Xem tóm tắt, mở trực tiếp nguồn gốc│
                      │  - Đổi Category inline, xem file đính │
                      │  - Tạo & Duyệt Bot Automation Task    │
                      └───────────────────┬───────────────────┘
                                          │ (Admin bấm "Approve")
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  Cloud Worker Dispatcher              │
                      ├───────────────────────────────────────┤
                      │ ► Keycloak API: Reset pass/Create User│
                      │ ► Playwright LMS: Auto Course Enroll  │
                      │ ► GitHub API: Create Issue Repo riêng │
                      │ ► Google Sheet Sync: Update L/M/P cols│
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  Cập nhật trạng thái 'completed'      │
                      │  → Lưu log thực thi & phản hồi Admin  │
                      └───────────────────────────────────────┘
```

---

## 3. Tech Stack & Danh Mục Công Nghệ Chi Tiết

### 3.1. Frontend Single Page Application
| Thư Viện / Công Nghệ | Phiên Bản | Vai Trò & Mục Đích Sử Dụng |
|---|---|---|
| **React** | `19.0.0` | Thư viện UI cốt lõi, chuẩn hóa React 19 Hooks (`useState`, `useEffect`, `useContext`). |
| **Vite** | `6.2.0` | Build tool và Development Server hiệu năng cao với `@vitejs/plugin-react`. |
| **TypeScript** | `5.7.2` | Đảm bảo tính chặt chẽ về mặt kiểu dữ liệu cho toàn bộ Frontend Models & APIs. |
| **Tailwind CSS** | `4.0.0` | Framework CSS thế hệ mới với `@tailwindcss/vite`, cấu hình bằng cú pháp CSS-first `@import "tailwindcss";`. |
| **@supabase/supabase-js** | `2.48.0` | Client kết nối cơ sở dữ liệu Supabase Realtime và xử lý luồng Google OAuth SSO. |
| **Lucide React** | `0.475.0` | Bộ biểu tượng giao diện người dùng hiện đại, sắc nét. |
| **SheetJS (`xlsx`)** | `0.18.5` | Thư viện xử lý xuất dữ liệu báo cáo sang định dạng Excel (.xlsx) thuần phía client. |
| **Recharts** | `2.15.0` | Thư viện trực quan hóa dữ liệu biểu đồ KPI (PieChart, BarChart, ResponsiveContainer). |
| **@telegram-apps/sdk-react** | `2.0.0` | SDK tích hợp giao diện Telegram Mini App (TMA) trên thiết bị di động. |
| **clsx / tailwind-merge** | `2.1.1` / `3.0.1` | Tiện ích gộp class CSS có điều kiện và xử lý xung đột class Tailwind. |

### 3.2. Backend & Automation Engine
| Thư Viện / Công Nghệ | Phiên Bản | Vai Trò & Mục Đích Sử Dụng |
|---|---|---|
| **Python** | `3.11.x` | Runtime môi trường Backend chính thức. |
| **FastAPI** | `0.115.8` | Framework API bất đồng bộ (Async ASGI Web Framework) với OpenAPI tự động. |
| **Uvicorn** | `0.34.0` | ASGI Server hiệu năng cao chạy FastAPI application. |
| **APScheduler** | `3.10.4` | Bộ lập lịch tác vụ bất đồng bộ (`AsyncIOScheduler`) điều phối các cronjob ngầm 24/7. |
| **Pydantic / Pydantic-Settings** | `2.10.6` / `2.7.1` | Khởi tạo Data Schema, Request/Response validation và quản lý biến môi trường `BaseSettings`. |
| **google-generativeai / google-genai** | `0.8.4` / `1.2.0` | SDK chính thức gọi Google Gemini AI API với cơ chế tự động Fallback model khi cạn Quota. |
| **google-api-python-client / google-auth-oauthlib** | `2.163.0` / `1.2.1` | Kết nối Gmail API, Google Sheets API v4, Google Docs API v1 & Google Drive API v3. |
| **playwright** | `1.50.0` | Tự động hóa trình duyệt không đầu (Headless Chromium) để cào OS Ticket & giả lập thao tác LMS. |
| **supabase (Python)** | `2.12.0` | SDK Python tương tác với Supabase PostgreSQL qua Service Role Key và Storage API. |
| **python-keycloak** | `5.1.0` | Wrapper tương tác Keycloak Admin REST API phục vụ quản lý user/password. |
| **python-telegram-bot / httpx** | `21.10` / `0.28.1` | Gửi HTTP webhook, tương tác Telegram Bot API và GitHub REST API. |
| **PyJWT** | `2.10.1` | Giải mã và kiểm tra tính hợp lệ của JSON Web Token từ Supabase Auth. |

---

## 4. Bản Đồ Thư Mục Toàn Dự Án (Monorepo Map)

```
ptv-tasks-administrator/
├── .agent/                             # 🤖 Cấu hình Antigravity Framework & Specialized Agents
│   ├── agents/                         # Danh sách các AI Specialist Agents (.md)
│   ├── skills/                         # Các bộ kỹ năng mở rộng (Clean Code, UI/UX, Debugging...)
│   └── workflows/                      # Quy trình làm việc tự động (Plan, Verify, Coordinate...)
├── backend/                            # 🐍 MÃ NGUỒN BACKEND PYTHON FASTAPI
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── endpoints/
│   │   │       │   ├── bots.py         # API kiểm tra trạng thái & retry bot worker
│   │   │       │   ├── github.py       # API tạo GitHub Issue vào Private Repo
│   │   │       │   ├── reports.py      # API tính toán KPI thống kê từ Supabase
│   │   │       │   ├── tasks.py        # API quản lý hàng đợi & phê duyệt bot task
│   │   │       │   └── tickets.py      # API CRUD tickets, phân loại, tóm tắt AI
│   │   │       └── router.py           # Bộ gom APIRouter tổng hợp v1
│   │   ├── brain/
│   │   │   └── knowledge_base.json     # Cơ sở tri thức: danh mục, team members, keyword routing
│   │   ├── core/
│   │   │   ├── config.py               # Pydantic Settings đọc biến môi trường (.env)
│   │   │   ├── gemini.py               # Gemini AIEngine đa model với Auto-Fallback
│   │   │   ├── security.py             # Auth Bearer & kiểm tra whitelist domain @dtt.vn
│   │   │   └── supabase.py             # Singleton khởi tạo Supabase Python Client
│   │   ├── models/
│   │   │   ├── task.py                 # Pydantic schema cho Bot Automation Tasks
│   │   │   ├── template.py             # Pydantic schema cho Template Config
│   │   │   └── ticket.py               # Pydantic schema cho Unified Inbox Tickets
│   │   ├── services/
│   │   │   ├── github_service.py       # Dịch vụ gọi GitHub REST API tạo Issue
│   │   │   ├── gmail_service.py        # Dịch vụ quét Gmail, upload Attachment lên Storage
│   │   │   ├── google_doc_service.py   # Dịch vụ kiểm tra quyền & gắn comment Google Docs
│   │   │   ├── google_sheet_service.py # Dịch vụ quét Google Sheet & đồng bộ ngược dữ liệu
│   │   │   ├── keycloak_service.py     # Dịch vụ tương tác Keycloak REST API
│   │   │   ├── osticket_service.py     # Dịch vụ cào Playwright trên OS Ticket
│   │   │   ├── playwright_service.py   # Dịch vụ tự động hóa thao tác LMS
│   │   │   └── telegram_service.py     # Dịch vụ gửi thông báo & nút bấm Inline Telegram
│   │   ├── workers/
│   │   │   ├── bot_executor.py         # Router thực thi các tác vụ Bot sau khi được phê duyệt
│   │   │   └── ticket_processor.py     # Pipeline xử lý Ticket đầu vào kết hợp Gemini AI
│   │   └── main.py                     # File chạy chính: CORS, Lifespan Scheduler, Healthcheck
│   ├── .env.example                    # Mẫu cấu hình môi trường Backend
│   ├── Dockerfile                      # Cấu hình đóng gói Docker container cho Render/Server
│   └── requirements.txt                # Danh sách thư viện Python phụ thuộc
├── frontend/                           # ⚛️ MÃ NGUỒN FRONTEND REACT 19 SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Header.tsx          # Header cố định: Search, Badge verified, Profile, Logout
│   │   │   │   └── Sidebar.tsx         # Thanh điều hướng menu trái, Brand Logo, Link Landing
│   │   │   └── layout/
│   │   │       └── AppLayout.tsx       # Khung bố cục Admin bọc Sidebar + Header + Main Content
│   │   ├── config/
│   │   │   └── authorConfig.ts         # 📌 Cấu hình thông tin Tác Giả & Chủ Quyền Dự Án
│   │   ├── context/
│   │   │   └── AuthContext.tsx         # Supabase Auth Provider & Domain Whitelist Enforcer
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   └── LoginPage.tsx       # Trang Đăng Nhập độc quyền Google OAuth SSO
│   │   │   ├── bots/
│   │   │   │   └── BotCommanderPage.tsx# Trang giám sát Cloud Worker & Terminal logs
│   │   │   ├── dashboard/
│   │   │   │   └── DashboardPage.tsx   # Trang Executive Dashboard với biểu đồ Recharts
│   │   │   ├── github/
│   │   │   │   └── GithubReporterPage.tsx # Trang tạo Issue GitHub hỗ trợ AI Auto-fill
│   │   │   ├── inbox/
│   │   │   │   └── UnifiedInboxPage.tsx# Trang Hòm Thư Đa Kênh, Modal xem file, đổi Tag
│   │   │   ├── landing/
│   │   │   │   └── LandingPage.tsx     # Trang Chủ giới thiệu dự án & Hồ sơ Tác Giả
│   │   │   ├── reports/
│   │   │   │   └── ReportsExportPage.tsx # Trang xuất báo cáo Excel (.xlsx) với SheetJS
│   │   │   ├── tasks/
│   │   │   │   └── TaskManagementPage.tsx # Cổng Human-in-the-Loop duyệt payload JSON
│   │   │   └── telegram/
│   │   │       └── TelegramAppPage.tsx # Mô phỏng giao diện Telegram Mini App
│   │   ├── lib/
│   │   │   ├── api.ts                  # Hàm tiện ích fetchApi<T> gọi Backend
│   │   │   └── supabase.ts             # Khởi tạo Supabase JS Client Singleton
│   │   ├── types/
│   │   │   └── index.ts                # Định nghĩa toàn bộ TypeScript Interfaces & Types
│   │   ├── App.tsx                     # Điều phối Tab & Auth State Routing
│   │   ├── index.css                   # Tailwind CSS v4 root stylesheet
│   │   └── main.tsx                    # React Root Render Entrypoint
│   ├── index.html                      # HTML Template
│   ├── package.json                    # Cấu hình dependencies Frontend
│   └── vite.config.ts                  # Cấu hình Vite & Tailwind plugin
├── supabase/
│   └── migrations/
│       └── 20260812000000_initial_schema.sql # DDL Khởi tạo Database, Enums, Tables, RLS
├── Blueprint.md                        # Bản thiết kế kỹ thuật tổng thể
├── GEMINI.md                           # Bộ quy tắc định hình tư duy Agent
├── render.yaml                         # Cấu hình tự động triển khai hạ tầng Render.com
└── README.md                           # 📌 TÀI LIỆU NÀY (Single Source of Truth)
```

---

## 5. Chi Tiết Kiến Trúc Backend (Python 3.11 FastAPI)

### 5.1. Entrypoint & Background Scheduler (`backend/app/main.py`)
- **Khởi tạo ứng dụng:** Khởi tạo `app = FastAPI(title="Pythaverse Central Admin API", version="1.0.0", lifespan=lifespan)`.
- **Cơ chế Lifespan (`lifespan(app)`):**
  - Quản lý vòng đời khởi động/tắt máy của server thông qua `@asynccontextmanager`.
  - Khởi chạy `APScheduler` (`AsyncIOScheduler`) với 3 Cron Jobs quét ngầm:
    1. `poll_unread_gmails` (Quét Gmail API) – Tần suất: **Mỗi 3 phút**.
    2. `poll_open_ostickets` (Quét OS Ticket qua Playwright) – Tần suất: **Mỗi 5 phút**.
    3. `poll_form_feedbacks` (Quét Google Sheet phản hồi) – Tần suất: **Mỗi 5 phút**.
  - Khi server dừng, gọi `scheduler.shutdown()` để đóng các luồng an toàn.
- **Hàm bọc chống sập & dọn RAM (`safe_job_wrapper(job_func, job_name)`):**
  - Bọc toàn bộ các hàm quét trong khối `try...except` để nếu một kênh gặp lỗi mạng thì không làm sập tiến trình chính.
  - Khối `finally` luôn gọi `gc.collect()` (thu gom rác bộ nhớ), tối ưu hóa việc vận hành trên môi trường tài nguyên giới hạn (Render Free Tier 512MB RAM).
- **Cấu hình CORS:** Cho phép các nguồn `https://ptv-tasks-administrator.vercel.app`, `http://localhost:5173`, `http://localhost:3000` và wildcard trong môi trường Dev.
- **Endpoint kiểm tra trạng thái (`GET /api/v1/health`):** Dành riêng cho các dịch vụ ping giữ server thức (như UptimeRobot). Trả về trạng thái `status: "online"`, `scheduler_running: bool`, `active_jobs: int`.

---

### 5.2. Cấu Hình & Bảo Mật Core (`backend/app/core/`)

#### `config.py` – Quản lý biến môi trường (`Settings`)
Kế thừa từ `pydantic_settings.BaseSettings`, tự động đọc từ file `.env` với các nhóm biến chính:
- **Hệ thống:** `PROJECT_NAME`, `API_V1_STR` (`/api/v1`), `ENV` (`development`/`production`), `ALLOWED_DOMAIN` (`dtt.vn`).
- **Supabase:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Gemini AI:** `GEMINI_API_KEY`, `GEMINI_PRIMARY_MODEL` (`gemini-2.5-flash`), `GEMINI_FALLBACK_MODEL` (`gemini-1.5-flash`).
- **Telegram Bot:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`.
- **Keycloak:** `KEYCLOAK_SERVER_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASS`.
- **GitHub:** `GITHUB_PAT`, `GITHUB_DEFAULT_OWNER`, `GITHUB_DEFAULT_REPO`.

#### `security.py` – Xác thực & Ủy quyền
- `verify_dtt_domain_email(email: str) -> bool`: Kiểm tra phần domain sau dấu `@` có khớp chính xác với `settings.ALLOWED_DOMAIN` (`dtt.vn`) hay không.
- `get_current_user_email(credentials: HTTPAuthorizationCredentials) -> str`:
  - Giải mã JWT token từ header `Authorization: Bearer <token>`.
  - Trích xuất trường `email` hoặc `preferred_username`.
  - Ném lỗi `403 FORBIDDEN` nếu email không thuộc whitelist domain `@dtt.vn`.

#### `supabase.py` – Singleton Supabase Client
- `get_supabase_client() -> Client`: Khởi tạo và lưu cache đối tượng client Supabase với Service Role Key, đảm bảo quyền đọc/ghi vượt qua các chính sách bảo mật nội bộ phục vụ việc ingest dữ liệu từ background workers.

---

### 5.3. Bộ Não Trí Tuệ Nhân Tạo (`backend/app/core/gemini.py` & `knowledge_base.json`)

#### `gemini.py` – Lớp `AIEngine` & Cơ chế Multi-Model Fallback
- **Danh sách mô hình dự phòng (`GEMINI_MODELS`):**
  Thứ tự thử nghiệm: `gemini-3.6-flash` ➔ `gemini-3.5-flash-lite` ➔ `gemini-3.5-flash` ➔ `gemini-3.1-flash-lite` ➔ `gemini-3.1-pro-preview` ➔ `gemini-3-flash-preview` ➔ `gemini-pro-latest` ➔ `gemini-flash-latest` ➔ `gemini-flash-lite-latest`.
- **Phương thức `analyze_ticket(subject, raw_content, source) -> dict`:**
  - Gửi prompt hướng dẫn AI đóng vai trợ lý phân loại ticket cho Pythaverse.
  - Ép kiểu trả về định dạng JSON thuần (`response_mime_type="application/json"`):
    ```json
    {
      "category": "bug | account_keycloak | lms_enroll | license | other",
      "summary_vi": "Tóm tắt ngắn gọn 2 câu bằng tiếng Việt về vấn đề chính.",
      "assigned_name": "Tên người phụ trách đề xuất",
      "assigned_email": "Email người phụ trách"
    }
    ```
  - **Bẫy lỗi Quota & 429:** Nếu bắt gặp lỗi HTTP 429 hoặc `RESOURCE_EXHAUSTED`, hệ thống tự động ghi log cảnh báo và chuyển ngay sang model kế tiếp trong danh sách fallback mà không gây gián đoạn.
- **Hàm bất đồng bộ `process_ticket_with_ai(ticket_id: str)`:**
  - Đọc ticket từ bảng `inbox_tickets` trong Supabase theo `id`.
  - Gọi `AIEngine.analyze_ticket()`.
  - Cập nhật lại các trường `ai_summary`, `category`, `assigned_name`, `assigned_email` vào cơ sở dữ liệu.

#### `knowledge_base.json` – Cơ sở tri thức phân công
Lưu trữ ma trận phân công nhân sự nội bộ dựa trên từ khóa (Keywords):
- **Hung Nguyen** (`hung.nguyenmanh@dtt.vn`): Overall Lead & Administrator (admin, system, platform, general, default).
- **Jezer Diaz** (`jezer.diaz@example.com`): Support & Software Specialist (support ticket, access, workspace, account).
- **Bryan** (`bryan@example.com`): Software Lead & Hardware (website, leanbot, bluetooth, ipad, reseller demo).
- **Linh Đặng Thủy** (`linhdang@example.com`): Product & Curriculum Lead (e-certificate, curriculum, swrp, plearn, upload lessons).
- **Afiq** (`afiq@example.com`): Software Support (ide bluetooth, hostel students).

---

### 5.4. Data Models & Schemas (`backend/app/models/`)

#### `ticket.py`
- **Enums:**
  - `TicketSource`: `gmail`, `google_form`, `osticket`.
  - `TicketCategory`: `bug`, `account_keycloak`, `lms_enroll`, `license`, `other`.
  - `TicketPriority`: `critical`, `normal`.
  - `TicketStatus`: `pending`, `approved`, `processing`, `completed`, `dismissed`.
- **Pydantic Models:**
  - `TicketCreate`: Dùng khi nhận webhook tạo ticket mới (`source`, `source_id`, `sender_email`, `submitter_name`, `subject`, `raw_content`, `metadata`).
  - `TicketResponse`: Định dạng trả về client gồm đầy đủ các trường database cùng `created_at`, `updated_at`.

#### `task.py`
- **Enums:**
  - `BotType`: `keycloak_api`, `lms_playwright`, `github_issue_creator`, `google_doc_comment`.
  - `ApprovalStatus`: `pending`, `approved`, `rejected`.
- **Pydantic Models:**
  - `AutomationTaskCreate`: `ticket_id`, `bot_type`, `payload_data`.
  - `AutomationTaskApprovalUpdate`: `approval_status`, `edited_payload`.
  - `AutomationTaskResponse`: Trả về thông tin tác vụ kèm `execution_status` (`queued`, `running`, `success`, `failed`), `execution_logs`, thời gian tạo và thực thi.

#### `template.py`
- `TemplateConfigCreate` & `TemplateConfigResponse`: Quản lý mẫu markdown động (`template_key`, `name`, `content_markdown`, `fields_mapping`).

---

### 5.5. Hệ Thống Dịch Vụ Thu Thập & Tác Vụ (`backend/app/services/`)

#### 1. `gmail_service.py` – Quản lý kết nối & thu thập Gmail
- `get_gmail_service()`: Khởi tạo kết nối Google Gmail API v1 bằng `Refresh Token`. Điểm cải tiến quan trọng: Không ép biến `scopes` để Google tự động kế thừa scope gốc của Refresh Token, khắc phục hoàn toàn lỗi `invalid_scope`.
- `process_gmail_attachments(service, msg_id, payload) -> list`:
  - Duyệt đệ quy cây thư mục các phần MIME tử payload (`parts`).
  - Tải dữ liệu nhị phân file đính kèm (`attachments.get`).
  - Tự động upload lên Supabase Storage bucket `ticket-attachments` với đường dẫn `attachments/{msg_id}_{filename}`.
  - Lấy Public URL và trả về danh sách `[{"filename": "...", "url": "..."}]`.
- `upload_attachment_to_supabase(file_bytes: bytes, filename: str) -> str`:
  - Tự động nhận diện MIME type chính xác (`mimetypes.guess_type`, fallback cho `.pdf`, `.xlsx`, `.docx`) để tránh lỗi màn hình đen khi mở file trên trình duyệt.
- `poll_unread_gmails()`:
  - Quét danh sách email chưa đọc có nhãn `INBOX` (`is:unread label:INBOX`).
  - Bỏ qua các email đã tồn tại trong Supabase (`source = 'gmail'` AND `source_id = msg_id`).
  - Bóc tách tiêu đề, người gửi, thời gian, nội dung tóm lược (`snippet`) và tệp đính kèm.
  - Insert vào `inbox_tickets`, sau đó gọi `process_ticket_with_ai()` để chạy tóm tắt tự động.

#### 2. `google_sheet_service.py` – Quản lý phản hồi Google Form & Đồng bộ ngược
- `get_google_credentials()` & `get_sheets_service()`: Xác thực tài khoản dịch vụ Google Service Account từ chuỗi JSON `GOOGLE_CREDENTIALS_JSON`.
- `get_valid_sheet_name(service, spreadsheet_id, requested_name)`: Tự động phát hiện tab sheet hợp lệ giữa `Form_Responses` hoặc `Feedbacks`.
- `poll_form_feedbacks()`:
  - Đọc phạm vi dữ liệu từ dòng 2: `A2:P100`.
  - Ánh xạ các cột nghiệp vụ: Cột C (`COUNTRY`), D (`SUBMITTER`), F (`SUBJECT`), G (`REPORT GoogleDoc URL`), H (`REMARKS`), I (`FB ID`), M (`Assigned Checkbox`).
  - Bỏ qua các dòng đã được đánh dấu `Assigned = TRUE`.
  - Lưu vào Supabase với đầy đủ `country`, `doc_url`, `raw_content` và metadata dòng `row_index`.
  - Tự động kích hoạt AI phân tích tóm tắt.
- `update_feedback_row(sheet_name, row_index, category, status="To Implement")`:
  - **Đồng bộ ngược dữ liệu:** Khi Admin bấm Duyệt tác vụ trên giao diện Web hoặc Telegram, hàm này sẽ gọi Google Sheets API để ghi đè Cột L (`Category`), Cột M (`Assigned = TRUE`) và Cột P (`Status = "To Implement"`).

#### 3. `google_doc_service.py` – Đọc & Tương tác Google Docs
- `GoogleDocManager`:
  - `extract_doc_id(url: str) -> str`: Trích xuất Document ID qua Regular Expression `/d/([a-zA-Z0-9-_]+)`.
  - `check_comment_permission(doc_url: str) -> (bool, str)`: Kiểm tra quyền xem/nhận xét tài liệu thông qua Google Drive API (`capabilities.canComment`).
  - `read_doc_content(doc_url: str) -> (str, str)`: Đọc toàn bộ nội dung văn bản trong tài liệu Google Doc.
  - `add_comment_and_tag(doc_url: str, comment_text_en: str, tag_email: str) -> (bool, str)`: Tạo bình luận tự động và gắn thẻ tag `@email` nhân sự phụ trách vào tài liệu.

#### 4. `osticket_service.py` – Tự động hóa cào dữ liệu OS Ticket
- `poll_open_ostickets()`:
  - Khởi chạy Playwright Chromium ở chế độ không đầu (`headless=True`).
  - Tự động đăng nhập vào bảng điều khiển quản trị (`/scp/login.php`).
  - Điều hướng tới danh sách Open Queue (`/scp/tickets.php`).
  - **Tách biệt ID:** Trích xuất chính xác **Internal ID** từ thuộc tính đường dẫn (`id=3338`) và **Số hiệu hiển thị** (`965278`). Lưu Internal ID vào `source_id` để link bấm mở trực tiếp trên giao diện luôn điều hướng chuẩn 100%.
  - Mở trang chi tiết vé để lấy toàn bộ nội dung thảo luận (`.thread-body`).
  - Lưu vào Supabase kèm tên người gửi, mức độ ưu tiên và trigger AI tóm tắt.

#### 5. `telegram_service.py` – Thông báo & Nút Duyệt Telegram
- `TelegramService.send_approval_notification(task_id, ticket_summary, bot_type, payload) -> bool`:
  - Gửi tin nhắn Markdown tới Admin Chat ID kèm bàn phím tương tác Inline Keyboard: `[✅ Phê duyệt ngay (approve_{id})]` và `[❌ Từ chối (reject_{id})]`.

#### 6. `github_service.py` – Tạo GitHub Issue
- `GitHubDispatcherService.create_issue(payload) -> dict`:
  - Sử dụng GitHub Fine-Grained Personal Access Token (PAT).
  - Gửi request `POST https://api.github.com/repos/{owner}/{repo}/issues` với tiêu đề, nội dung Markdown và danh sách nhãn (`labels`).

#### 7. `keycloak_service.py` & `playwright_service.py`
- `KeycloakService.execute_account_action(payload)`: Wrapper gọi Keycloak Admin REST API để thực hiện thao tác quản trị tài khoản (`reset_password`, `disable_user`, `create_user`).
- `PlaywrightLMSService.enroll_student(payload)`: Tự động hóa đăng nhập cổng học tập LMS/PLearn và ghi danh học viên vào khóa học tương ứng.

---

### 5.6. Workers Điều Phối Thực Thi (`backend/app/workers/`)

#### `bot_executor.py` – Router điều phối tác vụ đã duyệt
- `execute_approved_bot_task(bot_type: str, payload_data: dict) -> dict`:
  - Nhận yêu cầu sau khi có phê duyệt từ con người.
  - Định tuyến tới đúng Service tương ứng: `keycloak_api` ➔ `keycloak_service`, `lms_playwright` ➔ `playwright_lms_service`, `github_issue_creator` ➔ `github_service`.

#### `ticket_processor.py` – Pipeline tiếp nhận & gắn kết AI
- `process_incoming_ticket(ticket_data: dict) -> dict`:
  - Nhận ticket từ webhook.
  - Kích hoạt Gemini Engine phân loại.
  - Gửi thông báo Telegram nếu phát hiện tác vụ tự động hóa tiềm năng.

---

### 5.7. REST API Endpoints Chi Tiết (`backend/app/api/v1/`)

Tất cả các route đều được gom tại `backend/app/api/v1/router.py` và gắn tiền tố `/api/v1`.

| Phương Thức | Endpoint URL | Mục Đích & Mô Tả Chi Tiết | File Xử Lý |
|---|---|---|---|
| `POST` | `/api/v1/tickets/` | Nhận webhook tạo ticket mới và kích hoạt AI triage. | `endpoints/tickets.py` |
| `GET` | `/api/v1/tickets/` | Lấy danh sách ticket từ Supabase. Hỗ trợ query params: `status`, `category`, `sort` (`desc`/`asc`), `days`. Mặc định ẩn các ticket có status `dismissed`. | `endpoints/tickets.py` |
| `PUT` | `/api/v1/tickets/{id}/dismiss` | Đánh dấu bỏ qua ticket (`status = 'dismissed'`). Nếu là Gmail, tự động đánh dấu đã đọc trên hòm thư gốc. | `endpoints/tickets.py` |
| `PUT` | `/api/v1/tickets/{id}/restore` | Khôi phục ticket bị bỏ qua về lại trạng thái `pending`. | `endpoints/tickets.py` |
| `POST` | `/api/v1/tickets/{id}/triage` | Ép buộc Gemini AI phân tích tóm tắt lại cho 1 ticket cụ thể. | `endpoints/tickets.py` |
| `POST` | `/api/v1/tickets/batch-triage` | Quét toàn bộ các ticket cũ trong DB chưa có tóm tắt (`ai_summary IS NULL`) và chạy AI hàng loạt. | `endpoints/tickets.py` |
| `PUT` | `/api/v1/tickets/{id}/category` | Cho phép Admin đổi trực tiếp Category/Tag của ticket từ giao diện Web. | `endpoints/tickets.py` |
| `GET` | `/api/v1/tasks/` | Lấy danh sách các tác vụ Bot từ bảng `bot_automation_tasks` kèm thông tin join của `inbox_tickets`. Hỗ trợ lọc theo `approval_status`. | `endpoints/tasks.py` |
| `POST` | `/api/v1/tasks/` | Tạo một tác vụ phê duyệt bot mới từ ticket với trạng thái ban đầu `approval_status = 'pending'`. | `endpoints/tasks.py` |
| `PUT` | `/api/v1/tasks/{id}/approve` | Phê duyệt tác vụ. Tự động đồng bộ ngược về Google Sheets (nếu là nguồn Google Form), cập nhật `approval_status = 'approved'`, `execution_status = 'success'` và đổi ticket status thành `completed`. | `endpoints/tasks.py` |
| `GET` | `/api/v1/bots/status` | Trả về trạng thái real-time của các Cloud Worker (Gmail Sync, Keycloak API, LMS Playwright, GitHub Dispatcher). | `endpoints/bots.py` |
| `POST` | `/api/v1/bots/{id}/retry` | Kích hoạt chạy lại (retry) thủ công cho một tác vụ bot bị thất bại. | `endpoints/bots.py` |
| `POST` | `/api/v1/github/create-issue` | Gửi yêu cầu tạo Issue tới GitHub REST API dựa trên thông tin người dùng nhập. | `endpoints/github.py` |
| `GET` | `/api/v1/reports/summary` | Truy vấn Supabase tính toán số liệu thống kê: tổng số ticket, số tác vụ chờ duyệt, số ticket hoàn thành trong tháng và tỷ lệ danh mục. | `endpoints/reports.py` |
| `GET` | `/api/v1/health` | Endpoint kiểm tra sức khỏe hệ thống và trạng thái hoạt động của Scheduler. | `main.py` |

---

## 6. Chi Tiết Cơ Sở Dữ Liệu Supabase (PostgreSQL 16)

Dữ liệu được quản lý tập trung trên Supabase PostgreSQL với file migration chính thức tại `supabase/migrations/20260812000000_initial_schema.sql`.

### 6.1. Các Kiểu ENUMs
```sql
CREATE TYPE ticket_source AS ENUM ('gmail', 'google_form', 'osticket');
CREATE TYPE ticket_category AS ENUM ('bug', 'account_keycloak', 'lms_enroll', 'license', 'other');
CREATE TYPE ticket_priority AS ENUM ('critical', 'normal');
CREATE TYPE ticket_status AS ENUM ('pending', 'approved', 'processing', 'completed', 'dismissed');
CREATE TYPE bot_type AS ENUM ('keycloak_api', 'lms_playwright', 'github_issue_creator', 'google_doc_comment');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
```

### 6.2. Cấu Trúc Bảng Dữ Liệu

#### 1. Bảng `inbox_tickets` (Hòm thư hợp nhất đa kênh)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Định danh duy nhất của ticket. |
| `source` | `ticket_source` | `NOT NULL` | Nguồn tiếp nhận (`gmail`, `google_form`, `osticket`). |
| `source_id` | `VARCHAR(255)` | - | ID trên hệ thống gốc (Message ID Gmail, FB ID Sheet, Internal ID OS Ticket). |
| `sender_email` | `VARCHAR(255)` | `NOT NULL` | Email người gửi yêu cầu. |
| `submitter_name` | `VARCHAR(255)` | - | Họ tên người gửi yêu cầu. |
| `subject` | `TEXT` | - | Tiêu đề email / chủ đề phản hồi / tên ticket. |
| `raw_content` | `TEXT` | `NOT NULL` | Nội dung văn bản thô đầy đủ từ nguồn gửi. |
| `ai_summary` | `TEXT` | - | Bản tóm tắt tiếng Việt 2 câu được Gemini AI tạo ra. |
| `category` | `ticket_category` | `DEFAULT 'other'` | Phân loại danh mục (hỗ trợ Admin chỉnh sửa trực tiếp). |
| `priority` | `ticket_priority` | `DEFAULT 'normal'` | Mức độ ưu tiên (`normal`, `critical`). |
| `status` | `ticket_status` | `DEFAULT 'pending'` | Trạng thái xử lý (`pending`, `completed`, `dismissed`, ...). |
| `country` | `VARCHAR(100)` | - | Quốc gia người gửi (dành riêng cho Google Form Feedback). |
| `doc_url` | `TEXT` | - | Đường dẫn Google Doc đính kèm trong báo cáo. |
| `assigned_name` | `VARCHAR(255)` | - | Tên nhân sự được AI đề xuất phụ trách. |
| `assigned_email` | `VARCHAR(255)` | - | Email nhân sự được AI đề xuất phụ trách. |
| `assigned_to` | `VARCHAR(255)` | - | Người được gán trên OS Ticket gốc. |
| `ticket_timestamp`| `VARCHAR(100)` | - | Thời gian gửi gốc định dạng chuỗi. |
| `attachments` | `JSONB` | `DEFAULT '[]'::jsonb` | Danh sách tệp đính kèm (`[{"filename": "...", "url": "..."}]`). |
| `metadata` | `JSONB` | `DEFAULT '{}'::jsonb` | Dữ liệu phụ: `row_index`, `sheet_name`, `ticket_number`... |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm record được lưu vào cơ sở dữ liệu. |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm cập nhật cuối cùng. |

#### 2. Bảng `bot_automation_tasks` (Hàng đợi phê duyệt tác vụ Bot)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Định danh duy nhất của tác vụ. |
| `ticket_id` | `UUID` | `REFERENCES inbox_tickets(id) ON DELETE CASCADE` | Khóa ngoại liên kết tới ticket gốc. |
| `bot_type` | `bot_type` | `NOT NULL` | Loại bot worker thực thi (`keycloak_api`, `lms_playwright`, ...). |
| `payload_data` | `JSONB` | `NOT NULL` | Tham số JSON thực thi để Admin duyệt/chỉnh sửa. |
| `approval_status`| `approval_status` | `DEFAULT 'pending'` | Trạng thái phê duyệt của Admin (`pending`, `approved`, `rejected`). |
| `execution_status`| `VARCHAR(50)` | `DEFAULT 'queued'` | Trạng thái chạy của bot (`queued`, `running`, `success`, `failed`). |
| `execution_logs` | `TEXT` | - | Nhật ký log chi tiết khi worker chạy. |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm tạo tác vụ. |
| `executed_at` | `TIMESTAMPTZ` | - | Thời điểm worker thực thi xong. |

#### 3. Bảng `templates_config` (Cấu hình mẫu báo cáo động)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Định danh template. |
| `template_key` | `VARCHAR(100)`| `UNIQUE NOT NULL` | Mã định danh template (VD: `github_issue_bug`). |
| `name` | `VARCHAR(255)`| `NOT NULL` | Tên hiển thị của template. |
| `content_markdown`| `TEXT` | `NOT NULL` | Nội dung cấu trúc Markdown mẫu. |
| `fields_mapping` | `JSONB` | `DEFAULT '[]'::jsonb` | Danh sách ánh xạ các trường dữ liệu. |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời gian cập nhật template. |

### 6.3. Tối Ưu Hóa Chỉ Mục (Indexes) & Supabase Storage Bucket
- **Chỉ mục:**
  - `CREATE INDEX idx_tickets_status ON inbox_tickets(status);`
  - `CREATE INDEX idx_tickets_category ON inbox_tickets(category);`
  - `CREATE INDEX idx_tasks_approval ON bot_automation_tasks(approval_status);`
- **Supabase Storage Bucket:** `ticket-attachments` (Chế độ Public) – Lưu trữ toàn bộ hình ảnh, tài liệu PDF, bảng tính đính kèm tải từ Gmail API.

---

## 7. Chi Tiết Kiến Trúc Frontend (React 19 + TypeScript + Tailwind CSS v4)

### 7.1. Định Tuyến & Quản Lý Phiên (`App.tsx` & `AuthContext.tsx`)

#### `App.tsx` – Điều phối điều hướng & Auth Guard
- Quản lý trạng thái tab hiện tại bằng `activeTab` (`landing`, `login`, `dashboard`, `unified-inbox`, `task-management`, `github-reporter`, `bot-commander`, `reports-export`, `telegram-app`).
- **Luồng điều hướng thông minh:**
  - Mọi người dùng đều có thể xem trang chủ `LandingPage` và `LoginPage`.
  - Sau khi đăng nhập Google OAuth thành công, `useEffect` tự động phát hiện `user` và chuyển hướng thẳng vào `dashboard`.
  - Nếu cố tình truy cập các tab Admin khi chưa đăng nhập, hệ thống sẽ hiển thị `LoginPage`.

#### `AuthContext.tsx` – Kiểm soát quyền truy cập nghiêm ngặt
- Cung cấp React Context: `user`, `loading`, `signInWithGoogle()`.
- Lắng nghe sự kiện đăng nhập qua `supabase.auth.onAuthStateChange`.
- **Enforce Whitelist Email:**
  ```ts
  const ALLOWED_ADMIN_EMAIL = "hung.nguyenmanh@dtt.vn";
  ```
  Nếu tài khoản đăng nhập không khớp với `hung.nguyenmanh@dtt.vn`, hệ thống sẽ lập tức hiển thị cảnh báo từ chối truy cập và tự động gọi `supabase.auth.signOut()`.

---

### 7.2. Cấu Hình Chủ Quyền Tác Giả (`authorConfig.ts`)

File cấu hình đặt tại `frontend/src/config/authorConfig.ts` dùng để cá nhân hóa và khẳng định bản quyền tác giả hiển thị tại Trang Chủ (`LandingPage`):
- `name`: "Nguyễn Mạnh Hùng" (Project Creator & Maintainer).
- `title`: "Lead AI Engineer & Automation Architect".
- `bio`: Giới thiệu năng lực thiết kế giải pháp Tự Động Hóa Doanh Nghiệp (Enterprise Automation Hub).
- `avatarUrl`: Ảnh đại diện tác giả.
- `socials`: Danh sách các liên kết mạng xã hội có thể click trực tiếp:
  - **GitHub:** `https://github.com/hungnm-1225`
  - **LinkedIn:** `https://linkedin.com/in/nguyenmanhhung`
  - **Facebook:** `https://facebook.com/hung.nguyenmanh`
  - **Email:** `mailto:hungnm@dtt.vn`
  - **Portfolio:** `https://pythaverse.space`
- `projectInfo`: Phiên bản, công nghệ và các điểm nổi bật của dự án.

---

### 7.3. Client Utilities & Type Definitions (`lib/` & `types/`)

#### `frontend/src/lib/api.ts`
- Hàm `fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T>`: Tự động gán header `Content-Type: application/json`, kết nối tới `VITE_API_BASE_URL` (mặc định `http://localhost:8000/api/v1`), kiểm tra lỗi HTTP và parse JSON kết quả.

#### `frontend/src/lib/supabase.ts`
- Khởi tạo client Supabase singleton thông qua `createClient(supabaseUrl, supabaseAnonKey)`.

#### `frontend/src/types/index.ts`
Định nghĩa đầy đủ các interface TypeScript: `InboxTicket`, `BotAutomationTask`, `TemplateConfig`, `CategoryRatio`, `ReportsSummary`, `BotWorkersStatusResponse`, `GithubIssuePayload`, `GithubIssueResponse`.

---

### 7.4. Layout & Navigation Components (`components/`)

#### `Sidebar.tsx`
- Cột điều hướng bên trái cố định (`h-screen sticky top-0`).
- Hiển thị logo thương hiệu Pythaverse Admin Automation Hub.
- Nút bấm nhanh về Trang Chủ `LandingPage`.
- Danh sách 7 module quản trị: Executive Dashboard, Unified Inbox Feed, Task & Approval Hub, GitHub Issue Dispatcher, Bot Execution Center, Analytics & XLSX Export, Telegram Mini App.

#### `Header.tsx`
- Thanh điều khiển phía trên với hiệu ứng làm mờ nền (`backdrop-blur-md`).
- Ô tìm kiếm toàn cục (Search Input).
- Nút tắt điều hướng về Trang Chủ.
- Huy hiệu bảo mật: `Verified @dtt.vn`.
- Hiển thị Avatar, Họ tên, Email Google của Admin và nút Đăng xuất (`LogOut`).

#### `AppLayout.tsx`
- Bố cục tổng thể kết hợp `Sidebar` và `Header` bao bọc lấy nội dung chính của từng module.

---

### 7.5. Chi Tiết Từng Tính Năng Giao Diện (`features/`)

#### 1. `LandingPage.tsx` (Trang Chủ Trình Diễn)
- Giao diện Dark mode sang trọng với các hiệu ứng ánh sáng mờ ambient blur blobs.
- Thanh Header công khai điều hướng nhanh tới các khu vực tính năng, kiến trúc và đăng nhập.
- Hero Section giới thiệu năng lực tự động hóa kết hợp Gemini AI.
- Khu vực **Chủ Quyền Tác Giả (Author Ownership Section)**: Thẻ thông tin lớn giới thiệu tác giả Nguyễn Mạnh Hùng với ảnh đại diện, chức danh, mô tả năng lực và hệ thống nút bấm mạng xã hội tương tác trực tiếp.

#### 2. `LoginPage.tsx` (Trang Đăng Nhập)
- Thẻ Card đăng nhập với huy hiệu giải thích quy tắc bảo mật chỉ cho phép tài khoản Google `@dtt.vn`.
- Nút bấm chính: **"Đăng Nhập Bằng Google OAuth"** kết nối trực tiếp với Supabase Auth Provider.

#### 3. `DashboardPage.tsx` (Executive Dashboard)
- 4 Thẻ KPI Real-time: Ticket Chờ Xử Lý, Tác Vụ Chờ Phê Duyệt, Đã Giải Quyết Tháng Này, System Health.
- Biểu đồ tròn Recharts (`PieChart`): Phân phối tỷ lệ ticket theo danh mục (`System Bugs`, `Keycloak Account`, `LMS Enroll`, `License`, `Others`).
- Biểu đồ cột Recharts (`BarChart`): Xu hướng xử lý ticket hàng ngày trong tuần.

#### 4. `UnifiedInboxPage.tsx` (Hòm Thư Hợp Nhất Đa Kênh)
- **Bộ lọc kép linh hoạt:**
  - Theo nguồn: `Tất cả Nguồn`, `✉️ Gmail`, `📝 Google Form`, `🎫 OS Ticket`.
  - Theo danh mục: `Tất cả Category`, `🐛 System Bugs`, `🔑 Keycloak/Account`, `🎓 LMS Enroll`, `📜 License`, `📌 Khác`, `🗑️ Đã Bỏ Qua`.
- **Nút đảo thứ tự sắp xếp:** Chuyển đổi nhanh giữa `Mới nhất ➔ Cũ nhất` và `Cũ nhất ➔ Mới nhất`.
- **Dropdown đổi Tag trực tiếp:** Cho phép Admin thay đổi Category của ticket ngay trên từng card và lưu tức thì vào Supabase.
- **Deep Link mở trang gốc:** Nút *"Mở trang gốc"* tự động tạo đường dẫn chính xác:
  - Gmail: Mở tìm kiếm theo Message ID (`mail.google.com/mail/u/0/#search/id%3A...`).
  - Google Form: Mở Google Sheet và bôi đen đúng dải ô dòng tương ứng (`range=A{row}:P{row}`).
  - OS Ticket: Mở đúng ticket qua Internal ID (`support.pythaverse.space/scp/tickets.php?id=...`).
- **Modal xem trước tệp đa năng (`FileViewerModal`):**
  - Xem ảnh trực tiếp (`png`, `jpg`, `webp`).
  - Xem tài liệu PDF nhúng trong `<iframe>`.
  - Xem tài liệu Word/Excel qua bộ nhúng Google Docs Viewer Embed.
  - Tải file về máy với 1 click.
- **Thẻ tóm tắt Gemini AI:** Hiển thị nội dung tóm tắt tiếng Việt và nhân sự được đề xuất phân công kèm email.
- **Xem nội dung gốc:** Hỗ trợ thu gọn / mở rộng toàn bộ nội dung thô ban đầu.
- **Nút hành động:** `[Bỏ qua]`, `[Khôi phục Hòm Thư]`, `[Tạo Tác Vụ Phê Duyệt Bot]`.

#### 5. `TaskManagementPage.tsx` (Cổng Kiểm Soát Human-in-the-Loop)
- Bảng danh sách các tác vụ Bot đang chờ phê duyệt.
- **Modal Phê Duyệt & Chỉnh Sửa Payload:** Mở trình soạn thảo JSON cho phép Admin kiểm tra, chỉnh sửa các tham số thực thi (email học viên, action keycloak, title bug...) trước khi bấm `Approve & Run Worker`.

#### 6. `BotCommanderPage.tsx` (Trung Tâm Điều Khiển Bot)
- Thẻ giám sát trạng thái 4 Cloud Worker: Gmail Sync Worker, Keycloak REST Worker, LMS Playwright Worker, GitHub Issue Dispatcher.
- Nút bấm `Retry` để khởi chạy lại tác vụ bị lỗi.
- Màn hình Terminal Console giả lập hiển thị live logs của hệ thống.

#### 7. `GithubReporterPage.tsx` (Tạo GitHub Issue)
- Form soạn thảo Issue gửi tới Private Repository.
- Nút tính năng **"AI Auto-Fill Bug Report"** tự động điền mẫu báo cáo lỗi chuẩn Markdown (Mô tả sự cố, Môi trường, Các bước tái hiện).
- Gửi trực tiếp tới GitHub REST API.

#### 8. `ReportsExportPage.tsx` (Xuất Báo Cáo Excel Phía Client)
- Lựa chọn Template xuất: Báo Cáo Tổng Hợp Ticket, Báo Cáo Nhật Ký Chạy Bot, Danh Sách Cấp Tài Khoản Keycloak.
- Bộ chọn khoảng ngày (Từ ngày - Đến ngày).
- Tích hợp thư viện SheetJS (`xlsx`) tạo và tải file `.xlsx` về máy ngay trên trình duyệt mà không cần xử lý nặng tại server.

#### 9. `TelegramAppPage.tsx` (Telegram Mini App Simulator)
- Khung mô phỏng giao diện di động trên Telegram, cho phép phê duyệt nhanh tác vụ qua nút bấm tối ưu cho màn hình cảm ứng.

---

## 8. Quy Chuẩn Phát Triển & Hướng Dẫn Mở Rộng Cho AI / Developer

Khi AI Assistant hoặc Developer tiếp tục phát triển hệ thống, BẮT BUỘC tuân thủ các nguyên tắc sau:

### 8.1. Thêm một Kênh Thu Thập (Ingestion Channel) Mới
1. **Viết Service:** Tạo file mới trong `backend/app/services/{ten}_service.py`. Định nghĩa hàm `poll_{ten}()`.
2. **Khai báo Cronjob:** Trong `backend/app/main.py`, thêm job vào `scheduler` bên trong hàm `lifespan()` thông qua `safe_job_wrapper`.
3. **Mở rộng ENUM Database:** Thêm giá trị mới vào `ticket_source` trong SQL migration.
4. **Cập nhật Frontend:** Thêm Badge và Deep Link trong `frontend/src/features/inbox/UnifiedInboxPage.tsx`.

### 8.2. Thêm một Bot Worker Mới
1. **Viết Service:** Tạo file trong `backend/app/services/{ten}_service.py` xử lý logic thực thi.
2. **Khai báo vào Executor:** Thêm nhánh `elif bot_type == "{ten}":` trong `backend/app/workers/bot_executor.py`.
3. **Mở rộng ENUM:** Thêm giá trị vào `bot_type` trong cơ sở dữ liệu.
4. **Cập nhật giao diện:** Bổ sung hiển thị trên `BotCommanderPage.tsx` và `TaskManagementPage.tsx`.

### 8.3. Quy Tắc Code Sạch & Bảo Mật (Clean Code Standards)
- Mọi hàm backend mới phải có chú thích docstring rõ ràng và type hinting đầy đủ.
- Tuyệt đối không hardcode mật khẩu, API key vào source code; mọi giá trị nhạy cảm phải nạp qua `app.core.config.settings`.
- Giữ nguyên cơ chế `Human-in-the-Loop`: Tuyệt đối không tự động kích hoạt hàm thực thi bot nếu chưa có xác nhận duyệt từ bảng `bot_automation_tasks`.

---

## 9. Biến Môi Trường & Hướng Dẫn Khởi Chạy

### 9.1. Danh Sách Biến Môi Trường Cần Thiết

#### Backend (`backend/.env`)
```env
# Project Core
PROJECT_NAME="Pythaverse Central Admin & Automation Hub"
ENV="development"
ALLOWED_DOMAIN="dtt.vn"

# Supabase Credentials
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-secret-key"

# Gemini AI API
GEMINI_API_KEY="your-gemini-api-key"

# Google Workspace / Gmail API / Google Sheet API
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GMAIL_REFRESH_TOKEN="your-gmail-oauth2-refresh-token"
GOOGLE_CREDENTIALS_JSON='{"type": "service_account", "project_id": "...", ...}'
SPREADSHEET_ID="1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go"

# OS Ticket Credentials
OSTICKET_URL="https://support.pythaverse.space/scp/login.php"
OSTICKET_ADMIN_USER="your-osticket-username"
OSTICKET_ADMIN_PASS="your-osticket-password"

# Telegram Bot
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
TELEGRAM_ADMIN_CHAT_ID="your-telegram-chat-id"

# Keycloak Admin
KEYCLOAK_SERVER_URL="https://auth.pythaverse.space"
KEYCLOAK_REALM="master"
KEYCLOAK_CLIENT_ID="admin-cli"
KEYCLOAK_ADMIN_USER="admin"
KEYCLOAK_ADMIN_PASS="your-keycloak-admin-password"

# GitHub Dispatcher
GITHUB_PAT="github_pat_your_fine_grained_token"
GITHUB_DEFAULT_OWNER="pythaverse"
GITHUB_DEFAULT_REPO="private-tasks-repo"
```

#### Frontend (`frontend/.env.local`)
```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
VITE_API_BASE_URL="http://localhost:8000/api/v1"
VITE_APP_URL="http://localhost:5173"
```

---

### 9.2. Hướng Dẫn Khởi Chạy Local Development

#### Khởi chạy Backend FastAPI (Cổng 8000):
```bash
# Di chuyển vào thư mục backend
cd backend

# Tạo và kích hoạt môi trường ảo Python
python -m venv venv
# Trên Windows:
.\venv\Scripts\activate
# Trên Linux/macOS:
source venv/bin/activate

# Cài đặt danh sách thư viện phụ thuộc
pip install -r requirements.txt

# Cài đặt trình duyệt cho Playwright
playwright install chromium

# Khởi chạy server FastAPI ở chế độ auto-reload
uvicorn app.main:app --reload --port 8000
```
Swagger UI tài liệu API sẽ khả dụng tại: `http://localhost:8000/docs`

#### Khởi chạy Frontend React SPA (Cổng 5173):
```bash
# Di chuyển vào thư mục frontend
cd frontend

# Cài đặt dependencies
npm install

# Khởi chạy dev server Vite
npm run dev
```
Truy cập giao diện tại: `http://localhost:5173`

---

*Tài liệu README.md này được biên soạn và chuẩn hóa toàn diện cho hệ thống PTV Tasks Administrator. Mọi cập nhật cấu trúc hệ thống cần được đồng bộ trực tiếp vào file này.*
