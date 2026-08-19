# 🚀 PTV Tasks Administrator – Pythaverse Central Admin & Automation Hub

> **Phiên bản:** 1.0.0 Enterprise Release  
> **Kiến trúc:** Monorepo (Frontend SPA React 19 + Backend FastAPI Python 3.11 + Supabase PostgreSQL 16 & Auth SSO + Cloud Bot Workers)  
> **Tác giả & Kiến trúc sư hệ thống:** Nguyễn Mạnh Hùng (Lead AI Engineer & Automation Architect – DTT Corporation / Pythaverse)  
> **Mục đích tài liệu:** Bản đồ kiến trúc toàn diện và tra cứu kỹ thuật chuẩn mực (Single Source of Truth) dành cho Developer và AI Coder. Tài liệu bóc tách 100% cấu trúc, chức năng từng file, danh sách hàm, tham số, logic cơ sở dữ liệu và luồng nghiệp vụ end-to-end mà không cần phải mở duyệt thủ công mã nguồn.

---

## 📑 Mục Lục Toàn Diện

1. [Tổng Quan Hệ Thống & Triết Lý Vận Hành](#1-tổng-quan-hệ-thống--triết-lý-vận-hành)
2. [Sơ Đồ Kiến Trúc & Luồng Tự Động Hóa End-to-End](#2-sơ-đồ-kiến-trúc--luồng-tự-động-hóa-end-to-end)
3. [Tech Stack & Danh Mục Công Nghệ Chi Tiết](#3-tech-stack--danh-mục-công-nghệ-chi-tiết)
4. [Bản Đồ Thư Mục Toàn Dự Án (Monorepo Directory Map)](#4-bản-đồ-thư-mục-toàn-dự-án-monorepo-directory-map)
5. [Chi Tiết Kiến Trúc Backend (Python 3.11 FastAPI)](#5-chi-tiết-kiến-trúc-backend-python-311-fastapi)
   - [5.1. Entrypoint & Background Scheduler (`backend/app/main.py`)](#51-entrypoint--background-scheduler-backendappmainpy)
   - [5.2. Cấu Hình & Bảo Mật Core (`backend/app/core/`)](#52-cấu-hình--bảo-mật-core-backendappcore)
   - [5.3. Bộ Não Trí Tuệ Nhân Tạo & Tri Thức Hệ Thống (`gemini.py` & `knowledge_base.json`)](#53-bộ-não-trí-tuệ-nhân-tạo--tri-thức-hệ-thống-geminipy--knowledge_basejson)
   - [5.4. Data Models & Schemas (`backend/app/models/`)](#54-data-models--schemas-backendappmodels)
   - [5.5. Hệ Thống Dịch Vụ Thu Thập, RPA & Tác Vụ (`backend/app/services/`)](#55-hệ-thống-dịch-vụ-thu-thập-rpa--tác-vụ-backendappservices)
   - [5.6. Workers Điều Phối Thực Thi (`backend/app/workers/`)](#56-workers-điều-phối-thực-thi-backendappworkers)
   - [5.7. REST API Endpoints Chi Tiết (`backend/app/api/v1/endpoints/`)](#57-rest-api-endpoints-chi-tiết-backendappapiv1endpoints)
6. [Chi Tiết Cơ Sở Dữ Liệu Supabase (PostgreSQL 16)](#6-chi-tiết-cơ-sở-dữ-liệu-supabase-postgresql-16)
   - [6.1. Kiểu Dữ Liệu ENUMs](#61-kiểu-dữ-liệu-enums)
   - [6.2. Cấu Trúc Chi Tiết Các Bảng Dữ Liệu](#62-cấu-trúc-chi-tiết-các-bảng-dữ-liệu)
   - [6.3. Tối Ưu Hóa Chỉ Mục (Indexes), RLS Policies & Storage Bucket](#63-tối-ưu-hóa-chỉ-mục-indexes-rls-policies--storage-bucket)
7. [Chi Tiết Kiến Trúc Frontend (React 19 + TypeScript + Tailwind CSS v4)](#7-chi-tiết-kiến-trúc-frontend-react-19--typescript--tailwind-css-v4)
   - [7.1. Định Tuyến & Điều Phối Ứng Dụng (`App.tsx`)](#71-định-tuyến--điều-phối-ứng-dụng-appsx)
   - [7.2. Quản Lý Ngữ Cảnh: Xác Thực & Giao Diện Sáng/Tối (`context/`)](#72-quản-lý-ngữ-cảnh-xác-thực--giao-diện-sángtối-context)
   - [7.3. Cấu Hình Chủ Quyền Tác Giả (`config/authorConfig.ts`)](#73-cấu-hình-chủ-quyền-tác-giả-configauthorconfigts)
   - [7.4. Client Utilities & Type Definitions (`lib/` & `types/`)](#74-client-utilities--type-definitions-lib--types)
   - [7.5. Layout & Navigation Components (`components/`)](#75-layout--navigation-components-components)
   - [7.6. Chi Tiết Từng Module Tính Năng Giao Diện (`features/`)](#76-chi-tiết-từng-module-tính-năng-giao-diện-features)
8. [Quy Chuẩn Phát Triển & Hướng Dẫn Mở Rộng Cho AI / Developer](#8-quy-chuẩn-phát-triển--hướng-dẫn-mở-rộng-cho-ai--developer)
9. [Biến Môi Trường (.env) & Hướng Dẫn Triển Khai Vận Hành](#9-biến-môi-trường-env--hướng-dẫn-triển-khai-vận-hành)

---

## 1. Tổng Quan Hệ Thống & Triết Lý Vận Hành

`ptv-tasks-administrator` là nền tảng quản trị tác vụ tập trung và tự động hóa thông minh (Central Automation Hub) được thiết kế và xây dựng riêng cho hệ sinh thái công nghệ giáo dục Pythaverse (`pythaverse.space`) thuộc Công ty Cổ phần Công nghệ DTT (`@dtt.vn`).

### 1.1. Ba Bài Toán Nghiệp Vụ Cốt Lõi Được Giải Quyết
1. **Phân mảnh kênh tiếp nhận yêu cầu (Multi-channel Fragmentation):**
   - **Gmail Google Workspace (`@dtt.vn`):** Thư yêu cầu hỗ trợ, cấp phép, đổi mật khẩu từ đối tác, giáo viên và phòng ban.
   - **Google Form / Google Sheets Feedbacks:** Biểu mẫu phản hồi lỗi từ người dùng kèm đường link Google Doc và thông tin quốc gia.
   - **Helpdesk OS Ticket (`support.pythaverse.space`):** Hệ thống ticketing nội bộ với hàng trăm ticket xử lý tài khoản, lỗi kỹ thuật LMS/PLearn, Workspace và Leanbot.
2. **Quá tải xử lý thủ công (Operational Bottleneck):**
   - Đội ngũ quản trị viên và QA phải đọc từng email/ticket, phân loại bằng mắt, trích xuất dữ liệu, sau đó đăng nhập thủ công vào Keycloak để reset mật khẩu, vào Moodle LMS để ghi danh học viên, hoặc vào GitHub để tạo Bug Issue.
3. **Thiếu cổng kiểm soát an toàn (Risk of Blind Automation):**
   - Việc để AI tự động thực thi các hành vi can thiệp hệ thống (reset mật khẩu, phân quyền, đóng mở ticket) mà không có sự kiểm tra của con người tiềm ẩn nguy cơ bảo mật nghiêm trọng.

### 1.2. Bốn Triết Lý Vận Hành Hệ Thống (Core Principles)
- **Hợp Nhất Nguồn Cấp (Unified Single Feed):** Toàn bộ email, biểu mẫu phản hồi và ticket từ mọi nguồn đều được các tiến trình nền tự động thu thập và đồng bộ về bảng duy nhất `inbox_tickets` trên Supabase PostgreSQL.
- **Phân Loại & Tóm Tắt Tự Động (Gemini AI Multi-Model Triage):** Sử dụng Google Gemini AI Engine với cơ chế tự động Fallback 10 tầng mô hình để tóm tắt 2 câu tiếng Việt, phân loại chuẩn xác 5 danh mục (`bug`, `account_keycloak`, `lms_enroll`, `license`, `other`) và tự động khớp nhân sự phụ trách theo `knowledge_base.json`.
- **Phê Duyệt Con Người Tuyệt Đối (Human-in-the-Loop Safeguard):** Không có bất kỳ tác vụ can thiệp hệ thống nào (Keycloak API, Playwright RPA, GitHub Issue) được thực thi nếu chưa có trạng thái `approval_status = 'approved'` do Quản trị viên bấm duyệt và chỉnh sửa tham số JSON Payload trên Web SPA hoặc Telegram Mini App.
- **Bảo Mật Xác Thực Miền Doanh Nghiệp (@dtt.vn Domain Whitelist):** Kiểm soát nghiêm ngặt tầng Frontend (Supabase Auth Listener) và Backend (JWT Bearer Token verification), từ chối và tự động đăng xuất tất cả các tài khoản không thuộc quyền quản trị viên `hung.nguyenmanh@dtt.vn`.

---

## 2. Sơ Đồ Kiến Trúc & Luồng Tự Động Hóa End-to-End

### 2.1. Sơ Đồ Khối Luồng Dữ Liệu Toàn Cục (End-to-End Architecture)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CÁC KÊNH TIẾP NHẬN ĐẦU VÀO (INGESTION)                    │
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
                      │  - Thu gom RAM (gc.collect())         │
                      │  - Bẫy lỗi không làm sập server       │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  Gemini AI Triage Engine              │
                      │  (10-Model Auto Fallback)             │
                      │  - Tóm tắt tiếng Việt ngắn gọn 2 câu  │
                      │  - Phân loại danh mục chuẩn xác       │
                      │  - Khớp Assignee từ knowledge_base    │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  Supabase Cloud Engine                │
                      │  - PostgreSQL 16 (inbox_tickets)      │
                      │  - Storage Bucket: ticket-attachments │
                      │  - RLS Policies (@dtt.vn Whitelist)   │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  Telegram Bot Alert (Push Alert)      │
                      │  - Gửi thông báo kèm Inline Keyboard  │
                      │  - Nút bấm: [Approve] | [Reject]      │
                      └───────────────────┬───────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  HUMAN-IN-THE-LOOP CONTROL PORTAL     │
                      │  (React 19 SPA / Telegram Mini App)   │
                      │  - Xem tóm tắt, mở trực tiếp nguồn gốc│
                      │  - Đổi Category inline, xem file đính │
                      │  - Soạn/Sửa JSON Payload tác vụ Bot   │
                      └───────────────────┬───────────────────┘
                                          │ (Admin bấm "Approve & Run Worker")
                                          ▼
                      ┌────────────────────────────────────────────────────────┐
                      │                 CLOUD BOT WORKERS DISPATCHER           │
                      ├────────────────────────────────────────────────────────┤
                      │ ► Keycloak Identity Bot: Reset Pass / Disable / Verify │
                      │ ► Workspace License RPA: Bulk Users / Order / Contract │
                      │ ► LMS & Git Worker: Ghi danh khóa học / Seeding SSO    │
                      │ ► GitHub Dispatcher: Tạo Issue Markdown vào Repo Kín   │
                      │ ► Sheet & Doc Triage: Update L/M/P & @mention Doc      │
                      └───────────────────┬────────────────────────────────────┘
                                          │
                                          ▼
                      ┌───────────────────────────────────────┐
                      │  ĐỒNG BỘ NGƯỢC & HOÀN TẤT VÒNG ĐỜI    │
                      │  - Ticket status -> 'completed'       │
                      │  - Cập nhật execution_logs chi tiết   │
                      │  - Đánh dấu đã đọc trên Gmail gốc     │
                      │  - Ghi đè Cột L, M, P trên Google Sheet│
                      └───────────────────────────────────────┘
```

---

## 3. Tech Stack & Danh Mục Công Nghệ Chi Tiết

### 3.1. Frontend & Client-Side Stack
| Công nghệ / Package | Phiên bản | Vai trò & Mục đích sử dụng trong hệ thống |
|---|---|---|
| **React** | `19.0.0` | Thư viện giao diện chính, áp dụng chuẩn React 19 Hooks (`useState`, `useEffect`, `useCallback`, `useContext`, `useRef`). |
| **Vite** | `6.2.0` | Công cụ đóng gói (Build Tool) và Development Server tốc độ cao với `@vitejs/plugin-react`. |
| **TypeScript** | `5.7.2` | Đảm bảo tính an toàn kiểu dữ liệu (Strict Type Safety) cho toàn bộ interfaces, models và API clients. |
| **Tailwind CSS** | `4.0.0` | Framework CSS thế hệ mới tích hợp qua `@tailwindcss/vite`, cấu hình bằng cú pháp CSS-first `@import "tailwindcss";`. |
| **React Router DOM** | `7.18.2` | Hệ thống định tuyến SPA phía Client (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `NavLink`, `useLocation`). |
| **@supabase/supabase-js** | `2.48.0` | SDK tương tác Supabase Client, lắng nghe phiên đăng nhập Google OAuth SSO và truy vấn dữ liệu Realtime. |
| **Lucide React** | `0.475.0` | Bộ biểu tượng giao diện người dùng hiện đại, sắc nét cho toàn bộ Dashboard và các Modules. |
| **SheetJS (`xlsx`)** | `0.18.5` | Thư viện xử lý xuất dữ liệu Báo Cáo KPI DTT 3Đ sang file Excel (.xlsx) thuần phía client không tốn tài nguyên server. |
| **Recharts** | `2.15.0` | Thư viện trực quan hóa dữ liệu biểu đồ KPI (`ResponsiveContainer`, `PieChart`, `Pie`, `Cell`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `Legend`). |
| **Sonner** | `2.0.8` | Hệ thống thông báo Toast Notification hiện đại, hỗ trợ rich colors và tự động thích ứng Dark/Light theme. |
| **@telegram-apps/sdk-react**| `2.0.0` | SDK tích hợp giao diện và phản hồi xúc giác (Haptic Feedback) cho Telegram Mini App (TMA). |
| **clsx / tailwind-merge** | `2.1.1` / `3.0.1` | Tiện ích gộp class CSS có điều kiện và xử lý xung đột class Tailwind CSS. |

### 3.2. Backend & Automation Engine Stack
| Công nghệ / Package | Phiên bản | Vai trò & Mục đích sử dụng trong hệ thống |
|---|---|---|
| **Python** | `3.11.x` | Môi trường runtime chính thức của Backend. |
| **FastAPI** | `0.115.8` | Async Web Framework hiệu năng cao, tự động sinh tài liệu Swagger UI OpenAPI tại `/docs`. |
| **Uvicorn** | `0.34.0` | ASGI Web Server tiêu chuẩn chạy ứng dụng FastAPI đa luồng bất đồng bộ. |
| **APScheduler** | `3.10.4` | `AsyncIOScheduler` điều phối các tác vụ chạy ngầm định kỳ 24/7 (Gmail, OS Ticket, Google Sheets, Live Site Monitor). |
| **Pydantic / Settings** | `2.10.6` / `2.7.1` | Kiểm thực cấu trúc dữ liệu (Data Validation) và quản lý nạp biến môi trường an toàn qua `BaseSettings`. |
| **google-generativeai** | `0.8.4` / `1.2.0` | SDK chính thức gọi Google Gemini AI API với thuật toán Auto-Fallback qua danh sách 10 model. |
| **google-api-python-client** | `2.163.0` | Kết nối Gmail API v1, Google Sheets API v4, Google Docs API v1 và Google Drive API v3. |
| **google-auth-oauthlib** | `1.2.1` | Xử lý xác thực OAuth2 Refresh Token cho Gmail và Service Account Credentials JSON cho Drive/Docs/Sheets. |
| **playwright** | `1.50.0` | Trình duyệt không đầu (Headless Chromium) dùng để cào OS Ticket và chạy RPA tự động hóa luồng Workspace/LMS. |
| **supabase (Python)** | `2.12.0` | SDK Python kết nối cơ sở dữ liệu PostgreSQL và Supabase Storage Bucket qua Service Role Key. |
| **python-keycloak** | `5.1.0` | Thư viện wrapper tương tác trực tiếp với Keycloak Admin REST API phục vụ quản trị tài khoản người dùng. |
| **python-telegram-bot** | `21.10` | Điều khiển Telegram Bot, gửi tin nhắn cảnh báo và xử lý callback phê duyệt Inline Keyboard. |
| **httpx** | `0.28.1` | HTTP Client bất đồng bộ gọi GitHub REST API, Telegram API và kiểm tra Live Uptime các Website. |
| **PyJWT** | `2.10.1` | Giải mã và kiểm tra tính hợp lệ của JSON Web Token từ Supabase Auth. |
| **pytz** | `2025.x` | Chuẩn hóa múi giờ Việt Nam (`Asia/Ho_Chi_Minh`) cho toàn bộ nhật ký sự cố và báo cáo. |

---

## 4. Bản Đồ Thư Mục Toàn Dự Án (Monorepo Directory Map)

```
ptv-tasks-administrator/
├── .agent/                             # 🤖 Bộ khung AI Specialist Agents & Workflows
│   ├── agents/                         # Định nghĩa vai trò chuyên gia (frontend, backend, security...)
│   ├── skills/                         # Kỹ năng mở rộng (clean-code, ui-ux-pro-max, debugging...)
│   └── workflows/                      # Quy trình làm việc tự động hóa
├── backend/                            # 🐍 MÃ NGUỒN BACKEND PYTHON FASTAPI
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── endpoints/
│   │   │       │   ├── bots.py         # [API] Trạng thái 6 Workers, Terminal Logs & Retry task
│   │   │       │   ├── github.py       # [API] Tạo GitHub Issue, AI Generate Bug Template chuyên sâu
│   │   │       │   ├── monitor.py      # [API] Quản lý Site Uptime Monitor, Check Live, Lịch sử 45 ngày
│   │   │       │   ├── reports.py      # [API] Thống kê KPI, Xu hướng ngày, Trích xuất dữ liệu Báo cáo 3Đ
│   │   │       │   ├── tasks.py        # [API] Lấy danh sách task, Tạo task, Phê duyệt (Approve/Reject)
│   │   │       │   └── tickets.py      # [API] CRUD ticket, Phân loại Tag, Bỏ qua, Khôi phục, Triage AI
│   │   │       └── router.py           # Bộ gom APIRouter tổng hợp prefix /api/v1
│   │   ├── brain/
│   │   │   └── knowledge_base.json     # Cơ sở tri thức: Categories, Team Members, 7 Phân hệ Pythaverse
│   │   ├── core/
│   │   │   ├── config.py               # Pydantic BaseSettings đọc biến môi trường (.env)
│   │   │   ├── gemini.py               # Gemini AIEngine đa model với thuật toán Auto-Fallback 10 tầng
│   │   │   ├── security.py             # HTTPBearer & kiểm tra Whitelist Domain @dtt.vn
│   │   │   └── supabase.py             # Singleton khởi tạo Supabase Python Client (Service Role)
│   │   ├── models/
│   │   │   ├── task.py                 # Pydantic Schemas & Enums cho Bot Automation Tasks
│   │   │   ├── template.py             # Pydantic Schemas cho Cấu hình Template Động
│   │   │   └── ticket.py               # Pydantic Schemas & Enums cho Unified Inbox Tickets
│   │   ├── services/
│   │   │   ├── github_service.py       # Dịch vụ gửi Issue vào Private Repo qua GitHub REST API
│   │   │   ├── gmail_service.py        # Quét Gmail, bóc tách tệp & upload Storage bucket có MIME type
│   │   │   ├── google_doc_service.py   # Kiểm tra quyền, đọc nội dung và @mention tag comment Google Docs
│   │   │   ├── google_sheet_service.py # Quét Form Sheet, lưu Supabase và đồng bộ ngược Cột L/M/P
│   │   │   ├── keycloak_service.py     # Wrapper Keycloak Admin REST API (Reset pass, Disable, Verify)
│   │   │   ├── osticket_service.py     # Playwright cào OS Ticket, bóc tách Internal ID & Display Number
│   │   │   ├── playwright_service.py   # Tự động hóa ghi danh khóa học Moodle LMS / PLearn
│   │   │   ├── site_monitor_service.py # Giám sát Uptime Live 10 Website, SSO Login check & Downtime tracking
│   │   │   ├── telegram_service.py     # Gửi tin nhắn Telegram kèm Inline Keyboard nút duyệt nhanh
│   │   │   ├── workspace_lineage_service.py   # Giải mã phả hệ School -> Partner -> Distributor Credentials
│   │   │   └── workspace_playwright_service.py# RPA tự động hóa luồng Order & Contract trên Workspace
│   │   ├── workers/
│   │   │   ├── bot_executor.py         # Router thực thi các tác vụ Bot sau khi được phê duyệt
│   │   │   └── ticket_processor.py     # Pipeline xử lý Ticket đầu vào kết hợp Gemini AI
│   │   └── main.py                     # Entrypoint: Lifespan 4 Cronjobs, CORS Middleware, Health Check
│   ├── .env.example                    # Mẫu cấu hình biến môi trường Backend
│   ├── Dockerfile                      # Dockerfile triển khai Container đa nền tảng (Playwright Ready)
│   └── requirements.txt                # Danh sách thư viện Python phụ thuộc cố định phiên bản
├── frontend/                           # ⚛️ MÃ NGUỒN FRONTEND REACT 19 SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Header.tsx          # Header cố định: Search, Theme Toggle, Profile, Logout
│   │   │   │   └── Sidebar.tsx         # Menu điều hướng bên trái với 8 modules và Brand Logo
│   │   │   └── layout/
│   │   │       └── AppLayout.tsx       # Khung bố cục chuẩn bọc Sidebar + Header + Outlet nội dung
│   │   ├── config/
│   │   │   └── authorConfig.ts         # 📌 Cấu hình thông tin Tác Giả & Khẳng định Chủ Quyền Dự Án
│   │   ├── context/
│   │   │   ├── AuthContext.tsx         # Supabase Auth Provider & Domain Whitelist Enforcer (@dtt.vn)
│   │   │   └── ThemeContext.tsx        # Quản lý chế độ Giao diện Sáng / Tối (Light / Dark Theme)
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   └── LoginPage.tsx       # Trang Đăng nhập Google OAuth SSO độc quyền @dtt.vn
│   │   │   ├── bots/
│   │   │   │   └── BotCommanderPage.tsx# Giám sát 6 Workers, Terminal Logs & Điều khiển chạy lại
│   │   │   ├── dashboard/
│   │   │   │   └── DashboardPage.tsx   # Executive Dashboard: 4 KPI Cards, PieChart, BarChart
│   │   │   ├── github/
│   │   │   │   └── GithubReporterPage.tsx # Tạo GitHub Issue có AI Auto-Fill kết hợp QA Notes
│   │   │   ├── inbox/
│   │   │   │   └── UnifiedInboxPage.tsx# Hòm thư đa kênh, Modal xem file đa năng, Đổi Tag trực tiếp
│   │   │   ├── landing/
│   │   │   │   └── LandingPage.tsx     # Trang chủ giới thiệu nền tảng & Hồ sơ Tác Giả Nguyễn Mạnh Hùng
│   │   │   ├── monitor/
│   │   │   │   └── SiteMonitorPage.tsx # Giám sát Uptime Live 10 Website, Uptime Bars 45 ngày, Incident Log
│   │   │   ├── reports/
│   │   │   │   └── ReportsExportPage.tsx # Xuất Báo Cáo KPI DTT 3Đ sang Excel (.xlsx) với SheetJS
│   │   │   ├── tasks/
│   │   │   │   └── TaskManagementPage.tsx # Cổng Human-in-the-Loop: Soạn/Sửa JSON Payload trước khi duyệt
│   │   │   └── telegram/
│   │   │       └── TelegramAppPage.tsx # Mô phỏng giao diện di động Telegram Mini App (TMA)
│   │   ├── lib/
│   │   │   ├── api.ts                  # Tiện ích gọi fetchApi<T> kết nối Backend kèm xử lý lỗi
│   │   │   └── supabase.ts             # Khởi tạo Supabase JS Client Singleton
│   │   ├── types/
│   │   │   └── index.ts                # Định nghĩa toàn bộ TypeScript Interfaces và Data Types
│   │   ├── App.tsx                     # Định tuyến React Router DOM và ProtectedRoute Guard
│   │   ├── index.css                   # Root stylesheet với cú pháp Tailwind CSS v4
│   │   └── main.tsx                    # React Root Entrypoint bọc StrictMode
│   ├── index.html                      # HTML5 Template
│   ├── package.json                    # Khai báo dependencies Frontend và npm scripts
│   ├── tsconfig.json                   # Cấu hình TypeScript Compiler
│   ├── vercel.json                     # Cấu hình Vercel SPA Rewrite Rules
│   └── vite.config.ts                  # Cấu hình Vite Build Tool và Tailwind Vite Plugin
├── supabase/                           # 🗄️ MÃ NGUỒN CƠ SỞ DỮ LIỆU SUPABASE POSTGRESQL
│   ├── migrations/
│   │   └── 20260812000000_initial_schema.sql # DDL Khởi tạo Enums, Tables, Indexes, RLS
│   └── schema.sql                      # Đặc tả Schema hoàn chỉnh kèm giải thích chi tiết
├── Blueprint.md                        # Bản thiết kế kỹ thuật tổng thể ban đầu của dự án
├── GEMINI.md                           # Bộ quy tắc định hình tư duy Agent & Routing chuyên gia
├── render.yaml                         # File Blueprint triển khai hạ tầng tự động trên Render.com
└── README.md                           # 📌 TÀI LIỆU NÀY (Bản đồ kiến trúc & Tra cứu kỹ thuật chuẩn mực)
```

---

## 5. Chi Tiết Kiến Trúc Backend (Python 3.11 FastAPI)

### 5.1. Entrypoint & Background Scheduler (`backend/app/main.py`)

#### 1. Khởi tạo Ứng dụng & Async Lifespan
- **Ứng dụng:** `app = FastAPI(title="Pythaverse Central Admin API", version="1.0.0", lifespan=lifespan)`.
- **Cơ chế Lifespan (`lifespan(app: FastAPI)`):**
  - Quản lý vòng đời chạy ngầm của Server bằng `@asynccontextmanager`.
  - Khởi tạo và kích hoạt bộ lập lịch `scheduler = AsyncIOScheduler()`.
  - Đăng ký **4 Cron Jobs** chạy ngầm 24/7:
    1. `poll_unread_gmails` (Quét Gmail API) – Tần suất: **Mỗi 3 phút** (`id='gmail_cron'`).
    2. `poll_open_ostickets` (Quét OS Ticket qua Playwright) – Tần suất: **Mỗi 5 phút** (`id='osticket_cron'`).
    3. `poll_form_feedbacks` (Quét Google Sheet phản hồi) – Tần suất: **Mỗi 5 phút** (`id='sheet_cron'`).
    4. `poll_site_uptime_cron` (Quét Live Uptime các Website) – Tần suất: **Mỗi 1 giờ** (`id='site_uptime_cron'`).
  - Khi server tắt, kích hoạt `scheduler.shutdown()` để giải phóng luồng an toàn.

#### 2. Hàm bọc an toàn & Thu gom RAM (`safe_job_wrapper(job_func, job_name: str)`)
- **Mục đích:** Đảm bảo khi một trong các dịch vụ bên ngoài (Gmail, OS Ticket, Google Sheets) gặp sự cố mạng hoặc timeout thì không làm sập ứng dụng chính.
- **Cơ chế dọn dẹp RAM:** Khối `finally` luôn thực thi lệnh `gc.collect()` (Python Garbage Collector), giúp giải phóng ngay bộ nhớ nhị phân sau khi cào web bằng Playwright hoặc tải attachment – giải pháp sống còn trên môi trường máy chủ miễn phí giới hạn tài nguyên (Render 512MB RAM).

#### 3. Cấu hình CORS Middleware
- Cho phép kết nối từ các Origin: `https://ptv-tasks-administrator.vercel.app`, `http://localhost:5173`, `http://localhost:3000` và wildcard `*` trong chế độ phát triển.
- Hỗ trợ đầy đủ các phương thức HTTP: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`, `HEAD`.

#### 4. Health Check Endpoint (`GET /api/v1/health`)
- **Mục đích:** Dành riêng cho các dịch vụ ping giữ server sống 24/7 (như UptimeRobot hoặc Cron-job.org).
- **Phản hồi:**
  ```json
  {
    "status": "online",
    "scheduler_running": true,
    "active_jobs": 4
  }
  ```

---

### 5.2. Cấu Hình & Bảo Mật Core (`backend/app/core/`)

#### 1. `config.py` – Quản lý biến môi trường (`Settings`)
Kế thừa từ `pydantic_settings.BaseSettings`, tự động đọc và ép kiểu từ file `.env`:
- **Hệ thống:** `PROJECT_NAME`, `API_V1_STR` (`/api/v1`), `ENV` (`development`/`production`), `ALLOWED_DOMAIN` (`dtt.vn`).
- **Supabase:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Gemini AI:** `GEMINI_API_KEY`, `GEMINI_PRIMARY_MODEL` (`gemini-3.7-flash`), `GEMINI_FALLBACK_MODEL` (`gemini-3.6-flash`).
- **Telegram Bot:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`.
- **Keycloak:** `KEYCLOAK_SERVER_URL`, `KEYCLOAK_REALM` (`idp`/`master`), `KEYCLOAK_CLIENT_ID` (`admin-cli`), `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASS`.
- **GitHub Dispatcher:** `GITHUB_PAT`, `GITHUB_DEFAULT_OWNER`, `GITHUB_DEFAULT_REPO`.

#### 2. `security.py` – Xác thực & Kiểm soát Whitelist Miền Doanh Nghiệp
- `verify_dtt_domain_email(email: str) -> bool`: Tách chuỗi sau ký tự `@`, chuyển về chữ thường và so sánh chính xác với `settings.ALLOWED_DOMAIN` (`dtt.vn`).
- `get_current_user_email(credentials: HTTPAuthorizationCredentials) -> str`:
  - Giải mã JSON Web Token (JWT) từ Header `Authorization: Bearer <token>`.
  - Trích xuất claim `email` hoặc `preferred_username`.
  - Ném ngoại lệ HTTP `403 FORBIDDEN` nếu email không thuộc miền `@dtt.vn`.

#### 3. `supabase.py` – Singleton Supabase Python Client
- `get_supabase_client() -> Client`: Khởi tạo và lưu cache đối tượng Client của Supabase sử dụng `SUPABASE_SERVICE_ROLE_KEY`. Cho phép các background workers đọc/ghi dữ liệu toàn quyền vượt qua RLS.

---

### 5.3. Bộ Não Trí Tuệ Nhân Tạo & Tri Thức Hệ Thống (`gemini.py` & `knowledge_base.json`)

#### 1. `gemini.py` – Lớp `AIEngine` & Thuật Toán Auto-Fallback 10 Tầng
- **Danh sách 10 mô hình Gemini dự phòng (`GEMINI_MODELS`):**
  1. `gemini-3.7-flash` (Mô hình thế hệ mới nhất, ưu tiên cao nhất)
  2. `gemini-3.6-flash`
  3. `gemini-3.5-flash-lite`
  4. `gemini-3.5-flash`
  5. `gemini-3.1-flash-lite`
  6. `gemini-3.1-pro-preview`
  7. `gemini-3-flash-preview`
  8. `gemini-pro-latest`
  9. `gemini-flash-latest`
  10. `gemini-flash-lite-latest`
- **Phương thức `analyze_ticket(subject: str, raw_content: str, source: str) -> dict`:**
  - Gửi prompt hướng dẫn AI phân tích nội dung ticket.
  - Ép kiểu định dạng đầu ra chuẩn JSON (`response_mime_type="application/json"`):
    ```json
    {
      "category": "bug | account_keycloak | lms_enroll | license | other",
      "summary_vi": "Tóm tắt ngắn gọn 2 câu bằng tiếng Việt về vấn đề chính.",
      "assigned_name": "Tên nhân sự phụ trách",
      "assigned_email": "Email nhân sự phụ trách"
    }
    ```
  - **Bẫy lỗi Quota & 429:** Tự động bắt các lỗi `429`, `quota`, `resource_exhausted` để chuyển ngay sang model kế tiếp trong danh sách fallback mà không gây gián đoạn luồng xử lý.
- **Hàm bất đồng bộ `process_ticket_with_ai(ticket_id: str)`:**
  - Đọc thông tin ticket từ bảng `inbox_tickets` trong Supabase theo `ticket_id`.
  - Kích hoạt `AIEngine.analyze_ticket()`.
  - Cập nhật lại các trường `ai_summary`, `category`, `assigned_name`, `assigned_email` vào Supabase.

#### 2. `knowledge_base.json` – Cơ Sở Tri Thức & Ma Trận Phân Hệ
Chứa toàn bộ ma trận phân công nhân sự và đặc tả kiến trúc 7 phân hệ chính của Pythaverse:
- **Ma trận Nhân sự (Team Members):**
  - `Hung Nguyen` (`hung.nguyenmanh@dtt.vn`): Overall Lead & Administrator (keywords: general, admin, system, platform, default).
  - `Jezer Diaz` (`jezer.diaz@example.com`): Support & Software Specialist (keywords: support ticket, access, workspace, account).
  - `Bryan` (`bryan@example.com`): Software Lead & Hardware (keywords: website, leanbot, bluetooth, ipad, reseller demo).
  - `Linh Đặng Thủy` (`linhdang@example.com`): Product & Curriculum Lead (keywords: e-certificate, curriculum, swrp, plearn, upload lessons).
  - `Afiq` (`afiq@example.com`): Software Support (keywords: ide bluetooth, hostel students).
- **Đặc tả Kỹ thuật 7 Phân Hệ Pythaverse (`systems`):**
  1. **Workspace (`pythaverse.space`):** Nền tảng phân quyền đa cấp (Admin > Distributor > Partner > School > Teacher/Student). Giao dịch License giữa Admin-Distributor-Partner là Contract; School lên Partner là Order.
  2. **PLearn LMS (`learn.pythaverse.space`):** Moodle LMS (PHP / MariaDB / REST WebServices). Quản lý khóa học, bài học và ghi danh học viên/giáo viên.
  3. **PGit (`git.pythaverse.space`):** Gitea Engine lưu trữ mã nguồn. Bắt buộc user phải đăng nhập SSO ít nhất 1 lần để hệ thống seeding tài khoản.
  4. **Keycloak Auth IDP (`eid.pythaverse.space`):** Cổng xác thực tập trung OAuth2/OIDC (Realm: `idp` / `master`). Quản trị reset password, disable/enable, gỡ verified email.
  5. **Leanbot / Hardware (`ide.pythaverse.space`):** Blockly Web IDE / App Inventor + Bluetooth BLE Companion APK.
  6. **Support Helpdesk (`support.pythaverse.space`):** osTicket Helpdesk Engine (PHP / MySQL).
  7. **PContest (`contest.pythaverse.space`):** Hệ thống thi đấu trực tuyến, nộp bài code và Leaderboard.

---

### 5.4. Data Models & Schemas (`backend/app/models/`)

#### 1. `ticket.py`
- **Enums:**
  - `TicketSource`: `gmail`, `google_form`, `osticket`.
  - `TicketCategory`: `bug`, `account_keycloak`, `lms_enroll`, `license`, `other`.
  - `TicketPriority`: `critical`, `normal`.
  - `TicketStatus`: `pending`, `approved`, `processing`, `completed`, `dismissed`.
- **Pydantic Models:**
  - `TicketCreate`: `source`, `source_id`, `sender_email`, `submitter_name`, `subject`, `raw_content`, `metadata`.
  - `TicketResponse`: Định dạng trả về client với đầy đủ các trường database cùng `created_at`, `updated_at`.

#### 2. `task.py`
- **Enums:**
  - `BotType`: `keycloak_api`, `workspace_rpa`, `lms_playwright`, `github_issue_creator`, `google_doc_comment`, `feedback_doc_triage`.
  - `ApprovalStatus`: `pending`, `approved`, `rejected`.
- **Pydantic Models:**
  - `AutomationTaskCreate`: `ticket_id`, `bot_type`, `payload_data`.
  - `AutomationTaskApprovalUpdate`: `approval_status`, `edited_payload`.
  - `AutomationTaskResponse`: Trả về thông tin tác vụ kèm `execution_status` (`queued`, `running`, `success`, `failed`), `execution_logs`, thời gian tạo và thực thi.

#### 3. `template.py`
- `TemplateConfigCreate` & `TemplateConfigResponse`: Quản lý mẫu markdown động (`template_key`, `name`, `content_markdown`, `fields_mapping`).

---

### 5.5. Hệ Thống Dịch Vụ Thu Thập, RPA & Tác Vụ (`backend/app/services/`)

#### 1. `gmail_service.py` – Thu Thập & Upload Attachment
- `get_gmail_service()`: Khởi tạo Google Gmail API v1 bằng `Refresh Token`. Điểm cải tiến kỹ thuật: Không truyền tham số `scopes` cố định để Google tự động kế thừa scope gốc của Refresh Token, khắc phục hoàn toàn lỗi `invalid_scope`.
- `process_gmail_attachments(service, msg_id, payload) -> list`:
  - Duyệt đệ quy cây thư mục MIME payload (`parts`).
  - Tải dữ liệu nhị phân file đính kèm (`attachments.get`).
  - Upload lên Supabase Storage bucket `ticket-attachments` với đường dẫn `attachments/{msg_id}_{filename}`.
  - Lấy Public URL và trả về danh sách `[{"filename": "...", "url": "..."}]`.
- `upload_attachment_to_supabase(file_bytes: bytes, filename: str) -> str`:
  - Tự động nhận diện MIME type chính xác (`mimetypes.guess_type`, fallback cho `.pdf`, `.xlsx`, `.docx`) để tránh lỗi màn hình đen khi mở file trên trình duyệt.
- `poll_unread_gmails()`:
  - Quét danh sách email chưa đọc có nhãn `INBOX` (`is:unread label:INBOX`).
  - Bỏ qua các email đã tồn tại trong Supabase (`source = 'gmail'` AND `source_id = msg_id`).
  - Trích xuất tiêu đề, người gửi, thời gian, snippet và attachment, lưu vào `inbox_tickets`, kích hoạt `process_ticket_with_ai()`.

#### 2. `google_sheet_service.py` – Quét Biểu Mẫu & Đồng Bộ Ngược L/M/P
- `get_google_credentials()` & `get_sheets_service()`: Xác thực tài khoản dịch vụ Google Service Account từ `GOOGLE_CREDENTIALS_JSON`.
- `get_valid_sheet_name(service, spreadsheet_id, requested_name)`: Tự động phát hiện tab sheet hợp lệ giữa `Form_Responses` hoặc `Feedbacks`.
- `poll_form_feedbacks()`:
  - Đọc dải dữ liệu `A2:P100`.
  - Ánh xạ cột: Cột C (`COUNTRY`), D (`SUBMITTER`), F (`SUBJECT`), G (`REPORT GoogleDoc`), H (`REMARKS`), I (`FB ID`), M (`Assigned Checkbox`).
  - Bỏ qua dòng đã đánh dấu `Assigned = TRUE`.
  - Lưu vào Supabase với `country`, `doc_url`, `raw_content` và metadata `row_index`, sau đó kích hoạt AI tóm tắt.
- `update_feedback_row(sheet_name, row_index, category, status="To Implement")`:
  - **Đồng bộ ngược dữ liệu:** Khi Admin bấm Duyệt tác vụ, hàm gọi Google Sheets API để ghi đè Cột L (`Category`), Cột M (`Assigned = TRUE`) và Cột P (`Status = "To Implement"`).

#### 3. `google_doc_service.py` – Đọc & Tương Tác Google Docs (`GoogleDocManager`)
- `extract_doc_id(url: str) -> str`: Trích xuất Document ID qua biểu thức chính quy `/d/([a-zA-Z0-9-_]+)`.
- `check_comment_permission(doc_url: str) -> (bool, str)`: Kiểm tra quyền xem/nhận xét tài liệu thông qua Google Drive API (`capabilities.canComment`).
- `read_doc_content(doc_url: str) -> (str, str)`: Đọc toàn bộ nội dung văn bản trong tài liệu Google Doc.
- `add_comment_and_tag(doc_url: str, comment_text_en: str, tag_email: str) -> (bool, str)`: Tạo bình luận tự động và gắn thẻ tag `Cc: +email` nhân sự phụ trách vào tài liệu.

#### 4. `osticket_service.py` – Cào Dữ Liệu OS Ticket Bằng Playwright
- `poll_open_ostickets()`:
  - Khởi chạy Playwright Chromium ở chế độ không đầu (`headless=True`).
  - Đăng nhập vào bảng điều khiển quản trị (`/scp/login.php`).
  - Điều hướng tới Open Queue (`/scp/tickets.php`).
  - **Bóc tách ID phân biệt:** Trích xuất chính xác **Internal ID** từ thuộc tính đường dẫn (`id=3338`) và **Số hiệu hiển thị** (`965278`). Lưu Internal ID vào `source_id` để link mở trực tiếp trên giao diện luôn hoạt động chuẩn 100%.
  - Mở trang chi tiết vé để lấy toàn bộ nội dung thread (`.thread-body`), lưu vào Supabase và kích hoạt AI triage.

#### 5. `keycloak_service.py` – Quản Trị Tài Khoản Keycloak REST API
- `KeycloakService`:
  - `_get_admin_client()`: Kết nối `KeycloakAdmin` với `server_url`, `admin_user`, `admin_pass`, `realm_name`.
  - `_find_user_id(keycloak_admin, identifier)`: Tìm kiếm user UUID theo email hoặc username.
  - `execute_account_action(payload)`: Thực thi các hành động:
    1. `reset_password` / `change_password`: Đặt mật khẩu mới qua `admin_client.set_user_password()`.
    2. `disable_user`: Vô hiệu hóa tài khoản (`enabled=False`).
    3. `enable_user`: Kích hoạt lại tài khoản (`enabled=True`).
    4. `verify_email`: Đánh dấu email đã xác thực (`emailVerified=True`).
    5. `change_display_name`: Cập nhật `firstName` và `lastName`.
    - Hỗ trợ chế độ Safe Simulation nếu chưa cấu hình mật khẩu Admin.

#### 6. `github_service.py` – Tạo Issue Trên GitHub REST API
- `GitHubDispatcherService.create_issue(payload) -> dict`:
  - Sử dụng GitHub Fine-Grained Personal Access Token (PAT).
  - Gửi request `POST https://api.github.com/repos/{owner}/{repo}/issues` với `title`, `body` (Markdown), `labels` và `assignees`.

#### 7. `site_monitor_service.py` – Giám Sát Uptime Live 10 Website & Keycloak SSO
- Giám sát danh sách 10 website hệ sinh thái Pythaverse:
  1. `pythaverse_main`: `https://pythaverse.space/` (check login SSO Keycloak)
  2. `ide`: `https://ide.pythaverse.space/#/`
  3. `avatar`: `https://avatar.pythaverse.space/`
  4. `note`: `https://note.pythaverse.space/`
  5. `git`: `https://git.pythaverse.space/dashboard/repos`
  6. `contest`: `https://contest.pythaverse.space/contest`
  7. `digitaltwin`: `https://digitaltwin.pythaverse.space/`
  8. `learn`: `https://learn.pythaverse.space/my/`
  9. `learn_s`: `https://learn-s.pythaverse.space/my/` (Staging)
  10. `iot`: `https://iot.pythaverse.space/`
- `check_single_site(site)`: Gửi request HTTP kiểm tra mã phản hồi, đo độ trễ (latency ms), kiểm tra token Keycloak SSO đối với site yêu cầu, ghi nhận bắt đầu/kết thúc sự cố DOWN vào Supabase `site_downtime_events`.
- `check_all_sites()`: Kiểm tra đồng thời toàn bộ website bằng `asyncio.gather()`.
- `get_uptime_history(site_id, days=45)`: Tính toán lịch sử Uptime từng ngày phục vụ hiển thị Uptime Bars.
- `get_incident_log(limit=50)`: Trích xuất danh sách các sự cố sập web gần nhất.

#### 8. `workspace_lineage_service.py` & `workspace_playwright_service.py`
- `WorkspaceLineageResolver.resolve_hierarchy_by_school_name(school_name)`: Tự động truy vấn quan hệ phả hệ tổ chức từ database `workspace_organizations` để tìm đúng credentials của School -> Partner -> Distributor.
- `WorkspacePlaywrightService`: RPA tự động hóa các thao tác trên Workspace:
  - `school_create_order(credentials, order_data)`: Đăng nhập School Workspace, tạo Order nhiều môn học kèm ngày bắt đầu/kết thúc và số lượng license.
  - `partner_approve_school_order(credentials, order_id)`: Partner duyệt Order và chọn Pool License.
  - `distributor_approve_partner_contract(credentials, contract_code)`: Distributor duyệt Contract.
  - `admin_approve_distributor_contract(credentials, contract_code, justification)`: Sales Admin phê duyệt Contract kèm ghi chú Justification.

#### 9. `telegram_service.py` – Gửi Cảnh Báo Telegram Kèm Nút Bấm
- `TelegramService.send_approval_notification(task_id, ticket_summary, bot_type, payload)`: Gửi tin nhắn Markdown tới Quản trị viên qua Telegram Bot kèm Inline Keyboard nút bấm `[✅ Phê duyệt ngay]` và `[❌ Từ chối]`.

---

### 5.6. Workers Điều Phối Thực Thi (`backend/app/workers/`)

#### 1. `bot_executor.py` – Bộ Điều Phối Tác Vụ Đã Duyệt
- `execute_approved_bot_task(bot_type: str, payload_data: dict)`:
  - Tiếp nhận tác vụ sau khi có phê duyệt của Admin.
  - Định tuyến và kích hoạt đúng Service thực thi:
    - `keycloak_api` ➔ `keycloak_service.execute_account_action()`
    - `workspace_rpa` ➔ `workspace_playwright_service` (tạo order hoặc duyệt contract)
    - `github_issue_creator` ➔ `github_service.create_issue()`
    - `google_doc_comment` / `feedback_doc_triage` ➔ `google_sheet_service` & `google_doc_service`

#### 2. `ticket_processor.py` – Pipeline Tiếp Nhận & Gắn Kết AI
- `process_incoming_ticket(ticket_data: dict) -> dict`: Nhận ticket từ webhook/kênh tiếp nhận, kích hoạt Gemini AI triage, đề xuất loại bot và gửi thông báo Telegram nếu cần phê duyệt.

---

### 5.7. REST API Endpoints Chi Tiết (`backend/app/api/v1/endpoints/`)

Tất cả các route đều được đăng ký tại `backend/app/api/v1/router.py` với tiền tố `/api/v1`.

| Phương thức | Endpoint URL | Mục đích & Chi tiết xử lý | File xử lý |
|---|---|---|---|
| `POST` | `/api/v1/tickets/` | Nhận webhook tạo ticket mới và kích hoạt AI triage. | `tickets.py` |
| `GET` | `/api/v1/tickets/` | Lấy danh sách ticket từ Supabase. Query params: `status`, `category`, `sort` (`desc`/`asc`), `days`. Mặc định ẩn status `dismissed`. | `tickets.py` |
| `PUT` | `/api/v1/tickets/{id}/dismiss` | Bỏ qua ticket (`status = 'dismissed'`). Nếu là Gmail, tự động đánh dấu đã đọc trên hộp thư gốc. | `tickets.py` |
| `PUT` | `/api/v1/tickets/{id}/restore` | Khôi phục ticket bị bỏ qua về trạng thái `pending`. | `tickets.py` |
| `POST` | `/api/v1/tickets/{id}/triage` | Ép buộc Gemini AI phân tích tóm tắt lại cho 1 ticket cụ thể. | `tickets.py` |
| `POST` | `/api/v1/tickets/batch-triage` | Quét toàn bộ ticket trong DB chưa có tóm tắt (`ai_summary IS NULL`) và chạy AI hàng loạt. | `tickets.py` |
| `PUT` | `/api/v1/tickets/{id}/category` | Đổi trực tiếp Category của ticket ngay trên card Web UI. | `tickets.py` |
| `GET` | `/api/v1/tasks/` | Lấy danh sách tác vụ từ `bot_automation_tasks` (join `inbox_tickets`). Lọc theo `approval_status`. | `tasks.py` |
| `POST` | `/api/v1/tasks/` | Tạo tác vụ phê duyệt bot mới từ Unified Inbox (`approval_status = 'pending'`). | `tasks.py` |
| `PUT` | `/api/v1/tasks/{id}/approve` | Phê duyệt tác vụ. Chạy Worker thật, đồng bộ Google Sheets, cập nhật `approval_status = 'approved'`, `execution_status = 'success'`, đổi ticket thành `completed`. | `tasks.py` |
| `PUT` | `/api/v1/tasks/{id}/reject` | Từ chối tác vụ (`approval_status = 'rejected'`, `execution_status = 'failed'`). | `tasks.py` |
| `GET` | `/api/v1/bots/status` | Trả về trạng thái real-time của 6 Workers (`active`/`degraded`). | `bots.py` |
| `GET` | `/api/v1/bots/logs` | Lấy danh sách nhật ký log thực thi thật từ cơ sở dữ liệu và cron listener. | `bots.py` |
| `POST` | `/api/v1/bots/{id}/retry` | Chạy lại (retry) thủ công cho 1 Task ID (UUID) hoặc khởi động lại 1 Worker cụ thể. | `bots.py` |
| `POST` | `/api/v1/github/create-issue` | Gửi yêu cầu tạo Issue vào Private Repository qua GitHub REST API. | `github.py` |
| `POST` | `/api/v1/github/ai-generate-template` | Gọi Gemini AI kết hợp Domain Knowledge Pythaverse + Ghi chú điều tra của QA để sinh Bug Report chuẩn Markdown. | `github.py` |
| `GET` | `/api/v1/reports/summary` | Thống kê số liệu KPI: tổng ticket pending, tỷ lệ tăng trưởng tuần, số task chờ duyệt, số ticket hoàn thành trong tháng, biểu đồ phân phối danh mục và xu hướng ngày. | `reports.py` |
| `GET` | `/api/v1/reports/kpi-export-data` | Trích xuất và tổng hợp toàn bộ dữ liệu công việc trong tháng kèm link dẫn chứng để phục vụ xuất Báo Cáo KPI DTT 3Đ. | `reports.py` |
| `GET` | `/api/v1/monitor/sites` | Lấy danh sách 10 website được giám sát cùng thống kê tổng quan (UP, DOWN, WARNING, latency trung bình). | `monitor.py` |
| `PUT` | `/api/v1/monitor/sites/{site_id}` | Cập nhật cấu hình Bật/Tắt kiểm tra hoặc Ẩn/Hiện thông báo của 1 website. | `monitor.py` |
| `POST` | `/api/v1/monitor/check-now` | Kích hoạt kiểm tra Live ngay lập tức cho toàn bộ 10 website. | `monitor.py` |
| `POST` | `/api/v1/monitor/sites/{site_id}/check`| Kiểm tra riêng 1 website cụ thể ngay lập tức. | `monitor.py` |
| `GET` | `/api/v1/monitor/sites/{site_id}/history`| Lấy lịch sử Uptime 45 ngày của 1 website để render Uptime Bars. | `monitor.py` |
| `GET` | `/api/v1/monitor/incidents` | Lấy danh sách toàn bộ các sự cố sập web (downtime events) gần nhất từ Supabase. | `monitor.py` |
| `GET` | `/api/v1/health` | Kiểm tra sức khỏe hệ thống và trạng thái hoạt động của Scheduler (hỗ trợ UptimeRobot Ping). | `main.py` |

---

## 6. Chi Tiết Cơ Sở Dữ Liệu Supabase (PostgreSQL 16)

Dữ liệu được lưu trữ và đồng bộ tập trung trên Supabase PostgreSQL 16 (`supabase/schema.sql`).

### 6.1. Kiểu Dữ Liệu ENUMs
```sql
CREATE TYPE ticket_source AS ENUM ('gmail', 'google_form', 'osticket');
CREATE TYPE ticket_category AS ENUM ('bug', 'account_keycloak', 'lms_enroll', 'license', 'other');
CREATE TYPE ticket_priority AS ENUM ('critical', 'normal');
CREATE TYPE ticket_status AS ENUM ('pending', 'approved', 'processing', 'completed', 'dismissed');
CREATE TYPE bot_type AS ENUM ('keycloak_api', 'workspace_rpa', 'lms_playwright', 'lms_git_provisioning', 'github_issue_creator', 'google_doc_comment', 'feedback_doc_triage');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
```

---

### 6.2. Cấu Trúc Chi Tiết Các Bảng Dữ Liệu

#### 1. Bảng `inbox_tickets` (Hòm thư hợp nhất đa kênh)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính định danh duy nhất của ticket. |
| `source` | `ticket_source` | `NOT NULL` | Kênh tiếp nhận (`gmail`, `google_form`, `osticket`). |
| `source_id` | `VARCHAR(255)` | - | ID trên hệ thống gốc (Message ID Gmail, FB ID Sheet, Internal ID OS Ticket). |
| `sender_email` | `VARCHAR(255)` | `NOT NULL` | Email người gửi yêu cầu. |
| `submitter_name` | `VARCHAR(255)` | - | Họ tên người gửi yêu cầu. |
| `subject` | `TEXT` | - | Tiêu đề email / chủ đề phản hồi / tên ticket. |
| `raw_content` | `TEXT` | `NOT NULL` | Toàn bộ nội dung văn bản thô từ nguồn gốc. |
| `ai_summary` | `TEXT` | - | Bản tóm tắt tiếng Việt 2 câu được Gemini AI tạo ra. |
| `category` | `ticket_category`| `DEFAULT 'other'` | Phân loại danh mục (cho phép Admin đổi trực tiếp trên UI). |
| `priority` | `ticket_priority`| `DEFAULT 'normal'` | Mức độ ưu tiên (`normal`, `critical`). |
| `status` | `ticket_status` | `DEFAULT 'pending'` | Trạng thái xử lý (`pending`, `completed`, `dismissed`, ...). |
| `country` | `VARCHAR(100)` | - | Quốc gia người gửi (dành riêng cho Google Form Feedback). |
| `doc_url` | `TEXT` | - | Đường dẫn Google Doc đính kèm trong báo cáo. |
| `assigned_name` | `VARCHAR(255)` | - | Tên nhân sự được AI đề xuất phụ trách. |
| `assigned_email`| `VARCHAR(255)` | - | Email nhân sự được AI đề xuất phụ trách. |
| `assigned_to` | `VARCHAR(255)` | - | Người được gán trên OS Ticket gốc. |
| `ticket_timestamp`| `VARCHAR(100)`| - | Thời gian gửi gốc định dạng chuỗi. |
| `attachments` | `JSONB` | `DEFAULT '[]'::jsonb` | Danh sách tệp đính kèm (`[{"filename": "...", "url": "..."}]`). |
| `metadata` | `JSONB` | `DEFAULT '{}'::jsonb` | Dữ liệu phụ: `row_index`, `sheet_name`, `ticket_number`... |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm record được tạo trong cơ sở dữ liệu. |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm cập nhật cuối cùng (tự động qua Trigger). |

#### 2. Bảng `bot_automation_tasks` (Hàng đợi phê duyệt tác vụ Bot)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính của tác vụ. |
| `ticket_id` | `UUID` | `REFERENCES inbox_tickets(id) ON DELETE CASCADE` | Khóa ngoại liên kết tới ticket gốc. |
| `bot_type` | `bot_type` | `NOT NULL` | Loại bot worker thực thi (`keycloak_api`, `workspace_rpa`, ...). |
| `payload_data` | `JSONB` | `NOT NULL` | Tham số JSON thực thi để Admin duyệt/chỉnh sửa. |
| `approval_status`| `approval_status`| `DEFAULT 'pending'` | Trạng thái phê duyệt của Admin (`pending`, `approved`, `rejected`). |
| `execution_status`| `VARCHAR(50)` | `DEFAULT 'queued'` | Trạng thái chạy của bot (`queued`, `running`, `success`, `failed`). |
| `execution_logs` | `TEXT` | - | Nhật ký log chi tiết khi worker thực thi. |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm tạo tác vụ. |
| `executed_at` | `TIMESTAMPTZ` | - | Thời điểm worker thực thi xong. |

#### 3. Bảng `templates_config` (Cấu hình mẫu báo cáo động)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính template. |
| `template_key` | `VARCHAR(100)` | `UNIQUE NOT NULL` | Mã định danh template (VD: `github_issue_bug`). |
| `name` | `VARCHAR(255)` | `NOT NULL` | Tên hiển thị của template. |
| `content_markdown`| `TEXT` | `NOT NULL` | Nội dung cấu trúc Markdown mẫu. |
| `fields_mapping` | `JSONB` | `DEFAULT '[]'::jsonb` | Danh sách ánh xạ các trường dữ liệu. |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời gian cập nhật template. |

#### 4. Bảng `site_downtime_events` (Nhật ký sự cố gián đoạn Website)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính sự cố. |
| `site_id` | `VARCHAR(100)` | `NOT NULL` | Mã định danh website (VD: `pythaverse_main`, `ide`). |
| `site_name` | `VARCHAR(255)` | `NOT NULL` | Tên hiển thị của website. |
| `started_at` | `TIMESTAMPTZ` | `NOT NULL` | Thời điểm phát hiện sự cố sập web. |
| `ended_at` | `TIMESTAMPTZ` | - | Thời điểm website phục hồi hoạt động trở lại. |
| `duration_s` | `INTEGER` | `DEFAULT 0` | Tổng thời gian gián đoạn (tính bằng giây). |
| `http_code` | `INTEGER` | - | Mã lỗi HTTP (500, 502, 504, 0). |
| `error_msg` | `TEXT` | - | Chi tiết thông báo lỗi kết nối hoặc timeout. |
| `is_ongoing` | `BOOLEAN` | `DEFAULT TRUE` | Đánh dấu sự cố có đang tiếp diễn hay không. |

---

### 6.3. Tối Ưu Hóa Chỉ Mục (Indexes), RLS Policies & Storage Bucket

#### 1. Chỉ Mục Tăng Tốc Truy Vấn (Performance Indexes)
```sql
CREATE INDEX idx_tickets_status    ON inbox_tickets(status);
CREATE INDEX idx_tickets_category  ON inbox_tickets(category);
CREATE INDEX idx_tickets_priority  ON inbox_tickets(priority);
CREATE INDEX idx_tickets_source    ON inbox_tickets(source);
CREATE INDEX idx_tickets_created   ON inbox_tickets(created_at DESC);
CREATE INDEX idx_tasks_approval    ON bot_automation_tasks(approval_status);
CREATE INDEX idx_tasks_execution   ON bot_automation_tasks(execution_status);
CREATE INDEX idx_tasks_ticket_id   ON bot_automation_tasks(ticket_id);
```

#### 2. Row Level Security (RLS) Policies
Chỉ cho phép tài khoản Google đã xác thực thuộc miền `@dtt.vn` truy cập dữ liệu:
```sql
ALTER TABLE inbox_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_automation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_dtt_vn_only" ON inbox_tickets
    FOR ALL USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');

CREATE POLICY "admin_dtt_vn_only" ON bot_automation_tasks
    FOR ALL USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');

CREATE POLICY "admin_dtt_vn_only" ON templates_config
    FOR ALL USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');
```

#### 3. Supabase Storage Bucket (`ticket-attachments`)
- **Chế độ:** Public Bucket.
- **Mục đích:** Lưu trữ hình ảnh, tài liệu PDF, file Excel đính kèm được tải từ Gmail API.
- **Quy tắc đường dẫn:** `attachments/{msg_id}_{filename}`.
- **Content-Type Header:** Tự động gán MIME Type chuẩn (`application/pdf`, `image/png`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`...) khi upload để trình duyệt hiển thị trực tiếp trong `iframe` hoặc tab mới mà không bị lỗi màn hình đen.

---

## 7. Chi Tiết Kiến Trúc Frontend (React 19 + TypeScript + Tailwind CSS v4)

### 7.1. Định Tuyến & Điều Phối Ứng Dụng (`App.tsx`)

Sử dụng `react-router-dom` v7 quản lý toàn bộ luồng điều hướng:
- **Public Routes:**
  - `/`: Trang Chủ giới thiệu (`LandingPage`).
  - `/login`: Trang Đăng Nhập Google SSO (`LoginPage`).
- **Protected Admin Routes (Bọc bởi `ProtectedRoute` và `AppLayout`):**
  - `/dashboard`: Bảng điều khiển tổng quan chỉ số KPI (`DashboardPage`).
  - `/inbox`: Hòm thư hợp nhất đa kênh (`UnifiedInboxPage`).
  - `/tasks`: Trung tâm phê duyệt tác vụ Human-in-the-Loop (`TaskManagementPage`).
  - `/github`: Điều phối tạo Bug Issue GitHub (`GithubReporterPage`).
  - `/bots`: Trung tâm giám sát và điều khiển Bot Workers (`BotCommanderPage`).
  - `/reports`: Xuất Báo Cáo KPI DTT 3Đ sang Excel (`ReportsExportPage`).
  - `/telegram`: Mô phỏng Telegram Mini App (`TelegramAppPage`).
  - `/monitor`: Giám sát Uptime Live 10 Website (`SiteMonitorPage`).
- **Cơ chế ProtectedRoute:** Kiểm tra trạng thái `loading` và `user` từ `AuthContext`. Nếu chưa đăng nhập, tự động chuyển hướng về `/login`.

---

### 7.2. Quản Lý Ngữ Cảnh: Xác Thực & Giao Diện Sáng/Tối (`context/`)

#### 1. `AuthContext.tsx` – Kiểm Soát Quyền Truy Cập Nghiêm Ngặt
- **State cung cấp:** `user`, `loading`, `signInWithGoogle()`, `signOut()`.
- **Lắng nghe phiên:** `supabase.auth.onAuthStateChange`.
- **Ràng buộc Whitelist Email:**
  ```ts
  const ALLOWED_ADMIN_EMAIL = "hung.nguyenmanh@dtt.vn";
  ```
  Nếu tài khoản đăng nhập không khớp với `hung.nguyenmanh@dtt.vn`, hệ thống lập tức kích hoạt `toast.error`, tự động gọi `supabase.auth.signOut()` và xóa `user` về `null`.

#### 2. `ThemeContext.tsx` – Quản Lý Giao Diện Light / Dark Theme
- **State:** `theme` (`'light'` | `'dark'`), `setTheme()`, `toggleTheme()`.
- **Cơ chế vận hành:** Thêm hoặc xóa class `dark` trên thẻ `document.documentElement` (`<html>`), lưu trạng thái lựa chọn vào `localStorage.getItem('theme')`.

---

### 7.3. Cấu Hình Chủ Quyền Tác Giả (`config/authorConfig.ts`)

Khẳng định quyền tác giả và bản quyền dự án, hiển thị công khai tại Trang Chủ (`LandingPage`):
- `name`: "Nguyễn Mạnh Hùng" (Project Creator & Lead Architect).
- `title`: "Lead AI Engineer & Automation Architect".
- `bio`: Chuyên gia thiết kế các giải pháp Tự Động Hóa Doanh Nghiệp (Enterprise Automation Hub), tích hợp AI Gemini Triage, Bot Workers và điều phối tác vụ đa kênh cho Pythaverse.
- `avatarUrl`: Ảnh đại diện tác giả.
- `location`: "Hà Nội, Việt Nam" | `organization`: "Pythaverse / DTT Corporation".
- `socials`: Danh sách các nút bấm mạng xã hội tương tác trực tiếp:
  - **GitHub:** `https://github.com/hungnm-1225`
  - **LinkedIn:** `https://linkedin.com/in/nguyenmanhhung`
  - **Facebook:** `https://facebook.com/hung.nguyenmanh`
  - **Email:** `mailto:hungnm@dtt.vn`
  - **Portfolio:** `https://pythaverse.space`
- `projectInfo`: Phiên bản `v1.0.0 Enterprise Release`, công nghệ cốt lõi và các điểm nhấn kiến trúc.

---

### 7.4. Client Utilities & Type Definitions (`lib/` & `types/`)

#### 1. `frontend/src/lib/api.ts`
- Hàm `fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T>`:
  - Tự động ghép tiền tố `VITE_API_BASE_URL` (mặc định `http://localhost:8000/api/v1`).
  - Tự động gán header `Content-Type: application/json`.
  - Bắt lỗi HTTP status khác 2xx và ném Error kèm thông điệp chi tiết từ Backend.

#### 2. `frontend/src/lib/supabase.ts`
- Khởi tạo client Supabase singleton thông qua `createClient(supabaseUrl, supabaseAnonKey)`.

#### 3. `frontend/src/types/index.ts`
Khai báo đầy đủ TypeScript Types & Interfaces:
- `InboxTicket`: Định dạng dữ liệu ticket đầy đủ các trường đính kèm, metadata, country, doc_url.
- `BotAutomationTask`: Tác vụ tự động hóa kèm ticket join, execution_logs, payload_data.
- `ReportsSummary`: Số liệu KPI tổng thể, category_ratios, daily_trends.
- `BotWorkersStatusResponse` & `BotTerminalLog`: Cấu trúc dữ liệu giám sát Workers và Terminal Logs.
- `GithubIssuePayload` & `GithubIssueResponse`: Cấu trúc request/response tạo issue trên GitHub.

---

### 7.5. Layout & Navigation Components (`components/`)

#### 1. `Sidebar.tsx`
- Cột điều hướng bên trái cố định (`h-screen sticky top-0`).
- Logo thương hiệu Pythaverse Admin Automation Hub.
- Menu 8 Modules quản trị: Executive Dashboard, Unified Inbox Feed, Task & Approval Hub, GitHub Dispatcher, Bot Execution Center, Analytics & XLSX Export, Telegram Mini App, Site Health Monitor.
- Sử dụng `NavLink` với style kích hoạt trực quan, bóng đổ và màu sắc hiện đại.

#### 2. `Header.tsx`
- Thanh điều khiển trên cùng với hiệu ứng làm mờ nền (`backdrop-blur-md`).
- Ô tìm kiếm toàn cục (Global Search Input).
- Nút chuyển đổi giao diện Sáng / Tối (`Moon` / `Sun`).
- Hiển thị Avatar, Họ tên, Email Google của Quản trị viên và nút Đăng xuất (`LogOut`).

#### 3. `AppLayout.tsx`
- Khung bố cục chuẩn bọc `Sidebar` và `Header`, áp dụng thẻ `<Outlet />` của React Router DOM để render nội dung động.

---

### 7.6. Chi Tiết Từng Module Tính Năng Giao Diện (`features/`)

#### 1. `LandingPage.tsx` (Trang Chủ Trình Diễn)
- Giao diện Dark/Light mode sang trọng với các hiệu ứng ánh sáng mờ ambient blur blobs.
- Header công khai điều hướng nhanh tới đăng nhập Google SSO.
- Hero Section giới thiệu năng lực tự động hóa kết hợp Gemini AI.
- Khu vực **Chủ Quyền Tác Giả (Author Ownership Section)**: Thẻ thông tin lớn giới thiệu tác giả Nguyễn Mạnh Hùng với ảnh đại diện, chức danh, mô tả năng lực và hệ thống nút bấm mạng xã hội tương tác trực tiếp.

#### 2. `LoginPage.tsx` (Trang Đăng Nhập Doanh Nghiệp)
- Thẻ Card đăng nhập với huy hiệu giải thích quy tắc bảo mật chỉ cho phép tài khoản Google `@dtt.vn`.
- Nút bấm chính: **"Đăng nhập bằng Google Workspace"** kết nối trực tiếp với Supabase Auth OAuth Provider.

#### 3. `DashboardPage.tsx` (Executive Dashboard)
- **4 Thẻ Bento KPI Real-time:** Ticket Chờ Xử Lý, Tác Vụ Chờ Phê Duyệt, Đã Giải Quyết Trong Tháng, Tỷ Lệ Tự Động Hóa / Sức Khỏe Hệ Thống.
- **Biểu đồ tròn Recharts (`PieChart`):** Phân phối tỷ lệ ticket theo danh mục (System Bugs, Keycloak Account, LMS Enroll, License, Others) với bộ chọn thời gian linh hoạt (7 ngày, 30 ngày, tháng này).
- **Biểu đồ cột Recharts (`BarChart`):** Xu hướng so sánh số lượng Ticket Tiếp Nhận vs Đã Xử Lý hàng ngày.

#### 4. `UnifiedInboxPage.tsx` (Hòm Thư Hợp Nhất Đa Kênh)
- **Bộ lọc kép đa chiều:**
  - Nguồn: `Tất cả Nguồn`, `✉️ Gmail`, `📝 Google Form`, `🎫 OS Ticket`.
  - Danh mục: `Tất cả Category`, `🐛 System Bugs`, `🔑 Keycloak/Account`, `🎓 LMS Enroll`, `📜 License`, `📌 Khác`, `🗑️ Đã Bỏ Qua`.
- **Đảo thứ tự sắp xếp:** Chuyển đổi nhanh giữa `Mới nhất` và `Cũ nhất`.
- **Dropdown đổi Tag trực tiếp:** Cho phép Admin đổi Category của ticket ngay trên từng card và lưu tức thì vào Supabase.
- **Deep Link mở trang nguồn gốc:**
  - Gmail: Mở tìm kiếm theo Message ID (`mail.google.com/mail/u/0/#search/id%3A...`).
  - Google Form: Mở Google Sheet và bôi đen đúng dải ô dòng tương ứng (`range=A{row}:P{row}`).
  - OS Ticket: Mở đúng ticket qua Internal ID (`support.pythaverse.space/scp/tickets.php?id=...`).
- **Modal xem trước tệp đa năng (`FileViewerModal`):** Xem ảnh trực tiếp, xem PDF trong `iframe`, nhúng Google Docs Viewer cho tài liệu DOCX/XLSX.
- **Thẻ tóm tắt Gemini AI:** Hiển thị nội dung tóm tắt tiếng Việt và nhân sự được đề xuất phân công kèm email.
- **Nút hành động:** `[Bỏ qua]`, `[Khôi phục]`, `[Tạo Tác Vụ Bot Automation]`.

#### 5. `TaskManagementPage.tsx` (Cổng Kiểm Soát Human-in-the-Loop)
- Bảng danh sách các tác vụ Bot đang chờ phê duyệt, đã duyệt hoặc bị từ chối.
- **Modal Phê Duyệt & Chỉnh Sửa Payload:** Mở trình soạn thảo JSON cho phép Admin kiểm tra, chỉnh sửa các tham số thực thi (email, action, realm, password...) trước khi bấm `Approve & Run Worker`.
- **Modal Xem Log Thực Thi:** Hiển thị chi tiết toàn bộ log chạy của worker theo thời gian thực.

#### 6. `BotCommanderPage.tsx` (Trung Tâm Điều Khiển Bot)
- Thẻ giám sát trạng thái 6 Cloud Workers: Gmail Sync Worker, Keycloak Identity Bot, Workspace License RPA, LMS & Git Provisioning, Feedback Doc Triage, GitHub Issue Dispatcher.
- Nút bấm `Restart Worker` và `Retry Task` để kích hoạt lại chu kỳ kiểm tra hoặc chạy lại tác vụ bị lỗi.
- Màn hình Terminal Console giả lập hiển thị live logs của hệ thống với ô tìm kiếm và tính năng Auto-scroll.

#### 7. `GithubReporterPage.tsx` (Tạo GitHub Issue Chuyên Sâu)
- Form soạn thảo Issue gửi tới Private Repository.
- **Nút "AI Auto-Fill Bug Report":** Kết hợp tri thức hệ thống từ `knowledge_base.json` và **Ghi chú khảo sát chuyên sâu của QA** để sinh bản báo cáo lỗi kỹ thuật chuẩn xác 100% bằng Markdown (Mô tả, Môi trường QA/Prod, Điều kiện tiên quyết, Các bước tái hiện, Thực tế vs Mong đợi, Bằng chứng Logs).
- Chọn Assignees (`nguyenthetrung5-PTV`, `thetrungdtt`), Labels, Mức độ ưu tiên, Phân hệ ảnh hưởng.
- Tab Chuyển đổi giữa Soạn thảo (Write) và Xem trước (Preview).

#### 8. `ReportsExportPage.tsx` (Xuất Báo Cáo Excel Phía Client)
- **Template Chuẩn DTT 3Đ (Định lượng - Đối tượng - Đích đến):**
  - Trích xuất toàn bộ tickets và tasks trong khoảng ngày.
  - Tự động điền đầy đủ 5 mục công việc: Xử lý Support Ticket, Phát triển Hub Tự Động Hóa, Kiểm thử & Báo lỗi GitHub, Xử lý Email Workspace, Xử lý Google Form Feedback.
  - Tự động đính kèm danh sách Link dẫn chứng OS Ticket, Gmail và Form Tracking.
- Tích hợp thư viện SheetJS (`xlsx`) tạo và tải file `.xlsx` về máy ngay trên trình duyệt mà không cần xử lý nặng tại server.

#### 9. `TelegramAppPage.tsx` (Telegram Mini App Simulator)
- Khung mô phỏng giao diện di động trên Telegram, cho phép phê duyệt nhanh tác vụ qua nút bấm cảm ứng tối ưu cho mobile.

#### 10. `SiteMonitorPage.tsx` (Giám Sát Uptime Live 10 Website Hệ Sinh Thái)
- Giám sát trạng thái Live của 10 website Pythaverse.
- **Thanh Uptime Bars 45 ngày:** Hiển thị chuỗi ô trạng thái màu xanh (UP), vàng (DEGRADED), đỏ (DOWN) phong cách UptimeRobot.
- **Kiểm tra SSO Login Keycloak:** Tự động gửi request xác thực token Keycloak cho các portal chính.
- Nút **"Kiểm tra ngay (Check Now)"** quét toàn bộ website hoặc kiểm tra riêng từng site.
- **Incident Log Modal:** Bảng tra cứu lịch sử toàn bộ các sự cố sập web từ Supabase.

---

## 8. Quy Chuẩn Phát Triển & Hướng Dẫn Mở Rộng Cho AI / Developer

Khi AI Assistant hoặc Developer tiếp tục bảo trì và mở rộng hệ thống, BẮT BUỘC tuân thủ các nguyên tắc sau:

### 8.1. Thêm một Kênh Thu Thập (Ingestion Channel) Mới
1. **Tạo Service:** Thêm file `backend/app/services/{kenh}_service.py`, định nghĩa hàm `async def poll_{kenh}()`.
2. **Đăng ký Cron Job:** Trong `backend/app/main.py`, thêm job vào `scheduler` bên trong hàm `lifespan()` thông qua `safe_job_wrapper`.
3. **Mở rộng Database ENUM:** Thêm giá trị vào enum `ticket_source` trong SQL migration.
4. **Cập nhật Frontend:** Bổ sung nguồn lọc và icon tương ứng trong `frontend/src/features/inbox/UnifiedInboxPage.tsx`.

### 8.2. Thêm một Bot Worker Mới
1. **Tạo Service:** Xây dựng logic thực thi trong `backend/app/services/{ten}_service.py`.
2. **Đăng ký vào Executor:** Thêm nhánh `elif bot_type == "{ten}":` trong `backend/app/workers/bot_executor.py` và `backend/app/api/v1/endpoints/tasks.py`.
3. **Mở rộng Database ENUM:** Thêm giá trị vào enum `bot_type` trong Supabase.
4. **Cập nhật Giao diện:** Khai báo cấu hình worker trong `BotCommanderPage.tsx` và danh sách chọn bot trong `UnifiedInboxPage.tsx`.

### 8.3. Thêm một Website Mới Vào Site Monitor
1. Khai báo thông tin website vào mảng `DEFAULT_MONITORED_SITES` trong `backend/app/services/site_monitor_service.py` với `id`, `name`, `url`, `category`, `enabled`, `show_live_alert`, `check_login`.
2. Giao diện `SiteMonitorPage.tsx` trên Frontend sẽ tự động nhận diện và hiển thị thanh Uptime Bars cho website mới.

### 8.4. Quy Tắc Code Sạch & Bảo Mật (Clean Code Standards)
- **Type Safety:** 100% hàm Python phải có Type Hints đầy đủ; 100% components React phải có TypeScript Interfaces rõ ràng.
- **Bảo mật bí mật:** Tuyệt đối không hardcode API key, mật khẩu, JWT token vào mã nguồn. Tất cả phải nạp qua `app.core.config.settings` hoặc `import.meta.env`.
- **Human-in-the-Loop Integrity:** Tuyệt đối không được bỏ qua bước phê duyệt `bot_automation_tasks` để tự động chạy ngầm các tác vụ phá hủy (xóa user, reset pass, push code).

---

## 9. Biến Môi Trường (.env) & Hướng Dẫn Triển Khai Vận Hành

### 9.1. Danh Sách Biến Môi Trường Chi Tiết

#### Backend (`backend/.env`)
```env
# --- CẤU HÌNH HỆ THỐNG ---
PROJECT_NAME="Pythaverse Central Admin & Automation Hub"
ENV="production"
ALLOWED_DOMAIN="dtt.vn"

# --- SUPABASE POSTGRESQL & STORAGE ---
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-secret-key"

# --- GOOGLE GEMINI AI ---
GEMINI_API_KEY="AIzaSyYourGeminiApiKey"
GEMINI_PRIMARY_MODEL="gemini-3.7-flash"
GEMINI_FALLBACK_MODEL="gemini-3.6-flash"

# --- GOOGLE WORKSPACE & APIS ---
GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
GMAIL_REFRESH_TOKEN="your-gmail-api-oauth2-refresh-token"
GOOGLE_CREDENTIALS_JSON='{"type": "service_account", "project_id": "...", ...}'
SPREADSHEET_ID="1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go"

# --- OS TICKET HELPDESK ---
OSTICKET_URL="https://support.pythaverse.space/scp/login.php"
OSTICKET_ADMIN_USER="your_osticket_username"
OSTICKET_ADMIN_PASS="your_osticket_password"

# --- KEYCLOAK IDENTITY IDP ---
KEYCLOAK_SERVER_URL="https://eid.pythaverse.space"
KEYCLOAK_REALM="idp"
KEYCLOAK_CLIENT_ID="admin-cli"
KEYCLOAK_ADMIN_USER="admin"
KEYCLOAK_ADMIN_PASS="your_keycloak_admin_password"

# --- GITHUB ISSUE DISPATCHER ---
GITHUB_PAT="github_pat_your_fine_grained_token_with_issues_write_scope"
GITHUB_DEFAULT_OWNER="PTV-TechHub"
GITHUB_DEFAULT_REPO="Pythaverse2026"

# --- TELEGRAM BOT & NOTIFICATION ---
TELEGRAM_BOT_TOKEN="your_telegram_bot_token"
TELEGRAM_ADMIN_CHAT_ID="your_telegram_chat_id"

# --- LIVE SITE MONITOR & WORKSPACE RPA ---
KEYCLOAK_URL="https://eid.pythaverse.space/auth"
TEST_ADMIN_USER="admin_test_user"
TEST_ADMIN_PASS="admin_test_password"
```

#### Frontend (`frontend/.env.local`)
```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
VITE_API_BASE_URL="https://ptv-tasks-backend.onrender.com/api/v1"
VITE_APP_URL="https://ptv-tasks-administrator.vercel.app"
```

---

### 9.2. Hướng Dẫn Khởi Chạy Môi Trường Phát Triển (Local Development)

#### 1. Khởi chạy Backend FastAPI (Cổng 8000)
```bash
# 1. Di chuyển vào thư mục backend
cd backend

# 2. Khởi tạo môi trường ảo Python
python -m venv venv

# 3. Kích hoạt môi trường ảo
# Trên Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Trên Linux / macOS:
source venv/bin/activate

# 4. Cài đặt toàn bộ thư viện phụ thuộc
pip install -r requirements.txt

# 5. Cài đặt Chromium cho Playwright
playwright install chromium

# 6. Khởi chạy server FastAPI ở chế độ Auto-Reload
uvicorn app.main:app --reload --port 8000
```
- Swagger UI tài liệu API kiểm thử trực tiếp: `http://localhost:8000/docs`
- Health Check Ping: `http://localhost:8000/api/v1/health`

#### 2. Khởi chạy Frontend React SPA (Cổng 5173)
```bash
# 1. Di chuyển vào thư mục frontend
cd frontend

# 2. Cài đặt các packages
npm install

# 3. Khởi chạy Vite Dev Server
npm run dev
```
- Truy cập giao diện ứng dụng tại: `http://localhost:5173`

---

### 9.3. Hướng Dẫn Triển Khai Production (Cloud Deployment)

1. **Backend (Render.com Docker Web Service):**
   - Tạo Web Service mới trên Render.com, chọn Repository và cấu hình `rootDir: backend`, `dockerfilePath: ./Dockerfile`.
   - Nạp toàn bộ các biến môi trường trong file `backend/.env` vào mục **Environment Variables** trên Render Dashboard.
2. **Frontend (Vercel SPA):**
   - Import repository vào Vercel, chọn Root Directory là `frontend`.
   - Framework Preset: `Vite`.
   - Thêm các biến môi trường `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` trỏ tới URL của Render.
   - Vercel tự động nhận diện file `vercel.json` để cấu hình Single Page Application URL rewriting.
3. **Database (Supabase Cloud):**
   - Chạy toàn bộ file `supabase/schema.sql` trong SQL Editor của Supabase Dashboard để khởi tạo ENUMs, Tables, Indexes, RLS Policies và Triggers.
   - Tạo Storage Bucket `ticket-attachments` ở chế độ Public.
   - Bật Google OAuth Provider trong mục **Authentication -> Providers** và điền Redirect URL của Vercel (`https://ptv-tasks-administrator.vercel.app`).

---

*Tài liệu README.md này được biên soạn, chuẩn hóa và duy trì bởi Lead AI Engineer & Automation Architect Nguyễn Mạnh Hùng. Mọi cập nhật cấu trúc mã nguồn hoặc logic nghiệp vụ mới đều phải được đồng bộ trực tiếp vào tài liệu này.*
