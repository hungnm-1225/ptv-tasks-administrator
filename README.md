# 🚀 PTV Tasks Administrator – Pythaverse Central Admin & Automation Hub

> **Phiên bản:** 1.0.0 Enterprise Release  
> **Kiến trúc:** Monorepo (Frontend SPA React 19 + Backend FastAPI Python 3.11 + Supabase PostgreSQL 16 & Auth SSO + Cloud Bot Workers)  
> **Tác giả & Kiến trúc sư hệ thống:** Nguyễn Mạnh Hùng (Lead AI Engineer & Automation Architect – DTT Corporation / Pythaverse)  
> **Mục đích tài liệu:** Bản đồ kiến trúc toàn diện và tài liệu tra cứu kỹ thuật chuẩn mực (Single Source of Truth) dành cho Developer và AI Coder. Tài liệu bóc tách 100% cấu trúc, chức năng từng file, danh sách hàm, tham số, logic cơ sở dữ liệu và luồng nghiệp vụ end-to-end mà không cần phải mở duyệt thủ công từng file mã nguồn.

---

## 📑 Mục Lục Toàn Diện

1. [Tổng Quan Hệ Thống & Triết Lý Vận Hành](#1-tổng-quan-hệ-thống--triết-lý-vận-hành)
   - [1.1. Ba Bài Toán Nghiệp Vụ Cốt Lõi Được Giải Quyết](#11-ba-bài-toán-nghiệp-vụ-cốt-lõi-được-giải-quyết)
   - [1.2. Bốn Triết Lý Vận Hành Hệ Thống (Core Principles)](#12-bốn-triết-lý-vận-hành-hệ-thống-core-principles)
2. [Sơ Đồ Kiến Trúc & Luồng Dữ Liệu Tự Động Hóa End-to-End](#2-sơ-đồ-kiến-trúc--luồng-dữ-liệu-tự-động-hóa-end-to-end)
   - [2.1. Sơ Đồ Khối Luồng Dữ Liệu Toàn Cục (End-to-End Architecture)](#21-sơ-đồ-khối-luồng-dữ-liệu-toàn-cục-end-to-end-architecture)
   - [2.2. Luồng Nghiệp Vụ 1: Bóc Tách Biểu Mẫu COF & Tạo Tài Khoản Hàng Loạt](#22-luồng-nghiệp-vụ-1-bóc-tách-biểu-mẫu-cof--tạo-tài-khoản-hàng-loạt)
   - [2.3. Luồng Nghiệp Vụ 2: Phân Phối License & Duyệt Contract Phả Hệ 3 Cấp](#23-luồng-nghiệp-vụ-2-phân-phối-license--duyệt-contract-phả-hệ-3-cấp)
   - [2.4. Luồng Nghiệp Vụ 3: Ghi Danh Học Viên & Quản Lý Nhóm Lớp LMS / PLearn](#24-luồng-nghiệp-vụ-3-ghi-danh-học-viên--quản-lý-nhóm-lớp-lms--plearn)
   - [2.5. Luồng Nghiệp Vụ 4: Quản Lý Cây Thư Mục Google Drive Phân Tầng 6 Cấp](#25-luồng-nghiệp-vụ-4-quản-lý-cây-thư-mục-google-drive-phân-tầng-6-cấp)
   - [2.6. Luồng Nghiệp Vụ 5: Báo Lỗi GitHub Issue Tích Hợp AI & Ghi Chú QA](#26-luồng-nghiệp-vụ-5-báo-lỗi-github-issue-tích-hợp-ai--ghi-chú-qa)
   - [2.7. Luồng Nghiệp Vụ 6: Thu Thập Đa Kênh & Đồng Bộ Ngược](#27-luồng-nghiệp-vụ-6-thu-thập-đa-kênh--đồng-bộ-ngược)
   - [2.8. Luồng Nghiệp Vụ 7: Giám Sát Uptime Live 10 Website & Ma Trận Phân Quyền 7 Roles](#28-luồng-nghiệp-vụ-7-giám-sát-uptime-live-10-website--ma-trận-phân-quyền-7-roles)
3. [Tech Stack & Danh Mục Công Nghệ Chi Tiết](#3-tech-stack--danh-mục-công-nghệ-chi-tiết)
   - [3.1. Frontend & Client-Side Stack](#31-frontend--client-side-stack)
   - [3.2. Backend & Automation Engine Stack](#32-backend--automation-engine-stack)
   - [3.3. Database & Cloud Infrastructure Stack](#33-database--cloud-infrastructure-stack)
4. [Bản Đồ Cây Thư Mục Toàn Dự Án (Monorepo Directory Map)](#4-bản-đồ-cây-thư-mục-toàn-dự-án-monorepo-directory-map)
5. [Chi Tiết Kiến Trúc Backend (Python 3.11 FastAPI)](#5-chi-tiết-kiến-trúc-backend-python-311-fastapi)
   - [5.1. Entrypoint & Background Scheduler (`backend/app/main.py`)](#51-entrypoint--background-scheduler-backendappmainpy)
   - [5.2. Cấu Hình & Bảo Mật Core (`backend/app/core/`)](#52-cấu-hình--bảo-mật-core-backendappcore)
   - [5.3. Bộ Não Trí Tuệ Nhân Tạo & Tri Thức Hệ Thống (`gemini.py` & `knowledge_base.json`)](#53-bộ-não-trí-tuệ-nhân-tạo--tri-thức-hệ-thống-geminipy--knowledge_basejson)
   - [5.4. Data Models & Schemas (`backend/app/models/`)](#54-data-models--schemas-backendappmodels)
   - [5.5. Hệ Thống Dịch Vụ Thu Thập, RPA, Xử Lý Dữ Liệu (`backend/app/services/`)](#55-hệ-thống-dịch-vụ-thu-thập-rpa-xử-lý-dữ-liệu-backendappservices)
     - [5.5.1. Gói Dịch Vụ RPA Pythaverse Workspace (`backend/app/services/workspace/`)](#551-gói-dịch-vụ-rpa-pythaverse-workspace-backendappservicesworkspace)
     - [5.5.2. Dịch Vụ Phả Hệ & Két Sắt Mật Khẩu (`workspace_lineage_service.py`)](#552-dịch-vụ-phả-hệ--két-sắt-mật-khẩu-workspace_lineage_servicepy)
     - [5.5.3. Dịch Vụ Bóc Tách & Ghi Ngược COF Excel (`cof_excel_service.py`)](#553-dịch-vụ-bóc-tách--ghi-ngược-cof-excel-cof_excel_servicepy)
     - [5.5.4. Dịch Vụ Quản Trị Danh Tính Keycloak (`keycloak_service.py`)](#554-dịch-vụ-quản-trị-danh-tính-keycloak-keycloak_servicepy)
     - [5.5.5. Dịch Vụ Lưu Trữ Google Drive 6 Cấp (`google_drive_service.py`)](#555-dịch-vụ-lưu-trữ-google-drive-6-cấp-google_drive_servicepy)
     - [5.5.6. Dịch Vụ Thu Thập Gmail API (`gmail_service.py`)](#556-dịch-vụ-thu-thập-gmail-api-gmail_servicepy)
     - [5.5.7. Dịch Vụ Thu Thập Phản Hồi Google Sheets (`google_sheet_service.py`)](#557-dịch-vụ-thu-thập-phản-hồi-google-sheets-google_sheet_servicepy)
     - [5.5.8. Dịch Vụ Đọc & Bình Luận Google Docs (`google_doc_service.py`)](#558-dịch-vụ-đọc--bình-luận-google-docs-google_doc_servicepy)
     - [5.5.9. Dịch Vụ Cào Dữ Liệu OS Ticket (`osticket_service.py`)](#559-dịch-vụ-cào-dữ-liệu-os-ticket-osticket_servicepy)
     - [5.5.10. Dịch Vụ Giám Sát Sức Khỏe Hệ Thống & CI/CD Logs (`site_monitor_service.py`)](#5510-dịch-vụ-giám-sát-sức-khỏe-hệ-thống--cicd-logs-site_monitor_servicepy)
     - [5.5.11. Dịch Vụ Thông Báo Telegram Bot (`telegram_service.py`)](#5511-dịch-vụ-thông-báo-telegram-bot-telegram_servicepy)
     - [5.5.12. Dịch Vụ Điều Phối Tạo Issue GitHub (`github_service.py`)](#5512-dịch-vụ-điều-phối-tạo-issue-github-github_servicepy)
     - [5.5.13. Dịch Vụ Ghi Danh Moodle LMS Đơn Lẻ (`playwright_service.py`)](#5513-dịch-vụ-ghi-danh-moodle-lms-đơn-lẻ-playwright_servicepy)
   - [5.6. Workers Điều Phối Thực Thi (`backend/app/workers/`)](#56-workers-điều-phối-thực-thi-backendappworkers)
   - [5.7. Bảng Tra Cứu Toàn Bộ REST API Endpoints (`backend/app/api/v1/endpoints/`)](#57-bảng-tra-cứu-toàn-bộ-rest-api-endpoints-backendappapiv1endpoints)
   - [5.8. Scripts & Bộ Công Cụ Vận Hành Tự Động (`backend/scripts/` & `backend/tests/`)](#58-scripts--bộ-công-cụ-vận-hành-tự-động-backendscripts--backendtests)
6. [Chi Tiết Cơ Sở Dữ Liệu Supabase (PostgreSQL 16)](#6-chi-tiết-cơ-sở-dữ-liệu-supabase-postgresql-16)
   - [6.1. Kiểu Dữ Liệu ENUMs](#61-kiểu-dữ-liệu-enums)
   - [6.2. Cấu Trúc Chi Tiết 8 Bảng Dữ Liệu](#62-cấu-trúc-chi-tiết-8-bảng-dữ-liệu)
   - [6.3. Chỉ Mục (Indexes), Triggers, RLS Policies & Supabase Storage](#63-chỉ-mục-indexes-triggers-rls-policies--supabase-storage)
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

`ptv-tasks-administrator` là nền tảng quản trị tác vụ tập trung và trung tâm tự động hóa thông minh (Central Automation Hub) được thiết kế và xây dựng riêng cho hệ sinh thái công nghệ giáo dục Pythaverse (`pythaverse.space`) thuộc Công ty Cổ phần Công nghệ DTT (`@dtt.vn`).

### 1.1. Ba Bài Toán Nghiệp Vụ Cốt Lõi Được Giải Quyết
1. **Phân mảnh kênh tiếp nhận yêu cầu (Multi-channel Fragmentation):**
   - **Gmail Google Workspace (`@dtt.vn`):** Thư yêu cầu hỗ trợ, cấp phép, đổi mật khẩu từ đối tác, giáo viên và phòng ban.
   - **Google Form / Google Sheets Feedbacks:** Biểu mẫu phản hồi lỗi từ người dùng kèm đường link Google Doc và thông tin quốc gia.
   - **Helpdesk OS Ticket (`support.pythaverse.space`):** Hệ thống ticketing nội bộ với hàng trăm ticket xử lý tài khoản, lỗi kỹ thuật LMS/PLearn, Workspace và Leanbot.
2. **Quá tải xử lý thủ công (Operational Bottleneck):**
   - Đội ngũ quản trị viên và QA phải đọc từng email/ticket, phân loại bằng mắt, trích xuất dữ liệu, sau đó đăng nhập thủ công vào Keycloak để reset mật khẩu, vào Moodle LMS để ghi danh học viên, vào School Workspace để tạo tài khoản, hoặc vào GitHub để tạo Bug Issue.
3. **Thiếu cổng kiểm soát an toàn (Risk of Blind Automation):**
   - Việc để AI tự động thực thi các hành vi can thiệp hệ thống (reset mật khẩu, phân quyền, đóng mở ticket, tạo hợp đồng) mà không có sự kiểm tra của con người tiềm ẩn nguy cơ bảo mật nghiêm trọng.

### 1.2. Bốn Triết Lý Vận Hành Hệ Thống (Core Principles)
- **Hợp Nhất Nguồn Cấp (Unified Single Feed):** Toàn bộ email, biểu mẫu phản hồi và ticket từ mọi nguồn đều được các tiến trình nền tự động thu thập và đồng bộ về bảng duy nhất `inbox_tickets` trên Supabase PostgreSQL.
- **Phân Loại & Tóm Tắt Tự Động (Gemini AI Multi-Model Triage):** Sử dụng Google Gemini AI Engine với cơ chế tự động Fallback 10 tầng mô hình để tóm tắt 2 câu tiếng Việt, phân loại chuẩn xác 5 danh mục (`bug`, `account_keycloak`, `lms_enroll`, `license`, `other`) và tự động khớp nhân sự phụ trách theo `knowledge_base.json`.
- **Phê Duyệt Con Người Tuyệt Đối (Human-in-the-Loop Safeguard):** Không có bất kỳ tác vụ can thiệp hệ thống nào (Keycloak API, Playwright RPA, GitHub Issue) được thực thi nếu chưa có trạng thái `approval_status = 'approved'` do Quản trị viên bấm duyệt và chỉnh sửa tham số JSON Payload trên Web SPA hoặc Telegram Mini App.
- **Bảo Mật Xác Thực Miền Doanh Nghiệp (@dtt.vn Domain Whitelist):** Kiểm soát nghiêm ngặt tầng Frontend (Supabase Auth Listener) và Backend (JWT Bearer Token verification), từ chối và tự động đăng xuất tất cả các tài khoản không thuộc quyền quản trị viên `hung.nguyenmanh@dtt.vn`.

---

## 2. Sơ Đồ Kiến Trúc & Luồng Dữ Liệu Tự Động Hóa End-to-End

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
              │ (Mỗi 5 phút)              │ (Mỗi 5 phút)                 │ (Mỗi 5 phút)
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
                      ┌────────────────────────────────────────────────────────┐
                      │                 HỆ SINH THÁI ĐÍCH (PYTHAVERSE)         │
                      ├────────────────────────────────────────────────────────┤
                      │ 1. Pythaverse Workspace (School / Partner / Dist / Adm)│
                      │ 2. PLearn Moodle LMS (Khóa học, Ghi danh & Group)      │
                      │ 3. PGit Gitea Server (Provisioning SSO & Repository)   │
                      │ 4. Keycloak Identity IDP (Quản trị tập trung Realm IDP)│
                      │ 5. Google Drive 6 Cấp (Root > Năm > QG > Dist > Prt > Sch)│
                      │ 6. GitHub Private Repo (PTV-TechHub / Pythaverse2026)  │
                      └────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack & Danh Mục Công Nghệ Chi Tiết

### 3.1. Frontend & Client-Side Stack
- **Core Framework:** React 19 (v19.0.0) + TypeScript (Strict Type Checking)
- **Build Tool:** Vite 6 + Tailwind CSS v4 Vite Plugin
- **CSS & UI Framework:** Tailwind CSS v4 (`@tailwindcss/vite`), Dark / Light mode hỗ trợ đầy đủ
- **Icons & Animations:** `lucide-react`, Tailwind Animate, Canvas Confetti
- **Data Visualization:** Recharts 2.x (PieChart, BarChart, ResponsiveContainer)
- **Client Excel Processing:** SheetJS (`xlsx`) – Đọc & Xuất báo cáo KPI DTT 3Đ trực tiếp trên trình duyệt
- **Routing & State:** `react-router-dom` v7, React Context API (`AuthContext`, `ThemeContext`)
- **Toasts & Notifications:** `react-hot-toast`

### 3.2. Backend & Automation Engine Stack
- **Runtime & Web Framework:** Python 3.11 + FastAPI (Async/Await) + Uvicorn ASGI Server
- **Validation & Serialization:** Pydantic v2 + Pydantic Settings
- **Task Scheduling:** APScheduler (`AsyncIOScheduler`) bọc `safe_job_wrapper` và dọn RAM `gc.collect()`
- **AI Triage & Auto-Fallback:** Google Generative AI SDK (`google-generativeai`) với 10 tầng model fallback
- **Browser RPA Engine:** Playwright Async (`playwright.async_api`) Chromium Headless tối ưu cờ RAM
- **Identity & SSO Management:** Keycloak Admin REST API (`python-keycloak`) + Custom Headers
- **Security & Encryption:** Cryptography (`Fernet` cipher suite với `VAULT_SECRET_KEY`) + PyJWT
- **Office & Sheet Automation:** `openpyxl`, `google-api-python-client`, `google-auth-oauthlib`, `gspread`
- **External Communications:** `httpx` (Async HTTP Client), `python-telegram-bot`, GitHub REST API

### 3.3. Database & Cloud Infrastructure Stack
- **Database Engine:** Supabase PostgreSQL 16
- **Security & Authorization:** Row Level Security (RLS) với Whitelist `@dtt.vn`
- **File Storage:** Supabase Storage (Public Bucket `ticket-attachments`)
- **Hosting & Deployment:**
  - Frontend SPA: Vercel Cloud Platform (Tự động Rewrite SPA qua `vercel.json`)
  - Backend API: Render.com Docker Web Service (512MB RAM tối ưu)

---

## 4. Bản Đồ Cây Thư Mục Toàn Dự Án (Monorepo Directory Map)

```
ptv-tasks-administrator/
├── backend/                            # 🐍 MÃ NGUỒN BACKEND PYTHON FASTAPI
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── endpoints/
│   │   │       │   ├── bots.py         # REST API: Giám sát trạng thái 6 Workers & Restart/Retry
│   │   │       │   ├── github.py       # REST API: Tạo GitHub Issue & AI Auto-Fill Bug Report
│   │   │       │   ├── monitor.py      # REST API: Uptime 10 Site, Ma Trận Auth 16 TK & CI/CD Logs
│   │   │       │   ├── reports.py      # REST API: Tổng hợp KPI Cards & Dữ liệu xuất Excel DTT 3Đ
│   │   │       │   ├── tasks.py        # REST API: Quản lý hàng đợi tác vụ Human-in-the-Loop & Phê duyệt
│   │   │       │   ├── tickets.py      # REST API: Hòm thư hợp nhất đa kênh (Lọc, Tag, Bỏ qua, Triage)
│   │   │       │   └── workspace.py    # REST API: Phả hệ 480 trường, Danh mục khóa học & Bóc tách COF
│   │   │       └── router.py           # Gom 7 routers vào tiền tố `/api/v1`
│   │   ├── brain/
│   │   │   └── knowledge_base.json     # Cơ sở tri thức hệ thống: Ma trận 7 phân hệ & Phân công nhân sự
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
│   │   │   ├── workspace/              # 🏢 Gói Dịch Vụ RPA Pythaverse Workspace (Modularized)
│   │   │   │   ├── __init__.py         # Gom đa kế thừa thành class WorkspacePlaywrightService singleton
│   │   │   │   ├── base.py             # Khởi tạo Chromium tối ưu RAM, Login SSO Keycloak, Date Utils
│   │   │   │   ├── order_service.py    # School Tạo Order, Partner Duyệt, Quét & Bóc Tách Order
│   │   │   │   ├── contract_service.py # Partner/Distributor Tạo Contract, Duyệt & Quét Contract
│   │   │   │   ├── orchestrator_service.py # Điều phối Trọn Gói 4-in-1 (E2E Master Chain & Standalone)
│   │   │   │   ├── account_service.py  # Tạo tài khoản hàng loạt (Pha 1 nộp batch + Pha 2 Smart Polling)
│   │   │   │   └── enroll_service.py   # Ghi danh khóa học LMS & Quản lý Group lớp học
│   │   │   ├── workspace_playwright_service.py # Bridge file re-export 100% tương thích ngược
│   │   │   ├── workspace_lineage_service.py    # Giải mã phả hệ School -> Partner -> Distributor Fernet Vault
│   │   │   ├── cof_excel_service.py    # Dịch vụ bóc tách COF 3 tabs, sinh accounts.xlsx, ghi ngược kết quả
│   │   │   ├── keycloak_service.py     # 2-Tier Executor (REST API + Playwright RPA: Reset pass, Disable, Verify)
│   │   │   ├── gmail_service.py        # Quét Gmail, bóc tách tệp & upload Storage bucket có MIME type
│   │   │   ├── google_sheet_service.py # Quét Form Sheet, lưu Supabase và đồng bộ ngược Cột L/M/P
│   │   │   ├── google_doc_service.py   # Kiểm tra quyền, đọc nội dung và @mention tag comment Google Docs
│   │   │   ├── google_drive_service.py # Quản lý cây thư mục Google Drive 6 tầng theo năm & phả hệ
│   │   │   ├── osticket_service.py     # Playwright cào OS Ticket, bóc tách Internal ID & Display Number
│   │   │   ├── site_monitor_service.py # Giám sát Uptime Live 10 Website, Auth Matrix 16 Accounts & CI/CD Logs
│   │   │   ├── telegram_service.py     # Gửi tin nhắn Telegram kèm Inline Keyboard nút duyệt nhanh
│   │   │   ├── github_service.py       # Dịch vụ gửi Issue vào Private Repo qua GitHub REST API
│   │   │   ├── playwright_service.py   # Tự động hóa ghi danh khóa học Moodle LMS / PLearn đơn lẻ
│   │   │   └── ticket_processor.py     # Ingest ticket đầu vào kết hợp Gemini AI Triage
│   │   ├── workers/
│   │   │   ├── bot_executor.py         # Router thực thi các tác vụ Bot sau khi được phê duyệt
│   │   │   └── ticket_processor.py     # Ingest ticket đầu vào kết hợp Gemini AI Triage
│   │   └── main.py                     # Entrypoint: Lifespan 5 Cronjobs, CORS Middleware, Health Check
│   ├── data/                           # Thư mục lưu trữ dữ liệu tạm thời cho các Pipelines
│   │   ├── cof_input/                  # Chứa file COF (.xlsx) đầu vào cần xử lý
│   │   ├── cof_output/                 # Chứa file COF hoàn thiện đã ghi kết quả User/Pass/Group
│   │   ├── results_download/           # Chứa file kết quả tài khoản tải về từ Workspace RPA
│   │   └── temp_import/                # Chứa file accounts.xlsx trung gian nộp lên Workspace
│   ├── scripts/                        # Các kịch bản tự động hóa và import dữ liệu
│   │   ├── import_hierarchy.py         # Script import phả hệ 10.000+ trường học từ Excel vào Supabase
│   │   └── pythaverse_hierarchy_data.xlsx # Dữ liệu phả hệ tổ chức mẫu
│   ├── tests/                          # Bộ kịch bản kiểm thử quy trình tự động hóa
│   │   ├── test_cof_pipeline.py        # Kiểm thử toàn trình bóc tách COF, sinh accounts và ghi ngược
│   │   └── test_playwright_school_bot.py # Kiểm thử LIVE nộp file batch tạo tài khoản & Smart Polling
│   ├── seed_monitor_credentials.py     # Script mã hóa Fernet & nạp 16 tài khoản test cho 10 phân hệ
│   ├── .env.example                    # Mẫu cấu hình biến môi trường Backend
│   ├── Dockerfile                      # Dockerfile triển khai Container đa nền tảng (Playwright Ready)
│   └── requirements.txt                # Danh sách thư viện Python phụ thuộc cố định phiên bản
├── frontend/                           # ⚛️ MÃ NGUỒN FRONTEND REACT 19 SPA
│   ├── public/
│   │   └── logo.png                    # Logo thương hiệu Pythaverse Admin
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Header.tsx          # Header cố định: Mobile Hamburger, Theme Toggle, Profile, Logout
│   │   │   │   └── Sidebar.tsx         # Menu điều hướng bên trái (9 modules) hỗ trợ Mobile Drawer
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
│   │   │   │   └── SiteMonitorPage.tsx # Giám sát 3 Tabs: Public Uptime, Auth Matrix 16 Accounts & CI/CD Logs
│   │   │   ├── profile/
│   │   │   │   └── ProfileSettingsPage.tsx # Quản lý Hồ sơ Tác Giả, Upload Avatar Storage & MXH
│   │   │   ├── reports/
│   │   │   │   └── ReportsExportPage.tsx # Xuất Báo Cáo KPI DTT 3Đ sang Excel (.xlsx) với SheetJS
│   │   │   ├── studio/
│   │   │   │   └── AutomationStudioPage.tsx # Khởi tạo & Điều phối Tác Vụ Tự Động Hóa Độc Lập
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
│   │   ├── main.tsx                    # React Root Entrypoint bọc StrictMode
│   │   └── vite-env.d.ts               # Khai báo môi trường TypeScript cho Vite
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
  - Đăng ký **5 Cron Jobs** chạy ngầm 24/7:
    1. `poll_unread_gmails` (Quét Gmail API) – Tần suất: **Mỗi 5 phút** (`id='gmail_cron'`).
    2. `poll_open_ostickets` (Quét OS Ticket qua Playwright) – Tần suất: **Mỗi 5 phút** (`id='osticket_cron'`).
    3. `poll_form_feedbacks` (Quét Google Sheet phản hồi) – Tần suất: **Mỗi 5 phút** (`id='sheet_cron'`).
    4. `poll_site_uptime_cron` (Quét Live Uptime & Auth Matrix các Website) – Tần suất: **Mỗi 30 phút** (`id='site_uptime_cron'`).
    5. `poll_workspace_long_tasks` (Smart Polling Tác vụ Tạo Tài Khoản Batch) – Tần suất: **Mỗi 5 phút** (`id='workspace_long_tasks_cron'`).
  - Khi server tắt, kích hoạt `scheduler.shutdown()` để giải phóng luồng an toàn.

#### 2. Chi tiết Cronjob Smart Polling (`poll_workspace_long_tasks`)
- Quét bảng `bot_automation_tasks` tìm các task có `bot_type = 'workspace_playwright'` và `execution_status = 'waiting_poll'`.
- Trích xuất `request_id`, `school_code`, đường dẫn COF gốc từ `payload_data`.
- Khởi tạo Playwright kiểm tra trạng thái Request ID trên School Workspace.
- Khi trạng thái là `Done` / `Completed`:
  1. Tải file kết quả `RESULT_accounts.xlsx`.
  2. Kích hoạt `COFExcelService.write_results_back_to_cof()` ghi ngược User/Pass/Group LMS vào file COF hoàn thiện với định dạng highlight cam nhạt (`#FCE4D6`) và chữ đỏ đậm (`#C00000`).
  3. Gọi `GoogleDriveService` tải file COF kết quả lên đúng cây thư mục 6 cấp của trường và trả về `web_view_link`.
  4. Cập nhật task sang `execution_status = 'success'`, ghi log hoàn tất.

#### 3. Hàm bọc an toàn & Thu gom RAM (`safe_job_wrapper(job_func, job_name: str)`)
- **Mục đích:** Đảm bảo khi một trong các dịch vụ bên ngoài (Gmail, OS Ticket, Google Sheets, Playwright) gặp sự cố mạng hoặc timeout thì không làm sập ứng dụng chính.
- **Cơ chế dọn dẹp RAM:** Khối `finally` luôn thực thi lệnh `gc.collect()` (Python Garbage Collector), giúp giải phóng ngay bộ nhớ nhị phân sau khi cào web bằng Playwright hoặc tải attachment – giải pháp sống còn trên môi trường máy chủ Render 512MB RAM.

---

### 5.2. Cấu Hình & Bảo Mật Core (`backend/app/core/`)

#### 1. [config.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/config.py) – Quản lý biến môi trường (`Settings`)
Kế thừa từ `pydantic_settings.BaseSettings`, tự động đọc và ép kiểu từ file `.env`:
- **Hệ thống:** `PROJECT_NAME`, `API_V1_STR` (`/api/v1`), `ENV` (`development`/`production`), `ALLOWED_DOMAIN` (`dtt.vn`), `VAULT_SECRET_KEY` (Key mã hóa Fernet).
- **Supabase:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Gemini AI:** `GEMINI_API_KEY`, `GEMINI_PRIMARY_MODEL` (`gemini-3.7-flash`), `GEMINI_FALLBACK_MODEL` (`gemini-3.6-flash`).
- **Telegram Bot:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`.
- **Keycloak:** `KEYCLOAK_SERVER_URL`, `KEYCLOAK_REALM` (`idp`/`master`), `KEYCLOAK_CLIENT_ID` (`admin-cli`), `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASS`.
- **GitHub Dispatcher:** `GITHUB_PAT`, `GITHUB_DEFAULT_OWNER`, `GITHUB_DEFAULT_REPO`.
- **Google & OS Ticket:** `GOOGLE_CREDENTIALS_JSON`, `SPREADSHEET_ID`, `GMAIL_REFRESH_TOKEN`, `OSTICKET_URL`, `OSTICKET_ADMIN_USER`, `OSTICKET_ADMIN_PASS`.

#### 2. [security.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/security.py) – Xác thực & Kiểm soát Whitelist Miền Doanh Nghiệp
- `verify_dtt_domain_email(email: str) -> bool`: Tách chuỗi sau ký tự `@`, chuyển về chữ thường và so sánh chính xác với `settings.ALLOWED_DOMAIN` (`dtt.vn`).
- `async get_current_user_email(credentials: HTTPAuthorizationCredentials) -> str`:
  - Giải mã JSON Web Token (JWT) từ Header `Authorization: Bearer <token>`.
  - Trích xuất claim `email` hoặc `preferred_username`.
  - Ném ngoại lệ HTTP `403 FORBIDDEN` nếu email không thuộc miền `@dtt.vn`.

#### 3. [supabase.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/supabase.py) – Singleton Supabase Python Client
- `get_supabase_client() -> Client`: Khởi tạo và lưu cache đối tượng Client của Supabase sử dụng `SUPABASE_SERVICE_ROLE_KEY`. Cho phép các background workers đọc/ghi dữ liệu toàn quyền vượt qua RLS.

---

### 5.3. Bộ Não Trí Tuệ Nhân Tạo & Tri Thức Hệ Thống (`gemini.py` & `knowledge_base.json`)

#### 1. [gemini.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/gemini.py) – Lớp `AIEngine` & Thuật Toán Auto-Fallback 10 Tầng
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

#### 2. [knowledge_base.json](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/brain/knowledge_base.json) – Cơ Sở Tri Thức & Ma Trận Phân Hệ
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

#### 1. [ticket.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/ticket.py)
- **Enums:**
  - `TicketSource`: `gmail`, `google_form`, `osticket`.
  - `TicketCategory`: `bug`, `account_keycloak`, `lms_enroll`, `license`, `other`.
  - `TicketPriority`: `critical`, `normal`.
  - `TicketStatus`: `pending`, `approved`, `processing`, `completed`, `dismissed`.
- **Pydantic Models:**
  - `TicketCreate`: `source`, `source_id`, `sender_email`, `submitter_name`, `subject`, `raw_content`, `metadata`.
  - `TicketResponse`: Định dạng trả về client với đầy đủ các trường database cùng `created_at`, `updated_at`.

#### 2. [task.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/task.py)
- **Enums:**
  - `BotType`: `keycloak_api`, `workspace_rpa`, `lms_playwright`, `lms_git_provisioning`, `github_issue_creator`, `google_doc_comment`, `feedback_doc_triage`.
  - `ApprovalStatus`: `pending`, `approved`, `rejected`.
- **Pydantic Models:**
  - `AutomationTaskCreate`: `ticket_id`, `bot_type`, `payload_data`.
  - `AutomationTaskApprovalUpdate`: `approval_status`, `edited_payload`.
  - `AutomationTaskResponse`: Định dạng trả về client kèm thông tin Ticket join và `execution_logs`.

#### 3. [template.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/template.py)
- **Pydantic Models:**
  - `TemplateConfigCreate`: `template_key`, `name`, `content_markdown`, `fields_mapping`.
  - `TemplateConfigResponse`: Thông tin cấu hình template động.

---

### 5.5. Hệ Thống Dịch Vụ Thu Thập, RPA, Xử Lý Dữ Liệu (`backend/app/services/`)

#### 5.5.1. Gói Dịch Vụ RPA Pythaverse Workspace (`backend/app/services/workspace/`)

Gói dịch vụ được thiết kế theo kiến trúc Module Hóa Hướng Đối Tượng (Clean Modular Architecture), chia tách file `workspace_playwright_service.py` khổng lồ ban đầu thành 7 module chuyên biệt:

```
backend/app/services/
├── workspace/
│   ├── __init__.py              # Gom toàn bộ module thành class WorkspacePlaywrightService singleton
│   ├── base.py                  # Khởi tạo Chromium tối ưu RAM, Login SSO, Date Utils
│   ├── order_service.py         # School Tạo Order, Partner Duyệt, Quét & Bóc Tách Order
│   ├── contract_service.py      # Partner/Distributor Tạo Contract, Duyệt & Quét Contract
│   ├── orchestrator_service.py  # Điều phối Trọn Gói 4-in-1 (E2E Master Chain & Standalone Executions)
│   ├── account_service.py       # Tạo tài khoản hàng loạt (Pha 1 nộp batch + Pha 2 Polling)
│   └── enroll_service.py        # Ghi danh khóa học LMS & Quản lý Group
└── workspace_playwright_service.py # File cầu nối tương thích ngược 100%
```

##### 1. [base.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/base.py) – Lớp Cơ Sở `WorkspaceBaseService`
- `_create_context(p: Playwright) -> tuple[Browser, BrowserContext, Page]`:
  - Khởi tạo trình duyệt Chromium headless với danh sách cờ tiết kiệm RAM tối ưu cho môi trường Render 512MB:
    `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--single-process`, `--no-zygote`, `--disable-extensions`.
  - Viewport chuẩn 1920x1080, User-Agent Chrome 122 hiện đại.
- `login_role(page: Page, role_key: str, email: str, password: str) -> bool`:
  - Điều hướng tới `https://pythaverse.space`, chờ Keycloak SSO form xuất hiện.
  - Điền username, password và bấm nút `Sign In`.
  - Tự động bắt lỗi sai mật khẩu (`Invalid username or password`) hoặc lỗi timeout, trả về `True` nếu vào được dashboard hoặc `False` kèm log rõ ràng.
- `normalize_date_iso(date_str: str) -> str`:
  - Chuẩn hóa mọi dị biệt định dạng ngày tháng (`D/M/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, float Excel timestamp) về chuẩn ISO `YYYY-MM-DD`.
- `_logout(page: Page)`:
  - Bấm nút Logout và dọn dẹp Cookies/Storage an toàn.

##### 2. [order_service.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/order_service.py) – Lớp `WorkspaceOrderService`
- Kế thừa: `WorkspaceBaseService`.
- `school_create_order(credentials: dict, order_data: dict) -> dict`:
  - Đăng nhập School Workspace, mở `/school-workspace/orders`.
  - Bấm `+ Create Order`, điền Contact Info, Category, chọn môn học, số lượng Licenses, Start Date, End Date.
  - Bắt Order ID mới sinh từ hàng đầu của `MuiDataGrid`.
- `partner_approve_school_order(credentials: dict, order_identifier: str) -> dict`:
  - Đăng nhập Partner Workspace, mở `/partner-workspace/order-management`.
  - Tìm Order theo `order_identifier`, mở chi tiết, chọn Category Pool License để trừ kho.
  - Trả về `status='success'` hoặc `status='insufficient_pool'` nếu thiếu license trong kho.
- `fetch_partner_pending_school_orders(credentials: dict) -> list[dict]`:
  - Cào trực tiếp danh sách các đơn hàng trường học đang chờ duyệt (`Pending`) của Partner.
- `fetch_school_order_detailed_courses(credentials: dict, order_identifier: str) -> list[dict]`:
  - Mở chi tiết một School Order để cào danh sách môn học, số lượng license yêu cầu.

##### 3. [contract_service.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/contract_service.py) – Lớp `WorkspaceContractService`
- Kế thừa: `WorkspaceBaseService`.
- `partner_create_contract(credentials: dict, contract_data: dict) -> dict`:
  - Mở `/partner-workspace/contract-po/create`, tạo Contract Type `License` gửi Distributor và bắt mã `PRT-XXXX-XXX`.
- `distributor_approve_partner_contract(credentials: dict, contract_identifier: str) -> dict`:
  - Mở `/distributor-workspace/partner-contract-po`, kiểm tra kho Distributor và duyệt.
- `distributor_create_contract(credentials: dict, contract_data: dict) -> dict`:
  - Mở `/distributor-workspace/contract-po/create`, tạo Contract Type `License` gửi Sales Admin và bắt mã `DST-XXXX-XXX`.
- `admin_approve_distributor_contract(credentials: dict, contract_identifier: str, justification: str) -> dict`:
  - Mở `/sales-admin-workspace/dashboard`, mở Contract Details, điền `Justification Note` (>= 15 ký tự) và bấm `Confirm Approval`.
- `fetch_partner_contracts(credentials: dict) -> list[dict]`: Cào danh sách hợp đồng của Partner.
- `fetch_distributor_pending_contracts(credentials: dict) -> list[dict]`: Cào danh sách hợp đồng Distributor đang chờ.
- `fetch_sales_admin_pending_contracts(credentials: dict) -> list[dict]`: Cào danh sách hợp đồng Sales Admin cần duyệt.

##### 4. [orchestrator_service.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/orchestrator_service.py) – Lớp `WorkspaceOrchestratorService`
- Kế thừa: `WorkspaceOrderService`, `WorkspaceContractService`.
- `execute_full_license_hierarchy_chain(school_code: str, courses: list, order_date: str, contact_info: str, notes: str, lms_group_name: Optional[str], lms_student_emails: Optional[list]) -> dict`:
  - **Master E2E Chain 4 cấp liên hoàn:**
    1. Truy vết phả hệ qua `WorkspaceLineageService.resolve_by_school(school_code)`.
    2. School tạo Order.
    3. Partner duyệt Order (nếu thiếu License Pool, tự động kích hoạt chuỗi tạo & duyệt Contract Distributor -> Sales Admin).
    4. Distributor duyệt Contract hoặc tạo Contract lên Sales Admin.
    5. Sales Admin phê duyệt tối cao.
    6. Nếu có `lms_group_name`, tự động gọi `WorkspaceEnrollService.school_enroll_users_and_groups()` ghi danh LMS.
- `execute_approve_school_order_standalone(school_code: str, target_order_code: str) -> dict`: Duyệt đơn lẻ School Order.
- `execute_approve_partner_contract_standalone(school_code: str, target_contract_code: str) -> dict`: Duyệt đơn lẻ Partner Contract.
- `execute_admin_approve_contract_standalone(target_contract_code: str, justification: str) -> dict`: Duyệt đơn lẻ Contract cấp Sales Admin.

##### 5. [account_service.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/account_service.py) – Lớp `WorkspaceAccountService`
- Kế thừa: `WorkspaceBaseService`.
- `submit_account_creation_batch(credentials: dict, upload_file_path: str, record_count: int) -> dict`:
  - Pha 1 nộp file `accounts.xlsx`, bắt `Request ID` tại dòng đầu của `MuiDataGrid` và tắt Chromium ngay lập tức để giải phóng RAM.
- `check_and_export_batch_result(credentials: dict, request_id: str, download_dir: str) -> dict`:
  - Pha 2 Smart Polling: Mở kiểm tra trạng thái Request ID. Khi `Done` bấm Action Menu ➔ `Export` tải file kết quả `RESULT_accounts.xlsx`.

##### 6. [enroll_service.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/enroll_service.py) – Lớp `WorkspaceEnrollService`
- Kế thừa: `WorkspaceBaseService`.
- `school_enroll_users_and_groups(credentials: dict, course_name: str, start_date: str, end_date: str, school_name: str, group_name_raw: str, student_emails: list, teacher_emails: list) -> dict`:
  - Mở `/school-workspace/courses`, chọn môn học, tạo Group `{School} {Group} {Date}`, Bulk Import học sinh và giáo viên vào lớp.

##### 7. [__init__.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/__init__.py) & [workspace_playwright_service.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace_playwright_service.py)
- Định nghĩa class tổng hợp `WorkspacePlaywrightService(WorkspaceOrchestratorService, WorkspaceAccountService, WorkspaceEnrollService)` gom toàn bộ phương thức thành singleton `workspace_playwright_service`.
- File [workspace_playwright_service.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace_playwright_service.py) re-export toàn bộ class và instance, đảm bảo tương thích ngược 100% với tất cả workers và API endpoints cũ.

---

#### 5.5.2. Dịch Vụ Phả Hệ & Két Sắt Mật Khẩu (`workspace_lineage_service.py`)
- `COUNTRY_DISTRIBUTOR_MAP`: Ánh xạ Quốc gia <-> Master Distributor (`Vietnam`, `Malaysia`, `Indonesia`, `Philippines`).
- `init_cipher_suite() -> Fernet`: Khởi tạo đối tượng giải mã Fernet an toàn từ `settings.VAULT_SECRET_KEY`.
- `decrypt_password(encrypted_pass: str) -> str`: Giải mã mật khẩu an toàn khi Playwright cần đăng nhập.
- `resolve_by_school(school_identifier: str, country_hint: Optional[str]) -> dict`: Nhập tên trường hoặc mã trường ➔ Tự động truy vết 3 cấp (`School` ➔ `Partner` ➔ `Distributor`) và giải mã bộ 3 tài khoản tương ứng.

#### 5.5.3. Dịch Vụ Bóc Tách & Ghi Ngược COF Excel (`cof_excel_service.py`)
- `_clean_str(val) -> str`: Làm sạch chuỗi, loại bỏ khoảng trắng thừa.
- `_format_date_dob(dob_raw) -> str`: Chuẩn hóa ngày sinh về định dạng `D/M/YYYY`.
- `parse_cof_file(file_path: str) -> dict`: Bóc tách Tab 1 (Courses), Tab 2 (Students chưa có user), Tab 3 (Teachers).
- `generate_accounts_excel(accounts_to_create, output_path) -> int`: Tạo file `accounts.xlsx` chuẩn 7 cột bắt đầu từ dòng 6.
- `write_results_back_to_cof(...) -> str`: Map Username/Password vào cột 12-13, Group LMS vào cột 14, tô màu cam nhạt (`#FCE4D6`) và chữ đỏ đậm (`#C00000`).

#### 5.5.4. Dịch Vụ Quản Trị Danh Tính Keycloak (`keycloak_service.py`)
Hệ thống xử lý danh tính Keycloak 2 tầng với cơ chế Safe-by-Default:
- **Tầng 1 (REST API Trực Tiếp):** `execute_via_rest_api(target_user, actions, params)` sử dụng `KeycloakAdmin` kết hợp Custom User-Agent Browser Headers để vượt qua WAF/Cloudflare.
- **Tầng 2 (Playwright RPA Fallback):** `execute_via_playwright_rpa(target_user, actions, params)` tự động kích hoạt nếu Tầng 1 trả về lỗi mạng hoặc bị từ chối quyền.
- `execute_account_action(payload: dict) -> dict`: Router điều phối đa hành động:
  - `reset_password`: Đặt lại mật khẩu tạm thời + tùy chọn bắt buộc đổi khi đăng nhập.
  - `mark_email_verified` / `mark_email_unverified`: Xác thực hoặc gỡ xác thực email.
  - `enable_account` / `disable_account`: Kích hoạt lại hoặc tạm khóa tài khoản.

#### 5.5.5. Dịch Vụ Lưu Trữ Google Drive 6 Cấp (`google_drive_service.py`)
- `get_or_create_subfolder(parent_folder_id: str, folder_name: str) -> str`: Tìm hoặc tạo mới thư mục con trên Drive.
- `ensure_school_cof_folder(root_folder_id, country, distributor_name, partner_name, school_name, year) -> str`: Dựng chuỗi thư mục phân tầng 6 cấp: `Root` > `{Năm}` > `{Quốc gia}` > `[Distributor] {Tên}` > `[Partner] {Tên}` > `[School] {Tên}`.
- `upload_file_to_school_folder(local_file_path, folder_id, custom_file_name) -> dict`: Tải file COF lên Drive và trả về `web_view_link`.

#### 5.5.6. Dịch Vụ Thu Thập Gmail API (`gmail_service.py`)
- `get_gmail_service()`: Khởi tạo Gmail API Client bằng Refresh Token OAuth2.
- `process_gmail_attachments(service, msg_id, payload) -> list`: Tải file đính kèm và upload lên Supabase Storage với MIME type chuẩn.
- `poll_unread_gmails()`: Cronjob quét thư chưa đọc nhãn INBOX, lưu vào `inbox_tickets` kèm `internalDate` chuẩn xác.
- `mark_email_as_read(msg_id: str)`: Xóa nhãn `UNREAD` trên Gmail khi ticket được hoàn thành hoặc bỏ qua.

#### 5.5.7. Dịch Vụ Thu Thập Phản Hồi Google Sheets (`google_sheet_service.py`)
- `poll_form_feedbacks()`: Cronjob quét Google Sheet, đọc các dòng chưa gán (`Assigned != TRUE`), bóc tách Google Doc URL và lưu vào Supabase.
- `update_feedback_row(sheet_name, row_index, category, status)`: Đồng bộ ngược ghi Cột L (Category), Cột M (Assigned = TRUE), Cột P (Status = 'To Implement').

#### 5.5.8. Dịch Vụ Đọc & Bình Luận Google Docs (`google_doc_service.py`)
- `extract_doc_id(url: str) -> str`: Trích xuất Document ID từ đường link Google Doc.
- `check_comment_permission(doc_url: str) -> tuple[bool, str]`: Kiểm tra quyền truy cập của Service Account.
- `read_doc_content(doc_url: str) -> tuple[str, str]`: Đọc toàn bộ nội dung văn bản trong tài liệu.
- `add_comment_and_tag(doc_url, comment_text, tag_email) -> tuple[bool, str]`: Thêm bình luận và @mention nhân sự phụ trách.

#### 5.5.9. Dịch Vụ Cào Dữ Liệu OS Ticket (`osticket_service.py`)
- `login(page) -> bool`: Đăng nhập `/scp/login.php` bằng tài khoản quản trị.
- `scrape_ticket_detail(page, context, internal_id) -> dict`: Bóc tách tiêu đề, người gửi, Partner Form (School Name, Country), thread messages và tải attachment lên Supabase Storage.
- `poll_open_ostickets()`: Cronjob quét danh sách vé mở (`/scp/tickets.php?status=open`), bóc tách Internal ID và lưu vào `inbox_tickets`.

#### 5.5.10. Dịch Vụ Giám Sát Sức Khỏe Hệ Thống & CI/CD Logs (`site_monitor_service.py`)
- `check_all_sites()` & `check_single_site(site)`: Gửi HTTP Request kiểm tra Live Uptime cho 10 websites.
- `run_auth_matrix_checks() -> list[dict]`: Đọc 16 tài khoản test giải mã Fernet từ bảng `site_monitor_credentials`, gửi request xác thực Keycloak SSO và kiểm tra quyền truy cập route nội bộ cho 7 roles.
- `get_deployment_logs(provider: str, deployment_id: str) -> str`: Gọi Vercel API hoặc Render API trích xuất live terminal build logs.
- `get_uptime_history(site_id, days=45) -> list`: Trả về lịch sử 45 ngày phục vụ render Uptime Bars.
- `get_incident_log(limit=50) -> list`: Lấy danh sách toàn bộ các sự cố sập web từ Supabase.

#### 5.5.11. Dịch Vụ Thông Báo Telegram Bot (`telegram_service.py`)
- `send_approval_notification(task_id, ticket_summary, bot_type, payload) -> bool`: Gửi tin nhắn Markdown kèm Inline Keyboard `[Phê duyệt ngay]` | `[Từ chối]`.

#### 5.5.12. Dịch Vụ Điều Phối Tạo Issue GitHub (`github_service.py`)
- `create_issue(payload: dict) -> dict`: Gửi REST API tới GitHub tạo Issue mới trong Private Repo với title, body markdown, labels và assignees.

#### 5.5.13. Dịch Vụ Ghi Danh Moodle LMS Đơn Lẻ (`playwright_service.py`)
- `enroll_student(payload: dict) -> dict`: Tự động hóa ghi danh học viên vào khóa học LMS / PLearn đơn lẻ.

---

### 5.6. Workers Điều Phối Thực Thi (`backend/app/workers/`)

#### 1. [bot_executor.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/workers/bot_executor.py) – Điều Phối Thực Thi Bot Sau Phê Duyệt
Hàm `async def execute_approved_bot_task(bot_type: str, payload_data: dict) -> dict` phân luồng:
- `workspace_rpa`: Phân luồng theo `action` (`pipeline_end_to_end`, `bulk_account_creation`, `check_account_batch`, `school_create_order`, `partner_approve_order`, `admin_approve_contract`, `school_enroll_users`).
- `keycloak_api`: Gọi `keycloak_service.execute_account_action()`.
- `github_issue_creator`: Gọi `github_service.create_issue()`.

#### 2. [ticket_processor.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/workers/ticket_processor.py) – Xử Lý Ticket Đầu Vào
- `async def process_incoming_ticket(ticket_data: dict) -> dict`: Kích hoạt Gemini AI Triage và gửi cảnh báo Telegram nếu đề xuất tác vụ bot.

---

### 5.7. Bảng Tra Cứu Toàn Bộ REST API Endpoints (`backend/app/api/v1/endpoints/`)

| Method | Endpoint | File Xử Lý | Mục Đích & Ý Nghĩa Nghiệp Vụ |
|---|---|---|---|
| `GET` | `/api/v1/health` | `main.py` | Ping kiểm tra server và scheduler sống 24/7. |
| `GET` | `/api/v1/tickets` | `tickets.py` | Lấy danh sách tickets (lọc status, category, source, sort). |
| `PUT` | `/api/v1/tickets/{id}/complete` | `tickets.py` | Đánh dấu hoàn thành thủ công một ticket. |
| `PUT` | `/api/v1/tickets/{id}/dismiss` | `tickets.py` | Đưa ticket vào mục Đã Bỏ Qua và đánh dấu đã đọc trên Gmail. |
| `PUT` | `/api/v1/tickets/{id}/restore` | `tickets.py` | Khôi phục ticket từ mục Bỏ Qua về lại Hòm Thư. |
| `PUT` | `/api/v1/tickets/{id}/category` | `tickets.py` | Cập nhật nhanh phân loại category của ticket trên card. |
| `POST` | `/api/v1/tickets/{id}/triage` | `tickets.py` | Kích hoạt Gemini AI phân tích và tóm tắt lại ticket. |
| `GET` | `/api/v1/tasks` | `tasks.py` | Lấy danh sách tác vụ Bot kèm thông tin Ticket gốc. |
| `POST` | `/api/v1/tasks` | `tasks.py` | Tạo tác vụ phê duyệt bot mới từ Unified Inbox hoặc Studio (giờ GMT+7). |
| `PUT` | `/api/v1/tasks/{id}/approve` | `tasks.py` | Phê duyệt và đẩy Worker thật vào Background Task chạy ngầm. |
| `GET` | `/api/v1/workspace/hierarchy-schools`| `workspace.py` | Lấy danh sách 480 trường kèm chuỗi liên thông Partner & Distributor. |
| `GET` | `/api/v1/workspace/categories` | `workspace.py` | Lấy danh sách Categories duy nhất từ bảng `workspace_courses`. |
| `GET` | `/api/v1/workspace/courses` | `workspace.py` | Lấy danh mục khóa học từ database, hỗ trợ lọc theo Category. |
| `POST` | `/api/v1/workspace/extract-cof` | `workspace.py` | Bóc tách text COF, trích xuất Course ID và đối chiếu Database. |
| `GET` | `/api/v1/bots/status` | `bots.py` | Kiểm tra trạng thái Real-time của 6 Cloud Workers. |
| `GET` | `/api/v1/bots/logs` | `bots.py` | Lấy danh sách nhật ký thực thi Terminal Logs từ database. |
| `POST` | `/api/v1/bots/{id}/retry` | `bots.py` | Kích hoạt chạy lại cho một Task cụ thể hoặc restart Worker. |
| `POST` | `/api/v1/github/create-issue` | `github.py` | Tạo Issue 1-click gửi vào Private Repository GitHub. |
| `POST` | `/api/v1/github/ai-generate-template`| `github.py`| Nạp Ground Truth + Ticket + Ghi chú QA sinh Bug Report Markdown. |
| `GET` | `/api/v1/reports/summary` | `reports.py` | Lấy số liệu 4 Bento KPI Cards, PieChart và BarChart. |
| `GET` | `/api/v1/reports/kpi-export-data` | `reports.py` | Trích xuất và tổng hợp toàn bộ dữ liệu xuất Báo cáo KPI DTT 3Đ. |
| `GET` | `/api/v1/monitor/sites` | `monitor.py` | Lấy danh sách tất cả website cùng thống kê tổng quan (Tab 1). |
| `PUT` | `/api/v1/monitor/sites/{id}` | `monitor.py` | Bật/Tắt kiểm tra hoặc Ẩn/Hiện thông báo cho 1 website. |
| `POST` | `/api/v1/monitor/check-now` | `monitor.py` | Kích hoạt kiểm tra Live ngay lập tức cho toàn bộ website. |
| `GET` | `/api/v1/monitor/auth-matrix` | `monitor.py` | Lấy kết quả kiểm tra xác thực 16 tài khoản 7 Roles (Tab 2). |
| `POST` | `/api/v1/monitor/auth-matrix/check-now` | `monitor.py` | Chạy kiểm tra đăng nhập Keycloak SSO & route chuyên sâu ngay lập tức. |
| `GET` | `/api/v1/monitor/deployments/vercel` | `monitor.py` | Lấy lịch sử builds Frontend SPA từ Vercel REST API (Tab 3). |
| `GET` | `/api/v1/monitor/deployments/render` | `monitor.py` | Lấy trạng thái Container Backend Docker từ Render REST API (Tab 3). |
| `GET` | `/api/v1/monitor/deployments/{provider}/{id}/logs` | `monitor.py` | Trích xuất toàn bộ terminal build logs của bản build. |
| `GET` | `/api/v1/monitor/incidents` | `monitor.py` | Lấy danh sách các sự cố DOWN gần nhất từ Supabase. |

---

### 5.8. Scripts & Bộ Công Cụ Vận Hành Tự Động (`backend/scripts/` & `backend/tests/`)

#### 1. [import_hierarchy.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/scripts/import_hierarchy.py) – Import Phả Hệ 10.000+ Trường Học
- **Cơ chế hoạt động:**
  - Đọc file Excel `pythaverse_hierarchy_data.xlsx`.
  - **Bước 1 (Distributors):** Upsert vào `workspace_organizations` (`role_type='distributor'`), mã hóa mật khẩu bằng Fernet và lưu vào `workspace_credentials_vault`.
  - **Bước 2 (Partners):** Khớp `parent_id` trỏ tới Distributor tương ứng.
  - **Bước 3 (Schools):** Xử lý 10.000+ trường học theo từng **Batch 500 dòng**, khớp `parent_id` tới Partner và lưu mật khẩu mã hóa.

#### 2. [seed_monitor_credentials.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/seed_monitor_credentials.py) – Nạp Tài Khoản Ma Trận Giám Sát Xác Thực
- Mã hóa bằng Fernet (`VAULT_SECRET_KEY`) và nạp 16 tài khoản test cho 10 website Pythaverse vào bảng `site_monitor_credentials`.
- Bao gồm 7 vai trò cốt lõi (`Admin`, `Sales Admin`, `Distributor`, `Partner`, `School`, `Teacher`, `Student`) và các phân hệ vệ tinh (`ide`, `learn`, `git`, `avatar`, `contest`, `digitaltwin`, `iot`).

#### 3. [test_cof_pipeline.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/tests/test_cof_pipeline.py) – Kiểm Thử Toàn Trình COF Pipeline
- Kiểm thử quy trình đọc file COF mẫu, sinh file `accounts.xlsx` và ghi ngược kết quả User/Pass vào file COF hoàn thiện.

#### 4. [test_playwright_school_bot.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/tests/test_playwright_school_bot.py) – Kiểm Thử Live RPA School Workspace
- Kiểm thử trực tiếp nộp file batch tạo tài khoản, bắt Request ID và chạy Smart Polling tải file kết quả.

---

## 6. Chi Tiết Cơ Sở Dữ Liệu Supabase (PostgreSQL 16)

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

### 6.2. Cấu Trúc Chi Tiết 8 Bảng Dữ Liệu

#### 1. Bảng `inbox_tickets` (Hòm thư hợp nhất đa kênh)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính ticket. |
| `source` | `ticket_source` | `NOT NULL` | Kênh tiếp nhận: `gmail`, `google_form`, `osticket`. |
| `source_id` | `VARCHAR(255)` | - | Mã ID gốc của email (Message ID), form (FB-ROW), OS Ticket (#ID). |
| `sender_email` | `VARCHAR(255)` | `NOT NULL` | Email người gửi yêu cầu. |
| `submitter_name`| `VARCHAR(255)` | - | Tên hiển thị người gửi. |
| `subject` | `TEXT` | - | Tiêu đề thư hoặc chủ đề yêu cầu. |
| `raw_content` | `TEXT` | `NOT NULL` | Nội dung gốc đầy đủ từ email/ticket/form. |
| `ai_summary` | `TEXT` | - | Tóm tắt 2 câu tiếng Việt do Gemini AI sinh ra. |
| `category` | `ticket_category`| `DEFAULT 'other'` | Phân loại danh mục (`bug`, `account_keycloak`, `lms_enroll`, `license`, `other`). |
| `priority` | `ticket_priority`| `DEFAULT 'normal'` | Mức độ ưu tiên (`critical`, `normal`). |
| `status` | `ticket_status` | `DEFAULT 'pending'` | Trạng thái vòng đời (`pending`, `approved`, `processing`, `completed`, `dismissed`). |
| `country` | `VARCHAR(100)` | - | Quốc gia người gửi (đặc thù Form Google Sheet). |
| `doc_url` | `TEXT` | - | Đường dẫn Google Doc đính kèm trong Form phản hồi. |
| `ticket_timestamp`| `VARCHAR(100)`| - | Chuỗi ngày giờ nguyên bản từ nguồn cấp. |
| `attachments` | `JSONB` | `DEFAULT '[]'::jsonb` | Danh sách tệp đính kèm (`[{filename, url}]`). |
| `metadata` | `JSONB` | `DEFAULT '{}'::jsonb` | Dữ liệu mở rộng (thread_id, row_index, sheet_name, remarks). |
| `assigned_name` | `VARCHAR(255)` | - | Tên nhân sự được AI đề xuất phụ trách. |
| `assigned_email`| `VARCHAR(255)` | - | Email nhân sự được AI đề xuất phụ trách. |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm tạo bản ghi (hoặc thời gian gửi thật). |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm cập nhật trạng thái gần nhất. |

#### 2. Bảng `bot_automation_tasks` (Hàng đợi tác vụ tự động hóa Human-in-the-Loop)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính tác vụ. |
| `ticket_id` | `UUID` | `REFERENCES inbox_tickets(id) ON DELETE CASCADE` | Khóa ngoại liên kết tới ticket nguồn. |
| `bot_type` | `bot_type` | `NOT NULL` | Loại bot worker thực thi. |
| `payload_data` | `JSONB` | `NOT NULL` | Tham số JSON thực thi (email, password, action, order_details...). |
| `approval_status`| `approval_status`| `DEFAULT 'pending'` | Trạng thái duyệt: `pending`, `approved`, `rejected`. |
| `execution_status`| `VARCHAR(50)` | `DEFAULT 'queued'` | Trạng thái chạy: `queued`, `waiting_poll`, `running`, `success`, `failed`. |
| `execution_logs` | `TEXT` | - | Toàn bộ log chạy của worker theo giờ GMT+7. |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm tạo task. |
| `executed_at` | `TIMESTAMPTZ` | - | Thời điểm worker bắt đầu thực thi thật. |

#### 3. Bảng `templates_config` (Cấu hình Template Động)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính template. |
| `template_key` | `VARCHAR(100)` | `UNIQUE NOT NULL` | Mã định danh template (VD: `github_issue_bug`). |
| `name` | `VARCHAR(255)` | `NOT NULL` | Tên hiển thị của template. |
| `content_markdown`| `TEXT` | `NOT NULL` | Cấu trúc nội dung template dạng Markdown. |
| `fields_mapping`| `JSONB` | `DEFAULT '[]'::jsonb` | Ánh xạ các trường dữ liệu. |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm cập nhật cuối cùng. |

#### 4. Bảng `site_downtime_events` (Nhật ký sự cố gián đoạn Website)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính sự cố. |
| `site_id` | `VARCHAR(100)` | `NOT NULL` | Mã website (`pythaverse_main`, `ide`, `avatar`...). |
| `site_name` | `VARCHAR(255)` | `NOT NULL` | Tên hiển thị của website. |
| `started_at` | `TIMESTAMPTZ` | `NOT NULL` | Thời điểm phát hiện sự cố sập web. |
| `ended_at` | `TIMESTAMPTZ` | - | Thời điểm website phục hồi hoạt động trở lại. |
| `duration_s` | `INTEGER` | `DEFAULT 0` | Tổng thời gian gián đoạn (tính bằng giây). |
| `http_code` | `INTEGER` | - | Mã lỗi HTTP (500, 502, 504, 0). |
| `error_msg` | `TEXT` | - | Chi tiết thông báo lỗi kết nối hoặc timeout. |
| `is_ongoing` | `BOOLEAN` | `DEFAULT TRUE` | Đánh dấu sự cố có đang tiếp diễn hay không. |

#### 5. Bảng `workspace_organizations` (Cây phả hệ tổ chức Pythaverse)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính tổ chức. |
| `code` | `VARCHAR(100)` | `UNIQUE NOT NULL` | Mã tổ chức duy nhất (VD: `DST_01`, `PAR_102`, `SCH_10266`). |
| `name` | `VARCHAR(255)` | `NOT NULL` | Tên tổ chức / trường học / đối tác. |
| `role_type` | `VARCHAR(50)` | `NOT NULL` | Cấp bậc tổ chức: `distributor`, `partner`, `school`. |
| `parent_id` | `UUID` | `REFERENCES workspace_organizations(id)` | Khóa ngoại trỏ tới tổ chức cấp trên trực tiếp. |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm tạo bản ghi. |

#### 6. Bảng `workspace_credentials_vault` (Két sắt thông tin đăng nhập tự động hóa)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính két sắt. |
| `org_id` | `UUID` | `UNIQUE REFERENCES workspace_organizations(id) ON DELETE CASCADE` | Khóa ngoại liên kết tới tổ chức. |
| `account_role` | `VARCHAR(50)` | `NOT NULL` | Vai trò tài khoản: `distributor_admin`, `partner_admin`, `school_admin`. |
| `username` | `VARCHAR(255)` | `NOT NULL` | Tên đăng nhập Workspace. |
| `encrypted_password`| `TEXT` | `NOT NULL` | Mật khẩu đã được mã hóa bằng thuật toán Fernet. |
| `is_active` | `BOOLEAN` | `DEFAULT TRUE` | Trạng thái hoạt động của tài khoản. |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm cập nhật cuối cùng. |

#### 7. Bảng `workspace_courses` (Danh mục khóa học chuẩn)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính khóa học. |
| `course_id` | `INTEGER` | `UNIQUE NOT NULL` | Mã ID số của khóa học trên LMS (VD: `654`). |
| `course_name` | `VARCHAR(255)` | `NOT NULL` | Tên đầy đủ của khóa học. |
| `category` | `VARCHAR(50)` | `NOT NULL` | Phân loại Category (`SWRP`, `IR`, `ASP`, `Other`). |
| `lms_url` | `TEXT` | `NOT NULL` | Đường dẫn trực tiếp tới khóa học trên LMS. |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm tạo khóa học. |

#### 8. Bảng `author_profile` (Hồ sơ Tác Giả & Khẳng định Chủ Quyền Động)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính hồ sơ tác giả (`00000000-0000-0000-0000-000000000001`). |
| `name` | `VARCHAR(255)` | `NOT NULL` | Họ tên tác giả ("Nguyễn Mạnh Hùng"). |
| `title` | `VARCHAR(255)` | `NOT NULL` | Chức danh chuyên môn ("Lead AI Engineer & Automation Architect"). |
| `bio` | `TEXT` | `NOT NULL` | Mô tả tiểu sử và năng lực tự động hóa. |
| `avatar_url` | `TEXT` | - | Đường dẫn ảnh đại diện (lưu trữ trên Supabase Storage). |
| `location` | `VARCHAR(100)` | - | Địa điểm làm việc ("Hà Nội, Việt Nam"). |
| `organization` | `VARCHAR(255)`| - | Đơn vị chủ quản ("Pythaverse / DTT Corporation"). |
| `socials` | `JSONB` | `DEFAULT '[]'::jsonb` | Danh sách mạng xã hội ({name, url, iconName, colorClass}). |
| `project_info` | `JSONB` | `DEFAULT '{}'::jsonb` | Thông tin phiên bản và điểm nhấn kiến trúc. |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm cập nhật gần nhất. |

#### 9. Bảng `site_monitor_credentials` (Két sắt thông tin kiểm thử Ma Trận Xác Thực & Phân Quyền)
| Tên Cột | Kiểu Dữ Liệu | Ràng Buộc / Mặc Định | Ý Nghĩa & Mục Đích Nghiệp Vụ |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Khóa chính tài khoản test. |
| `site_id` | `VARCHAR(100)` | `NOT NULL` | Phân hệ gắn liền (`pythaverse_main`, `ide`, `avatar`, `learn`...). |
| `role_label` | `VARCHAR(100)` | `NOT NULL` | Tên vai trò kiểm thử (`Admin`, `Sales Admin`, `Distributor`, `Partner`, `School`, `Teacher`, `Student`). |
| `expected_path` | `VARCHAR(255)`| `DEFAULT '/'` | Route nội bộ mong đợi tài khoản truy cập được sau khi đăng nhập SSO. |
| `encrypted_credentials`| `TEXT` | `NOT NULL` | Dữ liệu đăng nhập JSON `{username, password}` đã mã hóa Fernet. |
| `is_active` | `BOOLEAN` | `DEFAULT TRUE` | Trạng thái kích hoạt kiểm thử. |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Thời điểm cập nhật cuối cùng. |

---

### 6.3. Chỉ Mục (Indexes), Triggers, RLS Policies & Supabase Storage

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
ALTER TABLE site_monitor_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_dtt_vn_only" ON inbox_tickets
    FOR ALL USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');

CREATE POLICY "admin_dtt_vn_only" ON bot_automation_tasks
    FOR ALL USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');

CREATE POLICY "admin_dtt_vn_only" ON templates_config
    FOR ALL USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');

CREATE POLICY "admin_dtt_vn_only" ON site_monitor_credentials
    FOR ALL USING ((auth.jwt() ->> 'email') LIKE '%@dtt.vn');
```

#### 3. Supabase Storage Bucket (`ticket-attachments`)
- **Chế độ:** Public Bucket.
- **Mục đích:** Lưu trữ hình ảnh, avatar, tài liệu PDF, file Excel đính kèm được tải từ Gmail API, OS Ticket và Profile Settings.
- **Quy tắc đường dẫn:** `attachments/{msg_id}_{filename}`, `osticket/{ticket_id}_{filename}`, `avatars/avatar_{timestamp}.png`.
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
  - `/studio`: Trung tâm khởi tạo & điều phối bot độc lập (`AutomationStudioPage`).
  - `/github`: Điều phối tạo Bug Issue GitHub (`GithubReporterPage`).
  - `/bots`: Trung tâm giám sát và điều khiển Bot Workers (`BotCommanderPage`).
  - `/reports`: Xuất Báo Cáo KPI DTT 3Đ sang Excel (`ReportsExportPage`).
  - `/telegram`: Mô phỏng Telegram Mini App (`TelegramAppPage`).
  - `/monitor`: Giám sát 3 Tabs: Uptime, Auth Matrix & CI/CD Logs (`SiteMonitorPage`).
  - `/profile`: Thiết lập thông tin Tác Giả & MXH (`ProfileSettingsPage`).
- **Cơ chế ProtectedRoute:** Kiểm tra trạng thái `loading` và `user` từ `AuthContext`. Nếu chưa đăng nhập, tự động chuyển hướng về `/login`.

---

### 7.2. Quản Lý Ngữ Cảnh: Xác Thực & Giao Diện Sáng/Tối (`context/`)

#### 1. [AuthContext.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/context/AuthContext.tsx) – Kiểm Soát Quyền Truy Cập Nghiêm Ngặt
- **State cung cấp:** `user`, `loading`, `signInWithGoogle()`, `signOut()`.
- **Lắng nghe phiên:** `supabase.auth.onAuthStateChange`.
- **Ràng buộc Whitelist Email:**
  ```ts
  const ALLOWED_ADMIN_EMAIL = "hung.nguyenmanh@dtt.vn";
  ```
  Nếu tài khoản đăng nhập không khớp với `hung.nguyenmanh@dtt.vn`, hệ thống lập tức kích hoạt `toast.error`, tự động gọi `supabase.auth.signOut()` và xóa `user` về `null`.

#### 2. [ThemeContext.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/context/ThemeContext.tsx) – Quản Lý Giao Diện Light / Dark Theme
- **State:** `theme` (`'light'` | `'dark'`), `setTheme()`, `toggleTheme()`.
- **Cơ chế vận hành:** Thêm hoặc xóa class `dark` trên thẻ `document.documentElement` (`<html>`), lưu trạng thái lựa chọn vào `localStorage.getItem('theme')`.

---

### 7.3. Cấu Hình Chủ Quyền Tác Giả (`config/authorConfig.ts`)

Khẳng định quyền tác giả và bản quyền dự án, hiển thị công khai tại Trang Chủ (`LandingPage`) và đồng bộ động từ `author_profile` trong Supabase:
- `name`: "Nguyễn Mạnh Hùng" (Project Creator & Lead Architect).
- `title`: "Lead AI Engineer & Automation Architect".
- `bio`: Chuyên gia thiết kế các giải pháp Tự Động Hóa Doanh Nghiệp (Enterprise Automation Hub), tích hợp AI Gemini Triage, Bot Workers và điều phối tác vụ đa kênh cho Pythaverse.
- `avatarUrl`: Ảnh đại diện tác giả lưu trữ trên Supabase Storage.
- `location`: "Hà Nội, Việt Nam" | `organization`: "Pythaverse / DTT Corporation".
- `socials`: Danh sách các nút bấm mạng xã hội tương tác trực tiếp (GitHub, LinkedIn, Facebook, Email, Portfolio, Telegram, Threads...).
- `projectInfo`: Phiên bản `v1.0.0 Enterprise Release`, công nghệ cốt lõi và các điểm nhấn kiến trúc.

---

### 7.4. Client Utilities & Type Definitions (`lib/` & `types/`)

#### 1. [frontend/src/lib/api.ts](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/lib/api.ts)
- Hàm `fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T>`:
  - Tự động ghép tiền tố `VITE_API_BASE_URL` (mặc định `http://localhost:8000/api/v1`).
  - Tự động gán header `Content-Type: application/json`.
  - Bắt lỗi HTTP status khác 2xx và ném Error kèm thông điệp chi tiết từ Backend.

#### 2. [frontend/src/lib/supabase.ts](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/lib/supabase.ts)
- Khởi tạo client Supabase singleton thông qua `createClient(supabaseUrl, supabaseAnonKey)`.

#### 3. [frontend/src/types/index.ts](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/types/index.ts)
Khai báo đầy đủ TypeScript Types & Interfaces:
- `InboxTicket`: Định dạng dữ liệu ticket đầy đủ các trường đính kèm, metadata, country, doc_url.
- `BotAutomationTask`: Tác vụ tự động hóa kèm ticket join, execution_logs, payload_data.
- `ReportsSummary`: Số liệu KPI tổng thể, category_ratios, daily_trends.
- `BotWorkersStatusResponse` & `BotTerminalLog`: Cấu trúc dữ liệu giám sát Workers và Terminal Logs.
- `GithubIssuePayload` & `GithubIssueResponse`: Cấu trúc request/response tạo issue trên GitHub.

---

### 7.5. Layout & Navigation Components (`components/`)

#### 1. [Sidebar.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/common/Sidebar.tsx)
- Cột điều hướng bên trái cố định (`h-screen sticky top-0`) tích hợp Drawer Menu phản hồi mượt mà trên Mobile (`isMobileNavOpen`).
- Logo thương hiệu Pythaverse Admin Automation Hub.
- Menu 9 Modules quản trị: Executive Dashboard, Unified Inbox Feed, Task & Approval Hub, **Automation Studio**, GitHub Dispatcher, Bot Execution Center, Analytics & XLSX Export, Telegram Mini App, Site Health Monitor.
- Sử dụng `NavLink` với style kích hoạt trực quan, bóng đổ và màu sắc hiện đại.

#### 2. [Header.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/common/Header.tsx)
- Thanh điều khiển trên cùng với hiệu ứng làm mờ nền (`backdrop-blur-md`).
- Tích hợp nút Hamburger Menu trên mobile (`lg:hidden`).
- Ô tìm kiếm toàn cục (Global Search Input).
- Nút chuyển đổi giao diện Sáng / Tối (`Moon` / `Sun`).
- Profile Dropdown menu: Chuyển hướng tới `/profile` (Thiết lập thông tin tài khoản & MXH) và nút Đăng xuất (`LogOut`).

#### 3. [AppLayout.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/layout/AppLayout.tsx)
- Khung bố cục chuẩn bọc `Sidebar` và `Header`, quản lý trạng thái `isMobileNavOpen` và áp dụng thẻ `<Outlet />` của React Router DOM để render nội dung động.

---

### 7.6. Chi Tiết Từng Module Tính Năng Giao Diện (`features/`)

#### 1. [LandingPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/landing/LandingPage.tsx) (Trang Chủ Trình Diễn)
- Giao diện Dark/Light mode sang trọng với các hiệu ứng ánh sáng mờ ambient blur blobs.
- Header công khai điều hướng nhanh tới đăng nhập Google SSO.
- Hero Section giới thiệu năng lực tự động hóa kết hợp Gemini AI.
- Khu vực **Chủ Quyền Tác Giả (Author Ownership Section)**: Thẻ thông tin lớn giới thiệu tác giả Nguyễn Mạnh Hùng với ảnh đại diện, chức danh, mô tả năng lực và hệ thống nút bấm mạng xã hội tương tác trực tiếp (tự động đồng bộ động từ `author_profile` trong Supabase).

#### 2. [LoginPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/auth/LoginPage.tsx) (Trang Đăng Nhập Doanh Nghiệp)
- Thẻ Card đăng nhập với huy hiệu giải thích quy tắc bảo mật chỉ cho phép tài khoản Google `@dtt.vn`.
- Nút bấm chính: **"Đăng nhập bằng Google Workspace"** kết nối trực tiếp với Supabase Auth OAuth Provider.

#### 3. [DashboardPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/dashboard/DashboardPage.tsx) (Executive Dashboard)
- **4 Thẻ Bento KPI Real-time:** Ticket Chờ Xử Lý, Tác Vụ Chờ Phê Duyệt, Đã Giải Quyết Trong Tháng, Tỷ Lệ Tự Động Hóa / Sức Khỏe Hệ Thống.
- **Biểu đồ tròn Recharts (`PieChart`):** Phân phối tỷ lệ ticket theo danh mục (System Bugs, Keycloak Account, LMS Enroll, License, Others) với bộ chọn thời gian linh hoạt (7 ngày, 30 ngày, tháng này).
- **Biểu đồ cột Recharts (`BarChart`):** Xu hướng so sánh số lượng Ticket Tiếp Nhận vs Đã Xử Lý hàng ngày.

#### 4. [UnifiedInboxPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/inbox/UnifiedInboxPage.tsx) (Hòm Thư Hợp Nhất Đa Kênh)
- **Bộ lọc kép đa chiều:**
  - Nguồn: `Tất cả Nguồn`, `✉️ Gmail`, `📝 Google Form`, `🎫 OS Ticket`.
  - Danh mục: `Tất cả Category`, `🐛 System Bugs`, `🔑 Keycloak/Account`, `🎓 LMS Enroll`, `📜 License`, `📌 Khác`, `🗑️ Đã Bỏ Qua`.
  - Trạng thái: `Tất cả Trạng Thái`, `⏳ Chờ Xử Lý`, `🔄 Đang Xử Lý`, `✅ Đã Giải Quyết`, `🗑️ Đã Bỏ Qua`.
- **Đảo thứ tự sắp xếp:** Chuyển đổi nhanh giữa `Mới nhất` và `Cũ nhất`.
- **Dropdown đổi Tag trực tiếp:** Cho phép Admin đổi Category của ticket ngay trên từng card và lưu tức thì vào Supabase.
- **Deep Link mở trang nguồn gốc:**
  - Gmail: Mở tìm kiếm theo Message ID (`mail.google.com/mail/u/0/#search/id%3A...`).
  - Google Form: Mở Google Sheet và bôi đen đúng dải ô dòng tương ứng (`range=A{row}:P{row}`).
  - OS Ticket: Mở đúng ticket qua Internal ID (`support.pythaverse.space/scp/tickets.php?id=...`).
- **Modal xem trước tệp đa năng (`FileViewerModal`):** Xem ảnh trực tiếp, xem PDF trong `iframe`, nhúng Google Docs Viewer cho tài liệu DOCX/XLSX.
- **Modal Tạo Tác Vụ Bot Automation:** Hỗ trợ Searchable Combobox tìm kiếm trường học trong 480+ trường phả hệ, thêm/xóa nhiều khóa học, AI tự động bóc tách file COF và trình soạn thảo JSON Payload đồng bộ tự động.
- **Thẻ tóm tắt Gemini AI:** Hiển thị nội dung tóm tắt tiếng Việt và nhân sự được đề xuất phân công kèm email.
- **Nút hành động:** `[Bỏ qua]`, `[Khôi phục]`, `[Hoàn thành]`, `[Tạo Issue GitHub]`, `[Tạo Tác Vụ Bot Automation]`.

#### 5. [AutomationStudioPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/studio/AutomationStudioPage.tsx) (Trung Tâm Khởi Tạo & Điều Phối Bot Độc Lập)
- Cho phép Quản trị viên chủ động cấu hình và kích hoạt các tác vụ bot mà **không cần gắn với một Inbox Ticket** (`ticket_id = null`, `is_manual_dispatch = true`).
- **4 Bộ Dispatcher Engines:**
  1. `🔑 Keycloak Identity Bot`: Cấu hình Reset Mật khẩu, Xác thực Email, Tạm khóa / Kích hoạt tài khoản với bộ 3 Switch Toggles độc quyền.
  2. `🏢 Workspace Phả Hệ & License Bot`: Tích hợp 6 phân luồng chuyên biệt (Trọn Gói Toàn Trình, Duyệt Đơn Hàng Trường, Duyệt Hợp Đồng Đối Tác, Duyệt Hợp Đồng Quản Trị, Tạo Tài Khoản, Ghi Danh LMS), Searchable Combobox lọc 480+ trường phả hệ, tự động điền Partner & Distributor, chọn danh mục môn học (`SWRP`, `IR`, `ASP`) và số lượng License.
  3. `🎓 LMS Course & Git Provisioning`: Ghi danh học sinh/giáo viên và kích hoạt tài khoản Git qua Moodle WebServices.
  4. `🤖 Google Feedback & Doc Triage`: Tự động đọc và @mention bình luận nhân sự phụ trách trên Google Docs.
- **Live JSON Payload Editor:** Tự động sinh cấu trúc JSON tham số tương ứng thời gian thực, cho phép Admin chỉnh sửa trực tiếp hoặc Copy 1-click vào Clipboard.
- **Nút gửi phê duyệt:** Tạo bản ghi vào `bot_automation_tasks` với nhãn `⚡ Tác vụ Studio Trực Tiếp` để Admin phê duyệt an toàn.

#### 6. [TaskManagementPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/tasks/TaskManagementPage.tsx) (Cổng Kiểm Soát Human-in-the-Loop)
- Bảng danh sách các tác vụ Bot đang chờ phê duyệt, đã duyệt hoặc bị từ chối (hỗ trợ cuộn ngang mượt mà trên thiết bị di động).
- Tự động nhận diện và hiển thị huy hiệu phân biệt giữa tác vụ sinh từ Inbox và tác vụ trực tiếp từ Automation Studio.
- **Modal Phê Duyệt & Chỉnh Sửa Payload (Human-in-the-Loop Visual Form):** Hỗ trợ chuyển đổi linh hoạt giữa Form trực quan và JSON Editor cho phép Admin kiểm tra, tùy chỉnh mật khẩu, trạng thái tài khoản trước khi bấm `Phê Duyệt & Chạy Worker`.
- **Modal Xem Log Thực Thi:** Hiển thị chi tiết toàn bộ log chạy của worker theo thời gian thực.

#### 7. [BotCommanderPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/bots/BotCommanderPage.tsx) (Trung Tâm Điều Khiển Bot)
- Thẻ giám sát trạng thái 6 Cloud Workers: Gmail Sync Worker, Keycloak Identity Bot, Workspace License RPA, LMS & Git Provisioning, Feedback Doc Triage, GitHub Issue Dispatcher.
- Nút bấm `Restart Worker` và `Retry Task` để kích hoạt lại chu kỳ kiểm tra hoặc chạy lại tác vụ bị lỗi.
- Màn hình Terminal Console giả lập hiển thị live logs của hệ thống với ô tìm kiếm và tính năng Auto-scroll.

#### 8. [GithubReporterPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/github/GithubReporterPage.tsx) (Tạo GitHub Issue Chuyên Sâu)
- Form soạn thảo Issue gửi tới Private Repository.
- **Nút "AI Auto-Fill Bug Report":** Kết hợp tri thức hệ thống từ `knowledge_base.json` và **Ghi chú khảo sát chuyên sâu của QA** để sinh bản báo cáo lỗi kỹ thuật chuẩn xác 100% bằng Markdown (Mô tả, Môi trường QA/Prod, Điều kiện tiên quyết, Các bước tái hiện, Thực tế vs Mong đợi, Bằng chứng Logs).
- Chọn Assignees (`nguyenthetrung5-PTV`, `thetrungdtt`), Labels, Mức độ ưu tiên, Phân hệ ảnh hưởng.
- Tab Chuyển đổi giữa Soạn thảo (Write) và Xem trước (Preview).

#### 9. [ReportsExportPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/reports/ReportsExportPage.tsx) (Xuất Báo Cáo Excel Phía Client)
- **Template Chuẩn DTT 3Đ (Định lượng - Đối tượng - Đích đến):**
  - Trích xuất toàn bộ tickets và tasks trong khoảng ngày.
  - Tự động điền đầy đủ 5 mục công việc: Xử lý Support Ticket, Phát triển Hub Tự Động Hóa, Kiểm thử & Báo lỗi GitHub, Xử lý Email Workspace, Xử lý Google Form Feedback.
  - Tự động đính kèm danh sách Link dẫn chứng OS Ticket, Gmail và Form Tracking.
- Tích hợp thư viện SheetJS (`xlsx`) tạo và tải file `.xlsx` về máy ngay trên trình duyệt mà không cần xử lý nặng tại server.

#### 10. [TelegramAppPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/telegram/TelegramAppPage.tsx) (Telegram Mini App Simulator)
- Khung mô phỏng giao diện di động trên Telegram, cho phép phê duyệt nhanh tác vụ qua nút bấm cảm ứng tối ưu cho mobile.

#### 11. [SiteMonitorPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/monitor/SiteMonitorPage.tsx) (Trung Tâm Giám Sát Sức Khỏe & Hạ Tầng 3-Tabs)
- Thiết kế 3 Tabs chuyên sâu cho toàn bộ hệ sinh thái:
  - **Tab 1: Giám Sát Công Khai:** Giám sát trạng thái Live của 10 website Pythaverse, thanh Uptime Bars 45 ngày theo chuẩn UptimeRobot, Live Uptime Bar 24 giờ và bảng Incident Log tra cứu lịch sử sự cố gián đoạn.
  - **Tab 2: Ma Trận Xác Thực & Phân Quyền:** Kiểm thử tự động đăng nhập Keycloak SSO cho 16 tài khoản mẫu thuộc 7 vai trò cốt lõi (`Admin`, `Sales Admin`, `Distributor`, `Partner`, `School`, `Teacher`, `Student`), đo thời gian phản hồi và xác thực quyền truy cập các route nội bộ của từng portal.
  - **Tab 3: CI/CD & Tiến Trình Triển Khai:** Kết nối Vercel REST API và Render REST API, theo dõi trạng thái các bản build Frontend SPA và Backend Container, tích hợp trình xem Terminal Build Logs thời gian thực trực tiếp trên trình duyệt.

#### 12. [ProfileSettingsPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/profile/ProfileSettingsPage.tsx) (Thiết Lập Chủ Quyền Tác Giả)
- Quản lý hồ sơ tác giả Nguyễn Mạnh Hùng, chức danh, đơn vị chủ quản, vị trí địa lý và bio giới thiệu.
- Tải ảnh đại diện trực tiếp lên Supabase Storage bucket `ticket-attachments/avatars/`.
- Quản lý hệ sinh thái mạng xã hội với tính năng tự động nhận diện nền tảng (Threads, Telegram, Zalo, WhatsApp, Instagram, X, YouTube, Discord, GitHub, LinkedIn, Facebook, Email).
- Lưu trữ và đồng bộ tức thì vào bảng `author_profile` trong Supabase.

---

## 8. Quy Chuẩn Phát Triển & Hướng Dẫn Mở Rộng Cho AI / Developer

Khi AI Assistant hoặc Developer tiếp tục bảo trì và mở rộng hệ thống, BẮT BUỘC tuân thủ các nguyên tắc sau:

### 8.1. Thêm một Kênh Thu Thập (Ingestion Channel) Mới
1. **Tạo Service:** Thêm file `backend/app/services/{kenh}_service.py`, định nghĩa hàm `async def poll_{kenh}()`.
2. **Đăng ký Cron Job:** Trong [main.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/main.py), thêm job vào `scheduler` bên trong hàm `lifespan()` thông qua `safe_job_wrapper`.
3. **Mở rộng Database ENUM:** Thêm giá trị vào enum `ticket_source` trong SQL migration.
4. **Cập nhật Frontend:** Bổ sung nguồn lọc và icon tương ứng trong [UnifiedInboxPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/inbox/UnifiedInboxPage.tsx).

### 8.2. Thêm một Bot Worker Mới
1. **Tạo Service:** Xây dựng logic thực thi trong `backend/app/services/{ten}_service.py` hoặc gói `workspace/`.
2. **Đăng ký vào Executor:** Thêm nhánh `elif bot_type == "{ten}":` trong [bot_executor.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/workers/bot_executor.py) và [tasks.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/tasks.py).
3. **Mở rộng Database ENUM:** Thêm giá trị vào enum `bot_type` trong Supabase.
4. **Cập nhật Giao diện:** Khai báo cấu hình worker trong [BotCommanderPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/bots/BotCommanderPage.tsx) và danh sách chọn bot trong [UnifiedInboxPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/inbox/UnifiedInboxPage.tsx).

### 8.3. Thêm một Website Mới Vào Site Monitor
1. Khai báo thông tin website vào mảng `DEFAULT_MONITORED_SITES` trong [site_monitor_service.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/site_monitor_service.py) với `id`, `name`, `url`, `category`, `enabled`, `show_live_alert`, `check_login`.
2. Giao diện [SiteMonitorPage.tsx](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/monitor/SiteMonitorPage.tsx) trên Frontend sẽ tự động nhận diện và hiển thị thanh Uptime Bars cho website mới.

### 8.4. Quy Tắc Code Sạch & Bảo Mật (Clean Code Standards)
- **Type Safety:** 100% hàm Python phải có Type Hints đầy đủ; 100% components React phải có TypeScript Interfaces rõ ràng.
- **Bảo mật bí mật:** Tuyệt đối không hardcode API key, mật khẩu, JWT token vào mã nguồn. Tất cả phải nạp qua `app.core.config.settings` hoặc `import.meta.env`.
- **Human-in-the-Loop Integrity:** Tuyệt đối không được bỏ qua bước phê duyệt `bot_automation_tasks` để tự động chạy ngầm các tác vụ can thiệp hệ thống.

---

## 9. Biến Môi Trường (.env) & Hướng Dẫn Triển Khai Vận Hành

### 9.1. Danh Sách Biến Môi Trường Chi Tiết

#### Backend (`backend/.env`)
```env
# --- CẤU HÌNH HỆ THỐNG ---
PROJECT_NAME="Pythaverse Central Admin & Automation Hub"
ENV="production"
ALLOWED_DOMAIN="dtt.vn"
VAULT_SECRET_KEY="your-fernet-secret-encryption-key-for-credentials-vault"

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

### 9.3. Hướng Dẫn Chạy Thử Nghiệm Scripts & Pipelines

#### 1. Chạy Import Phả Hệ Tổ Chức Vào Supabase
```bash
cd backend
python scripts/import_hierarchy.py scripts/pythaverse_hierarchy_data.xlsx
```

#### 2. Chạy Thử Nghiệm Pipeline COF & Enrollment Simulation
```bash
cd backend
python tests/test_cof_pipeline.py
```

#### 3. Chạy Thử Nghiệm LIVE RPA School Batch Account Creation
```bash
cd backend
python tests/test_playwright_school_bot.py
```

---

### 9.4. Hướng Dẫn Triển Khai Production (Cloud Deployment)

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
