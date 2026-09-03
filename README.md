# 🚀 BÁCH KHOA TOÀN THƯ KIẾN TRÚC HỆ THỐNG PTV-TASKS-ADMINISTRATOR
## Pythaverse Central Admin & Automation Hub (Enterprise Single Source of Truth)

> **Tài liệu Kỹ Thuật Độc Quyền & Tối Cao:** Bản đặc tả kiến trúc toàn diện này được biên soạn nhằm chuẩn hóa và hệ thống lại 100% mã nguồn, sơ đồ luồng dữ liệu, cấu trúc cơ sở dữ liệu, các gói dịch vụ RPA, ma trận bộ nhớ đệm RAM và giao diện người dùng của dự án **`ptv-tasks-administrator`**. Mọi kỹ sư phần mềm, chuyên gia tự động hóa hoặc AI Coder mới chỉ cần đọc tài liệu này là có thể nắm bắt trọn vẹn toàn bộ hệ sinh thái, hiểu rõ từng tệp tin và từng hàm xử lý mà không cần phải duyệt thủ công từng tệp code hay gặp bối rối khi thao tác với một file đơn lẻ.

---

## 📌 THÔNG TIN BẢN QUYỀN & TÁC GIẢ SÁNG LẬP

- **Dự án:** `ptv-tasks-administrator` (Pythaverse Central Admin & Automation Hub)
- **Tác giả & Kiến trúc sư trưởng:** **Nguyễn Mạnh Hùng** (*Lead AI Engineer & Automation Architect – DTT Corporation / Pythaverse Ecosystem*)
- **GitHub:** [`https://github.com/hungnm-1225`](https://github.com/hungnm-1225)
- **Email:** `hungnm@dtt.vn` / `hung.nguyenmanh@dtt.vn`
- **Hệ sinh thái:** [Pythaverse Space](https://pythaverse.space)
- **Phiên bản:** `v2.6.0 Enterprise Reliability Release` (Cập nhật tháng 09/2026)

---

## 📑 MỤC LỤC TỔNG QUAN

1. [PHẦN I: TẦM NHÌN HỆ THỐNG & BỐN NGUYÊN TẮC BẤT DI BẤT DỊCH](#-phần-i-tầm-nhìn-hệ-thống--bốn-nguyên-tắc-bất-di-bất-dịch)
2. [PHẦN II: 7 PHÂN HỆ NGHIỆP VỤ PYTHAVERSE (DOMAIN TRUTH)](#-phần-ii-7-phân-hệ-nghiệp-vụ-pythaverse-domain-truth)
3. [PHẦN III: STACK CÔNG NGHỆ, THƯ VIỆN & THÔNG SỐ VẬN HÀNH MÔI TRƯỜNG](#-phần-iii-stack-công-nghệ-thư-viện--thông-số-vận-hành-môi-trường)
4. [PHẦN IV: SƠ ĐỒ CẤU TRÚC THƯ MỤC MONOREPO TỔNG THỂ & VAI TRÒ TỪNG FILE](#-phần-iv-sơ-đồ-cấu-trúc-thư-mục-monorepo-tổng-thể--vai-trò-từng-file)
5. [PHẦN V: GIẢI PHẪU CHI TIẾT TỪNG FILE & HÀM XỬ LÝ BACKEND (FASTAPI 0.115)](#-phần-v-giải-phẫu-chi-tiết-từng-file--hàm-xử-lý-backend-fastapi-0115)
   - [5.1. Entrypoint & Lifespan Crons Lệch Pha (`main.py`)](#51-entrypoint--lifespan-crons-lệch-pha-mainpy)
   - [5.2. Lõi Hệ Thống Core (`app/core/`)](#52-lõi-hệ-thống-core-appcore)
   - [5.3. Định Nghĩa Dữ Liệu Schemas (`app/models/`)](#53-định-nghĩa-dữ-liệu-schemas-appmodels)
   - [5.4. Tri Thức Nghiệp Vụ Brain (`app/brain/knowledge_base.json`)](#54-tri-thức-nghiệp-vụ-brain-appbrainknowledge_basejson)
   - [5.5. Cổng Giao Tiếp REST API Endpoints & Ma Trận 8 In-Memory Caches (`app/api/v1/endpoints/`)](#55-cổng-giao-tiếp-rest-api-endpoints--ma-trận-8-in-memory-caches-appapiv1endpoints)
   - [5.6. Gói Dịch Vụ Workspace RPA Đa Kế Thừa (`app/services/workspace/`)](#56-gói-dịch-vụ-workspace-rpa-đa-kế-thừa-appservicesworkspace)
   - [5.7. Các Dịch Vụ Nghiệp Vụ Chuyên Biệt (`app/services/`)](#57-các-dịch-vụ-nghiệp-vụ-chuyên-biệt-appservices)
   - [5.8. Bộ Điều Phối Workers Chạy Ngầm (`app/workers/`)](#58-bộ-điều-phối-workers-chạy-ngầm-appworkers)
   - [5.9. Kịch Bản Khởi Tạo Dữ Liệu Scripts (`scripts/`)](#59-kịch-bản-khởi-tạo-dữ-liệu-scripts-scripts)
6. [PHẦN VI: GIẢI PHẪU CHI TIẾT GIAO DIỆN FRONTEND SPA (REACT 19 + VITE 6 + TAILWIND CSS V4)](#-phần-vi-giải-phẫu-chi-tiết-giao-diện-frontend-spa-react-19--vite-6--tailwind-css-v4)
   - [6.1. Khởi Chạy & Định Tuyến Toàn Cục (`App.tsx`, `main.tsx`)](#61-khởi-chạy--định-tuyến-toàn-cục-apptsx-maintsx)
   - [6.2. Thiết Kế Hệ Thống Design System Bento Grid & Enterprise Pastel OKLCH](#62-thiết-kế-hệ-thống-design-system-bento-grid--enterprise-pastel-oklch)
   - [6.3. Cấu Hình Tác Giả, Contexts & Tiện Ích Client (`config/`, `context/`, `lib/`, `types/`)](#63-cấu-hình-tác-giả-contexts--tiện-ích-client-config-context-lib-types)
   - [6.4. Bóc Tách Chi Tiết 13 Feature Modules](#64-bóc-tách-chi-tiết-13-feature-modules)
   - [6.5. Components Dùng Chung & Bố Cục Layout (`components/common/`, `components/layout/`)](#65-components-dùng-chung--bố-cục-layout-componentscommon-componentslayout)
7. [PHẦN VII: CƠ SỞ DỮ LIỆU SUPABASE POSTGRESQL 16 (16 BẢNG & STORAGE BUCKET)](#-phần-vii-cơ-sở-dữ-liệu-supabase-postgresql-16-16-bảng--storage-bucket)
8. [PHẦN VIII: 9 SƠ ĐỒ LUỒNG NGHIỆP VỤ END-TO-END (MERMAID SEQUENCE & FLOWCHARTS)](#-phần-viii-9-sơ-đồ-luồng-nghiệp-vụ-end-to-end-mermaid-sequence--flowcharts)
9. [PHẦN IX: CẨM NANG VẬN HÀNH & MA TRẬN ĐIỀU HƯỚNG DÀNH CHO AI CODER MỚI](#-phần-ix-cẩm-nang-vận-hành--ma-trận-điều-hướng-dành-cho-ai-coder-mới)
10. [PHẦN X: CẨM NANG ĐỊNH TUYẾN CHUYÊN GIA AI (INTELLIGENT AGENT ROUTING PLAYBOOK)](#-phần-x-cẩm-nang-định-tuyến-chuyên-gia-ai-intelligent-agent-routing-playbook)

---

## 🏛️ PHẦN I: TẦM NHÌN HỆ THỐNG & BỐN NGUYÊN TẮC BẤT DI BẤT DỊCH

`ptv-tasks-administrator` được định vị là **Trung tâm Thần kinh Điều phối & Tự Động Hóa Tập Trung (Pythaverse Central Admin & Automation Hub)** cho toàn bộ tập đoàn DTT Corporation và hệ sinh thái giáo dục công nghệ Pythaverse.

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 ĐẦU VÀO ĐA KÊNH (INGESTION)             │
                  │   [Gmail Workspace]  [Google Forms]  [OS Ticket SCP]   │
                  └───────────────────────────┬────────────────────────────┘
                                              │ Ingestion Crons (5 mins)
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                      LÕI TRUNG TÂM PTV-TASKS-ADMINISTRATOR (BACKEND FASTAPI)             │
│                                                                                          │
│  ┌─────────────────────────┐   ┌───────────────────────────┐   ┌──────────────────────┐  │
│  │   Gemini AI Triage      │   │  Human-in-the-Loop Gate   │   │  Lineage & Vault     │  │
│  │   (10-Model Fallback)   │──▶│  (Approval Queue Portal)  │──▶│  (Fernet Encryption) │  │
│  └─────────────────────────┘   └───────────────────────────┘   └──────────────────────┘  │
│                                              │ Phê duyệt / Run Immediate                 │
│                                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                             BOT WORKER EXECUTION CENTER                            │  │
│  │  [Workspace RPA 4-Cấp]  [Keycloak 2-Tier API]  [LMS PLearn Enrol]  [GitHub Dispatch]│  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
│                                              │                                           │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                    MA TRẬN 8 BỘ NHỚ ĐỆM IN-MEMORY RAM (1MS SPEED)                  │  │
│  │    Courses (10m) | Workspace (15m) | Board (5m) | Bots (15s) | Tasks (60s)         │  │
│  │    Tickets (60s) | Monitor (30s)   | Reports (60s)                                 │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────┬───────────────────────────────────────────┘
                                               │ Thực thi tự động
                                               ▼
                  ┌────────────────────────────────────────────────────────┐
                  │               HỆ SINH THÁI ĐÍCH (EXECUTION TARGETS)    │
                  │  School Workspace | PLearn LMS | Keycloak EID | GitHub │
                  └────────────────────────────────────────────────────────┘
```

### Bốn Nguyên Tắc Thiết Kế Bất Di Bất Dịch (Absolute Rules):
1. **Cổng Phê Duyệt Con Người (Human-in-the-Loop Gate):**
   - Mọi tác vụ có khả năng gây đột biến hệ thống (cấp phát License, tạo tài khoản Keycloak, ghi danh LMS, tạo GitHub Issue) BẮT BUỘC phải đi qua hàng đợi phê duyệt của Quản trị viên (`approval_status = 'approved'`), trừ trường hợp Quản trị viên chủ động kích hoạt từ Automation Studio với cờ `run_immediately = true`.
2. **Kiểm Soát Miền Doanh Nghiệp (@dtt.vn Whitelist):**
   - Bảo mật đa tầng dựa trên Supabase OAuth & Bearer Token. Chỉ các tài khoản email Google thuộc miền `@dtt.vn` (đặc biệt tài khoản Quản trị viên Tối cao `hung.nguyenmanh@dtt.vn`) mới có quyền đăng nhập và gọi API. Tự động từ chối và đăng xuất mọi tài khoản ngoài miền.
3. **Bảo Vệ Bộ Nhớ Đệm RAM (Memory Collection Safeguard):**
   - Do hệ thống triển khai trên máy chủ Render giới hạn 512MB RAM, mọi tác vụ chạy ngầm và tiến trình Playwright Chromium BẮT BUỘC phải thực thi bên trong `safe_job_wrapper` và luôn gọi `gc.collect()` trong khối `finally` để giải phóng bộ nhớ nhị phân.
4. **Google Gemini Auto-Fallback 10 Tầng:**
   - Đảm bảo tính sẵn sàng 99.99% cho bộ máy phân tích AI bằng cơ chế tự động chuyển đổi thông minh giữa 10 mô hình Gemini khi gặp lỗi hạn mức `429 Too Many Requests`, `quota_exhausted` hoặc `ResourceExhausted`.

---

## 🌐 PHẦN II: 7 PHÂN HỆ NGHIỆP VỤ PYTHAVERSE (DOMAIN TRUTH)

Mọi kỹ sư và AI Coder khi tương tác với dự án bắt buộc phải hiểu rõ bản chất nghiệp vụ của 7 phân hệ:

| STT | Phân Hệ | Tên Miền / Giao Thức | Core Platform | Vai Trò Kỹ Thuật & Nghiệp Vụ Cốt Lõi | Phương Thức Tự Động Hóa |
|---|---|---|---|---|---|
| **1** | **School Workspace** | `https://pythaverse.space` | React MUI / Direct REST APIs | Hệ thống quản trị phân cấp 3 tầng (`Distributor` ➔ `Partner` ➔ `School`). Trường học tạo Order gửi Đối tác; Đối tác cấp License từ Pool hoặc xin Nhà phân phối cấp bù Contract; Quản trị viên Sales Admin phê duyệt tối cao. | Playwright Chromium Headless + Direct API Scanner (Gói `workspace/` 8 modules). |
| **2** | **PLearn LMS** | `https://learn.pythaverse.space` | Moodle LMS (PHP / MariaDB / Edwiser RemUI) | Cổng đào tạo Moodle LMS. Quản lý danh mục khóa học (`SWRP`, `IR`, `ASP`...) và ghi danh tài khoản theo Vai trò (`Student` - 9, `Non-editing teacher` - 7, `Manager` - 1), chia nhóm lớp tự động. | Playwright Headless + Keyword Filter 2 nhịp trên `td.cell.c2` (`playwright_service.py`). |
| **3** | **PGit Repos** | `https://git.pythaverse.space` | Gitea Git Server (Go / SQLite) | Máy chủ lưu trữ mã nguồn dự án học sinh. Yêu cầu tài khoản người dùng phải đăng nhập SSO qua Keycloak ít nhất 1 lần để kích hoạt cơ chế JIT (Just-In-Time) provisioning. | Kích hoạt SSO OIDC qua Keycloak Admin API / Playwright (`keycloak_service.py`). |
| **4** | **Keycloak Auth IDP** | `https://eid.pythaverse.space` | Keycloak (Java / WildFly / PostgreSQL) | Cổng xác thực định danh tập trung OpenID Connect / OAuth2 (Realm: `idp` / `master`). Quản lý thông tin đăng nhập, reset mật khẩu, kích hoạt/khóa tài khoản và xác thực email. | 2-Tier Hybrid: Direct REST API (300ms) ➔ Playwright RPA Fallback (`keycloak_service.py`). |
| **5** | **Leanbot IDE** | `https://ide.pythaverse.space` | Blockly / Web Bluetooth BLE | Web IDE lập trình khối kéo thả Blockly / App Inventor kết nối Robot phần cứng Leanbot thông qua Bluetooth BLE Companion APK. | Synthetic Monitoring Uptime & Latency (`site_monitor_service.py`). |
| **6** | **Support Helpdesk** | `https://support.pythaverse.space` | osTicket (PHP / MySQL) | Hệ thống tiếp nhận sự cố kỹ thuật osTicket. Được cào dữ liệu tự động định kỳ 5 phút qua Playwright Headless session. | Playwright headless scraper cào vé, custom form fields & files đính kèm (`osticket_service.py`). |
| **7** | **PContest** | `https://contest.pythaverse.space` | Next.js / Python Judge | Hệ thống tổ chức thi đấu lập trình trực tuyến, quản lý bảng xếp hạng Leaderboard và chấm điểm tự động. | Synthetic Monitoring Uptime & Latency (`site_monitor_service.py`). |

---

## 🛠️ PHẦN III: STACK CÔNG NGHỆ, THƯ VIỆN & THÔNG SỐ VẬN HÀNH MÔI TRƯỜNG

```
                      ┌────────────────────────────────────────────────────────┐
                      │              KIẾN TRÚC CÔNG NGHỆ HIỆN ĐẠI              │
                      └────────────────────────────────────────────────────────┘
                       ┌───────────────────────┐      ┌───────────────────────┐
                       │     FRONTEND SPA      │      │     BACKEND API       │
                       ├───────────────────────┤      ├───────────────────────┤
                       │ • React 19 Strict     │      │ • Python 3.11         │
                       │ • TypeScript Strict   │      │ • FastAPI 0.115       │
                       │ • Vite 6 Bundler      │      │ • Pydantic v2         │
                       │ • Tailwind CSS v4     │      │ • APScheduler 3.10    │
                       │ • Lucide React Icons  │      │ • Playwright Async    │
                       │ • Sonner Toast & D&D  │      │ • Fernet Cryptography │
                       │ • Canvas Confetti     │      │ • SheetJS / OpenPyXL  │
                       │ • Bento Grid Layout   │      │ • 8 In-Memory Caches  │
                       └───────────────────────┘      └───────────────────────┘
                                      │                      │
                                      ▼                      ▼
                       ┌──────────────────────────────────────────────────────┐
                       │             CƠ SỞ DỮ LIỆU & ĐIỆN TOÁN ĐÁM MÂY        │
                       ├──────────────────────────────────────────────────────┤
                       │ • Supabase PostgreSQL 16 (16 Tables + RLS Policies)  │
                       │ • Google Gemini AI Studio (10-Model Sequence)        │
                       │ • Vercel (Frontend Hosting) & Render (Backend Docker)│
                       │ • Google Workspace APIs (Gmail, Sheets, Docs, Drive) │
                       └──────────────────────────────────────────────────────┘
```

### 1. Backend Stack & Phiên Bản Chuẩn
- **Ngôn ngữ & Runtime:** Python `3.11.x`
- **Web Framework:** FastAPI `0.115.x` (Asynchronous, OpenAPI/Swagger tự sinh tại `/docs`)
- **Validation Engine:** Pydantic `2.10.x` (Strict Schema Validation & Settings Management)
- **RPA & Automation Engine:** Playwright Async Chromium (`playwright.async_api: 1.50.x`) với cờ tối ưu RAM nghiêm ngặt.
- **Lập lịch chạy ngầm:** APScheduler `3.10.x` (`AsyncIOScheduler`) với 6 Crons so le lệch pha.
- **In-Memory Caching:** Bộ nhớ đệm RAM tự phát triển (Ma trận 8 In-Memory Caches, TTL 15s - 15m, phản hồi 1ms, tự động invalidate khi có thao tác CUD).
- **Mã hóa dữ liệu Két Sắt:** `cryptography.fernet: ^44.0.x` (Thuật toán mã hóa đối xứng khóa 32 bytes URL-safe base64).
- **Trí tuệ nhân tạo (AI):** `google-generativeai: ^0.8.4` tích hợp chuỗi 10 models fallback tự phục hồi.
- **Xử lý Bảng tính:** `openpyxl: ^3.1.5` kết hợp định dạng màu hex và công thức Excel.
- **HTTP Client:** `httpx: ^0.28.x` cho REST API calls và synthetic monitoring.

### 2. Frontend Stack & Phiên Bản Chuẩn
- **Framework UI:** React `19.0.0` (Functional Components, Custom Hooks, Concurrent Rendering)
- **Ngôn ngữ:** TypeScript `5.7.x` Strict Mode (`strict: true`, tuyệt đối không dùng `any` bừa bãi)
- **Bundler:** Vite `6.2.x` (Hỗ trợ HMR siêu tốc và tối ưu hóa Dynamic Chunk Splitting)
- **Định tuyến:** React Router DOM `v7` (Lazy loading 100% 13 modules với `React.lazy` + `Suspense`)
- **CSS Styling:** Tailwind CSS `4.0.x` (Kiến trúc Design Tokens hiện đại `@import "tailwindcss";`, Dark/Light Mode, Container Queries, Bento Grid SaaS aesthetic)
- **Biểu tượng (Icons):** `lucide-react: 0.475.x` (Bộ icon đồng nhất, sắc nét)
- **Xử lý Excel Client-side:** SheetJS (`xlsx: 0.18.5`)
- **Thông báo & Hiệu ứng:** `sonner: ^2.0.1` (Toast notifications) và `canvas-confetti: ^1.9.4` (Hiệu ứng pháo hoa khi xong việc).

### 3. Thông Số Tối Ưu RAM Render 512MB (Server Constraints)
- **V8 JavaScript Heap:** Khóa trần ở 128MB qua cờ `--js-flags=--max-old-space-size=128`.
- **Playwright Low-RAM Arguments:** `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--single-process`, `--disable-extensions`, `--disable-background-networking`.
- **Network Route Interceptor:** Hủy tải toàn bộ tài nguyên `image`, `media`, `font` (`.woff`, `.woff2`, `.ttf`), analytics/tracking (`google-analytics`, `facebook`, `hotjar`, `clarity`, `stats.wp.com`...), giảm 60-80% RAM và tăng tốc 3-5 lần.
- **Global Concurrency Semaphore:** `asyncio.Semaphore(1)` khóa đơn phiên – tại một thời điểm chỉ cho phép tối đa 1 phiên Chromium hoạt động trên toàn hệ thống.

---

## 📁 PHẦN IV: SƠ ĐỒ CẤU TRÚC THƯ MỤC MONOREPO TỔNG THỂ & VAI TRÒ TỪNG FILE

```
ptv-tasks-administrator/
├── .agent/                             # Cấu hình AI Assistant & Chuyên gia Agents
│   ├── agents/                         # Hồ sơ năng lực chuyên gia (Frontend, Backend, RPA, Security...)
│   ├── rules/                          # Quy tắc hành vi bắt buộc GEMINI.md
│   ├── skills/                         # Kỹ năng nghiệp vụ chuyên biệt
│   └── workflows/                      # Quy trình làm việc tự động hóa (/brainstorm, /plan, /debug...)
├── backend/                            # Ứng dụng Backend FastAPI (Python 3.11)
│   ├── app/
│   │   ├── api/v1/                     # Bộ định tuyến REST API v1
│   │   │   ├── endpoints/              # 9 Router chi tiết theo miền nghiệp vụ (Có In-Memory Cache)
│   │   │   │   ├── board.py            # API Kanban Board, Thùng rác 30 ngày, Columns, Cards (BoardMemoryCache)
│   │   │   │   ├── bots.py             # API Giám sát 8 Workers, Stream log GMT+7, Retry Worker (BotsMemoryCache)
│   │   │   │   ├── courses.py          # API CRUD Khóa học (Workspace vs LMS), Bulk Upsert, Category (SimpleMemoryCache)
│   │   │   │   ├── github.py           # API Dispatch Issue vào Private Repo & AI Template Generator
│   │   │   │   ├── monitor.py          # API Giám sát 3-Tab: Public Sites, Auth Matrix, CI/CD Logs (MonitorMemoryCache)
│   │   │   │   ├── reports.py          # API Thống kê KPI, Dynamic Health 24h, Xuất DTT 3Đ Excel (ReportsMemoryCache)
│   │   │   │   ├── tasks.py            # API Cổng Duyệt Tác Vụ Human-in-the-Loop, Background Dispatch (TasksMemoryCache)
│   │   │   │   ├── tickets.py          # API Hòm thư hợp nhất, Multi-filter, AI Triage thủ công (TicketsMemoryCache)
│   │   │   │   └── workspace.py        # API Phả hệ 480 trường, RAM Cache, Sync Scanner, Extract COF (WorkspaceMemoryCache)
│   │   │   └── router.py               # Điểm tập hợp toàn bộ Router v1
│   │   ├── brain/                      # Tri thức nghiệp vụ AI Triage Grounding
│   │   │   └── knowledge_base.json     # Định nghĩa 7 phân hệ, từ khóa routing cán bộ phụ trách
│   │   ├── core/                       # Lõi hệ thống & Quản trị tài nguyên
│   │   │   ├── config.py               # Pydantic Settings, Biến môi trường, Hàm múi giờ GMT+7
│   │   │   ├── gemini.py               # AI Engine Triage, Chuỗi 10-Model Fallback tự phục hồi
│   │   │   ├── playwright_manager.py   # Global Semaphore 1-slot, Low-RAM Chromium Args, Route Interceptor
│   │   │   ├── security.py             # Kiểm tra Domain @dtt.vn, Xác thực Bearer JWT
│   │   │   └── supabase.py             # Singleton Supabase Client (Service Role Key)
│   │   ├── models/                     # Schemas Pydantic Validation
│   │   │   ├── task.py                 # Schemas Task Create, Approval, Retry
│   │   │   ├── template.py             # Schemas GitHub Template & XLSX Export Mapping
│   │   │   └── ticket.py               # Schemas Ticket Create, Update, Filter Params
│   │   ├── services/                   # Các dịch vụ nghiệp vụ chuyên biệt
│   │   │   ├── workspace/              # GÓI DỊCH VỤ WORKSPACE RPA ĐA KẾ THỪA (8 MODULES)
│   │   │   │   ├── __init__.py         # Tổng hợp Singleton workspace_playwright_service
│   │   │   │   ├── account_service.py  # Nộp batch tài khoản, Hybrid Fast-Path <=30 users
│   │   │   │   ├── base.py             # Khởi tạo Chromium RAM thấp, Login SSO, Date Formatter
│   │   │   │   ├── contract_service.py # Tạo/Duyệt Hợp đồng PRT -> DST -> Sales Admin
│   │   │   │   ├── enroll_service.py   # Tạo Group và Ghi danh học sinh/GV trên School Workspace
│   │   │   │   ├── order_service.py    # School tạo Order & Partner duyệt Order từ Pool License
│   │   │   │   ├── orchestrator_service.py # Master E2E Chain 4 cấp & Subflows độc lập
│   │   │   │   └── workspace_scanner_service.py # Direct API Scanner 5 Master Distributors
│   │   │   ├── cof_excel_service.py    # Bóc tách COF 3 Tabs, sinh accounts.xlsx, ghi ngược kết quả
│   │   │   ├── github_service.py       # Dispatcher gửi Issue trực tiếp vào Private Repo
│   │   │   ├── gmail_service.py        # Quét hòm thư Gmail, tải Attachment lên Storage Bucket
│   │   │   ├── google_doc_service.py   # Đọc nội dung Doc báo cáo, add comment tag Cc email
│   │   │   ├── google_drive_service.py # Quản lý thư mục Drive 6 cấp, tải COF lên đúng trường
│   │   │   ├── google_sheet_service.py # Quét Form Feedback Sheet & Cập nhật ngược Assigned=TRUE
│   │   │   ├── keycloak_service.py     # 2-Tier Hybrid: Direct REST API + Playwright Fallback
│   │   │   ├── osticket_service.py     # Playwright Scraper cào vé OS Ticket, Custom Form & Files
│   │   │   ├── playwright_service.py   # Ghi danh trực tiếp Moodle LMS PLearn theo vai trò & Group
│   │   │   ├── site_monitor_service.py # Giám sát Uptime 10 site, Test 16 acc test, Vercel/Render CI/CD
│   │   │   ├── ticket_processor.py     # Cầu nối tiếp nhận ticket và kích hoạt AI Triage
│   │   │   ├── workspace_lineage_service.py # Giải mã Fernet Két Sắt & Phân giải phả hệ 3 cấp
│   │   │   └── workspace_playwright_service.py # Bridge file tương thích ngược
│   │   ├── workers/                    # Bộ điều phối thực thi chạy ngầm
│   │   │   ├── bot_executor.py         # Router Worker trung tâm thực thi 4 loại bot (14 actions)
│   │   │   └── ticket_processor.py     # Xử lý luồng nạp ticket và kích hoạt AI
│   │   └── main.py                     # Entrypoint FastAPI, Lifespan 6 Crons so le, safe_job_wrapper
│   ├── scripts/                        # Kịch bản khởi tạo CSDL
│   │   ├── import_hierarchy.py         # Import 480 trường và mã hóa Fernet vào Két Sắt
│   │   ├── seed_monitor_credentials.py # Khởi tạo và mã hóa 16 tài khoản test Site Monitor
│   │   └── test_lms_advanced_features.py # Kịch bản kiểm thử các tính năng nâng cao Moodle LMS
│   ├── Dockerfile                      # Dockerfile triển khai môi trường Render (Chromium ready)
│   └── requirements.txt                # Danh mục gói thư viện Python Backend
├── frontend/                           # Ứng dụng Frontend SPA (React 19 + Vite 6 + Tailwind CSS v4)
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/                 # Components dùng chung (Header.tsx, Sidebar.tsx)
│   │   │   └── layout/                 # Khung sườn giao diện (AppLayout.tsx)
│   │   ├── config/
│   │   │   └── authorConfig.ts         # Khẳng định chủ quyền tác giả Nguyễn Mạnh Hùng & Socials
│   │   ├── context/
│   │   │   ├── AuthContext.tsx         # Quản lý phiên đăng nhập Google & Whitelist @dtt.vn
│   │   │   └── ThemeContext.tsx        # Quản lý giao diện Sáng / Tối (Dark/Light Mode)
│   │   ├── features/                   # 13 TRANG CHỨC NĂNG CHUYÊN BIỆT
│   │   │   ├── auth/LoginPage.tsx      # Đăng nhập bảo mật Google OAuth Whitelist @dtt.vn
│   │   │   ├── board/WorkBoardPage.tsx # Bảng Kanban 6 cột, kéo thả, Confetti, Thùng rác 30 ngày
│   │   │   ├── bots/BotCommanderPage.tsx # Giám sát 8 Workers, Stream Log GMT+7, Restart
│   │   │   ├── courses/CoursesManagerPage.tsx # Quản lý 2 bảng khóa học, Bulk Upsert, Category
│   │   │   ├── dashboard/DashboardPage.tsx # Bảng điều khiển Bento KPI tổng quan, Quick Actions
│   │   │   ├── github/GithubReporterPage.tsx # Điều phối Issue GitHub, AI Template Generator
│   │   │   ├── inbox/UnifiedInboxPage.tsx # Hòm thư hợp nhất đa kênh, Gemini AI Triage
│   │   │   ├── landing/LandingPage.tsx # Trang chủ giới thiệu tác giả & 7 phân hệ Pythaverse
│   │   │   ├── monitor/SiteMonitorPage.tsx # Giám sát 3 Tab: Public Sites, Auth Matrix, CI/CD
│   │   │   ├── profile/ProfileSettingsPage.tsx # Hồ sơ tác giả, trạng thái biến môi trường, System info
│   │   │   ├── reports/ReportsExportPage.tsx # Báo cáo phân tích KPI, Dynamic Health, Xuất DTT 3Đ
│   │   │   ├── studio/AutomationStudioPage.tsx # Điều phối Bot độc lập (Keycloak, RPA, Moodle, Docs)
│   │   │   └── tasks/TaskManagementPage.tsx # Cổng phê duyệt Human-in-the-Loop, Live Terminal Logs
│   │   ├── lib/
│   │   │   ├── api.ts                  # Wrapper gọi API Backend FastAPI chuẩn mực (fetchApi)
│   │   │   └── supabase.ts             # Supabase Client khởi tạo cho Frontend
│   │   ├── types/
│   │   │   └── index.ts                # Toàn bộ định nghĩa TypeScript Strict Types (18+ Interfaces)
│   │   ├── App.tsx                     # Khởi tạo React Router DOM v7 & Lazy Load 13 Pages
│   │   ├── index.css                   # Tailwind CSS v4, Font Plus Jakarta Sans, Scrollbar
│   │   └── main.tsx                    # Khởi tạo React Virtual DOM
│   ├── package.json                    # Danh mục gói thư viện Frontend & Scripts
│   ├── tsconfig.json                   # Cấu hình TypeScript Strict Type-Checking
│   └── vite.config.ts                  # Cấu hình Vite Bundler & Aliases
├── supabase/                           # Cơ sở dữ liệu PostgreSQL 16 & Migrations
│   ├── migrations/                     # Lịch sử nâng cấp CSDL Supabase
│   │   └── 20260812000000_initial_schema.sql # Migration khởi tạo CSDL
│   └── schema.sql                      # Schema chuẩn mực 16 bảng CSDL, RLS, Indexes, Triggers
├── design-system/                      # Cấu hình Design System Bento Grid & Enterprise Pastel OKLCH
│   └── ptv-tasks-admin/
│       └── MASTER.md                   # Bảng màu, typography, shadow, spacing chuẩn
├── design.md                           # Bản đặc tả Design System Enterprise Pastel & Bento Grid
├── Blueprint.md                        # Bản đặc tả kỹ thuật kiến trúc tổng thể Master Blueprint
├── GEMINI.md                           # Bộ quy tắc hệ thống & Chỉ dẫn AI Agent Routing
└── README.md                           # Bách khoa toàn thư kỹ thuật Single Source of Truth
```

---

## 🔬 PHẦN V: GIẢI PHẪU CHI TIẾT TỪNG FILE & HÀM XỬ LÝ BACKEND (FASTAPI 0.115)

### 5.1. Entrypoint & Lifespan Crons Lệch Pha (`main.py`)
- **Tệp tin:** [`backend/app/main.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/main.py)
- **Vai trò:** Khởi tạo ứng dụng FastAPI, cấu hình CORS, thiết lập bộ quản lý vòng đời `lifespan` kích hoạt 6 tiến trình chạy ngầm so le lệch pha (APScheduler) và bảo vệ máy chủ bằng cơ chế `safe_job_wrapper`.

#### Danh Mục Hàm Chi Tiết Trong `main.py`:
1. `safe_job_wrapper(job_func, job_name: str)`
   - **Mục đích:** Hàm bọc an toàn tuyệt đối cho mọi cronjob. Ngăn chặn việc một cronjob bị crash làm sập toàn bộ tiến trình FastAPI, đồng thời tự động kích hoạt `gc.collect()` trong khối `finally` để giải phóng bộ nhớ nhị phân trên môi trường Render 512MB RAM.
   - **Tham số:** `job_func` (hàm bất đồng bộ cần chạy), `job_name` (tên định danh để in log).
   - **Logic:** `try -> await job_func() -> catch Exception (log lỗi) -> finally (gc.collect())`.
2. `poll_workspace_long_tasks()`
   - **Mục đích:** Quét bảng `bot_automation_tasks` tìm các tác vụ có `execution_status = 'waiting_poll'` (Pha 2 của Smart Polling Engine).
   - **Logic:** Mở Chromium Playwright ➔ Gọi `check_and_export_batch_result()` kiểm tra `request_id` ➔ Khi hoàn tất: xuất file `RESULT_accounts.xlsx`, gọi `COFExcelService.write_results_back_to_cof()` ghi ngược kết quả highlight cam `#FCE4D6` & đỏ `#C00000`, tải lên Supabase Storage và thư mục Google Drive của trường, cập nhật task thành `success`, `current_step = 'completed'` và ticket thành `completed`.
3. `lifespan(app: FastAPI)`
   - **Mục đích:** Context Manager quản lý khởi động và tắt ứng dụng an toàn.
   - **Cơ chế Lập Lịch So Le Lệch Pha 6 Crons (So Le & Chống Tràn RAM):**
     1. `gmail_cron`: Gọi `poll_unread_gmails` (chu kỳ 5 phút, khởi chạy sau 5s).
     2. `osticket_cron`: Gọi `poll_open_ostickets` (chu kỳ 5 phút, khởi chạy sau 65s - lệch 1 phút).
     3. `sheet_cron`: Gọi `poll_form_feedbacks` (chu kỳ 5 phút, khởi chạy sau 125s - lệch 2 phút).
     4. `workspace_long_tasks_cron`: Gọi `poll_workspace_long_tasks` (chu kỳ 3 phút, khởi chạy sau 185s - lệch 3 phút).
     5. `site_uptime_cron`: Gọi `poll_site_uptime_cron` (chu kỳ 30 phút, khởi chạy sau 245s - lệch 4 phút).
     6. `distributor_cache_scanner_cron`: Gọi `workspace_scanner_service.scan_and_cache_all_distributors` (chu kỳ 45 phút, khởi chạy sau 305s - lệch 5 phút).
4. `health_check()`
   - **Mục đích:** Endpoint kiểm tra sức khỏe hệ thống tại `/api/v1/health` (hỗ trợ cả GET và HEAD).
   - **Trả về:** `{"status": "online", "scheduler_running": true, "active_jobs": 6}`.

---

### 5.2. Lõi Hệ Thống Core (`app/core/`)

#### 1. [`config.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/config.py)
- **Mục đích:** Quản trị tập trung toàn bộ biến môi trường thông qua Pydantic `BaseSettings`.
- **Hàm tiện ích:**
  - `get_vn_time_str(fmt: str = "%Y-%m-%d %H:%M:%S") -> str`: Trả về thời gian hiện tại theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh` – GMT+7).
  - `get_vn_iso() -> str`: Trả về chuỗi thời gian định dạng ISO chuẩn múi giờ GMT+7.
- **Các nhóm biến chính:** Cấu hình Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), Khóa két sắt (`VAULT_SECRET_KEY`), Danh sách 10 model Gemini (`GEMINI_MODELS`), Thông tin quản trị Keycloak, OS Ticket, GitHub PAT, Google Workspace OAuth và Google Drive Folder IDs.

#### 2. [`gemini.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/gemini.py)
- **Mục đích:** Động cơ phân tích, tóm tắt và tự động gán nhãn cho vé (AI Auto-Triage & Categorization).
- **Hàm `AIEngine.generate_content_with_retry(prompt: str) -> str`:**
  - Triển khai thuật toán **Auto-Fallback 10 tầng**: Duyệt qua danh sách `GEMINI_MODELS` (`gemini-3.8-flash` ➔ `gemini-3.7-flash` ➔ `gemini-3.5-flash-lite` ➔ `gemini-3.1-pro-preview` ➔ `gemini-3.6-flash` ➔ `gemini-3.5-flash` ➔ `gemini-3.1-flash-lite` ➔ `gemini-3-flash-preview` ➔ `gemini-2.5-pro` ➔ `gemini-2.5-flash`). Nếu model hiện tại gặp lỗi `429 (Rate Limit)` hoặc `quota_exhausted`, tự động ghi log cảnh báo và chuyển ngay sang model kế tiếp.
- **Hàm `process_ticket_with_ai(ticket_id: str) -> Optional[Dict[str, Any]]`:**
  - Đọc nội dung thô của ticket từ Supabase, nạp `knowledge_base.json` làm ngữ cảnh domain truth, gửi prompt yêu cầu AI bóc tách JSON chuẩn: `category` (`bug`, `account_keycloak`, `lms_enroll`, `license`, `other`), `priority` (`critical`, `normal`), `ai_summary` (tóm tắt bằng Tiếng Việt), `assigned_name` và `assigned_email`. Cập nhật kết quả ngược vào bảng `inbox_tickets`.

#### 3. [`playwright_manager.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/playwright_manager.py)
- **Mục đích:** Trung tâm kiểm soát tài nguyên và bộ nhớ trình duyệt Playwright Chromium toàn diện, thiết kế riêng cho môi trường máy chủ Render 512MB RAM.
- **Cơ chế Khóa Đơn Phiên (Global Concurrency Semaphore):**
  - `PLAYWRIGHT_CONCURRENCY_SEMAPHORE = asyncio.Semaphore(1)`
  - Context Manager `acquire_playwright_slot(task_name, timeout)`: Đảm bảo tại một thời điểm chỉ có tối đa 1 phiên Chromium chạy ngầm trong toàn bộ hệ thống; các tác vụ khác tự động xếp hàng đợi an toàn thay vì chạy đồng thời gây tràn RAM (OOM Kill).
- **Bộ Cờ Tiết Kiệm RAM (Low-RAM Chromium Arguments):**
  - `LOW_RAM_CHROMIUM_ARGS`: Bật `--js-flags=--max-old-space-size=128` khóa trần V8 Heap ở 128MB, vô hiệu hóa GPU, Audio, Extensions, Sync, Software Rasterizer và Dev-Shm.
- **Bộ Chặn Tải Tài Nguyên (Network Route Interceptor):**
  - `setup_low_ram_routes(target)`: Tự động abort toàn bộ request `image`, `media`, `font` (`.woff`, `.woff2`, `.ttf`), analytics/tracking (`google-analytics`, `facebook`, `hotjar`, `clarity`, `stats.wp.com`...), giảm 60-80% lượng tiêu thụ RAM và tăng tốc độ tải trang gấp 3-5 lần.
- **Trợ Thủ Chờ DOM & API Ổn Định:**
  - `wait_for_dom_and_spinners(page, target_selector, min_pacing_ms, timeout)`: Tự động chờ các spinner/overlay của MUI/WordPress/Moodle biến mất (`.MuiCircularProgress-root`, `.MuiSkeleton-root`, `.MuiDataGrid-loadingOverlay`, `.loading-icon`), chờ selector mục tiêu xuất hiện và chèn micro-pacing 300-500ms cho React Virtual DOM cập nhật hoàn tất trước khi thao tác.
  - `smart_wait_for_options_loaded(page, parent_locator, min_options, timeout)`: Chờ danh sách lựa chọn trong Dropdown Material-UI hoặc Listbox nạp xong từ API (kiểm tra `li[role='option']` và chờ spinner ẩn), thay thế hoàn toàn việc ngủ cứng `wait_for_timeout`.
  - `smart_poll_condition(check_fn, timeout, poll_interval) -> Any`: Động cơ Polling kiểm tra điều kiện bất đồng bộ linh hoạt, trả về kết quả ngay khi hàm kiểm tra đạt điều kiện thay vì phải chờ hết thời gian ngủ tĩnh.

#### 4. [`security.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/security.py)
- **Mục đích:** Kiểm soát an ninh tầng API qua giao thức HTTP Bearer Token.
- **Hàm `verify_dtt_domain_email(email: str) -> bool`:** Kiểm tra phần mở rộng domain của email, bắt buộc phải là `@dtt.vn`.
- **Hàm `get_current_user_email(credentials: HTTPAuthorizationCredentials) -> str`:** Giải mã JWT Token từ Supabase Auth, trích xuất email người dùng và thực thi kiểm tra Whitelist Domain. Nếu vi phạm, trả về lỗi `HTTP 403 Forbidden` ngay lập tức.

#### 5. [`supabase.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/supabase.py)
- **Mục đích:** Cung cấp singleton client kết nối Supabase PostgreSQL với quyền hạn tối cao (`SUPABASE_SERVICE_ROLE_KEY`), cho phép các background workers thao tác CSDL mà không bị chặn bởi RLS.
- **Hàm `get_supabase_client() -> Client`:** Trả về đối tượng singleton kết nối Supabase.

---

### 5.3. Định Nghĩa Dữ Liệu Schemas (`app/models/`)
- [`ticket.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/ticket.py): Chứa `InboxTicketCreate`, `InboxTicketUpdate`, `TicketFilterParams` kiểm soát dữ liệu tìm kiếm, lọc phân trang và cập nhật vé.
- [`task.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/task.py): Chứa `BotAutomationTaskCreate`, `TaskApprovalRequest` (duyệt/từ chối), `TaskRetryRequest` (chạy lại tác vụ lỗi).
- [`template.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/template.py): Chứa schema cấu hình template Markdown cho GitHub Issue và mapping cột xuất file báo cáo XLSX.

---

### 5.4. Tri Thức Nghiệp Vụ Brain (`app/brain/knowledge_base.json`)
- [`knowledge_base.json`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/brain/knowledge_base.json): Tệp tri thức trung tâm chứa định nghĩa kỹ thuật của 7 phân hệ Pythaverse, danh sách cán bộ phụ trách mặc định (Assignees), quy tắc phân loại danh mục khóa học (`SWRP`, `IR`, `ASP`...), giúp Gemini AI phản hồi chính xác tuyệt đối theo ngữ cảnh doanh nghiệp.

---

### 5.5. Cổng Giao Tiếp REST API Endpoints & Ma Trận 8 In-Memory Caches (`app/api/v1/endpoints/`)

Toàn bộ hệ thống REST API Backend được tối ưu hóa phản hồi 1ms thông qua **Ma Trận 8 Bộ Nhớ Đệm In-Memory RAM Caching** hoàn toàn độc lập, không phụ thuộc Redis:

| STT | Lớp Cache Engine | Tệp Tin Khai Báo | TTL Mặc Định | Cơ Chế Invalidate (Làm Sạch) | Phạm Vi Dữ Liệu Đệm |
|---|---|---|---|---|---|
| **1** | `SimpleMemoryCache` | [`courses.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/courses.py) | 600s (10 phút) | Tự động khi Thêm, Sửa, Xóa, Bulk Upsert, Đổi tên Category. | Danh mục khóa học `workspace_courses`, `lms_courses` và danh sách Category. |
| **2** | `WorkspaceMemoryCache` | [`workspace.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/workspace.py) | 900s (15 phút) | Khi gọi `sync-cache-now` hoặc cập nhật phả hệ. | Phả hệ 480 trường học, cache Orders/Contracts của 5 Master Distributors. |
| **3** | `BoardMemoryCache` | [`board.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/board.py) | 300s (5 phút) | Khi tạo/sửa bảng, xóa vào thùng rác, khôi phục, kéo thẻ, cập nhật subtasks. | Danh sách Bảng, Thùng rác, Cột trạng thái, Thẻ công việc. |
| **4** | `BotsMemoryCache` | [`bots.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/bots.py) | 15s | Khi force sync, purge RAM hoặc kích hoạt retry worker. | Trạng thái Real-time 8 Workers và terminal logs thực thi gần nhất. |
| **5** | `TasksMemoryCache` | [`tasks.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/tasks.py) | 60s | Khi duyệt task, tạo task mới hoặc cập nhật trạng thái worker. | Danh sách tác vụ tự động hóa trong hàng đợi phê duyệt. |
| **6** | `TicketsMemoryCache` | [`tickets.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/tickets.py) | 60s | Khi hoàn thành vé, bác bỏ vé, đổi category hoặc sync đa kênh. | Danh sách vé hòm thư đa kênh hợp nhất theo bộ lọc. |
| **7** | `MonitorMemoryCache` | [`monitor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/monitor.py) | 30s | Khi quản trị viên bấm nút "Kiểm tra ngay (Check Now)". | Trạng thái Uptime 10 site, lịch sử uptime 45 ngày và nhật ký sự cố. |
| **8** | `ReportsMemoryCache` | [`reports.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/reports.py) | 60s | Khi có vé hoặc tác vụ mới hoàn tất. | Thống kê 4 thẻ KPI, Dynamic Health 24h, biểu đồ donut và xu hướng 7 ngày. |

#### Giải Phẫu Chi Tiết 9 Router API:

1. **[`tickets.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/tickets.py) (`/tickets`):**
   - `GET /`: `list_tickets(status, category, source, sort)` – lọc đa tiêu chí, đọc từ `TicketsMemoryCache`.
   - `POST /sync/osticket`: `trigger_sync_osticket()` – kích hoạt cào vé OS Ticket chạy ngầm và invalidate cache.
   - `POST /sync/gmail`: `trigger_sync_gmail()` – kích hoạt quét Gmail chạy ngầm và invalidate cache.
   - `PUT /{ticket_id}/complete`: `complete_ticket()` – đánh dấu hoàn thành vé.
   - `PUT /{ticket_id}/dismiss`: `dismiss_ticket()` – đưa vé vào thùng rác, đồng thời gọi `mark_email_as_read()` trên Gmail nếu nguồn là email.
   - `PUT /{ticket_id}/restore`: `restore_ticket()` – khôi phục vé đã bác bỏ về trạng thái `pending`.
   - `PUT /{ticket_id}/category`: `update_category()` – đổi phân loại vé.
   - `POST /{ticket_id}/ai-triage`: `trigger_ai_triage()` – kích hoạt lại bộ máy Gemini AI phân tích lại nội dung vé.

2. **[`tasks.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/tasks.py) (`/tasks`):**
   - `GET /`: `list_tasks(status, limit, offset)` – lấy danh sách task chờ duyệt từ `TasksMemoryCache`.
   - `POST /`: `create_task(payload)` – tạo task mới; nếu `run_immediately = true` thì kích hoạt ngay worker nền.
   - `PUT /{task_id}/approve`: `approve_task(payload)` – phê duyệt hoặc từ chối task. Nếu duyệt, đưa `run_approved_task_worker` vào `background_tasks`.
   - `run_approved_task_worker(task_id, bot_type, payload, ticket_id)`: Hàm thực thi an toàn bọc thép, tự động phân giải credentials phả hệ 3 cấp nếu là `workspace_rpa`, gọi `execute_approved_bot_task`, ghi nhận tiến trình từng bước vào cột `current_step`, ghi log ANSI GMT+7, cập nhật `last_error_step` và `retry_count` khi retry, chuyển trạng thái linh hoạt giữa `waiting_poll`, `partial_success` (hoàn thành 1 phần kèm checkpoint khôi phục), `success` hoặc `failed`. Hỗ trợ chạy lại (Retry) bảo toàn điểm checkpoint gián đoạn thay vì làm lại từ đầu.

3. **[`bots.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/bots.py) (`/bots`):**
   - `GET /status`: `get_bot_workers_status()` – giám sát 8 workers (`gmail_sync_worker`, `osticket_sync_worker`, `feedback_sheet_worker`, `distributor_cache_worker`, `workspace_license_worker`, `keycloak_api_worker`, `lms_git_worker`, `github_dispatcher`), đếm số lượng task lỗi.
   - `GET /logs`: `get_bot_terminal_logs()` – stream 30 bản ghi log thực thi gần nhất, chuẩn hóa GMT+7, loại bỏ timestamp trùng lặp qua `clean_log_message`.
   - `POST /force-sync/{sync_type}`: `force_sync_pipeline()` – ép quét tức thì cho các luồng: `gmail`, `osticket`, `sheet`, `distributor_cache`, `site_uptime`.
   - `POST /purge-memory`: `purge_system_memory()` – gọi cưỡng bức `gc.collect()` và xóa cache RAM.
   - `POST /{task_id}/retry`: `retry_bot_task()` – chạy lại 1 task theo UUID hoặc chạy lại toàn bộ task lỗi của một Worker theo tên key.

4. **[`workspace.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/workspace.py) (`/workspace`):**
   - `GET /hierarchy-schools`: `get_hierarchy_schools(search)` – trả về 480 trường học kèm phả hệ đầy đủ cho Autocomplete, tìm kiếm trong RAM 0.1ms.
   - `GET /categories`: `get_course_categories()` – trả về danh sách category duy nhất của Workspace.
   - `GET /courses`: `get_workspace_courses(category)` – danh mục khóa học phục vụ License RPA.
   - `GET /cached-pending-orders`: `get_cached_pending_orders(school_name, distributor_code)` – đọc cache đơn hàng của trường học.
   - `GET /cached-pending-contracts`: `get_cached_pending_contracts(contract_type, distributor_code)` – đọc cache hợp đồng PRT / DST.
   - `POST /sync-cache-now`: `trigger_distributor_cache_sync()` – kích hoạt quét nền 5 Master Distributors.
   - `POST /extract-cof`: `extract_cof_content(req)` – bóc tách dữ liệu COF text bằng Regular Expressions, map tự động với cache khóa học.

5. **[`courses.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/courses.py) (`/courses`):**
   - `GET /{course_type}`: `list_courses(course_type, category, search)` – nạp danh mục khóa học `workspace` hoặc `lms`, tìm kiếm & lọc trong RAM.
   - `GET /{course_type}/categories`: `get_categories(course_type)` – nạp danh mục Category duy nhất.
   - `POST /{course_type}`: `create_course(course_type, payload)` – thêm khóa học mới, tự sinh URL Moodle `https://learn.pythaverse.space/course/view.php?id={course_id}`.
   - `PUT /{course_type}/{course_id}`: `update_course()` – cập nhật thông tin khóa học.
   - `DELETE /{course_type}/{course_id}`: `delete_course()` – xóa khóa học.
   - `POST /{course_type}/bulk-upsert`: `bulk_upsert_courses()` – nạp hàng loạt từ Excel/Text qua SheetJS theo từng batch 50 records.
   - `PUT /{course_type}/categories/rename`: `rename_category()` – đổi tên danh mục môn học hàng loạt.
   - `DELETE /{course_type}/categories`: `delete_category(old_category, target_category)` – xóa hoặc gộp danh mục môn học.

6. **[`board.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/board.py) (`/board`):**
   - `GET /boards`: `list_boards()` – danh sách các bảng hoạt động từ `BoardMemoryCache`.
   - `GET /boards/trash`: `list_trash_boards()` – danh sách các bảng trong thùng rác 30 ngày.
   - `POST /boards`: `create_board(payload)` – tạo bảng mới kèm 6 cột mặc định (`Tiếp Nhận`, `Cần Làm`, `Đang Làm`, `Chờ Duyệt`, `Hoàn Thành`, `Hủy Bỏ`).
   - `PUT /boards/{board_id}`: `update_board()` – cập nhật tiêu đề, wallpaper, độ mờ overlay/columns/cards.
   - `DELETE /boards/{board_id}`: `soft_delete_board()` – chuyển bảng vào thùng rác (`is_deleted = TRUE`).
   - `PUT /boards/{board_id}/restore`: `restore_board()` – khôi phục bảng nguyên vẹn.
   - `DELETE /boards/{board_id}/permanent`: `permanent_delete_board()` – xóa vĩnh viễn khỏi CSDL.
   - `GET /boards/{board_id}/columns` & `POST /boards/{board_id}/columns`: quản lý cột trạng thái.
   - `GET /boards/{board_id}/cards`, `POST /cards`, `PUT /cards/{card_id}`, `PUT /cards/{card_id}/move`, `DELETE /cards/{card_id}`: quản lý thẻ công việc và kéo thả.

7. **[`monitor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/monitor.py) (`/monitor`):**
   - `GET /sites`: `get_monitored_sites()` – trạng thái Uptime 10 site Pythaverse và đo latency (RAM Cache 30s).
   - `POST /check-now`: `check_all_now()` – kiểm tra ngay lập tức toàn bộ 10 website.
   - `GET /sites/{site_id}/history`: `get_site_history(site_id, days)` – lịch sử uptime 45 ngày.
   - `GET /sites/{site_id}/hourly`: `get_site_hourly_history(site_id, hours)` – lịch sử uptime 24 giờ.
   - `GET /auth-matrix`: `get_auth_matrix()` – ma trận xác thực 16 tài khoản test 7 vai trò qua giải mã Fernet.
   - `POST /auth-matrix/check-now`: `run_auth_check_now()` – kích hoạt kiểm tra xác thực phân quyền ngay.
   - `GET /deployments` & `GET /deployments/logs`: theo dõi builds CI/CD Vercel & Render.

8. **[`github.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/github.py) (`/github`):**
   - `POST /create-issue`: `create_github_issue(payload)` – gửi Issue trực tiếp vào Private Repo `PTV-TechHub/Pythaverse2026` bằng GitHub PAT.
   - `POST /ai-generate-template`: `ai_generate_bug_template(req)` – kết hợp Domain Knowledge từ `knowledge_base.json` + Ghi chú QA thực tế + File đính kèm để sinh Bug Report Markdown nghiêm ngặt (chỉ báo cáo thực nghiệm, không suy diễn nguyên nhân).

9. **[`reports.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/reports.py) (`/reports`):**
   - `GET /summary`: `get_reports_summary(cat_range, trend_range)` – tổng hợp 4 chỉ số KPI, Dynamic Health 24h, phân bố loại yêu cầu và xu hướng tiếp nhận vs xử lý.
   - `GET /kpi-export`: `get_kpi_export_data()` – xuất bảng dữ liệu báo cáo KPI chuẩn mực DTT 3Đ (Đúng - Đủ - Đẹp).

---

### 5.6. Gói Dịch Vụ Workspace RPA Đa Kế Thừa (`app/services/workspace/`)

Gói dịch vụ RPA được thiết kế theo mô hình **Đa Kế Thừa Tầng (Layered Multi-Inheritance Architecture)** giúp mã nguồn gọn gàng, tách bạch trách nhiệm và dễ dàng bảo trì:

```mermaid
classDiagram
    class WorkspaceBaseService {
        +create_context(playwright, low_ram)
        +login_role(page, username, password, role)
        +normalize_date_iso(date_str)
        +_dismiss_welcome_dialog(page)
    }
    class WorkspaceOrderService {
        +school_create_order(credentials, order_data)
        +partner_approve_school_order(credentials, order_id)
        +fetch_school_order_detailed_courses(credentials, order_id)
    }
    class WorkspaceContractService {
        +partner_create_contract(credentials, contract_data)
        +distributor_approve_partner_contract(credentials, contract_id)
        +distributor_create_contract(credentials, contract_data)
        +admin_approve_distributor_contract(credentials, contract_id, justification)
    }
    class WorkspaceEnrollService {
        +school_enroll_users_and_groups(...)
    }
    class WorkspaceOrchestratorService {
        +execute_full_license_hierarchy_chain(payload)
        +execute_approve_school_order_standalone(payload)
        +execute_approve_partner_contract_standalone(payload)
        +execute_admin_approve_contract_standalone(payload)
        +partner_create_and_approve_chain(payload)
        +distributor_create_and_approve_chain(payload)
    }
    class WorkspaceAccountService {
        +submit_account_creation_batch(credentials, file_path, count)
        +check_and_export_batch_result(credentials, request_id, download_dir)
    }
    class WorkspacePlaywrightService {
        <<Singleton>>
    }

    WorkspaceBaseService <|-- WorkspaceOrderService
    WorkspaceBaseService <|-- WorkspaceContractService
    WorkspaceBaseService <|-- WorkspaceEnrollService
    WorkspaceOrderService <|-- WorkspaceOrchestratorService
    WorkspaceContractService <|-- WorkspaceOrchestratorService
    WorkspaceEnrollService <|-- WorkspaceOrchestratorService
    WorkspaceOrchestratorService <|-- WorkspacePlaywrightService
    WorkspaceAccountService <|-- WorkspacePlaywrightService
```

#### Chi Tiết 8 Module RPA:
1. [`base.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/base.py): Chứa `WorkspaceBaseService` khởi tạo Chromium với cờ tiết kiệm tài nguyên (`--no-sandbox`, `--disable-dev-shm-usage`, `--single-process`), xử lý form đăng nhập Keycloak SSO `login_role()` và chuẩn hóa ngày tháng ISO `normalize_date_iso()`.
2. [`order_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/order_service.py): Chứa `WorkspaceOrderService` xử lý quy trình School tạo Order (`school_create_order`), Partner duyệt Order từ Pool License (`partner_approve_school_order`), và trích xuất chi tiết môn học của Order (`fetch_school_order_detailed_courses`).
3. [`contract_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/contract_service.py): Chứa `WorkspaceContractService` xử lý quy trình Partner tạo Contract gửi Distributor (`partner_create_contract`), Distributor duyệt Contract (`distributor_approve_partner_contract`), Distributor tạo Contract xin Sales Admin (`distributor_create_contract`), và Sales Admin phê duyệt cấp bù tối cao (`admin_approve_distributor_contract`).
4. [`orchestrator_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/orchestrator_service.py): Chứa `WorkspaceOrchestratorService` điều phối chuỗi liên hoàn Master E2E Chain 4 cấp (`execute_full_license_hierarchy_chain`) và các subflows độc lập (`execute_approve_school_order_standalone`, `execute_approve_partner_contract_standalone`, `partner_create_and_approve_chain`). Đảm bảo trả về đầy đủ `checkpoint` và `current_step` ở 100% các nhánh rẽ (thành công, thất bại, một phần) phục vụ cơ chế tự động khôi phục điểm checkpoint khi chạy lại (Resume).
5. [`account_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/account_service.py): Chứa `WorkspaceAccountService` nộp file batch tạo tài khoản (`submit_account_creation_batch`), nhận `checkpoint` để tự động kiểm tra `account_batch_request_id` (bỏ qua bước nộp lại file nếu đã có request id từ phiên trước), tích hợp **Hybrid Fast-Path** (chờ 12s lấy kết quả ngay nếu batch <= 30 tài khoản) và trích xuất `request_id` cho Cronjob tiếp quản nếu batch lớn (`check_and_export_batch_result`).
6. [`enroll_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/enroll_service.py): Chứa `WorkspaceEnrollService` (`school_enroll_users_and_groups`) tạo Group lớp và ghi danh học sinh/giáo viên trực tiếp trên giao diện School Workspace, áp dụng `wait_for_dom_and_spinners` để đồng bộ hóa DOM & MUI spinner hoàn toàn tự nhiên thay vì chờ tĩnh.
7. [`workspace_scanner_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/workspace_scanner_service.py): Chứa `WorkspaceScannerService` sử dụng Direct API trong session Playwright của 5 Master Distributors để quét và lưu cache hàng trăm hợp đồng/đơn hàng trong vài giây vào bảng `workspace_contracts_cache` và `workspace_orders_cache`.
8. [`__init__.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/__init__.py): Tổng hợp toàn bộ các lớp trên thành singleton `workspace_playwright_service`.

---

### 5.7. Các Dịch Vụ Nghiệp Vụ Chuyên Biệt (`app/services/`)

#### 1. [`playwright_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/playwright_service.py) (Moodle LMS PLearn Direct Enroller)
- **Mục đích:** Quản lý tự động hóa 100% trên giao diện Moodle LMS PLearn (`learn.pythaverse.space`) với giao diện Edwiser RemUI.
- **Các hàm xử lý chính:**
  - `_sanitize_emails(email_list)`: Làm sạch, chuyển lowercase và loại bỏ email trùng lặp.
  - `_parse_date_components(date_str)`: Chuyển đổi định dạng chuỗi ngày (`YYYY-MM-DD` hoặc `DD/MM/YYYY`) thành dictionary `{day, month, year}` để điền Form dropdown Moodle.
  - `_login_moodle_sso(page)`: Mở `/login/index.php`, tự động bắt redirect Keycloak SSO, điền tài khoản quản trị và kiểm tra đăng nhập thành công.
  - `_close_modal_safely(page, modal)`: Đóng modal an toàn và dọn dẹp thẻ backdrop `.modal-backdrop` chống Layout Freeze.
  - `enroll_users_pipeline(payload)`:
    - **Bước 1 (Ghi danh mới):** Mở modal "Enrol users", chọn Role (`Student`: 9, `Non-editing teacher`: 7, `Manager`: 1), bung "Show more...", bật checkbox "Enable" và chọn ngày Enrolment ends. Tìm kiếm email trong ô Autocomplete; nếu có gợi ý thì chọn để ghi danh.
    - **Bước 2 (Smart Fallback 2 nhịp):** Với các tài khoản không có trong gợi ý mới (đã từng có trong khóa), sử dụng bộ lọc Keyword Filter (chọn `keywords`, điền email vào ô `Type...`, bấm `Apply filters` 2 lần để tạo Tag Pill), khớp chính xác cột `td.cell.c2`, bấm biểu tượng ⚙️ (Gia hạn) để cập nhật ngày kết thúc.
    - **Bước 3 (Auto Group Creation):** Nếu có `group_name`, mở `/group/index.php?id=...`, tự động tạo Group nếu chưa có và gán toàn bộ học viên vào Group lớp.
  - `modify_user_role(payload)`: Áp dụng **Mono-Role Replacement** – xóa sạch toàn bộ role badges cũ trước khi gán duy nhất 1 role mong muốn và bấm icon đĩa mềm 💾 lưu lại.
  - `unenrol_users_pipeline(payload)`: Lọc chính xác email qua Keyword Filter và bấm icon thùng rác 🗑️ xác nhận gỡ người dùng khỏi khóa học.

#### 2. [`keycloak_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/keycloak_service.py) (2-Tier Hybrid Keycloak Identity Engine)
- **Mục đích:** Quản trị định danh tài khoản tập trung trên Keycloak EID (`eid.pythaverse.space`).
- **Kiến trúc 2 Tầng (2-Tier Hybrid):**
  - **Tầng 1 (Direct REST API):** Gọi `execute_via_rest_api()` sử dụng HTTPX kèm `BROWSER_HEADERS` để lấy Admin Token và gọi trực tiếp Keycloak Admin REST API (`/auth/admin/realms/{realm}/users`). Hoàn thành trong 300ms.
  - **Tầng 2 (Playwright RPA Fallback):** Nếu Tầng 1 gặp lỗi WAF hoặc bị chặn mạng, tự động gọi `execute_via_playwright_ui()`, mở Chromium headless, đăng nhập vào giao diện Keycloak Admin Console và thao tác trực tiếp trên Web UI.
- **Hàm điều phối:** `execute_account_action(payload)` – tự động thực hiện các hành động: `reset_password`, `set_status` (kích hoạt/vô hiệu hóa), `verify_email`, `send_verify_email`, `delete_user`, `git_oidc_provision`.

#### 3. [`cof_excel_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/cof_excel_service.py) (Bóc Tách & Ghi Ngược COF Excel)
- **Mục đích:** Đọc hiểu cấu trúc bảng tính COF (Curriculum Order Form) 3 Tabs và tạo file kết quả chuẩn mực.
- **Các hàm xử lý chính:**
  - `parse_cof_excel(file_path)`: Đọc Tab 1 (COF - School Name, Môn học, License, Ngày), Tab 2 (Student Info - Họ tên, Email, DOB, Class Group), Tab 3 (Teacher Info - Họ tên, Email, Course Assign).
  - `_format_date_dmy(val)`: **Chuẩn hóa ngày sinh DOB** bắt buộc về định dạng `D/M/YYYY` (ví dụ `1/1/1990` hoặc `15/8/2012`), loại bỏ phần giờ phút rác.
  - `generate_accounts_file_for_upload(students, teachers, output_path)`: Sinh file `accounts.xlsx` 7 cột chuẩn bắt đầu từ dòng 6 (`No.`, `First Name (*)`, `Last Name (*)`, `Mobile number`, `Email (*)`, `Date of Birth (*)`, `Role (*)`).
  - `write_results_back_to_cof(original_cof_path, result_accounts_path, output_cof_path)`: Đọc file `RESULT_accounts.xlsx`, map User/Pass vào Cột 12-13 và Group LMS vào Cột 14 của Tab 2/Tab 3, đồng thời highlight nền cam nhạt (`#FCE4D6`) và chữ in đậm màu đỏ (`#C00000`).

#### 4. [`workspace_lineage_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace_lineage_service.py) (Phân Giải Phả Hệ & Giải Mã Két Sắt)
- **Mục đích:** Cầu nối định danh truy vết phả hệ 3 cấp (`Distributor` ➔ `Partner` ➔ `School`) và giải mã tài khoản bảo mật.
- **Hàm `decrypt_password(encrypted_pwd: str) -> str`:** Sử dụng Fernet đối xứng với `VAULT_SECRET_KEY` để giải mã mật khẩu tức thì.
- **Các hàm phân giải:**
  - `resolve_by_school(school_identifier)`: Nhận vào tên trường hoặc School ID, truy vết cây cha để trả về đủ 3 bộ credentials `{school, partner, distributor}`.
  - `resolve_by_partner(partner_identifier)`: Truy vết ngược lên Distributor cấp cha.
  - `resolve_by_distributor(distributor_identifier)`: Lấy thông tin tài khoản của Distributor.
  - `resolve_by_contract(contract_code)`: Nhận diện mã Hợp đồng (ví dụ `PRT-260331-18084`) để suy ra Partner và Distributor tương ứng.

#### 5. [`site_monitor_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/site_monitor_service.py) (Giám Sát Hệ Thống 3 Tầng)
- **Mục đích:** Cung cấp dữ liệu giám sát cho trang `/monitor`.
- **Các hàm xử lý chính:**
  - `check_all_sites()`: Kiểm tra HTTP status và đo độ trễ latency của 10 website Pythaverse.
  - `execute_role_auth_check(cred)`: Giải mã Fernet 16 tài khoản test trong `site_monitor_credentials`, tự động POST login form Keycloak SSO và kiểm tra quyền truy cập route đích (`PASS` / `FAIL`).
  - `get_uptime_history(site_id, days=45)` & `get_hourly_uptime_history(site_id, hours=24)`: Truy vấn lịch sử uptime từ bảng `site_downtime_events`.
  - `get_deployments_summary()` & `get_deployment_logs_stream()`: Kết nối REST API Vercel và Render để theo dõi lịch sử build và stream terminal logs CI/CD.

#### 6. Các Dịch Vụ Google Workspace & Tiện Ích Khác:
- [`gmail_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/gmail_service.py): `poll_unread_gmails` quét hòm thư định kỳ, tải attachment lên Supabase Storage `ticket-attachments` và kích hoạt AI Triage.
- [`google_sheet_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/google_sheet_service.py): `poll_form_feedbacks` quét Google Sheet Feedback, nhận diện tab và ghi nhận ticket.
- [`google_doc_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/google_doc_service.py): `insert_comment_with_mentions` thêm comment tag email người phụ trách vào Google Docs.
- [`google_drive_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/google_drive_service.py): `upload_file_to_school_folder` dựng cây thư mục 6 cấp trên Drive và tải file COF kết quả lên đúng vị trí.
- [`osticket_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/osticket_service.py): `poll_open_ostickets` sử dụng Playwright session để cào danh sách vé, bóc tách Custom Form fields và file đính kèm.
- [`github_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/github_service.py): `create_issue` gửi Issue trực tiếp vào Private Repository `PTV-TechHub/Pythaverse2026` qua Bearer Token `GITHUB_PAT`.

---

### 5.8. Bộ Điều Phối Workers Chạy Ngầm (`app/workers/`)

#### [`bot_executor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/workers/bot_executor.py) (Bộ Điều Phối Trung Tâm)
- **Hàm `execute_approved_bot_task(bot_type: str, payload_data: Dict[str, Any], task_id: Optional[str] = None) -> Dict[str, Any]`:**
  - Nhận diện `bot_type` và `action` để phân phối chính xác **14 Actions**:
    1. **`workspace_rpa` (10 Actions):**
       - `pipeline_end_to_end` / `create_order_and_contracts`: Kích hoạt Master E2E Chain 4 cấp.
       - `approve_school_order_standalone`: Phê duyệt Order có sẵn của School.
       - `approve_partner_contract_standalone`: Phê duyệt Contract có sẵn của Partner.
       - `partner_create_and_approve_chain`: Tạo và duyệt chuỗi Partner.
       - `distributor_create_and_approve_chain`: Tạo và duyệt chuỗi Distributor.
       - `school_create_order`: School tạo Order mới.
       - `partner_approve_order`: Partner duyệt Order.
       - `partner_create_contract` / `distributor_approve_contract` / `distributor_create_contract` / `admin_approve_contract`.
       - `bulk_account_creation`: Nộp batch COF và tính toán thời gian nghỉ ngắt quãng 15s/tài khoản (`max(total * 15, 30)`).
       - `school_enroll_users`: Ghi danh học viên & lớp trên School Workspace.
    2. **`lms_playwright` / `lms_git_provisioning` / `lms_enroll` (3 Actions):**
       - `enroll_users_pipeline`: Ghi danh học sinh/giáo viên và phân nhóm lớp.
       - `modify_user_role`: Đổi vai trò người dùng (Mono-Role).
       - `unenrol_users_pipeline`: Hủy ghi danh người dùng.
    3. **`keycloak_api` (1 Action tổng hợp):** Chuyển tiếp sang `keycloak_service.execute_account_action()`.
    4. **`github_issue_creator`:** Chuyển tiếp sang `github_service.create_issue()`.
    5. **`feedback_doc_triage` / `google_doc_comment`:** Chuyển tiếp sang `google_doc_service.insert_comment_with_mentions()`.

---

### 5.9. Kịch Bản Khởi Tạo Dữ Liệu Scripts (`scripts/`)
- [`import_hierarchy.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/scripts/import_hierarchy.py): Đọc file `pythaverse_hierarchy_data.xlsx`, mã hóa Fernet toàn bộ mật khẩu và nạp cây phả hệ 480 trường vào bảng `workspace_organizations` và `workspace_credentials_vault`.
- [`seed_monitor_credentials.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/seed_monitor_credentials.py): Khởi tạo và mã hóa Fernet 16 tài khoản test cho 7 vai trò trong bảng `site_monitor_credentials`.
- [`test_lms_advanced_features.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/test_lms_advanced_features.py): Bộ kịch bản độc lập kiểm thử ghi danh Moodle, Keyword Filter 2 nhịp, đổi vai trò Mono-Role và xóa ghi danh.

---

## 🎨 PHẦN VI: GIẢI PHẪU CHI TIẾT GIAO DIỆN FRONTEND SPA (REACT 19 + VITE 6 + TAILWIND CSS V4)

### 6.1. Khởi Chạy & Định Tuyến Toàn Cục (`App.tsx`, `main.tsx`)
- **Tệp tin:** [`frontend/src/App.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/App.tsx)
- **Cơ chế:** Áp dụng **100% Lazy Loading** cho tất cả 13 trang bằng `React.lazy()` và bọc trong `Suspense` kèm component fallback spinner đẹp mắt, giúp tối ưu hóa Bundle Size và tăng tốc First Contentful Paint (FCP).
- **Bộ Quét & Làm Sạch Trình Duyệt (`purgeStaleDataCaches()`):** Tự động kích hoạt khi ứng dụng khởi chạy, quét và dọn sạch 100% các key cache LocalStorage cũ có tiền tố `ptv_*` (`ptv_tasks_*`, `ptv_studio_*`, `ptv_courses_*`, `ptv_wb_*`...) tồn đọng từ các phiên trước, bảo toàn duy nhất cấu hình `theme` và Supabase Session Token, đảm bảo toàn bộ dữ liệu hiển thị đồng bộ tuyệt đối từ Backend REST API.
- **Cấu trúc Route:**
  - Route công khai: `/` (Landing Page), `/login` (Login Page).
  - Protected Routes (bọc bởi `AuthContext` Whitelist `@dtt.vn` và `AppLayout`): `/dashboard`, `/board`, `/inbox`, `/studio`, `/tasks`, `/courses`, `/github`, `/bots`, `/reports`, `/monitor`, `/profile`.

---

### 6.2. Thiết Kế Hệ Thống Design System Bento Grid & Enterprise Pastel OKLCH
- **Bố Cục Bento Grid:** Thiết kế giao diện hiện đại dạng mosaic các thẻ bất đối xứng (1x1, 2x1, 2x2, 4x1), khoảng cách đồng nhất 16px, bo tròn góc thẻ 16-24px, viền hairline 1px tinh tế.
- **Bảng Màu Enterprise Pastel (OKLCH):**
  - Mặt giấy bề mặt: `--color-paper: oklch(98.4% 0.003 247)` (slate-50 off-white).
  - Nền trang: `--color-paper-2: oklch(96% 0.008 250)` (slate-100 tint).
  - Thẻ nâng cao: `--color-paper-3: oklch(99% 0.002 247)`.
  - Mực văn bản: `--color-ink: oklch(22% 0.020 250)` (slate-900) & `--color-ink-2: oklch(45% 0.015 250)`.
  - Màu chủ đạo: `--color-primary: oklch(32% 0.020 250)` (slate-800).
  - Màu điểm nhấn: `--color-accent: oklch(58% 0.140 220)` (sky-500) & `--color-accent-soft: oklch(95% 0.030 220)`.
  - Ngữ nghĩa: `--color-mint` (Success), `--color-rose` (Destructive), `--color-amber` (Warning).
- **Quy Chuẩn Typography 2+1:**
  - Font hiển thị & tiêu đề: **Plus Jakarta Sans** (weights 600, 700, 800, roman).
  - Font nội dung văn bản: **Plus Jakarta Sans** (weights 400, 500, 600).
  - Font Terminal/Mã nguồn: **JetBrains Mono** (weights 400, 500, 600).
- **Chế Độ Dark / Light Mode:** Tự động đồng bộ với thẻ `<html>` qua lớp `.dark`, lưu trạng thái trong `localStorage.getItem('theme')`.

---

### 6.3. Cấu Hình Tác Giả, Contexts & Tiện Ích Client (`config/`, `context/`, `lib/`, `types/`)
- [`authorConfig.ts`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/config/authorConfig.ts): Lưu trữ thông tin định danh tác giả **Nguyễn Mạnh Hùng**, chức danh Lead AI Engineer & Automation Architect, liên kết mạng xã hội (GitHub, LinkedIn, Facebook, Email, Website) và highlights dự án.
- [`AuthContext.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/context/AuthContext.tsx): Quản lý trạng thái phiên đăng nhập qua Supabase Auth, tự động kiểm tra đuôi `@dtt.vn`, lưu trữ thông tin user vào React State và tự động logout nếu ngoài miền.
- [`ThemeContext.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/context/ThemeContext.tsx): Quản lý chuyển đổi chế độ Dark / Light theme, lưu cấu hình vào LocalStorage (`theme`), tự động gắn thẻ `class="dark"` lên thẻ `<html>`.
- [`lib/api.ts`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/lib/api.ts): Hàm tiện ích `fetchApi<T>(endpoint, options)` bọc chuẩn REST API Backend kèm xử lý lỗi tập trung và tiêm Supabase Bearer Token.
- [`lib/supabase.ts`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/lib/supabase.ts): Khởi tạo Supabase JS Client cho Frontend qua `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`.
- [`types/index.ts`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/types/index.ts): Tập hợp 18 interfaces TypeScript nghiêm ngặt (`InboxTicket`, `BotAutomationTask`, `CourseItem`, `BoardItem`, `BoardCardItem`...).

---

### 6.4. Bóc Tách Chi Tiết 13 Feature Modules

| STT | Feature Component | Đường Dẫn | Trọng Tâm Giao Diện & Logic Xử Lý Nghiệp Vụ | Caching Client / Data Fetching |
|---|---|---|---|---|
| **1** | [`DashboardPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/dashboard/DashboardPage.tsx) | `/dashboard` | **Executive Bento Dashboard:** 4 KPI Metric Cards (Tổng Ticket Chờ, Chờ Duyệt, Đã Xử Lý Tháng, Tỷ Lệ Tự Động Hóa), Quick Action buttons dẫn nhanh tới Studio/Courses/GitHub, bảng tóm tắt 5 vé và 5 tác vụ mới nhất. | Gọi `/reports/summary` (RAM Cache Backend 60s). Không dùng LocalStorage. |
| **2** | [`WorkBoardPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/board/WorkBoardPage.tsx) | `/board` | **Kanban Work Board:** Quản lý đa bảng, tùy biến hình nền/overlay opacity/card opacity, 6 cột trạng thái (`Backlog`, `To Do`, `In Progress`, `Review`, `Done`, `Abort`), kéo thả HTML5 D&D mượt mà, Subtasks checklist với progress bar, kích hoạt Canvas Confetti khi hoàn thành, và **Thùng Rác 30 Ngày** (Soft Delete/Restore/Xóa vĩnh viễn). | Gọi `/board/*` (BoardMemoryCache Backend 5m). Không dùng LocalStorage. |
| **3** | [`UnifiedInboxPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/inbox/UnifiedInboxPage.tsx) | `/inbox` | **Hòm Thư Đa Kênh Hợp Nhất:** Tiếp nhận ticket từ Gmail, Google Form và OS Ticket; bộ lọc đa tầng (Category, Priority, Source, Status, Keyword); xem trước tệp đính kèm; thẻ tóm tắt AI Gemini Tiếng Việt; gán cán bộ phụ trách; nút điều hướng nhanh sang Automation Studio hoặc GitHub Reporter. | Gọi `/tickets` (TicketsMemoryCache Backend 60s). Không dùng LocalStorage. |
| **4** | [`AutomationStudioPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/studio/AutomationStudioPage.tsx) | `/studio` | **Trung Tâm Điều Phối Tác Vụ Độc Lập:** 4 Dispatcher Engines (Keycloak Identity, Workspace License 6 subflows kèm Autocomplete 480 trường, Moodle LMS & Group, Google Feedback Docs); hỗ trợ nạp tệp COF/Accounts; chọn chế độ "Đưa vào hàng đợi" hoặc "Chạy ngay (Run Immediately)". | Gọi `/workspace/*` (WorkspaceMemoryCache Backend 15m). Không dùng LocalStorage. |
| **5** | [`TaskManagementPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/tasks/TaskManagementPage.tsx) | `/tasks` | **Cổng Phê Duyệt Human-in-the-Loop:** Danh sách tác vụ chờ duyệt; trình xem chi tiết JSON payload; modal phê duyệt kèm chỉnh sửa tham số; Live Terminal Logs thời gian thực hiển thị log màu sắc ANSI; badge `partial_success` (Hoàn thành 1 phần); hiển thị trực tiếp `current_step` (tiến trình bước) & `#retry_count`; nút **Retry Resume Checkpoint** khôi phục điểm gián đoạn. | Gọi `/tasks` (TasksMemoryCache Backend 60s). Không dùng LocalStorage. |
| **6** | [`CoursesManagerPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/courses/CoursesManagerPage.tsx) | `/courses` | **Quản Lý Danh Mục Khóa Học Song Song:** Dual-pane phân tách rõ `workspace_courses` và `lms_courses`; CRUD đơn lẻ tự sinh URL Moodle; Bulk Import SheetJS hỗ trợ nạp Excel và paste văn bản tự do theo batch 50 records; Category Manager đổi tên và gộp danh mục hàng loạt. | Gọi `/courses/*` (SimpleMemoryCache Backend 10m). Không dùng LocalStorage. |
| **7** | [`GithubReporterPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/github/GithubReporterPage.tsx) | `/github` | **Điều Phối GitHub Issue:** Tạo Issue trực tiếp vào Private Repo `PTV-TechHub/Pythaverse2026`; bộ máy Gemini AI sinh Title & Markdown Template chuẩn mực từ thông tin ticket và ghi chú QA; xem trước và chỉnh sửa Markdown trước khi gửi. | Nạp context từ `knowledge_base.json`. |
| **8** | [`BotCommanderPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/bots/BotCommanderPage.tsx) | `/bots` | **Giám Sát & Điều Khiển Bot Workers:** 8 thẻ trạng thái worker thời gian thực (Gmail, OSTicket, Sheet, Distributor Cache, Workspace License, Keycloak, LMS, GitHub); stream log hệ thống GMT+7; nút Force Sync on-demand 5 luồng, nút Purge RAM và Batch Retry. | Gọi `/bots/status` (BotsMemoryCache Backend 15s). Không dùng LocalStorage. |
| **9** | [`ReportsExportPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/reports/ReportsExportPage.tsx) | `/reports` | **Phân Tích KPI & Xuất Báo Cáo:** 4 chỉ số KPI tổng quan; Dynamic Health 24h; biểu đồ tròn tỷ trọng Category; biểu đồ cột xu hướng Tiếp nhận vs Xử lý 7 ngày; chức năng xuất file Excel báo cáo KPI DTT 3Đ. | Gọi `/reports/summary` (ReportsMemoryCache Backend 60s). |
| **10** | [`SiteMonitorPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/monitor/SiteMonitorPage.tsx) | `/monitor` | **Giám Sát Hệ Sinh Thái 3 Tab:** Tab 1 Uptime Bar 24h & lịch sử 45 ngày của 10 website Pythaverse; Tab 2 Ma trận xác thực 16 tài khoản test 7 vai trò qua giải mã Fernet; Tab 3 Theo dõi builds CI/CD Vercel & Render kèm stream log terminal. | Gọi `/monitor/sites` (MonitorMemoryCache Backend 30s). Không dùng LocalStorage. |
| **11** | [`ProfileSettingsPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/profile/ProfileSettingsPage.tsx) | `/profile` | **Hồ Sơ Tác Giả & Cấu Hình:** Khẳng định quyền tác giả Nguyễn Mạnh Hùng; hiển thị trạng thái các biến môi trường backend/frontend; thông tin phiên bản phát hành `v2.6.0 Enterprise Reliability`. | Render client-side + ping env check. |
| **12** | [`LandingPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/landing/LandingPage.tsx) | `/` | **Trang Chủ Giới Thiệu:** Giới thiệu tác giả và 7 phân hệ trong hệ sinh thái Pythaverse, công nghệ sử dụng, và nút chuyển hướng đăng nhập. | Static SSR-friendly. |
| **13** | [`LoginPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/auth/LoginPage.tsx) | `/login` | **Cổng Đăng Nhập Doanh Nghiệp:** Đăng nhập một chạm qua Google OAuth với chính sách bảo mật cưỡng chế Whitelist `@dtt.vn`. | Supabase OAuth Flow. |

---

### 6.5. Components Dùng Chung & Bố Cục Layout (`components/common/`, `components/layout/`)
- [`Header.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/common/Header.tsx): Thanh điều hướng trên cùng, hiển thị tiêu đề trang động, nút chuyển đổi Dark/Light theme, thông tin tài khoản người dùng đăng nhập (`@dtt.vn`) và nút đăng xuất.
- [`Sidebar.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/common/Sidebar.tsx): Cột điều hướng bên trái với logo Pythaverse Hub, danh sách 11 liên kết chức năng được phân nhóm logic, hiệu ứng active route nổi bật và badge bản quyền tác giả **Nguyễn Mạnh Hùng**.
- [`AppLayout.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/layout/AppLayout.tsx): Khung sườn tổng thể bao bọc Sidebar, Header và vùng nội dung chính `<Outlet />`, tích hợp cuộn trang mượt mà và padding chuẩn mực Bento Grid.

---

## 🗄️ PHẦN VII: CƠ SỞ DỮ LIỆU SUPABASE POSTGRESQL 16 (16 BẢNG & STORAGE BUCKET)

Hệ thống sử dụng cơ sở dữ liệu Supabase PostgreSQL 16 với 16 bảng dữ liệu chuyên biệt, phân chia theo 5 nhóm nghiệp vụ:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CƠ SỞ DỮ LIỆU SUPABASE POSTGRESQL 16 (16 BẢNG)                  │
├─────────────────────────┬──────────────────────────┬───────────────────────────────────┤
│ 1. INBOX & AUTOMATION   │ 2. LINEAGE & VAULT       │ 3. SCANNER & COURSE CATALOGS      │
│ • inbox_tickets         │ • workspace_organizations│ • workspace_contracts_cache       │
│ • bot_automation_tasks  │ • workspace_credentials_ │ • workspace_orders_cache          │
│ • templates_config      │   vault                  │ • workspace_courses               │
│                         │                          │ • lms_courses                     │
├─────────────────────────┼──────────────────────────┼───────────────────────────────────┤
│ 4. SITE HEALTH & CI/CD  │ 5. KANBAN WORK BOARD     │ 6. STORAGE BUCKET                 │
│ • site_monitor_         │ • work_boards            │ • ticket-attachments              │
│   credentials           │ • work_board_columns     │   (Lưu trữ file đính kèm email,   │
│ • site_downtime_events  │ • work_board_cards       │    COF Excel và avatar tác giả)   │
│ • site_deploy_configs   │                          │                                   │
└─────────────────────────┴──────────────────────────┴───────────────────────────────────┘
```

### Chi Tiết Cấu Trúc 16 Bảng Dữ Liệu:

#### 1. Nhóm Inbox & Tự Động Hóa:
- `inbox_tickets`: Lưu trữ toàn bộ vé yêu cầu từ Gmail, Google Form, OS Ticket. Các cột chính: `id` (UUID PK), `source` (ENUM), `source_id`, `sender_email`, `submitter_name`, `subject`, `raw_content`, `ai_summary`, `category` (ENUM), `priority` (ENUM), `status` (ENUM), `country`, `doc_url`, `attachments` (JSONB), `metadata` (JSONB), `created_at`, `updated_at`.
- `bot_automation_tasks`: Hàng đợi tác vụ tự động hóa chờ phê duyệt (Human-in-the-Loop). Các cột chính: `id` (UUID PK), `ticket_id` (FK ➔ `inbox_tickets.id`), `bot_type` (ENUM), `payload_data` (JSONB), `approval_status` (ENUM), `execution_status` (VARCHAR: `queued`, `running`, `waiting_poll`, `partial_success`, `success`, `failed`), `current_step` (VARCHAR: ghi nhận tiến trình bước thời gian thực), `last_error_step` (VARCHAR: bước gặp sự cố gần nhất), `retry_count` (INT4 DEFAULT 0: số lần chạy lại), `execution_logs` (TEXT ANSI), `created_at`, `executed_at`. Các Indexes hiệu năng: `idx_tasks_status` (`execution_status`, `approval_status`) và `idx_tasks_created_at` (`created_at DESC`).
- `templates_config`: Cấu hình mẫu Markdown cho GitHub Issues và ánh xạ cột báo cáo XLSX. Các cột: `id`, `template_key` (UNIQUE), `name`, `content_markdown`, `fields_mapping` (JSONB), `updated_at`.

#### 2. Nhóm Phả Hệ Tổ Chức & Két Sắt Mã Hóa:
- `workspace_organizations`: Cây phả hệ 3 cấp của 480 trường học (`distributor` ➔ `partner` ➔ `school`). Các cột: `id` (UUID PK), `name`, `code`, `role_type` (`distributor`, `partner`, `school`), `parent_id` (Self-referencing FK), `country`, `is_active`, `created_at`.
- `workspace_credentials_vault`: Két sắt lưu trữ tài khoản và mật khẩu đã mã hóa Fernet (`VAULT_SECRET_KEY`). Các cột: `id` (UUID PK), `org_id` (FK ➔ `workspace_organizations.id`), `username`, `encrypted_password` (Fernet encrypted), `role`, `updated_at`.

#### 3. Nhóm Bộ Nhớ Đệm Scanner & Danh Mục Khóa Học:
- `workspace_contracts_cache`: Lưu dữ liệu cache các Hợp đồng được quét bởi Direct API Scanner của 5 Master Distributors. Các cột: `id`, `contract_id`, `distributor_name`, `partner_name`, `total_licenses`, `status`, `raw_data` (JSONB), `synced_at`.
- `workspace_orders_cache`: Lưu dữ liệu cache các Đơn hàng (Orders) của trường học. Các cột: `id`, `order_id`, `partner_name`, `school_name`, `total_licenses`, `status`, `raw_data` (JSONB), `synced_at`.
- `workspace_courses`: Danh mục khóa học phục vụ cấp phát License trên School Workspace và bóc tách COF. Các cột: `id`, `course_id` (INT), `category` (VARCHAR), `course_name` (VARCHAR), `sku`, `lms_url`, `created_at`.
- `lms_courses`: Danh mục khóa học phục vụ ghi danh trực tiếp trên Moodle LMS PLearn (`learn.pythaverse.space`). Các cột: `id`, `course_id` (INT), `category` (VARCHAR), `course_name` (VARCHAR), `lms_url`, `created_at`.

#### 4. Nhóm Giám Sát Sức Khỏe & CI/CD:
- `site_monitor_credentials`: Lưu trữ 16 tài khoản test cho 7 vai trò được mã hóa Fernet để kiểm tra xác thực định kỳ. Các cột: `id`, `site_id`, `role_label`, `username`, `encrypted_password`, `expected_path`, `is_active`, `last_status`, `last_latency_ms`, `last_checked_at`.
- `site_downtime_events`: Ghi nhận nhật ký các sự cố downtime. Các cột: `id`, `site_id`, `started_at`, `ended_at`, `duration_s`, `is_ongoing`, `http_code`, `error_message`.
- `site_deploy_configs`: Cấu hình kết nối API Token tới Vercel và Render để theo dõi tiến trình build CI/CD. Các cột: `id`, `provider` (`vercel`, `render`), `target_id`, `encrypted_api_token`, `is_active`, `created_at`.

#### 5. Nhóm Bảng Công Việc Kanban (Work Board):
- `work_boards`: Lưu thông tin các bảng Kanban. Các cột: `id` (UUID PK), `title`, `description`, `background_url`, `overlay_color`, `overlay_opacity`, `column_opacity`, `card_opacity`, `is_default`, `is_deleted`, `deleted_at` (Thùng rác 30 ngày), `categories` (JSONB), `priorities` (JSONB), `created_at`.
- `work_board_columns`: 6 cột trạng thái của mỗi bảng. Các cột: `id` (UUID PK), `board_id` (FK ➔ `work_boards.id`), `title`, `color`, `column_type` (`backlog`, `todo`, `in_progress`, `review`, `done`, `abort`, `custom`), `order_index`.
- `work_board_cards`: Thẻ công việc chi tiết. Các cột: `id` (UUID PK), `board_id` (FK), `column_id` (FK), `title`, `description`, `priority`, `category`, `color`, `assigned_name`, `assigned_email`, `due_date`, `subtasks` (JSONB), `order_index`, `created_at`.

#### 6. Storage Bucket:
- `ticket-attachments`: Lưu trữ file đính kèm email từ Gmail/OS Ticket, các file COF Excel gốc và kết quả `RESULT_accounts.xlsx`.

---

## 🔄 PHẦN VIII: 9 SƠ ĐỒ LUỒNG NGHIỆP VỤ END-TO-END (MERMAID SEQUENCE & FLOWCHARTS)

### Luồng 1: Master E2E License Hierarchy Chain (Chuỗi Cấp Phép License 4 Cấp)
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Quản Trị Viên (Web Portal)
    participant Hub as Central Admin (FastAPI)
    participant Lineage as Lineage & Vault Service
    participant RPA as Workspace RPA Worker
    participant WS as School Workspace (pythaverse.space)
    participant Drive as Google Drive Service

    Admin->>Hub: Phê duyệt Task E2E (School Name, COF File / Courses)
    Hub->>Lineage: Truy vết 3 cấp: School -> Partner -> Distributor
    Lineage-->>Hub: Trả về Credentials 3 cấp (Giải mã Fernet tức thì)
    Hub->>RPA: Kích hoạt execute_full_license_hierarchy_chain
    RPA->>WS: Đăng nhập School ➔ Tạo Order gửi Partner
    RPA->>WS: Đăng nhập Partner ➔ Kiểm tra Pool License
    alt Kho Partner Đủ License
        RPA->>WS: Phê duyệt School Order thành công!
    else Kho Partner Thiếu License
        RPA->>WS: Tạo Contract gửi Distributor xin cấp bù
        RPA->>WS: Đăng nhập Distributor ➔ Duyệt Contract Partner
        alt Kho Distributor Đủ License
            WS-->>RPA: Cấp bù thành công ➔ Quay lại duyệt Order School!
        else Kho Distributor Thiếu License
            RPA->>WS: Tạo Contract gửi Sales Admin
            RPA->>WS: Đăng nhập Sales Admin ➔ Phê duyệt cấp phép tối cao
            RPA->>WS: Quay lại duyệt chuỗi Contract & Order School hoàn tất!
        end
    end
    RPA->>WS: Đăng nhập School ➔ Nộp file batch accounts.xlsx
    RPA-->>Hub: Bắt Request ID (Chạy Fast-Path hoặc giao Cronjob)
    Note over Hub,Drive: Khi có kết quả: Ghi ngược COF & Upload Drive 6 cấp
    Hub->>Drive: Tải COF hoàn chỉnh lên thư mục School trên Drive
    Drive-->>Admin: Trả về Web View Link & Cập nhật Task SUCCESS
```

---

### Luồng 2: Smart Polling Engine (Xử Lý Nộp Batch Tài Khoản & Ghi Ngược COF)
```mermaid
flowchart TD
    A[Quản trị viên nộp File accounts.xlsx] --> B{Số lượng User <= 30?}
    B -- Có (<= 30) --> C[Kích hoạt Hybrid Fast-Path: Đợi 12s tại chỗ]
    C --> D[Xuất file RESULT_accounts.xlsx ngay lập tức]
    B -- Không (> 30) --> E[Bắt Request ID tại dòng đầu DataGrid]
    E --> F[Đóng Chromium giải phóng RAM]
    F --> G[Đặt task: execution_status = 'waiting_poll']
    G --> H[Cronjob poll_workspace_long_tasks quét mỗi 3 phút]
    H --> I{Trạng thái Request ID là Done?}
    I -- Chưa --> J[Giữ nguyên waiting_poll cho chu kỳ kế tiếp]
    I -- Đã Done --> K[Bấm Action Menu ➔ Export RESULT_accounts.xlsx]
    K --> D
    D --> L[Gọi COFExcelService.write_results_back_to_cof]
    L --> M[Highlight kết quả Cột 12-13-14: Nền Cam #FCE4D6, Chữ Đỏ #C00000]
    M --> N[Upload lên Google Drive thư mục 6 cấp theo trường]
    N --> O[Cập nhật Task = SUCCESS & Ticket = COMPLETED]
```

---

### Luồng 3: Quản Lý Định Danh Keycloak 2-Tier Hybrid
```mermaid
flowchart TD
    A[Yêu cầu Keycloak: Reset Pass / Active / Verify Email] --> B[Tầng 1: Direct Admin REST API]
    B --> C{Lấy Token Quản Trị & Gọi API Thành Công?}
    C -- Thành công --> D[Hoàn tất tác vụ trong 300ms]
    C -- Bị Chặn / Lỗi WAF --> E[Tầng 2: Tự động kích hoạt Playwright RPA Fallback]
    E --> F[Khởi tạo Chromium Headless]
    F --> G[Đăng nhập giao diện Keycloak Admin Console]
    G --> H[Thao tác trực tiếp trên giao diện Web UI]
    H --> I[Cập nhật mật khẩu / trạng thái người dùng]
    I --> J[Đóng trình duyệt & Trả về kết quả SUCCESS]
```

---

### Luồng 4: Ghi Danh Trực Tiếp Moodle LMS PLearn & Phân Nhóm Lớp
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Quản Trị Viên (Web Portal)
    participant LMS_Worker as Playwright LMS Service
    participant Moodle as Moodle PLearn (learn.pythaverse.space)
    participant Keycloak as Pythaverse EID (eid.pythaverse.space)

    Admin->>LMS_Worker: Duyệt Task Ghi Danh (Course ID, List Emails, Role, End Date, Group Name)
    LMS_Worker->>Moodle: Mở /login/index.php
    Moodle->>Keycloak: Chuyển hướng SSO Login
    LMS_Worker->>Keycloak: Điền tài khoản quản trị & Đăng nhập
    Keycloak-->>Moodle: Redirect về Moodle thành công
    LMS_Worker->>Moodle: Mở trang Quản lý học viên (/user/index.php?id=...)
    LMS_Worker->>Moodle: Mở Modal "Enrol users" ➔ Chọn Role ➔ Tìm kiếm tài khoản
    alt Tài khoản mới
        LMS_Worker->>Moodle: Force click JS item Autocomplete ➔ Chọn Enrol users
    else Tài khoản đã có trong khóa
        LMS_Worker->>Moodle: Lọc Keyword Filter từng email (2 nhịp) ➔ Bấm ⚙️ Gia hạn & Cập nhật End Date
    end
    opt Có chỉ định Group Name
        LMS_Worker->>Moodle: Mở /group/index.php?id=...
        LMS_Worker->>Moodle: Tạo Group mới (nếu chưa có) ➔ Add/remove users ➔ Gán toàn bộ học viên vào Group
    end
    LMS_Worker-->>Admin: Trả về kết quả tổng kết chi tiết & Cập nhật Task SUCCESS
```

---

### Luồng 5: Ingestion Đa Kênh & Phân Tích Gemini AI Auto-Fallback 10 Tầng
```mermaid
flowchart TD
    A1[Gmail Workspace Ingestion Cron - 5s] --> B[Lưu Ticket thô vào bảng inbox_tickets]
    A2[OS Ticket Playwright Scraper - 65s] --> B
    A3[Google Sheet Feedback Cron - 125s] --> B
    B --> C[Kích hoạt process_ticket_with_ai]
    C --> D[Đọc tri thức domain từ knowledge_base.json]
    D --> E[Gọi Gemini AI Triage Engine]
    E --> F{Model hiện tại có bị 429 / Quota Limit?}
    F -- Bị lỗi 429 --> G[Tự động nhảy sang Model tiếp theo trong danh sách 10 Models]
    G --> E
    F -- Phản hồi OK --> H[Bóc tách JSON: Category, Priority, Summary, Assignee]
    H --> I[Cập nhật ngược vào inbox_tickets]
    I --> J[Hiển thị thẻ Ticket thời gian thực trên Unified Inbox]
```

---

### Luồng 6: Điều Phối Bot Độc Lập Automation Studio
```mermaid
flowchart LR
    A[Quản trị viên vào /studio] --> B{Chọn 1 trong 4 Dispatcher Engines}
    B --> C1[1. Keycloak Identity: Reset Pass / Active / Git OIDC]
    B --> C2[2. Workspace License: 6 Sub-flows & Phả hệ 480 trường]
    B --> C3[3. LMS Moodle: Enrol học sinh & Tạo Group tự động]
    B --> C4[4. Google Feedback Docs: Triage & Add Comment Cc]
    C1 --> D{Chọn Chế Độ Vận Hành}
    C2 --> D
    C3 --> D
    C4 --> D
    D -- Đưa vào hàng đợi --> E[Tạo Task trong bot_automation_tasks: pending]
    D -- Chạy Ngay (Run Immediately) --> F[Đặt approval_status = 'approved' & Gọi Bot Executor Ngay]
```

---

### Luồng 7: Giám Sát Sức Khỏe Đa Tầng 3-Tabs (Site Monitor)
```mermaid
flowchart TD
    A[SiteMonitorPage.tsx /monitor] --> B[Tab 1: Giám Sát Công Khai]
    A --> C[Tab 2: Ma Trận Xác Thực Phân Quyền]
    A --> D[Tab 3: CI/CD & Deploy Monitor]
    
    B --> B1[Kiểm tra HTTP Status 10 Website Pythaverse]
    B1 --> B2[Hiển thị Uptime Bar 24h & Đo Latency ms]
    
    C --> C1[Đọc 16 tài khoản test 7 vai trò từ site_monitor_credentials]
    C1 --> C2[Giải mã Fernet ➔ Tự động Post OIDC Form đăng nhập Keycloak]
    C2 --> C3[Kiểm tra quyền truy cập route nội bộ ➔ Cập nhật trạng thái PASS/FAIL]
    
    D --> D1[Kết nối Vercel REST API: Theo dõi trạng thái build Frontend]
    D --> D2[Kết nối Render REST API: Theo dõi build Backend & Stream Terminal Logs]
```

---

### Luồng 8: Quản Lý Công Việc Kanban Work Board & Thùng Rác 30 Ngày
```mermaid
flowchart TD
    A[WorkBoardPage.tsx /board] --> B[Quản lý Đa Bảng: Thêm mới / Tùy biến Wallpaper]
    B --> C[6 Cột trạng thái: Backlog, To Do, In Progress, Review, Done, Abort]
    C --> D[Thẻ công việc: Kéo thả D&D, Subtasks Checklist, Due Date]
    D --> E{Tất cả Subtasks hoàn thành hoặc Kéo vào cột Done?}
    E -- Đúng --> F[Kích hoạt hiệu ứng Pháo hoa Canvas Confetti]
    B --> G[Xóa Bảng] --> H[Chuyển vào Thùng rác 30 ngày: is_deleted = TRUE]
    H --> I{Thao tác tại Thùng rác}
    I -- Khôi phục --> J[Phục hồi bảng nguyên vẹn: is_deleted = FALSE]
    I -- Xóa vĩnh viễn --> K[Xóa cứng khỏi CSDL Supabase]
```

---

### Luồng 9: Điều Phối GitHub Issue Trực Tiếp Vào Private Repo
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Quản Trị Viên (Web Portal)
    participant GH_Page as GithubReporterPage.tsx
    participant Backend as FastAPI GitHub Endpoint
    participant Gemini as Gemini AI Template Engine
    participant GitHub as GitHub REST API (PTV-TechHub/Pythaverse2026)

    Admin->>GH_Page: Chọn Ticket cần báo lỗi hoặc nhập yêu cầu thủ công
    GH_Page->>Backend: Gửi yêu cầu sinh mẫu báo cáo lỗi
    Backend->>Gemini: Nạp thông tin Ticket & Ghi chú QA ➔ Sinh Title, Body Markdown chuẩn
    Gemini-->>Backend: Trả về Markdown template chuyên nghiệp
    Backend-->>GH_Page: Hiển thị bản xem trước cho Admin chỉnh sửa
    Admin->>GH_Page: Bấm "Gửi Issue Lên GitHub"
    GH_Page->>Backend: Gọi create_issue(title, body, labels, assignees)
    Backend->>GitHub: POST /repos/PTV-TechHub/Pythaverse2026/issues (Bearer GITHUB_PAT)
    GitHub-->>Backend: Trả về Issue #ID và HTML URL
    Backend-->>GH_Page: Thông báo thành công kèm đường dẫn trực tiếp tới GitHub Issue
```

---

## 🧭 PHẦN IX: CẨM NANG VẬN HÀNH & MA TRẬN ĐIỀU HƯỚNG DÀNH CHO AI CODER MỚI

Khi tiếp nhận bất kỳ yêu cầu nào từ người dùng, AI Coder mới **CHỈ CẦN TRA BẢNG DƯỚI ĐÂY** để biết chính xác file và hàm cần can thiệp:

### 1. Bảng Ma Trận Tra Cứu Tác Vụ Cực Nhanh (Quick Dispatch Matrix)

| Yêu Cầu Nghiệp Vụ Cần Xử Lý | Tệp Tin Cần Mở | Hàm Xử Lý Trọng Tâm | Ghi Chú Kỹ Thuật |
|---|---|---|---|
| **Sửa lỗi / Nâng cấp Ghi danh Moodle LMS** | [`backend/app/services/playwright_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/playwright_service.py) | `enroll_users_pipeline`, `modify_user_role`, `unenrol_users_pipeline` | Dùng Keyword Filter 2 nhịp, lọc `td.cell.c2`, gỡ sạch role cũ khi gán Mono-Role. |
| **Sửa lỗi chuỗi cấp phép License 4 cấp** | [`backend/app/services/workspace/orchestrator_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/orchestrator_service.py) | `execute_full_license_hierarchy_chain` | Kết hợp `order_service.py` và `contract_service.py`. |
| **Thay đổi logic bóc tách COF Excel** | [`backend/app/services/cof_excel_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/cof_excel_service.py) | `parse_cof_excel`, `generate_accounts_file_for_upload`, `write_results_back_to_cof` | Ngày sinh DOB bắt buộc `D/M/YYYY`, highlight cam `#FCE4D6` & đỏ `#C00000`. |
| **Thêm / Sửa thao tác Keycloak** | [`backend/app/services/keycloak_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/keycloak_service.py) | `execute_account_action`, `reset_password`, `activate_account` | Luôn giữ 2-Tier: Direct API trước, RPA Fallback sau. |
| **Sửa / Tối ưu In-Memory Cache Khóa Học** | [`backend/app/api/v1/endpoints/courses.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/courses.py) | `SimpleMemoryCache.invalidate`, `list_courses`, `bulk_upsert_courses` | TTL 10 phút, tự động xóa cache khi CUD. |
| **Sửa / Tối ưu Cache Phả Hệ 480 Trường** | [`backend/app/api/v1/endpoints/workspace.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/workspace.py) | `WorkspaceMemoryCache`, `get_hierarchy_schools`, `get_cached_pending_orders` | TTL 15 phút, đọc RAM 0.1ms. |
| **Thêm / Sửa luồng Bot Worker nền** | [`backend/app/workers/bot_executor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/workers/bot_executor.py) | `execute_approved_bot_task` | Khớp đúng `bot_type` và `action` từ payload (14 actions). |
| **Thay đổi chu kỳ Cron / Thêm Cron mới** | [`backend/app/main.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/main.py) | `lifespan`, `safe_job_wrapper` | Bắt buộc bọc bằng `safe_job_wrapper` và gọi `gc.collect()`. Khởi chạy so le lệch pha. |
| **Sửa giao diện Studio Điều Phối Bot** | [`frontend/src/features/studio/AutomationStudioPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/studio/AutomationStudioPage.tsx) | Component `AutomationStudioPage` | 4 Dispatcher Tabs, Autocomplete 480 trường, Cache 0ms `ptv_studio_*`. |
| **Sửa giao diện Quản Lý Khóa Học** | [`frontend/src/features/courses/CoursesManagerPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/courses/CoursesManagerPage.tsx) | Component `CoursesManagerPage` | Phân biệt `workspace_courses` và `lms_courses`, SheetJS parser batch 50. |
| **Sửa giao diện Kanban Work Board** | [`frontend/src/features/board/WorkBoardPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/board/WorkBoardPage.tsx) | Component `WorkBoardPage` | 6 Cột trạng thái, Thùng rác 30 ngày, Canvas Confetti. |
| **Sửa giao diện Giám Sát Hệ Thống** | [`frontend/src/features/monitor/SiteMonitorPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/monitor/SiteMonitorPage.tsx) | Component `SiteMonitorPage` | 3 Tab: Public Sites, Auth Matrix, CI/CD Logs. |
| **Sửa giao diện Cổng Duyệt Tác Vụ** | [`frontend/src/features/tasks/TaskManagementPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/tasks/TaskManagementPage.tsx) | Component `TaskManagementPage` | Human-in-the-Loop Gate, ANSI logs, Live Terminal. |
| **Sửa giao diện Hòm Thư Đa Kênh** | [`frontend/src/features/inbox/UnifiedInboxPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/inbox/UnifiedInboxPage.tsx) | Component `UnifiedInboxPage` | Feed hợp nhất, AI Triage badge, Filter đa tiêu chí. |

---

### 2. Khởi Động Môi Trường Phát Triển Cục Bộ (Local Dev)

#### 1. Khởi chạy Backend FastAPI (Terminal 1):
```powershell
cd backend
# Kích hoạt môi trường ảo Python
.\venv\Scripts\Activate.ps1
# Cài đặt thư viện phụ thuộc (nếu chưa cài)
pip install -r requirements.txt
# Khởi chạy máy chủ phát triển
uvicorn app.main:app --reload --port 8000
```
*Tài liệu Swagger UI kiểm thử API trực quan:* `http://localhost:8000/docs`

#### 2. Khởi chạy Frontend React SPA (Terminal 2):
```powershell
cd frontend
# Cài đặt gói thư viện Node.js (nếu chưa cài)
npm install
# Khởi chạy Vite Dev Server
npm run dev
```
*Giao diện Web Portal hiển thị tại:* `http://localhost:5173`

---

### 3. Danh Mục Biến Môi Trường Cốt Lõi (`backend/.env`)
```ini
# --- CẤU HÌNH HỆ THỐNG & AN NINH ---
PROJECT_NAME="Pythaverse Central Admin & Automation Hub"
ENV="development"
ALLOWED_DOMAIN="dtt.vn"
VAULT_SECRET_KEY="<Fernet_32_Byte_Base64_Key>"

# --- CƠ SỞ DỮ LIỆU SUPABASE POSTGRESQL 16 ---
SUPABASE_URL="https://wndmnrgxupnwxizsxqbx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<Supabase_Service_Role_Secret_Key>"

# --- GOOGLE GEMINI AI ENGINE (10-MODEL FALLBACK) ---
GEMINI_API_KEY="<Google_Gemini_API_Key>"

# --- KEYCLOAK IDENTITY IDP ---
KEYCLOAK_SERVER_URL="https://eid.pythaverse.space/auth"
KEYCLOAK_REALM="master"
KEYCLOAK_ADMIN_USER="admin"
KEYCLOAK_ADMIN_PASS="<Keycloak_Admin_Password>"

# --- OS TICKET HELPDESK ENGINE ---
OSTICKET_URL="https://support.pythaverse.space"
OSTICKET_ADMIN_USER="admin_hung"
OSTICKET_ADMIN_PASS="<OSTicket_Password>"

# --- GITHUB ISSUE DISPATCHER ---
GITHUB_PAT="<GitHub_Personal_Access_Token>"
GITHUB_DEFAULT_OWNER="PTV-TechHub"
GITHUB_DEFAULT_REPO="Pythaverse2026"

# --- GOOGLE WORKSPACE, SHEETS, DOCS & DRIVE ---
GOOGLE_CLIENT_ID="<Google_OAuth_Client_ID>"
GOOGLE_CLIENT_SECRET="<Google_OAuth_Client_Secret>"
GMAIL_REFRESH_TOKEN="<Gmail_API_Refresh_Token>"
GOOGLE_CREDENTIALS_JSON='{"type": "service_account", ...}'
SPREADSHEET_ID="1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go"
COF_ROOT_FOLDER_ID="1SEh4I9yJRM8JNi_SC9CltpkyDYeG-I--"
```

---

### 4. Năm Quy Chuẩn Vàng Khi Mở Rộng Tính Năng Mới
1. **Khi thêm một Endpoint mới:** Bắt buộc tạo router con trong `backend/app/api/v1/endpoints/`, sau đó đăng ký vào `backend/app/api/v1/router.py`. Mọi endpoint can thiệp dữ liệu phải xác thực email `@dtt.vn` qua `get_current_user_email`. Áp dụng In-Memory RAM Caching nếu endpoint được truy vấn thường xuyên.
2. **Khi thêm một Bảng CSDL mới:** Bắt buộc viết script migration SQL vào `supabase/migrations/` và cập nhật đồng bộ vào `supabase/schema.sql` (kèm RLS policy `admin_dtt_vn_only` và comment mô tả).
3. **Khi thêm một Worker RPA mới:** Bắt buộc kế thừa từ `WorkspaceBaseService` trong `backend/app/services/workspace/`, đảm bảo gọi Chromium với cờ tiết kiệm RAM và dọn bộ nhớ `gc.collect()` trong khối `finally`.
4. **Khi thêm một Trang Giao Diện mới:** Tạo thư mục tương ứng trong `frontend/src/features/`, khai báo Route trong `frontend/src/App.tsx` bằng `React.lazy`, tuân thủ cấu trúc Bento Grid, palette màu Enterprise Pastel OKLCH và hỗ trợ đầy đủ 2 chế độ Dark / Light theme.
5. **Cập Nhật Tài Liệu Đồng Bộ:** Bất kỳ thay đổi kiến trúc nào cũng phải được cập nhật ngay vào file [README.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/README.md) và [GEMINI.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/GEMINI.md) này để giữ vững vai trò **Single Source of Truth** của dự án.

---

## 🤖 PHẦN X: CẨM NANG ĐỊNH TUYẾN CHUYÊN GIA AI (INTELLIGENT AGENT ROUTING PLAYBOOK)

Khi AI Assistant thực thi bất kỳ nhiệm vụ lập trình hay phân tích nào trong workspace, hệ thống **BẮT BUỘC TỰ ĐỘNG** kích hoạt hồ sơ chuyên gia tương ứng từ `.agent/agents/`:

| Lĩnh Vực / Phạm Vi Tác Vụ | Agent Chuyên Gia | Hồ Sơ Tham Chiếu | Trọng Tâm Quy Chuẩn Áp Dụng |
|---|---|---|---|
| **Frontend UI/UX** | `frontend-specialist` | `.agent/agents/frontend-specialist.md` | React 19, TypeScript Strict, Tailwind CSS v4, Bento Grid, Enterprise Pastel OKLCH, Dark/Light theme, SaaS aesthetic, chống AI-slop, loại bỏ nhãn song ngữ thừa. |
| **Backend & REST APIs** | `backend-specialist` | `.agent/agents/backend-specialist.md` | Python 3.11, FastAPI 0.115, Pydantic v2 validation, Async/Await, APScheduler 6 Crons so le, Safe Job Wrapper, In-Memory RAM Caching 1ms. |
| **Database & Storage** | `database-architect` | `.agent/agents/database-architect.md` | Supabase PostgreSQL 16 (16 bảng CSDL + Storage Bucket), ENUMs, Foreign Keys, RLS Policies `@dtt.vn`, Performance Indexes, Triggers. |
| **RPA & Web Scraping** | `qa-automation-engineer` | `.agent/agents/qa-automation-engineer.md` | Playwright Async Chromium, Gói `workspace/` modularized 8 modules, Scanner Direct API, Moodle Keyword Filter 2 nhịp, Viewport chuẩn, Selector kiên cố, Smart Polling, dọn RAM `gc.collect()`. |
| **Security & Identity** | `security-auditor` | `.agent/agents/security-auditor.md` | Whitelist Domain `@dtt.vn`, Fernet Credential Vault (`VAULT_SECRET_KEY`), Keycloak Admin REST API + Playwright Fallback, Bearer Token validation. |
| **Điều Phối Đa Nhiệm** | `orchestrator` | `.agent/agents/orchestrator.md` | Phân tích luồng end-to-end, giải quyết xung đột dữ liệu, thiết kế pipeline liên thông đa dịch vụ. |
| **Gỡ Lỗi & Điều Tra Lỗi** | `debugger` | `.agent/agents/debugger.md` | 4-Phase Systematic Debugging, bắt log thực thi GMT+7, cô lập nguyên nhân gốc rễ, Gemini 10-model fallback. |

### Checklist Tự Kiểm Tra Trước Khi Trả Lời (Agent Routing Checklist):
1. Đã nhận diện đúng Agent chuyên môn cho lĩnh vực yêu cầu chưa?
2. Đã thông báo định tuyến: `🤖 **Applying knowledge of @[agent-name]...**` chưa?
3. Đã đảm bảo ngôn ngữ phản hồi bằng **Tiếng Việt**, tên biến/hàm/mã nguồn bằng **Tiếng Anh** chưa?
4. Đã gắn link tệp tin định dạng `[Tên tệp](file:///...)` chưa?
5. Đã bảo đảm tuân thủ 4 Nguyên Tắc Thiết Kế Bất Di Bất Dịch chưa?
