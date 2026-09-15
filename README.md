# 🚀 BÁCH KHOA TOÀN THƯ KIẾN TRÚC HỆ THỐNG PTV-TASKS-ADMINISTRATOR
## Pythaverse Central Admin & Automation Hub (Enterprise Single Source of Truth)

> **Tài liệu kiến trúc chuẩn mực:** Bản tài liệu này được biên soạn độc quyền và toàn diện để hệ thống hóa 100% mã nguồn, kiến trúc đa nền tảng, cơ chế an toàn bất biến, các dịch vụ tự động hóa, 20 bảng CSDL Supabase, toàn bộ 45+ module Backend FastAPI và 13 trang chức năng Frontend SPA của dự án **`ptv-tasks-administrator`**.  
> **Cam kết thiết kế:** Bất kỳ AI Coder hay kỹ sư hệ thống mới nào chỉ cần đọc duy nhất tệp tin này là thấu suốt toàn bộ dự án, hiểu rõ vai trò của từng tệp tin, cách thức hoạt động của từng hàm, luồng dữ liệu liên thông và các ràng buộc an toàn tuyệt đối mà không cần phải mở xem từng file đơn lẻ.

---

## 📌 THÔNG TIN BẢN QUYỀN & TÁC GIẢ SÁNG LẬP

- **Dự án:** `ptv-tasks-administrator` (Pythaverse Central Admin & Automation Hub)
- **Tác giả & Kiến trúc sư trưởng:** **Nguyễn Mạnh Hùng** (*Lead AI Engineer & Automation Architect – DTT Corporation / Pythaverse Ecosystem*)
- **GitHub:** [`https://github.com/hungnm-1225`](https://github.com/hungnm-1225)
- **Email:** `hungnm@dtt.vn` / `hung.nguyenmanh@dtt.vn`
- **Hệ sinh thái:** [Pythaverse Space](https://pythaverse.space)
- **Phiên bản:** `v3.4.0 Enterprise Comprehensive Edition` (Cập nhật ngày 15 tháng 09 năm 2026)

---

## 📑 MỤC LỤC TỔNG QUAN

1. [PHẦN I: TẦM NHÌN HỆ THỐNG & SÁU NGUYÊN TẮC BẤT BIẾN (SAFETY INVARIANTS)](#-phần-i-tầm-nhìn-hệ-thống--sáu-nguyên-tắc-bất-biến-safety-invariants)
2. [PHẦN II: 7 PHÂN HỆ NGHIỆP VỤ PYTHAVERSE (DOMAIN TRUTH)](#-phần-ii-7-phân-hệ-nghiệp-vụ-pythaverse-domain-truth)
3. [PHẦN III: STACK CÔNG NGHỆ, HẠ TẦNG ĐA NỀN TẢNG & THÔNG SỐ VẬN HÀNH](#-phần-iii-stack-công-nghệ-hạ-tầng-đa-nền-tảng--thông-số-vận-hành)
4. [PHẦN IV: SƠ ĐỒ CẤU TRÚC THƯ MỤC MONOREPO TỔNG THỂ & VAI TRÒ TỪNG FILE](#-phần-iv-sơ-đồ-cấu-trúc-thư-mục-monorepo-tổng-thể--vai-trò-từng-file)
5. [PHẦN V: GIẢI PHẪU CHI TIẾT TỪNG FILE & HÀM XỬ LÝ BACKEND (FASTAPI 0.115)](#-phần-v-giải-phẫu-chi-tiết-từng-file--hàm-xử-lý-backend-fastapi-0115)
   - [5.1. Entrypoint, Lifespan & 6 Crons Lệch Pha (`app/main.py`)](#51-entrypoint-lifespan--6-crons-lệch-pha-appmainpy)
   - [5.2. Lõi Hệ Thống Core (`app/core/`) – Dual-Key AI, OCC Lease & Lock Concurrency](#52-lõi-hệ-thống-core-appcore)
   - [5.3. Định Nghĩa Schemas & Models Pydantic (`app/models/`)](#53-định-nghĩa-schemas--models-pydantic-appmodels)
   - [5.4. Tri Thức Nghiệp Vụ & Policy Registry (`app/brain/`)](#54-tri-thức-nghiệp-vụ--policy-registry-appbrain)
   - [5.5. Cổng Giao Tiếp 10 Router REST API Endpoints (`app/api/v1/endpoints/`)](#55-cổng-giao-tiếp-10-router-rest-api-endpoints-appapiv1endpoints)
   - [5.6. Dịch Vụ Nghiệp Vụ & RPA Services (`app/services/`)](#56-dịch-vụ-nghiệp-vụ--rpa-services-appservices)
     - [5.6.1. Dịch Vụ Phân Tách Email Thread (`app/services/email_thread_service.py`)](#561-dịch-vụ-phân-tách-email-thread-appservicesemail_thread_servicepy)
     - [5.6.2. Thẩm Định Bằng Chứng & Chuẩn Hóa Fact (`evidence_verifier.py` & `request_fact_normalizer.py`)](#562-thẩm-định-bằng-chứng--chuẩn-hóa-fact-evidence_verifierpy--request_fact_normalizerpy)
     - [5.6.3. Bộ Lập Kế Hoạch & Thực Thi DAG (`workflow_planner.py` & `workflow_executor.py`)](#563-bộ-lập-kế-hoạch--thực-thi-dag-workflow_plannerpy--workflow_executorpy)
     - [5.6.4. Gói Xử Lý Bảng Tính Chuyên Biệt (`app/services/excel/` & `cof_excel_service.py`)](#564-gói-xử-lý-bảng-tính-chuyên-biệt-appservicesexcel--cof_excel_servicepy)
     - [5.6.5. Gói RPA Modularized School Workspace (`app/services/workspace/`)](#565-gói-rpa-modularized-school-workspace-appservicesworkspace)
     - [5.6.6. Các Dịch Vụ RPA & Phân Hệ Ngoài (LMS, Git, Keycloak, osTicket, Monitor, Google, GitHub)](#566-các-dịch-vụ-rpa--phân-hệ-ngoài-lms-git-keycloak-osticket-monitor-google-github)
   - [5.7. Bộ Điều Phối Workers Chạy Ngầm (`app/workers/`)](#57-bộ-điều-phối-workers-chạy-ngầm-appworkers)
   - [5.8. Bộ Kịch Bản Bổ Trợ CLI & Scripts (`backend/scripts/`)](#58-bộ-kịch-bản-bổ-trợ-cli--scripts-backendscripts)
   - [5.9. Bộ Kiểm Thử An Toàn Hermetic Pytest Suite (`backend/tests/`)](#59-bộ-kiểm-thử-an-toàn-hermetic-pytest-suite-backendtests)
6. [PHẦN VI: GIẢI PHẪU CHI TIẾT GIAO DIỆN FRONTEND SPA (REACT 19 + VITE 6 + TAILWIND CSS V4)](#-phần-vi-giải-phẫu-chi-tiết-giao-diện-frontend-spa-react-19--vite-6--tailwind-css-v4)
   - [6.1. Kiến Trúc Lõi Frontend SPA, Design System & Shared Components](#61-kiến-trúc-lõi-frontend-spa-design-system--shared-components)
   - [6.2. Giải Phẫu Chi Tiết 13 Trang Chức Năng & Sub-Components (`src/features/`)](#62-giải-phẫu-chi-tiết-13-trang-chức-năng--sub-components-srcfeatures)
7. [PHẦN VII: CƠ SỞ DỮ LIỆU SUPABASE POSTGRESQL 16 (20 BẢNG & PROVENANCE HẠ TẦNG)](#-phần-vii-cơ-sở-dữ-liệu-supabase-postgresql-16-20-bảng--provenance-hạ-tầng)
8. [PHẦN VIII: SƠ ĐỒ LUỒNG NGHIỆP VỤ END-TO-END (MERMAID SEQUENCE & FLOWCHARTS)](#-phần-viii-sơ-đồ-luồng-nghiệp-vụ-end-to-end-mermaid-sequence--flowcharts)
9. [PHẦN IX: BẢNG CHỈ MỤC TRA CỨU NHANH TÊN HÀM ➔ TỆP TIN (FUNCTION-TO-FILE QUICK INDEX)](#-phần-ix-bảng-chỉ-mục-tra-cứu-nhanh-tên-hàm--tệp-tin-function-to-file-quick-index)
10. [PHẦN X: CẨM NANG KHẮC PHỤC SỰ CỐ & FAQ DÀNH RIÊNG CHO AI CODER](#-phần-x-cẩm-nang-khắc-phục-sự-cố--faq-dành-riêng-cho-ai-coder)
11. [PHẦN XI: CẨM NANG ĐỊNH TUYẾN CHUYÊN GIA AI (INTELLIGENT AGENT ROUTING PLAYBOOK)](#-phần-xi-cẩm-nang-định-tuyến-chuyên-gia-ai-intelligent-agent-routing-playbook)

---

## 🏛️ PHẦN I: TẦM NHÌN HỆ THỐNG & SÁU NGUYÊN TẮC BẤT BIẾN (SAFETY INVARIANTS)

`ptv-tasks-administrator` được định vị là **Trung tâm Thần kinh Điều phối & Tự Động Hóa Tập Trung (Pythaverse Central Admin & Automation Hub)** cho toàn bộ tập đoàn DTT Corporation và hệ sinh thái giáo dục công nghệ Pythaverse.

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 ĐẦU VÀO ĐA KÊNH (INGESTION)             │
                  │   [Gmail Workspace]  [Google Forms]  [OS Ticket SCP]   │
                  └───────────────────────────┬────────────────────────────┘
                                              │ Ingestion Crons (Lệch pha: +15s, +90s, +420s)
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                      LÕI TRUNG TÂM PTV-TASKS-ADMINISTRATOR (BACKEND FASTAPI)             │
│                                                                                          │
│  ┌─────────────────────────┐   ┌───────────────────────────┐   ┌──────────────────────┐  │
│  │ Dual-Path Cognition AI  │   │ EvidenceVerifier Service  │   │  Human-in-the-Loop   │  │
│  │ • Summary (Key 1)       │──▶│ • raw_content[start:end]  │──▶│  Safety Gate         │  │
│  │ • Facts (Key 2)         │   │ • Substring Calibration   │   │  JWT Authenticated   │  │
│  │ • Fast-Path Fallback    │   │ • Attachment Fail-Closed  │   │  (@dtt.vn Whitelist) │  │
│  └─────────────────────────┘   └─────────────┬─────────────┘   └──────────────────────┘  │
│                                              │ Verified Facts                            │
│                                              ▼                                           │
│                                ┌───────────────────────────┐                             │
│                                │  Registry Policy Engine   │                             │
│                                │  • intent_policy.json     │                             │
│                                │  • Zero-Mockup Invariant  │                             │
│                                │  • Dual-Freeze Proposal   │                             │
│                                └─────────────┬─────────────┘                             │
│                                              │ Phê duyệt (Approved)                      │
│                                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                 TOPOLOGICAL DAG EXECUTOR & BOT WORKERS (KAHN ALGORITHM)            │  │
│  │  • OCC Workflow Lease Claiming via updated_at (Chống Race-Condition tuyệt đối)     │  │
│  │  • Khối try...finally cam kết 100% thu hồi Lease và tài nguyên Semaphore            │  │
│  │  • Append-Only Audit Trail (workflow_execution_events gắn proposal_id bất biến)    │  │
│  │  • BFS Graph Traversal: Reset thông minh toàn bộ downstream dependencies khi retry │  │
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
                  │ School Workspace | PLearn LMS | Keycloak | Pythaverse Git | GitHub │
                  └───────────────────────────┴────────────────────────────┘
```

### Sáu Nguyên Tắc Thiết Kế Bất Biến (Absolute Safety Invariants):

1. **Evidence-Based & Offset Verification Invariant (Không Bằng Chứng ➔ Không Action):**
   - Mọi ý định vận hành trích xuất bắt buộc phải có đoạn trích dẫn nguyên văn (`quote`) kèm định vị ký tự (`start_offset`, `end_offset`) và mã revision `source_revision_id`.
   - `EvidenceVerifierService` đối soát từng ký tự: $\text{raw\_content}[\text{start}:\text{end}] == \text{quote}$.
   - Nếu trích dẫn bị xê dịch vị trí do định dạng khoảng trắng hoặc ngắt dòng, hệ thống áp dụng thuật toán **Substring Calibration** trong phạm vi 160 ký tự. Nếu quote hoàn toàn không tồn tại hoặc sai lệch revision, intent đó bị gạch bỏ và outcome hạ xuống `needs_information`.
2. **Attachment Evidence Fail-Closed Invariant (File đính kèm chưa đối soát ➔ Không Action):**
   - Các trích dẫn có `source_kind == "attachment_extract"` tạm thời bị gắn cờ `is_verified = False` (chuyển sang `needs_information`).
   - Nghiêm cấm tuyệt đối việc dùng text thân email để đối soát trích dẫn từ file đính kèm khi chưa qua hạ tầng bóc tách bất biến.
3. **Zero-Mockup Invariant (Cấm Tuyệt Đối Dữ Liệu Bịa Đặt / Fallback Giả Định):**
   - Nghiêm cấm sử dụng bất kỳ giá trị mặc định giả lập nào (`SWRP 4-12`, count=4, mật khẩu `Ptv@2026`).
   - **Đặc biệt: Khai tử hoàn toàn default Git role `GUEST` và default LMS role `student` khi thiếu ngữ cảnh**. Yêu cầu cấp quyền Git không nêu rõ vai trò bắt buộc sinh `missing_requirement: git_role`, yêu cầu ghi danh LMS không rõ vai trò không tự gán `student`, lập tức chuyển trạng thái sang `needs_information` và chặn phê duyệt thực thi.
4. **Dual-Freeze Proposal & Immutable Provenance Linkage:**
   - Khi Admin phê duyệt, hệ thống đóng băng đồng thời cả `workflow_proposals.frozen_plan` và `automation_workflows.steps`.
   - Toàn bộ execution events trong `workflow_execution_events` bắt buộc phải mang theo `proposal_id`. Tuyệt đối không cho phép chỉnh sửa workflow hay proposal sau khi đã ở trạng thái `approved`.
5. **Real JWT Identity Enforcement (Chống Mạo Danh Người Phê Duyệt):**
   - Bỏ qua trường `approved_by` do Frontend gửi lên trong payload body.
   - Danh tính người duyệt được giải mã trực tiếp từ Bearer JWT Token qua dependency `get_current_user_email` và bắt buộc thuộc whitelist domain `@dtt.vn`.
6. **Optimistic Concurrency Control (OCC) Lease & Concurrency Safeguard (Render 512MB RAM):**
   - Chiếm Lease độc quyền cấp Workflow qua `TaskCoordinator.claim_workflow_lease()` sử dụng kiểm soát đồng thời lạc quan (OCC) trên trường `updated_at`. Hàm `update_workflow_heartbeat()` ném `RuntimeError` dừng khẩn cấp worker nếu bị cướp lease.
   - Khóa cứng `GLOBAL_PLAYWRIGHT_SEMAPHORE = asyncio.Semaphore(1)` kết hợp ContextVar `_PLAYWRIGHT_SLOT_HOLDER` chống deadlock re-entrancy khi hàm cha con cùng gọi acquire slot.
   - Mọi coroutine chạy Playwright hoặc quét ngầm bắt buộc gọi `gc.collect()` và `force_kill_zombie_chromium()` trong khối `finally`.
   - 6 Crons trong `main.py` xuất phát lệch pha (15s, 90s, 180s, 420s, 1200s, 2400s) để ngăn tràn RAM.

---

## 🌐 PHẦN II: 7 PHÂN HỆ NGHIỆP VỤ PYTHAVERSE (DOMAIN TRUTH)

| STT | Phân Hệ | Tên Miền / Giao Thức | Core Platform | Vai Trò Kỹ Thuật & Nghiệp Vụ Cốt Lõi | Phương Thức Tự Động Hóa |
|---|---|---|---|---|---|
| **1** | **School Workspace** | `https://pythaverse.space` | React MUI / Direct REST APIs | Quản trị phân cấp 3 tầng (`Distributor` ➔ `Partner` ➔ `School`). Cấp phát License Pool, bù Contract, nộp batch tài khoản số lượng lớn qua Bulk Account Creation. | Playwright Headless + Direct API Scanner (Gói `workspace/` 8 modules). Bơm DOM JS trực tiếp bảo toàn ký tự đặc biệt. |
| **2** | **PLearn LMS** | `https://learn.pythaverse.space` | Moodle LMS (PHP / MariaDB / Edwiser RemUI) | Cổng đào tạo Moodle LMS. Quản lý danh mục khóa học (`SWRP`, `IR`, `ASP`...) và ghi danh tài khoản theo Vai trò (`Student` - 9, `Teacher` - 7, `Manager` - 1). | Playwright Headless + Keyword Filter 2 nhịp trên `td.cell.c2` (`playwright_service.py`). |
| **3** | **PGit Repos** | `https://git.pythaverse.space` | GitBucket Server (Scala / JVM / SQLite) | Máy chủ lưu trữ mã nguồn dự án học sinh & giáo viên. Quản lý Collaborators tại `/settings/collaborators`. Yêu cầu đăng nhập SSO Keycloak. | Playwright Chromium tự động hóa OIDC Keycloak SSO Form, gán vai trò `ADMIN`, `DEVELOPER`, `GUEST` (`git_service.py`). |
| **4** | **Keycloak Auth IDP** | `https://eid.pythaverse.space` | Keycloak (Java / WildFly / PostgreSQL) | Cổng xác thực định danh tập trung OpenID Connect / OAuth2 (Realm: `master` / `idp`). Reset mật khẩu, kích hoạt/khóa tài khoản và xác thực email. | 2-Tier Hybrid: Direct REST API (300ms) ➔ Playwright RPA Fallback (`keycloak_service.py`). |
| **5** | **Leanbot IDE** | `https://ide.pythaverse.space` | Blockly / Web Bluetooth BLE | Web IDE lập trình khối kéo thả Blockly kết nối Robot Leanbot qua Bluetooth BLE. | Synthetic Monitoring Uptime & Latency (`site_monitor_service.py`). |
| **6** | **Support Helpdesk** | `https://support.pythaverse.space` | osTicket (PHP / MySQL) | Hệ thống tiếp nhận sự cố kỹ thuật osTicket. Cào dữ liệu định kỳ qua Playwright Headless session và chuyển giao cho Canonical Intake. | Playwright headless scraper cào vé, custom form fields & files đính kèm (`osticket_service.py`). |
| **7** | **PContest** | `https://contest.pythaverse.space` | Next.js / Python Judge | Hệ thống tổ chức thi đấu lập trình trực tuyến, quản lý Leaderboard và chấm điểm tự động. | Synthetic Monitoring Uptime & Latency (`site_monitor_service.py`). |

---

## 🛠️ PHẦN III: STACK CÔNG NGHỆ, HẠ TẦNG ĐA NỀN TẢNG & THÔNG SỐ VẬN HÀNH

### 1. Thế Trận Hạ Tầng Đa Nền Tảng (Multi-Platform Topology)
- **Vercel**: Máy chủ Edge CDN lưu trữ ứng dụng Frontend React 19 SPA (Build siêu tốc với Dynamic Chunk Splitting qua Vite 6).
- **Render.com**: Máy chủ khởi chạy Backend FastAPI trên môi trường tài nguyên nghiêm ngặt (**512MB RAM Free/Starter Tier**). Khóa cứng Semaphore 1 slot, thu hồi bộ nhớ `gc.collect()` và tiêu diệt Chromium zombie.
- **Supabase**: Cơ sở dữ liệu PostgreSQL 16 (20 bảng chuyên biệt, RLS `@dtt.vn`, Storage Bucket `ticket-attachments`, Két sắt mã hóa Fernet, và PostgreSQL Stored Procedure Atomic Locking).
- **Google Cloud Console**: Quản trị tài khoản dịch vụ (Service Account) tích hợp bộ ba Gmail Workspace API, Google Sheets API và Google Drive API.
- **UptimeRobot**: Giám sát ngoại vi Synthetic Ping Uptime (chu kỳ 5 phút) kiêm nhiệm vụ giữ ấm (keep-warm ping) cho Render chống ngủ đông.
- **GitHub**: Quản lý mã nguồn Monorepo, GitHub Actions CI/CD và Dispatcher Issue tự động vào Private Repositories.

### 2. Chi Tiết Backend Stack
- **Ngôn ngữ & Runtime:** Python `3.11.x` / `3.12.x`
- **Web Framework:** FastAPI `0.115.x` (Asynchronous ASGI)
- **Validation Engine:** Pydantic `2.10.x` (Strict Schema Validation & Settings Management)
- **RPA Engine:** Playwright Async Chromium (`playwright.async_api: 1.50.x`)
- **Lập lịch chạy ngầm:** APScheduler `3.10.x` (`AsyncIOScheduler`) với 6 Crons so le lệch pha.
- **In-Memory Caching:** Ma trận 8 In-Memory RAM Caches (`BoundedMemoryCache` phân tầng LRU + TTL, phản hồi 1ms, RAM <= 40MB).
- **Trí tuệ nhân tạo (AI):** `google-generativeai: ^0.8.4` tích hợp Dual-Key Engine (`GEMINI_API_KEY` & `GEMINI_API_KEY2`), Cross-Key Failover, chuỗi 10 models fallback (`gemini-3.8-flash` ➔ `gemini-3.7-flash` ➔ `gemini-3.5-flash-lite`...), kết hợp bộ **Deterministic Fast-Path Triage v1.2.0**.
- **Kiểm Thử Hồi Quy:** `pytest: ^8.x/9.x` / `anyio: ^4.x` (Hermetic in-memory test suite, 23/23 tests pass 100% in 1.33s).

### 3. Chi Tiết Frontend Stack
- **Node.js**: `20.x LTS` / `22.x LTS`
- **React**: `19.0.0` (React 19 Functional Hooks, Concurrent Rendering, Suspense Code Splitting)
- **Build Tool:** Vite `6.2.x`
- **TypeScript**: `5.7.x` (`strict: true`, Strict Type Checking)
- **Tailwind CSS**: `4.0.x` (Kiến trúc Design Tokens hiện đại `@import "tailwindcss";` kết hợp Enterprise Pastel OKLCH)
- **Lucide React**: `0.475.x` (Icon Library đồng nhất)
- **SheetJS (`xlsx`)**: `0.18.5` (Xử lý bóc tách & hiển thị bảng tính Excel tương tác client-side)
- **Supabase JS Client**: `@supabase/supabase-js: ^2.48.x` (Auth & Realtime Client)
- **Sonner**: `^2.0.1` (Toast Notification thích ứng Theme)
- **Canvas Confetti**: `^1.9.4` (Hiệu ứng pháo hoa hạt khi duyệt/hoàn thành workflow)

---

## 📁 PHẦN IV: SƠ ĐỒ CẤU TRÚC THƯ MỤC MONOREPO TỔNG THỂ & VAI TRÒ TỪNG FILE

```
ptv-tasks-administrator/
├── backend/                                    # Ứng dụng Backend FastAPI (Python 3.11/3.12)
│   ├── app/
│   │   ├── api/                                # REST API Routers
│   │   │   └── v1/
│   │   │       ├── router.py                   # Aggregator router gom 10 endpoints
│   │   │       └── endpoints/                  # 10 Router chuyên biệt
│   │   │           ├── workflows.py            # Safety Gate, Dual Freeze, DAG Execution, Depends(JWT)
│   │   │           ├── tickets.py              # Canonical Intake, Re-summarize, Re-assess Intent
│   │   │           ├── tasks.py                # Bot Task Queue, run_approved_task_worker, Payload Edit
│   │   │           ├── bots.py                 # Bot Status, Realtime Logs GMT+7 với Taxonomy Filter
│   │   │           ├── board.py                # Multi-board Kanban (Boards, Columns, Cards, DND)
│   │   │           ├── courses.py              # Dual Catalogs (Workspace & LMS), Git Repo Links
│   │   │           ├── workspace.py            # Phả hệ 480 trường, Scanner Cache, Bóc tách COF
│   │   │           ├── monitor.py              # Synthetic Ping 10 Sites, Auth Matrix, Downtime Logs
│   │   │           ├── github.py               # AI Bug Triage ➔ GitHub Issue Dispatcher
│   │   │           └── reports.py              # KPI Summary, Category Ratios, Daily Trends, Export
│   │   ├── brain/                              # Tri thức nghiệp vụ & Policy Registry
│   │   │   ├── capabilities.json               # 19 Capabilities hệ thống (Schemas, Handlers, Risk)
│   │   │   ├── intent_policy.json              # Bảng chính sách tất định (v1.1.0)
│   │   │   ├── dependency_rules.json           # Quy tắc sắp xếp Tô-pô & DAG dependencies
│   │   │   ├── workflow_rules.json             # Archetypes luồng công việc mẫu
│   │   │   ├── knowledge_base.json             # Tri thức kỹ thuật của 7 phân hệ Pythaverse
│   │   │   └── prompts/                        # Versioned Prompts (ticket_summary_v1, intent_extraction_v1)
│   │   ├── core/                               # Lõi hệ thống & Quản trị tài nguyên
│   │   │   ├── config.py                       # Settings, Pydantic BaseSettings, Time utilities GMT+7
│   │   │   ├── cache_policy.py                 # BoundedMemoryCache (3 Tiers, LRU, TTL, RAM <= 40MB)
│   │   │   ├── playwright_manager.py           # Semaphore 1 Slot, Re-entrancy Lock, Zombie Killer
│   │   │   ├── security.py                     # Whitelist Domain @dtt.vn, Bearer JWT Auth Dependency
│   │   │   ├── supabase.py                     # Singleton client Supabase
│   │   │   ├── task_coordinator.py             # OCC Workflow Lease Claiming via updated_at, Heartbeat
│   │   │   └── gemini.py                       # Dual-Key AI, Cross-Key Failover, Fast-Path Triage
│   │   ├── models/                             # Schemas Pydantic Strict Validation
│   │   │   ├── intent.py                       # EvidenceSpan (offsets), ExtractedEntity, TypedEntities
│   │   │   ├── workflow.py                     # WorkflowStepDraft (is_manual), WorkflowApprovalRequest
│   │   │   ├── ticket.py                       # InboxTicket schemas
│   │   │   ├── task.py                         # BotAutomationTask schemas
│   │   │   └── template.py                     # TemplateConfig schemas
│   │   ├── services/                           # Dịch vụ nghiệp vụ & RPA
│   │   │   ├── email_thread_service.py         # Tách email thread, khử quoted reply, nhận diện DTT vs User
│   │   │   ├── evidence_verifier.py            # Deterministic Verifier, Substring Calibration
│   │   │   ├── request_fact_normalizer.py      # Bổ sung sự thật xác thực từ văn bản gốc (Regex patterns)
│   │   │   ├── workflow_planner.py             # Policy Engine, Course/Git DB Resolve, Auto Git Sync
│   │   │   ├── workflow_executor.py            # Topological Kahn DAG, Frozen Plan SOT, BFS Retry
│   │   │   ├── cof_excel_service.py            # Facade Proxy chuyển tiếp sang app.services.excel
│   │   │   ├── excel/                          # Gói chuyên biệt bóc tách & tạo file Excel (4 services)
│   │   │   │   ├── cof_service.py              # Bóc tách file COF 3 Tabs & Dán ngược kết quả vào COF gốc
│   │   │   │   ├── bulk_template_service.py    # Phôi chuẩn hóa tài khoản trường học & xử lý text trần
│   │   │   │   ├── generic_excel_service.py    # Bóc tách mọi file Excel tự do (Links, Emails, Repos)
│   │   │   │   └── tof_service.py              # Khung bóc tách file TOF (Training Order Form)
│   │   │   ├── workspace_lineage_service.py    # Phân giải phả hệ 3 cấp & giải mã két sắt Fernet
│   │   │   ├── workspace_playwright_service.py # Singleton facade kết nối workspace orchestrator
│   │   │   ├── workspace/                      # Gói RPA Workspace modularized 8 modules
│   │   │   │   ├── base.py                     # Low-RAM Chromium Setup, JS DOM Injection Login
│   │   │   │   ├── account_service.py          # Bulk Account Creation & Batch Polling
│   │   │   │   ├── order_service.py            # School Order Creation & Partner License Grant
│   │   │   │   ├── contract_service.py         # Partner Contract Request & Distributor Approval
│   │   │   │   ├── enroll_service.py           # License Allocation to Students
│   │   │   │   ├── workspace_scanner_service.py# Direct API Scanner + Playwright Cache Sync
│   │   │   │   └── orchestrator_service.py     # E2E Pipeline Coordinator
│   │   │   ├── playwright_service.py           # Moodle LMS Enrollment Playwright Service (2 nhịp td.cell.c2)
│   │   │   ├── git_service.py                  # GitBucket Playwright Collaborators Service (OIDC Keycloak)
│   │   │   ├── keycloak_service.py             # 2-Tier Hybrid Keycloak (REST API 300ms + RPA Fallback)
│   │   │   ├── osticket_service.py             # osTicket Playwright Scraper
│   │   │   ├── site_monitor_service.py         # Synthetic Monitor Uptime & Latency cho 10 Sites
│   │   │   ├── gmail_service.py                # Google Workspace Gmail Polling via OAuth2
│   │   │   ├── google_sheet_service.py         # Google Sheets Form Feedback Polling
│   │   │   ├── google_doc_service.py           # Google Docs Feedback Comments Reader
│   │   │   ├── google_drive_service.py         # Google Drive Downloader & Explorer
│   │   │   └── github_service.py               # GitHub REST API Issue Creator
│   │   ├── workers/                            # Bộ điều phối thực thi chạy ngầm
│   │   │   ├── bot_executor.py                 # Central Worker Router thực thi 19 Capabilities
│   │   │   └── ticket_processor.py             # Atomic Revision RPC, Canonical Hash, Provenance Pipeline
│   │   └── main.py                             # Lifespan 6 Crons so le, Polling với Proposal ID audit
│   ├── scripts/                                # Scripts bổ trợ CLI & Quản trị dữ liệu
│   │   └── import_hierarchy.py                 # Script nhập phả hệ 480 trường học vào CSDL
│   ├── re_triage_all_tickets.py                # Script chạy lại AI Triage hàng loạt cho Inbox
│   ├── seed_monitor_credentials.py             # Script khởi tạo tài khoản kiểm thử cho 10 Sites
│   ├── test_git_collaborator.py                # Script kiểm thử độc lập cho RPA GitBucket
│   ├── test_lms_advanced_features.py           # Script kiểm thử độc lập cho RPA LMS Moodle
│   ├── tests/                                  # Bộ Kiểm Thử Hermetic Pytest (In-memory, Zero AI Quota)
│   │   ├── conftest.py                         # Pytest Fixtures & In-memory setup
│   │   ├── test_capability_contracts.py        # Contract Test 19 capabilities vs bot_executor
│   │   ├── test_planning_policy.py             # Test Zero-Mockup, EvidenceVerifier, Injection, Offsets
│   │   ├── test_request_fact_normalizer.py     # Test bóc tách email, role, khóa học, intents nguyên văn
│   │   ├── test_execution_safety.py            # Test Kahn Topological sort, Masking, Data Binding
│   │   ├── test_security_and_provenance.py     # Test JWT whitelist @dtt.vn, Immutable Provenance
│   │   └── test_workflow_legacy_replan.py      # Test Re-plan tự động cho legacy workflow
│   ├── pytest.ini                              # Cấu hình Pytest asyncio
│   ├── requirements.txt                        # Thư viện Python Backend
│   └── Dockerfile                              # Cấu hình Docker Linux cho Render.com
├── frontend/                                   # Ứng dụng Frontend SPA (React 19 + Vite 6 + Tailwind CSS v4)
│   ├── src/
│   │   ├── components/                         # UI Components dùng chung
│   │   │   ├── common/                         # ConfirmDialog, ThemeToggle, Header, Sidebar...
│   │   │   └── layout/                         # AppLayout (11 menu navigation, responsive drawer)
│   │   ├── config/                             # Cấu hình tác giả & branding (authorConfig.ts)
│   │   ├── context/                            # React Contexts
│   │   │   ├── AuthContext.tsx                 # Supabase Authentication State & JWT token
│   │   │   └── ThemeContext.tsx                # Dark / Light Mode Switcher
│   │   ├── features/                           # 13 Trang Chức Năng Chuyên Biệt
│   │   │   ├── inbox/                          # AI Workflow Console V3.1 (UnifiedInboxPage.tsx)
│   │   │   │   └── components/                 # WorkflowBuilder, WorkflowStepCard, WorkflowValidationPanel
│   │   │   ├── tasks/                          # TaskManagementPage.tsx (Bot Tasks Queue & Edit)
│   │   │   ├── board/                          # WorkBoardPage.tsx (Multi-board Kanban DND)
│   │   │   ├── studio/                         # AutomationStudioPage.tsx (RPA Multi-System Studio)
│   │   │   ├── courses/                        # CoursesManagerPage.tsx (Dual Catalog & Git Sync)
│   │   │   ├── bots/                           # BotCommanderPage.tsx (Bot Monitoring & Live Terminal)
│   │   │   ├── monitor/                        # SiteMonitorPage.tsx (3-Tab Health & Uptime Monitor)
│   │   │   ├── github/                         # GithubReporterPage.tsx (AI Bug Triage ➔ Issue)
│   │   │   ├── reports/                        # ReportsExportPage.tsx (KPIs & Excel Export)
│   │   │   ├── dashboard/                      # DashboardPage.tsx (Operational Executive Overview)
│   │   │   ├── profile/                        # ProfileSettingsPage.tsx (User Settings & Vault Status)
│   │   │   ├── landing/                        # LandingPage.tsx (Welcome Portal)
│   │   │   └── auth/                           # LoginPage.tsx (Supabase OAuth & @dtt.vn Validation)
│   │   ├── lib/                                # Utilities & HTTP Clients
│   │   │   ├── api.ts                          # fetchApi tự động gắn Supabase Bearer JWT, timeout 30s
│   │   │   └── supabase.ts                     # Supabase Client Frontend
│   │   ├── types/                              # TypeScript Strict Interfaces (index.ts)
│   │   ├── App.tsx                             # SPA Router, Suspense Code Splitting, ProtectedRoute
│   │   ├── index.css                           # Tailwind CSS v4 Design Tokens & OKLCH Theme
│   │   └── main.tsx                            # React 19 Entrypoint (createRoot)
│   ├── package.json                            # Thư viện Frontend
│   ├── tsconfig.json                           # TypeScript Compiler Config
│   └── vite.config.ts                          # Vite 6 Bundler Config & Dynamic Chunk Splitting
├── supabase/
│   ├── migrations/                             # Lịch sử 5 Database Migrations
│   │   ├── 20260812000000_initial_schema.sql
│   │   ├── 20260910000000_add_automation_workflows.sql
│   │   ├── 20260911000000_add_provenance_and_proposals.sql
│   │   ├── 20260912000000_harden_workflow_provenance.sql
│   │   └── 20260913000000_atomic_revisions_and_workflow_safety.sql
│   ├── runbooks/                               # SQL Scripts Pre-flight & Post-flight kiểm định
│   └── schema.sql                              # Schema chuẩn mực 20 bảng CSDL, RLS, Indexes, Stored Procedures
├── GEMINI.md                                   # System Instructions & Quy chuẩn tác nghiệp của AI Assistant (v3.4.0)
├── Blueprint.md                                # Master Blueprint Đặc Tả Kỹ Thuật Tổng Thể v2.0.0
└── README.md                                   # Bách khoa toàn thư kiến trúc hệ thống (Single Source of Truth)
```

---

## 🔬 PHẦN V: GIẢI PHẪU CHI TIẾT TỪNG FILE & HÀM XỬ LÝ BACKEND (FASTAPI 0.115)

### 5.1. Entrypoint, Lifespan & 6 Crons Lệch Pha (`app/main.py`)
- **Tệp tin:** [`backend/app/main.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/main.py)
- **Hàm `lifespan(app: FastAPI)`:**
  - Khởi tạo `AsyncIOScheduler` quản lý 6 tác vụ chạy ngầm định kỳ.
  - Gọi `force_kill_zombie_chromium()` và `gc.collect()` ngay khi khởi động và trước khi shutdown để dọn sạch container Render.
  - Lập lịch xuất phát lệch pha bảo vệ trần 512MB RAM Render:
    1. `gmail_cron` (10 phút, +15s): Gọi `poll_unread_gmails` cào thư mới từ Gmail Workspace qua API.
    2. `sheet_cron` (15 phút, +90s): Gọi `poll_form_feedbacks` cào phản hồi từ Google Sheets.
    3. `workspace_long_tasks_cron` (10 phút, +180s): Gọi `poll_workspace_long_tasks` kiểm tra tiến độ batch tài khoản.
    4. `osticket_cron` (15 phút, +420s): Gọi `poll_open_ostickets` chạy Chromium Playwright cào vé hỗ trợ.
    5. `site_uptime_cron` (60 phút, +1200s): Gọi `poll_site_uptime_cron` quét HTTP ping kiểm tra 10 Sites.
    6. `distributor_cache_scanner_cron` (60 phút, +2400s): Gọi `workspace_scanner_service.scan_and_cache_all_distributors` làm tươi bộ nhớ đệm hợp đồng và đơn hàng.
- **Hàm `safe_job_wrapper(job_func, job_name)`:**
  - Bọc an toàn tuyệt đối cho mọi cronjob: Bắt ngoại lệ, chống crash tiến trình ASGI.
  - Bắt `CronSlotYieldException`: Khi slot Playwright đang bận, cron nhường slot êm dịu mà không xuất log lỗi đỏ.
  - Khối `finally` đảm bảo 100% gọi `gc.collect()`.
- **Hàm `poll_workspace_long_tasks()` – Đồng Bộ Waiting Poll & Tự Động Resume Workflow:**
  - Quét bảng `bot_automation_tasks` tìm các task `execution_status = 'waiting_poll'` và `next_check_at <= now()`.
  - Nếu thiếu `request_id`, lập tức fail-closed cả task lẫn workflow, đánh dấu `status = 'failed'` và ghi audit event `failed` mang đầy đủ `proposal_id`.
  - Nếu batch hoàn tất (`status == 'completed'`):
    - Đọc file kết quả, gọi `COFService.write_results_back_to_cof` ghi ngược mã tài khoản vào file COF.
    - Upload file kết quả lên Supabase Storage `ticket-attachments` tại thư mục `results/`.
    - Cập nhật bot task `execution_status = 'success'`.
    - Đóng dấu bước workflow `status = 'success'`, lưu `outputs`.
    - Ghi audit event `succeeded` mang `proposal_id`.
    - **Tự động gọi `workflow_executor_service.execute_approved_workflow(workflow_id)` chạy ngầm** để tiếp tục kích hoạt các bước hạ nguồn (như LMS Enroll, Git Add Collaborators).
  - Nếu batch vẫn đang chạy (`still_processing`): Lùi hẹn kiểm tra lại sau 5 phút (`next_check_at = now + 5m`).

---

### 5.2. Lõi Hệ Thống Core (`app/core/`)

#### [`config.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/config.py) (Settings & Time Utilities)
- `VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")`: Múi giờ Việt Nam duy nhất toàn hệ thống.
- Các hàm thời gian chuẩn:
  - `get_utc_now()`: Lấy thời gian UTC hiện tại dạng datetime.
  - `get_utc_iso()`: Trả về chuỗi ISO UTC phục vụ lưu trữ CSDL.
  - `get_vn_time_str()`: Trả về chuỗi thời gian hiện tại chuẩn GMT+7 `YYYY-MM-DD HH:MM:SS`.
  - `to_vn_time_str(val)`: Chuyển đổi mọi đối tượng thời gian (datetime, str, timestamp) sang GMT+7 an toàn chống cộng đúp múi giờ.
- `Settings(BaseSettings)`: Quản lý biến môi trường: Supabase URL/Keys, JWT Issuer/Audience/Secret, 10-Model Gemini list, thông tin đăng nhập Keycloak, GitBucket, osTicket, Google APIs.

#### [`cache_policy.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/cache_policy.py) (In-Memory RAM Cache Phân Tầng)
- `CacheTier`:
  - `TIER_A_CATALOG`: Dữ liệu tĩnh (Courses, 480 trường học) – Max 50 items, TTL 10-15 phút.
  - `TIER_B_STATUS`: Trạng thái động (Bot workers, Site monitor, Reports) – Max 20 items, TTL 15-30 giây.
  - `TIER_C_SUMMARY`: Danh sách tóm tắt (Tasks, Tickets) – Max 15 items, TTL 45-60 giây.
- `BoundedMemoryCache`:
  - Sử dụng `OrderedDict` theo thuật toán LRU (Least Recently Used): Tự động loại bỏ key cũ nhất khi đạt ngưỡng `max_entries`.
  - Tự động dọn dẹp key hết hạn (`_purge_expired`) khi get/set.
  - Hỗ trợ `invalidate(prefix)` xóa sạch bộ nhớ đệm khi dữ liệu bị biến động. Giữ tổng dung lượng RAM cache toàn hệ thống luôn dưới mức **40MB**.

#### [`playwright_manager.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/playwright_manager.py) (Lock Quản Trị Tài Nguyên Chromium)
- `GLOBAL_PLAYWRIGHT_SEMAPHORE = asyncio.Semaphore(1)`: Khóa cứng tối đa 1 phiên Chromium hoạt động đồng thời trên toàn bộ container Render 512MB RAM.
- `_PLAYWRIGHT_SLOT_HOLDER: contextvars.ContextVar`: Quản lý danh tính coroutine đang giữ slot, cho phép **Re-entrancy an toàn** (hàm con kế thừa slot từ hàm cha mà không gây Deadlock).
- `acquire_playwright_slot(task_name, timeout, lane)`:
  - `lane='admin'`: Làn VIP dành cho Quản trị viên duyệt tác vụ hoặc kích hoạt từ Studio (Timeout 300s).
  - `lane='cron'`: Làn ngầm định kỳ (osTicket, Scanner). Nếu bận quá 45s, chủ động ném `CronSlotYieldException` nhường slot êm dịu.
  - Khối `finally` đảm bảo 100% giải phóng semaphore, tiêu diệt zombie chromium (`force_kill_zombie_chromium()`) và gọi `gc.collect()`.
- `LOW_RAM_CHROMIUM_ARGS`: 18 cờ tối ưu hóa Chromium (`--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--js-flags=--max-old-space-size=128`...).
- `setup_low_ram_routes(target)`: Bộ lọc mạng chặn triệt để hình ảnh (`png, jpg, webp`), video (`mp4, webm`), audio, fonts và trackers (`google-analytics, hotjar`), giúp tiết kiệm đến **70% RAM**.
- Smart DOM Helpers: `wait_for_dom_and_spinners`, `smart_wait_login_or_error` (chờ theo state race), `smart_wait_for_options_loaded`, `smart_poll_condition`.

#### [`security.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/security.py) (Strict Bearer JWT Authenticator)
- `get_current_user_email(credentials)`:
  - Dependency FastAPI bắt buộc trích xuất email trực tiếp từ Bearer JWT token trong header `Authorization`.
  - Giải mã và xác thực chữ ký token qua `SUPABASE_JWT_SECRET` (hỗ trợ HS256, RS256, ES256) cùng cấu hình Audience (`authenticated`) và Issuer.
  - **Cưỡng chế nghiêm ngặt whitelist domain `@dtt.vn`:** Token ngoài domain hoặc người dùng nặc danh bị từ chối ngay lập tức với mã `403 Forbidden`. Hỗ trợ fallback cho môi trường test hermetic (`TESTING=true`).

#### [`task_coordinator.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/task_coordinator.py) (Optimistic Concurrency Control Lease)
- `claim_workflow_lease(workflow_id, operator, lease_duration_seconds=600)`:
  - Sử dụng **Optimistic Concurrency Control (OCC)**: Cập nhật có điều kiện trên trường `updated_at`. Nếu có 2 tiến trình cố chiếm lease cùng lúc (click đúp hoặc cron tranh chấp), tiến trình sau match 0 dòng và bị từ chối ngay lập tức (`Fail-closed`).
- `update_workflow_heartbeat(workflow_id, lease_token)`:
  - Gia hạn lease ngầm định kỳ. Nếu token không khớp hoặc lease bị chiếm, ném ngay `RuntimeError` để dừng khẩn cấp worker đã mất quyền sở hữu lease.
- `release_workflow_lease(workflow_id, lease_token, final_status)`:
  - Chỉ giải phóng lease và cập nhật trạng thái kết thúc khi `lease_token` khớp chính xác 100% với token trên CSDL. Ngăn chặn triệt để worker cũ ghi đè trạng thái lên worker mới.

#### [`gemini.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/gemini.py) (Dual-Path AI Engine & Deterministic Fast-Path Triage v1.2.0)
- `GeminiDualPathEngine`:
  - Quản trị 2 API Key độc lập: `api_key_summary` (Key 1) và `api_key_facts` (Key 2).
  - Tự động hoán đổi chìa chéo (Cross-Key Failover) khi một key chạm hạn ngạch (429 / Quota Exceeded) trước khi kích hoạt danh sách 10 model fallback (`gemini-3.8-flash` ➔ `gemini-3.7-flash` ➔ `gemini-3.5-flash-lite`...).
- `summarize_ticket(subject, raw_content, source)`:
  - Tóm tắt mềm phục vụ hiển thị Inbox, trả về `TicketSummary` (`category`, `priority`, `goal`, `summary_vi`, `assigned_name`, `assigned_email`).
  - **Sanitize chặt chẽ:** Ép về đúng 5 danh mục hợp lệ (`license`, `lms_enroll`, `account_keycloak`, `bug`, `other`) và 4 mức ưu tiên (`urgent`, `high`, `normal`, `low`).
  - **Deterministic Fast-Path Triage v1.2.0 (Phao Cứu Sinh Khi Hết Quota):** Khi toàn bộ 10 model và cả 2 key đều chạm hạn ngạch Quota 429, hàm tự động kích hoạt bộ tóm tắt tất định thông minh:
    1. Cảnh báo UptimeRobot / Server incident ➔ Category `bug` (nếu down) hoặc `other` (nếu up), priority tương ứng.
    2. Yêu cầu ghi danh LMS (enrol, khóa học, swrp) ➔ Category `lms_enroll`.
    3. Yêu cầu license, hợp đồng, order ➔ Category `license`.
    4. Yêu cầu tài khoản, đổi pass, mở khóa ➔ Category `account_keycloak`.
    5. Khác ➔ Category `other`, trích xuất preview 120 ký tự sạch từ thân email.
- `extract_operational_facts(subject, raw_content, source, excel_summary, source_revision_id, sender_email)`:
  - Bóc tách sự thật vận hành, trích xuất cấu trúc `extracted_entities` và `intents`.
  - Đóng dấu trực tiếp `source_revision_id` vào từng `EvidenceSpan` kèm trích dẫn nguyên văn `quote` và tọa độ ký tự `[start_offset:end_offset]`.
  - **Tích hợp `request_fact_normalizer`:** Gọi `augment_assessment_with_request_facts()` bổ trợ tất định trực tiếp từ nội dung văn bản gốc trước khi chuyển sang chốt chặn kiểm chứng `EvidenceVerifierService`.

---

### 5.3. Định Nghĩa Schemas & Models Pydantic (`app/models/`)

- [`intent.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/intent.py):
  - `EvidenceSpan`: Trích dẫn bằng chứng bắt buộc mang `source_revision_id`, `source_kind` (`ticket_body` | `attachment_extract`), `quote`, `start_offset`, `end_offset`, `is_verified`.
  - `ExtractedEntity`: Thực thể bóc tách kèm danh sách bằng chứng và cờ kiểm chứng `is_verified`.
  - `TypedEntities`: Khung dữ liệu thực thể chuẩn hóa (`school_name`, `courses`, `repositories`, `users`, `target_email`, `git_role`, `repository_url`).
  - `ExtractedIntent`: Đại diện ý định vận hành kèm độ tin cậy và cờ `is_valid`.
  - `IntentAssessment`: Bản đánh giá toàn diện gồm `outcome` (`candidate_action`, `needs_information`, `no_action`), `intents`, `typed_entities`, `missing_requirements`.
  - `VerifiedIntentAssessment`: Bản đánh giá đã qua kiểm chứng bằng chứng ký tự.
- [`workflow.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/workflow.py):
  - `WorkflowStepDraft`: Đại diện một bước trong đồ thị DAG (`step_id`, `capability_id`, `name`, `status`, `inputs`, `depends_on`, `is_manual`, `outputs`, `error_message`).
  - `WorkflowDraftUpdate`: Payload chỉnh sửa draft của Admin (`title`, `goal`, `steps`, `operator_reason`).
  - `WorkflowApprovalRequest`: Payload phê duyệt (`run_immediately`, `operator_reason`).
  - `WorkflowValidationResult`: Kết quả kiểm định đồ thị DAG (`is_valid`, `errors`, `warnings`, `missing_requirements`, `stats`).
  - `WorkflowExecutionEventRecord`: Bản ghi nhật ký thực thi append-only mang `proposal_id`.
- [`ticket.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/ticket.py):
  - `InboxTicketCreate`, `InboxTicketUpdate`, `TicketSummaryResponse`, `TicketSummary`.
- [`task.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/task.py):
  - `BotTaskCreate`, `BotTaskUpdate`, `BotTaskExecutionRequest`.
- [`template.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/template.py):
  - `TemplateConfigItem`: Cấu hình mẫu email và tin nhắn thông báo tự động.

---

### 5.4. Tri Thức Nghiệp Vụ & Policy Registry (`app/brain/`)

- [`capabilities.json`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/brain/capabilities.json):
  - Đăng ký 19 Capabilities hệ sinh thái: `workspace.bulk_account_creation`, `workspace.poll_account_batch`, `workspace.create_school_order`, `workspace.partner_grant_license`, `workspace.partner_request_contract`, `workspace.distributor_approve_contract`, `workspace.admin_approve_contract`, `workspace.query_distributor_contracts`, `workspace.query_partner_orders`, `lms.direct_enroll`, `git.add_collaborators`, `keycloak.reset_password`, `keycloak.unlock_account`, `keycloak.create_user`, `github.create_issue`, `cof.parse_file`...
  - Mỗi capability quy định: `id`, `domain`, `bot_type`, `action`, `required_inputs`, `produces`, `consumes`, `risk_level`, `supported_by_handler`, `available`.
- [`intent_policy.json`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/brain/intent_policy.json):
  - Bảng chính sách tất định (Policy Registry v1.1.0) ánh xạ trực tiếp từ Intent sang Capability Pipeline:
    - `create_accounts` ➔ `[workspace.bulk_account_creation, workspace.poll_account_batch]`
    - `course_access` ➔ `[lms.direct_enroll]`
    - `repository_access` ➔ `[git.add_collaborators]`
    - `reset_password` ➔ `[keycloak.reset_password]`
    - `unlock_account` ➔ `[keycloak.unlock_account]`
    - `query_distributor_contracts` ➔ `[workspace.query_distributor_contracts]`
    - `query_partner_orders` ➔ `[workspace.query_partner_orders]`
    - `report_system_bug` ➔ `[github.create_issue]`
- [`knowledge_base.json`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/brain/knowledge_base.json):
  - Tri thức chi tiết về 7 phân hệ, cấu trúc bảng CSDL, API parameters, và các kịch bản lỗi thường gặp dùng cho AI Bug Reporter.

---

### 5.5. Cổng Giao Tiếp 10 Router REST API Endpoints (`app/api/v1/endpoints/`)

#### 1. [`workflows.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/workflows.py) (Server-Side Safety Gate & DAG Orchestrator)
- `GET /capabilities`: Lấy danh mục 19 Capabilities và các archetypes phục vụ Autocomplete.
- `GET /ticket/{ticket_id}`: Trả về workflow draft liên kết provenance hoặc tự động tái lập plan cho ticket legacy chưa có `proposal_id`.
- `POST /plan`: Kích hoạt `workflow_planner_service.plan_workflow_for_ticket` lập kế hoạch mới.
- `GET /{workflow_id}`: Lấy chi tiết workflow theo ID.
- `PUT /{workflow_id}`: Admin cập nhật draft (Cấm sửa khi đã `approved`, `running`, `success`). Bắt buộc lưu `operator_reason` vào `automation_workflow_history`.
- `POST /{workflow_id}/approve_and_run` – **Safety Approval Gate Tối Cao:**
  - Xác thực JWT người duyệt: Nhận `Depends(get_current_user_email)` thuộc domain `@dtt.vn`.
  - Khóa chặt `proposal_id`: Từ chối phê duyệt nếu thiếu `proposal_id` hoặc proposal đã `superseded`.
  - Kiểm tra tính khớp của Plan: Nếu danh sách bước khác với plan AI đề xuất, bắt buộc có `operator_reason` >= 5 ký tự.
  - Server-side validate toàn bộ các bước qua `validate_workflow_graph`.
  - **Dual Freeze:** Đóng băng đồng thời `workflow_proposals.frozen_plan` và `automation_workflows.steps`.
  - Ghi Audit Event `approved` kèm `proposal_id`.
  - Kích hoạt `workflow_executor_service.execute_approved_workflow` chạy ngầm.
- `POST /{workflow_id}/retry_step`: Kích hoạt retry một bước lỗi qua `workflow_executor_service.retry_workflow_step`.

#### 2. [`tickets.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/tickets.py) (Canonical Intake & Dual Re-analysis)
- `GET /`: Lấy danh sách vé có lọc đa tầng (status, category, source, sort) với RAM Cache 60s.
- `POST /sync/osticket`: Kích hoạt quét cào osTicket tức thì chạy ngầm và xóa cache.
- `POST /sync/gmail`: Kích hoạt quét Gmail tức thì chạy ngầm và xóa cache.
- `PUT /{id}/complete`, `PUT /{id}/dismiss`, `PUT /{id}/restore`: Cập nhật trạng thái vé.
- `POST /{id}/re-summarize`: Làm tươi lại bản tóm tắt mềm (Soft Summary), ghi nhận assessment mới vào `ticket_ai_assessments`. Không đổi plan vận hành.
- `POST /{id}/re-assess-intent`: Đánh giá lại toàn diện sự thật vận hành, trích xuất lại Intent có bằng chứng, tạo revision mới và lập Proposal mới.

#### 3. [`tasks.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/tasks.py) (Bot Task Queue & Manual Execution)
- `GET /`: Lấy danh sách bot automation tasks (RAM Cache 60s).
- `POST /{id}/approve`: Duyệt thủ công tác vụ bot đơn lẻ, cho phép sửa payload trước khi chạy.
- `run_approved_task_worker(task_id, bot_type, payload, ticket_id)`:
  - Chiếm lease thực thi qua `task_coordinator.claim_task_for_execution`.
  - Tự động phân giải phả hệ trường học qua `workspace_lineage_service.resolve_by_school` để nạp credentials từ Vault.
  - Gọi `execute_approved_bot_task` thực thi worker thật.

#### 4. [`bots.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/bots.py) (Bot Monitoring & Real-time Logs Terminal)
- `GET /status`: Thống kê tác vụ bot, danh sách worker đang hoạt động (RAM Cache 15s).
- `GET /logs`: Bóc tách và chuẩn hóa nhật ký thực thi thời gian thực theo cấu trúc: (Timestamp GMT+7, Log Level, Event Taxonomy: LIFECYCLE/STATE/API/PLAYWRIGHT/CHECKPOINT/RETRY/CRON/MEMORY, Nội dung sạch).
- `POST /trigger`: Kích hoạt worker trực tiếp.
- `POST /trigger-ingestion`: Kích hoạt ép chạy tức thì 1 trong 5 cronjob thu thập dữ liệu.

#### 5. [`board.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/board.py) (Multi-Board Kanban Engine)
- CRUD Boards: `GET /`, `POST /`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` (RAM Cache 5 phút).
- CRUD Columns & Cards: Quản lý cột trạng thái, thẻ nhiệm vụ, nhiệm vụ con (`subtasks`), kéo thả thay đổi vị trí (`order_index`), hỗ trợ tùy biến màu sắc cột và background overlay.

#### 6. [`courses.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/courses.py) (Dual Course Catalog Management)
- Quản trị song song 2 bảng danh mục: `workspace_courses` (School Workspace) và `lms_courses` (PLearn LMS).
- `GET /`, `POST /`, `PUT /{id}`, `DELETE /{id}` (RAM Cache 10 phút).
- `POST /bulk`: Nhập danh mục môn học hàng loạt từ file Excel.
- `POST /rename-category`: Đổi tên danh mục môn học đồng bộ trên toàn hệ thống.
- Quản lý danh sách liên kết Git Repositories (`git_repos`) gắn liền với từng khóa học LMS.

#### 7. [`workspace.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/workspace.py) (School Workspace Hub)
- `GET /hierarchy-schools`: Lấy danh sách 480 trường học kèm phả hệ 3 cấp (School -> Partner -> Distributor), đọc siêu tốc 1ms từ RAM Cache 15 phút.
- `GET /scanner-cache`: Lấy bộ nhớ đệm hợp đồng và đơn hàng đã quét.
- `POST /sync-scanner`: Kích hoạt quét tự động làm tươi cache hợp đồng/đơn hàng.
- `POST /extract-cof`: Bóc tách dữ liệu văn bản thô COF thành cấu trúc có kiểu.
- Quản lý phả hệ tổ chức (`/organizations`), đơn hàng (`/orders`), hợp đồng (`/contracts`).

#### 8. [`monitor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/monitor.py) (Synthetic Uptime & Incident Tracker)
- `GET /sites`: Lấy trạng thái uptime và độ trễ latency của 10 trang web (RAM Cache 30s).
- `POST /check-now`: Kích hoạt quét tức thì toàn bộ 10 sites.
- `POST /sites/{site_id}/check`: Quét kiểm tra riêng lẻ một site.
- `GET /sites/{site_id}/history`: Lấy biểu đồ lịch sử uptime 45 ngày.
- Quản lý tài khoản kiểm thử đăng nhập (`/credentials`), kiểm thử đăng nhập tự động (`/test-login`), và nhật ký sự cố (`/incidents`).

#### 9. [`github.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/github.py) (AI Bug Triage to GitHub Issue)
- `POST /generate-bug-prompt`: Sử dụng Gemini AI phân tích nội dung vé lỗi, đối chiếu với tri thức kiến trúc trong `knowledge_base.json`, sinh ra tiêu đề và nội dung Markdown báo lỗi chuyên nghiệp theo cấu trúc chuẩn.
- `POST /create-issue`: Dispatch trực tiếp Issue vào GitHub Repository qua REST API, tự động gán nhãn (`labels`) và người xử lý (`assignees`).

#### 10. [`reports.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/reports.py) (Executive Analytics & Export)
- `GET /summary`: Thống kê số liệu KPI (Vé chờ duyệt, Đã xử lý trong tháng, Tỷ lệ tự động hóa), tỷ lệ phân bố theo danh mục và xu hướng xử lý hàng ngày (RAM Cache 60s).
- `GET /export`: Xuất báo cáo dữ liệu vé ra định dạng file Excel (.xlsx) hoặc CSV.

---

### 5.6. Dịch Vụ Nghiệp Vụ & RPA Services (`app/services/`)

#### 5.6.1. Dịch Vụ Phân Tách Email Thread (`app/services/email_thread_service.py`)
- **Tệp tin:** [`backend/app/services/email_thread_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/email_thread_service.py)
- **`is_internal_email(email: Optional[str]) -> bool`**: Kiểm tra xem email có thuộc danh sách tên miền nội bộ `INTERNAL_DOMAINS = ("@dtt.vn", "@pythaverse.space")` hay không.
- **`parse_thread(raw_content: str, sender_email: Optional[str]) -> ParsedThreadResult`**:
  - Tách nội dung email nhiều lượt thành các phần tử `ThreadTurn`.
  - Sử dụng biểu thức chính quy `SPLIT_PATTERNS` để nhận diện điểm phân tách reply của các ứng dụng gửi thư phổ biến (Gmail `On ... wrote:`, Outlook `From: ... Sent: ...`, Thunderbird, tiếng Việt `Vào ... đã viết:`).
  - Tách đôi `current_msg` (tin nhắn mới nhất) và `history_raw` (toàn bộ lịch sử trao đổi trước đó).
  - Khử 100% các đoạn quoted rác bị lặp lại, giữ cho prompt của LLM luôn ngắn gọn và sạch sẽ.
  - Phân tích `is_latest_from_internal`: Xác định lượt phản hồi gần nhất là của Kỹ sư DTT hay Khách hàng.
  - Phân loại vòng đời hội thoại `lifecycle_state`:
    - `WAITING_CUSTOMER_INFO`: Kỹ sư đã phản hồi yêu cầu khách hàng cung cấp thêm thông tin.
    - `RESOLVED_CONFIRMATION`: Kỹ sư gửi thông báo đã hoàn thành tác vụ (`FULFILLMENT_PATTERNS`).
    - `ACTIONABLE`: Khách hàng mới gửi yêu cầu hoặc vừa bổ sung thông tin cần xử lý.
    - `SINGLE_MESSAGE`: Email đơn lẻ không có luồng trao đổi.
  - Xây dựng `compact_prompt_context`: Chuỗi ngữ cảnh cô đọng chứa tin nhắn mới nhất và tóm lược lịch sử trao đổi để đưa vào Gemini AI.

#### 5.6.2. Thẩm Định Bằng Chứng & Chuẩn Hóa Fact (`evidence_verifier.py` & `request_fact_normalizer.py`)

##### [`evidence_verifier.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/evidence_verifier.py) (Thẩm Định Bằng Chứng & Factory)
- **`verify_evidence_span(raw_content, span)`:**
  - Kiểm tra trực tiếp: $\text{raw\_content}[\text{start}:\text{end}] == \text{quote}$.
  - **Substring Calibration:** Nếu khoảng trắng hoặc xuống dòng làm lệch vị trí, tìm kiếm trích dẫn trong bán kính $\pm 160$ ký tự và hiệu chỉnh lại offset chính xác.
  - **Attachment Fail-Closed:** Gán `is_verified = False` cho trích dẫn từ file đính kèm khi chưa có snapshot bóc tách bất biến.
- **`load_verified_assessment(assessment_record, expected_revision_id)`:**
  - Factory giải tuần tự an toàn từ bảng `ticket_ai_assessments`.
  - Cưỡng chế `source_revision_id == expected_revision_id`.
  - Intent chỉ được giữ cờ `is_valid = True` khi có ít nhất 1 bằng chứng đã được verified.
  - Tự động dựng đối tượng `TypedEntities` đã kiểm chứng làm cơ sở dữ liệu duy nhất cho Planner.

##### [`request_fact_normalizer.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/request_fact_normalizer.py) (Bổ Sung Sự Thật Xác Thực Từ Văn Bản Gốc)
- **`split_email_thread(content)`**: Tách nội dung email, vứt bỏ toàn bộ lịch sử trích dẫn dài để chỉ tập trung vào tin nhắn mới nhất.
- **`parse_users_from_table_or_text(text, source_revision_id)`**:
  - Bóc tách danh sách người dùng từ cả hai định dạng: Dòng bảng phân cách bằng ký tự `|` / tab hoặc danh sách liệt kê thông thường.
  - Nhận diện vai trò: Tự động phân tích từ khóa giáo viên (`teacher`, `giáo viên`, `gv`) để gán vai trò `teacher` hoặc mặc định `student`.
  - Tự động loại trừ các email quản trị viên hệ thống (`ADMIN_EXCLUDED_EMAILS`).
  - Gắn tọa độ ký tự chính xác `_span(text, start, end, source_revision_id)` cho từng đối tượng trích xuất được.
- **`augment_assessment_with_request_facts(assessment, raw_content, source_revision_id, sender_email)`**:
  - Module bổ trợ tất định cho bộ bóc tách LLM, đảm bảo không bỏ sót các thực thể quan trọng trong email theo mẫu phổ biến.
  - Trích xuất danh sách email bằng biểu thức chính quy `EMAIL_RE`.
  - Trích xuất danh sách khóa học qua regex `COURSE_RE` (SWRP, Python, Robotics...).
  - Gán các Intent tương ứng (`create_accounts`, `course_access`, `repository_access`) khi có bằng chứng xác thực trong văn bản.

#### 5.6.3. Bộ Lập Kế Hoạch & Thực Thi DAG (`workflow_planner.py` & `workflow_executor.py`)

##### [`workflow_planner.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workflow_planner.py) (Bộ Lập Kế Hoạch Tất Định & Auto Git Sync)
- **`build_workflow_proposal(assessment, resolved_school, candidates, attachment_url)`:**
  - Đọc trực tiếp chính sách từ `intent_policy.json`, hoàn toàn không gọi LLM bên trong.
  - Áp dụng **Zero-Mockup Invariant**: Kiểm tra nghiêm ngặt `required_inputs`.
  - **Khóa Chặt Git Role (Zero-Mockup):** Yêu cầu `repository_access` thiếu trường `git_role` bắt buộc tạo `missing_requirements: git_role` và dừng ở `needs_information`, nghiêm cấm tự gán role `GUEST`.
  - **Tự Động Phân Giải Khóa Học & Đồng Bộ Git Repos (`resolve_course_from_db`):**
    - Nhận diện tên viết tắt (`SWRP 11`, `SWRP_11`, `SWRP11`) và tra cứu bảng `lms_courses` / `workspace_courses`.
    - Ghép cặp Git Repo tương ứng với đối tượng (`teacher` ➔ repo `gv`, học sinh ➔ repo `hs`).
    - Tích hợp Git Sync vào bước `lms.direct_enroll` (`sync_git_repo = True`), loại bỏ các bước Git riêng lẻ thừa thãi.
- **`validate_workflow_graph(steps)`:**
  - Kiểm tra tính toàn vẹn của đồ thị DAG: Phát hiện chu trình lặp (Cycle Detection), kiểm tra capability có tồn tại trong `capabilities.json` và có `available=true` hay không.
- **`_save_workflow_proposal(...)`:** Lưu đề xuất vào `workflow_proposals` và tạo workflow draft trong `automation_workflows`.

##### [`workflow_executor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workflow_executor.py) (Topological DAG Executor)
- **Kahn's Topological Sort:** Thuật toán sắp xếp Tô-pô dựa trên bán bậc vào (In-degree) đảm bảo các bước cha độc lập chạy trước, các bước phụ thuộc chỉ được kích hoạt khi bước cha đã thành công 100%.
- **OCC Workflow Lease:** Chiếm lease độc quyền qua `TaskCoordinator.claim_workflow_lease()`.
- **Parameter Interpolation:** Giải mã dữ liệu động `{{ step_xx.property }}` từ output của các bước hoàn thành trước đó.
- **Append-Only Audit Trail:** Mọi trạng thái (`started`, `waiting`, `succeeded`, `failed`) đều được ghi tức thời vào `workflow_execution_events` kèm đầy đủ `proposal_id` và che mờ mật khẩu `[PROTECTED]`.
- **Smart BFS Downstream Dependency Reset (`retry_workflow_step`):**
  - Khi quản trị viên yêu cầu thử lại một bước lỗi, thuật toán duyệt theo chiều rộng (BFS) tìm kiếm chính xác toàn bộ các bước hạ nguồn phụ thuộc vào nó và reset về trạng thái `waiting_dependency`.
  - Giữ nguyên trạng thái `success` của các bước độc lập đã thành công, không chạy lại lãng phí tài nguyên.

#### 5.6.4. Gói Xử Lý Bảng Tính Chuyên Biệt (`app/services/excel/` & `cof_excel_service.py`)

##### 1. [`cof_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/cof_service.py) (`COFService`)
- **`clean_str(val: Any) -> str`**: Chuẩn hóa chuỗi an toàn, strip khoảng trắng, xử lý `None`.
- **`format_date_dob(dob_raw: Any) -> str`**: Chuẩn hóa ngày sinh về định dạng chuẩn `DD/MM/YYYY`, xử lý ngày dạng số của Excel (Serial Date Number) và ngày dạng văn bản quốc tế (`YYYY/MM/DD`). Mặc định fallback an toàn `01/01/2000`.
- **`is_cof_file(file_path: str) -> bool`**: Kiểm tra cấu trúc sheet của file Excel (`student info`, `teacher info`, `curriculum`, `cof`) để xác định có phải là file COF chuẩn hay không.
- **`parse_cof_file(file_path: str) -> Dict[str, Any]`**: Bóc tách toàn bộ 3 tabs của file COF:
  - Tab 1: Đơn hàng, môn học, số lượng bản quyền.
  - Tab 2: Danh sách học sinh (Họ tên, ngày sinh, khối lớp, tài khoản).
  - Tab 3: Danh sách giáo viên (Họ tên, email, số điện thoại, môn phụ trách).
- **`write_results_back_to_cof(original_cof_path, accounts_result_data, output_cof_path)`**:
  - Đọc file COF gốc, dán ngược mã đăng nhập (`username`) và mật khẩu (`password`) đã được tạo vào các cột kết quả tương ứng của học sinh và giáo viên.
  - Đánh dấu màu nền xanh `PatternFill(start_color="E2EFDA")` cho các tài khoản mới tạo thành công, giữ nguyên các tài khoản cũ.

##### 2. [`bulk_template_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/bulk_template_service.py) (`BulkTemplateService`)
- **`normalize_input_accounts_excel(input_file_path, output_file_path)`**:
  - Chuẩn hóa mọi file Excel người dùng gửi lên thành **Phôi Chuẩn Của Trường** (Tiêu đề tại hàng 2, Tiêu đề cột tại hàng 5, Dữ liệu bắt đầu từ hàng 6).
  - Tự động nhận diện vị trí các cột họ tên, email, ngày sinh, số điện thoại dựa trên từ khóa header.
- **`extract_users_from_raw_text(text: str) -> List[Dict[str, Any]]`**:
  - Tự động bóc tách danh sách người dùng từ văn bản thuần túy trong email dạng bullet points hoặc đoạn văn ngắn.
- **`generate_accounts_excel_from_users(users, output_file_path)`**:
  - Khởi tạo trực tiếp một file Excel chuẩn từ danh sách người dùng dict đã bóc tách để nộp cho cỗ máy RPA mà không cần người dùng tự đính kèm file.
- **`write_results_back_to_standard_accounts(original_excel_path, accounts_result_data, output_excel_path)`**:
  - Ghi nhận kết quả tài khoản vào cột H (Username), cột I (Password), cột J (Trạng thái/Ghi chú) của file phôi chuẩn.

##### 3. [`generic_excel_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/generic_excel_service.py) (`GenericExcelService`)
- **`parse_generic_excel(file_path: str) -> Dict[str, Any]`**: Bóc tách dữ liệu tổng quát từ một file Excel bất kỳ, trả về danh sách sheet và mảng dòng dữ liệu.
- **`extract_links_and_emails(file_path: str) -> Dict[str, List[str]]`**: Quét sâu vào từng ô tính để trích xuất toàn bộ các liên kết hyperlink (URL Git repositories, tài liệu hướng dẫn) và các địa chỉ email có mặt trong bảng tính.

##### 4. [`tof_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/tof_service.py) (`TOFExcelService`)
- **`is_tof_file(file_path: str) -> bool`**: Nhận diện sơ bộ định dạng TOF (Training Order Form) qua tên file hoặc tên sheet.
- **`parse_tof_file(file_path: str) -> Dict[str, Any]`**: Khung dịch vụ bóc tách thông tin các lớp đào tạo giáo viên và chương trình trải nghiệm.

##### 5. [`cof_excel_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/cof_excel_service.py) (Facade Proxy Tương Thích Ngược)
- Lớp Facade tổng hợp chuyển tiếp 100% các lời gọi hàm từ mã nguồn cũ sang gói mới `app.services.excel`, đảm bảo không làm gãy các module `main.py`, `workers/` hay `workspace/`.

#### 5.6.5. Gói RPA Modularized School Workspace (`app/services/workspace/`)

- [`base.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/base.py) (`WorkspaceBaseService`):
  - Khởi tạo Chromium với 18 cờ tối ưu hóa Low-RAM.
  - **`login_role(page, username, password)`:** Áp dụng kỹ thuật **bơm DOM JS trực tiếp** (`page.evaluate`) để điền tên đăng nhập và mật khẩu, bảo toàn tuyệt đối 100% các ký tự đặc biệt (`@, #, !`) mà phương thức gõ phím thông thường hay làm rơi rụng.
- [`account_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/account_service.py) (`WorkspaceAccountService`):
  - **`bulk_account_creation_pipeline(payload)`:** Điều khiển Playwright đăng nhập tài khoản trường học, điều hướng tới mục Bulk Account Creation, upload file Excel phôi chuẩn và kích hoạt tiến trình tạo tài khoản hàng loạt.
  - **`check_and_export_batch_result(batch_id, ...)`:** Thăm dò tiến độ xử lý batch, khi hoàn tất tự động tải về file kết quả hoặc gọi API `exportData.php`.
  - **`generate_excel_from_api_data(...)`:** Tự động dựng file Excel kết quả đẹp mắt từ dữ liệu JSON của API.
- [`order_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/order_service.py) (`WorkspaceOrderService`):
  - **`_setup_snackbar_observer(page)`:** Cài đặt `MutationObserver` ngầm theo dõi toàn bộ thông báo Toast của giao diện Workspace MUI (`#notistack-snackbar`), phát hiện sự cố ngay trong vòng 200ms, loại bỏ hoàn toàn hiện tượng treo chờ Timeout 15s.
  - **`create_school_order_pipeline(payload)`:** Đăng nhập tài khoản School, chọn Partner cấp trên, nhập số lượng bản quyền môn học và gửi đơn hàng.
  - **`partner_grant_license_pipeline(payload)`:** Đăng nhập tài khoản Partner, kiểm tra số dư License Pool, phê duyệt đơn hàng của trường và cấp phát bản quyền.
- [`contract_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/contract_service.py) (`WorkspaceContractService`):
  - **`partner_request_contract_pipeline(payload)`:** Partner tạo yêu cầu cấp bù hợp đồng mới gửi lên Distributor.
  - **`distributor_approve_contract_pipeline(payload)`:** Distributor đăng nhập duyệt hợp đồng bổ sung hạn ngạch cho Partner.
  - **`admin_approve_contract_pipeline(payload)`:** Sales Admin tối cao phê duyệt bước cuối cùng kích hoạt hợp đồng có hiệu lực.
- [`enroll_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/enroll_service.py) (`WorkspaceEnrollService`):
  - Phân bổ license khóa học cho danh sách học sinh sau khi tài khoản đã được khởi tạo thành công.
- [`workspace_scanner_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/workspace_scanner_service.py) (`WorkspaceScannerService`):
  - Cơ chế quét 2 nhịp: Sử dụng Direct REST API quét nhanh toàn bộ hợp đồng và đơn hàng của 480 trường trong vòng vài giây; tự động chuyển sang Playwright fallback nếu phiên token hết hạn.
  - Lưu trữ dữ liệu quét được vào `workspace_contracts_cache` và `workspace_orders_cache`.
- [`orchestrator_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/orchestrator_service.py) (`WorkspaceOrchestratorService`):
  - Điều phối luồng liên thông E2E khép kín: Tự động kiểm tra số dư license ➔ Nếu thiếu, tự động kích hoạt tạo hợp đồng và duyệt bù ➔ Duyệt đơn hàng của trường ➔ Nộp batch tài khoản và phân bổ license.
- [`workspace_lineage_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace_lineage_service.py) (`WorkspaceLineageService`):
  - **`resolve_by_school(school_identifier)`:** Truy vấn bảng `workspace_organizations` để tái dựng cây phả hệ 3 cấp của trường học (School ➔ Partner ➔ Distributor).
  - Đọc thông tin xác thực từ bảng `workspace_credentials_vault` và giải mã đối xứng qua Fernet (`VAULT_SECRET_KEY`) để cấp tài khoản đăng nhập cho bot.

#### 5.6.6. Các Dịch Vụ RPA & Phân Hệ Ngoài (LMS, Git, Keycloak, osTicket, Monitor, Google, GitHub)

- [`playwright_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/playwright_service.py) (LMS Playwright Enroller):
  - **`enroll_users_pipeline(payload)`:** Tự động hóa ghi danh học sinh/giáo viên vào khóa học Moodle PLearn (`learn.pythaverse.space`).
  - Đăng nhập Moodle bằng tài khoản quản trị viên.
  - Điều hướng tới trang Enrolment của môn học (`/enrol/users.php?id=...`).
  - **Thuật toán tìm kiếm 2 nhịp trên `td.cell.c2`:** Nhập email vào ô tìm kiếm, chờ dropdown API nạp xong, kiểm tra chính xác email trên cột kết quả, chọn đúng Role (Student: 9, Teacher: 7, Manager: 1) và bấm Ghi danh.
- [`git_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/git_service.py) (GitBucket Collaborators Service):
  - **`add_collaborators_pipeline(payload)`:** Tự động hóa thêm thành viên vào Repository trên máy chủ GitBucket (`git.pythaverse.space`).
  - Tự động đăng nhập SSO thông qua Keycloak OIDC Form.
  - Điều hướng tới trang thiết lập cộng tác viên (`/{owner}/{repo}/settings/collaborators`).
  - Điền username/email thành viên, chọn vai trò (`ADMIN`, `DEVELOPER`, `GUEST`) và bấm Add.
- [`keycloak_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/keycloak_service.py) (2-Tier Hybrid Keycloak Service):
  - Tầng 1: Direct Admin REST API (`/auth/admin/realms/...`) phản hồi siêu tốc 300ms.
  - Tầng 2: Playwright RPA Fallback tự động kích hoạt nếu REST API gặp sự cố mạng hoặc lỗi quyền hạn.
  - Cung cấp: `reset_user_password`, `unlock_user_account`, `create_user`, `verify_user_email`.
- [`osticket_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/osticket_service.py) (osTicket Helpdesk Scraper):
  - **`poll_open_ostickets()`:** Cào dữ liệu vé mở từ cổng hỗ trợ kỹ thuật osTicket (`support.pythaverse.space`).
  - Đăng nhập SCP Admin session qua Playwright.
  - Bóc tách danh sách vé, tải file đính kèm lên Supabase Storage và chuyển giao cho `ticket_processor.py`.
- [`site_monitor_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/site_monitor_service.py) (Synthetic Uptime & Latency Monitor):
  - **`check_all_sites()`:** Gửi HTTP GET ping bất đồng bộ tới 10 trang web thuộc hệ sinh thái.
  - Đo thời gian phản hồi (latency ms), kiểm tra mã trạng thái HTTP (200 OK), tự động ghi nhận sự cố vào `site_downtime_events`.
- **Bộ Dịch Vụ Tích Hợp Google:**
  - [`gmail_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/gmail_service.py): Quét email chưa đọc qua OAuth2 Refresh Token và lưu vào `inbox_tickets`.
  - [`google_sheet_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/google_sheet_service.py): Quét bảng tính Google Form Feedback định kỳ.
  - [`google_doc_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/google_doc_service.py): Bóc tách nhận xét từ Google Docs.
  - [`google_drive_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/google_drive_service.py): Tải tệp tin COF từ Google Drive.
- [`github_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/github_service.py):
  - Khởi tạo GitHub Issue qua REST API với Personal Access Token (`GITHUB_PAT`).

---

### 5.7. Bộ Điều Phối Workers Chạy Ngầm (`app/workers/`)

#### [`bot_executor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/workers/bot_executor.py) (Router Worker Trung Tâm)
- `execute_approved_bot_task(bot_type, payload_data, task_id)`:
  - Hàm điều phối duy nhất cho toàn bộ 19 capabilities của hệ thống.
  - Phân nhánh theo `bot_type`:
    - `workspace_rpa`: Điều hướng sang `playwright_lms_service`, `git_playwright_service` hoặc các phương thức của `workspace_playwright_service` (Bulk account, Orders, Contracts, License E2E).
    - `keycloak_api`: Điều hướng sang `keycloak_service` (Reset pass, Unlock, Create user).
    - `github_issue_creator`: Điều hướng sang `github_service.create_issue`.
  - Bắt checkpoint và ghi nhận log thực thi chi tiết gắn nhãn `[Task #ID]`.

#### [`ticket_processor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/workers/ticket_processor.py) (Canonical Intake Pipeline)
- `compute_canonical_content_hash(raw_content, attachments)`: Chuẩn hóa nội dung văn bản kết hợp băm danh sách canonical attachments (tên file, URL, dung lượng) thành mã băm SHA-256 duy nhất.
- `create_or_get_ticket_revision(...)`: Gọi PostgreSQL Stored Procedure `create_or_get_inbox_ticket_revision` (khóa vé bằng `FOR UPDATE`). Đảm bảo việc cấp phát số thứ tự revision luôn nguyên tử và không bao giờ bị trùng lặp.
- `process_ticket_revision(revision_id)`:
  - Kích hoạt Dual-Path AI: Bóc tách sự thật vận hành qua `gemini_engine.extract_operational_facts(source_revision_id=revision_id)`.
  - Thẩm định bằng chứng qua `evidence_verifier`.
  - Tự động gọi `workflow_planner_service.plan_workflow_for_ticket(ticket_id, revision_id)` để tạo Workflow Proposal chuẩn mực.

---

### 5.8. Bộ Kịch Bản Bổ Trợ CLI & Scripts (`backend/scripts/`)

- [`backend/scripts/import_hierarchy.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/scripts/import_hierarchy.py): Kịch bản CLI nạp cấu trúc phả hệ 480 trường học (`workspace_organizations`) và nạp thông tin đăng nhập vào Két Sắt Fernet (`workspace_credentials_vault`).
- [`backend/re_triage_all_tickets.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/re_triage_all_tickets.py): Kịch bản chạy lại toàn bộ tiến trình AI Triage cho các vé tồn đọng trong CSDL để chuẩn hóa dữ liệu cũ.
- [`backend/seed_monitor_credentials.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/seed_monitor_credentials.py): Script khởi tạo tài khoản kiểm thử đăng nhập định kỳ cho 10 phân hệ web trong `site_monitor_credentials`.
- [`backend/test_git_collaborator.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/test_git_collaborator.py): Kịch bản kiểm thử độc lập luồng tự động hóa thêm cộng tác viên vào GitBucket.
- [`backend/test_lms_advanced_features.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/test_lms_advanced_features.py): Kịch bản kiểm thử độc lập luồng ghi danh học sinh/giáo viên vào Moodle LMS.

---

### 5.9. Bộ Kiểm Thử An Toàn Hermetic Pytest Suite (`backend/tests/`)
Hệ thống tích hợp bộ kiểm thử an toàn hermetic, chạy siêu tốc in-memory mà không tốn quota AI và không phụ thuộc dịch vụ ngoài (23/23 tests pass 100% trong 1.33s):
- [`conftest.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/tests/conftest.py): Thiết lập fixtures kiểm thử in-memory, mock settings và client Supabase.
- [`test_capability_contracts.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/tests/test_capability_contracts.py): Kiểm tra hợp đồng giữa 19 capabilities trong `capabilities.json` và code xử lý trong `bot_executor.py`.
- [`test_planning_policy.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/tests/test_planning_policy.py): Kiểm định Zero-Mockup Invariant, EvidenceVerifier, Injection, Skewed Offset, và loại trừ default Git role `GUEST`.
- [`test_request_fact_normalizer.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/tests/test_request_fact_normalizer.py): Kiểm tra bóc tách email giáo viên, khóa học và các ý định liên quan trực tiếp từ email thực tế.
- [`test_execution_safety.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/tests/test_execution_safety.py): Kiểm định thuật toán sắp xếp Tô-pô Kahn, che mờ mật khẩu `[PROTECTED]`, và liên kết dữ liệu dynamic data binding.
- [`test_security_and_provenance.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/tests/test_security_and_provenance.py): Kiểm định Bearer JWT token whitelist `@dtt.vn` và chuỗi truy vết bất biến `proposal_id`.
- [`test_workflow_legacy_replan.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/tests/test_workflow_legacy_replan.py): Kiểm định việc tự động tái lập kế hoạch cho các workflow legacy thiếu `proposal_id`.

---

## 🎨 PHẦN VI: GIẢI PHẪU CHI TIẾT GIAO DIỆN FRONTEND SPA (REACT 19 + VITE 6 + TAILWIND CSS V4)

### 6.1. Kiến Trúc Lõi Frontend SPA, Design System & Shared Components

- **Entrypoint & Routing ([`App.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/App.tsx)):**
  - Tích hợp `BrowserRouter`, `Routes`, `Route` từ React Router.
  - Sử dụng React 19 `lazy` và `Suspense` kết hợp `PageLoadingFallback` để chia nhỏ bundle thành các dynamic chunks, tải trang tức thì.
  - `ProtectedRoute`: Kiểm tra trạng thái xác thực qua `useAuth()`. Nếu chưa đăng nhập, tự động chuyển hướng về `/login`.
  - `purgeStaleDataCaches()`: Tự động dọn dẹp triệt để các key cache cũ (`ptv_*`) trong `localStorage` ngay khi ứng dụng khởi chạy.
- **Quản Trị Trạng Thái Contexts:**
  - [`AuthContext.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/context/AuthContext.tsx): Lắng nghe trạng thái đăng nhập Supabase Auth (`onAuthStateChange`), cung cấp `user`, `session`, `loading`, hàm `signInWithGoogle` (whitelist `@dtt.vn`), `signInWithPassword`, `signOut`.
  - [`ThemeContext.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/context/ThemeContext.tsx): Quản lý giao diện Sáng / Tối (`light` / `dark`), lưu lựa chọn vào `localStorage`.
- **Lớp Giao Tiếp API ([`lib/api.ts`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/lib/api.ts)):**
  - Hàm `fetchApi<T>(endpoint, options)`: Tự động trích xuất Supabase JWT Access Token từ session và gắn vào header `Authorization: Bearer <token>`.
  - Thiết lập `AbortController` với timeout cứng **30 giây** chống treo request trên mạng Render.
- **Định Kiểu Strict Types ([`types/index.ts`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/types/index.ts)):**
  - Định nghĩa đầy đủ các Interface: `InboxTicket`, `BotAutomationTask`, `WorkflowDraft`, `WorkflowProposal`, `WorkflowStep`, `WorkflowAIAnalysis`, `MissingRequirementItem`, `BoardItem`, `CourseItem`, `ReportsSummary`...
- **Shared Components & Layout:**
  - [`AppLayout.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/layout/AppLayout.tsx): Khung ứng dụng chính tích hợp Sidebar 11 mục điều hướng, Header với Breadcrumbs động, Avatar và ThemeToggle.
  - [`Sidebar.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/common/Sidebar.tsx): Thanh điều hướng trượt bên trái, hỗ trợ thu gọn/mở rộng, hiển thị trạng thái active route.
  - [`Header.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/common/Header.tsx): Thanh tiêu đề trên cùng, hiển thị thông tin người dùng và trạng thái phiên làm việc.
  - [`ConfirmDialog.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/common/ConfirmDialog.tsx): Hộp thoại xác nhận hành động nguy hiểm (xóa board, hủy vé, duyệt tác vụ).
  - [`ThemeToggle.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/components/common/ThemeToggle.tsx): Nút chuyển đổi Dark/Light mode với hiệu ứng chuyển động mượt mà.
  - [`authorConfig.ts`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/config/authorConfig.ts): Cấu hình thông tin tác giả Nguyễn Mạnh Hùng và thương hiệu hệ thống.

---

### 6.2. Giải Phẫu Chi Tiết 13 Trang Chức Năng & Sub-Components (`src/features/`)

#### 1. [`UnifiedInboxPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/inbox/UnifiedInboxPage.tsx) (Trung Tâm AI Workflow Console V3.1)
- Trực quan hóa danh sách vé tiếp nhận từ đa kênh (Gmail, Form, osTicket).
- Bộ lọc nhanh: Trạng thái (`pending`, `approved`, `completed`, `dismissed`), Danh mục (`bug`, `account_keycloak`, `lms_enroll`, `license`), Nguồn vé, và Sắp xếp thời gian.
- **Drawer Điều Khiển AI 4 Trạng Thái (Bento Grid):**
  1. `NO_ACTION`: Vé thông báo thuần túy, hiển thị lý do không cần tự động hóa.
  2. `NEEDS_INFORMATION`: Hiển thị Checklist thiếu thông tin với các badge màu hổ phách/đỏ cảnh báo (thiếu school, thiếu email, thiếu role git).
     - *Hiển thị các bước đã đủ căn cứ:* Khối hiển thị *"Các bước đã đủ căn cứ để đề xuất (chưa thể chạy)"* với badge màu xanh dương `sky-50/sky-800`.
  3. `READY_FOR_REVIEW`: Hiển thị Trích dẫn bằng chứng nguyên văn (`evidence_quotes`), model AI đã dùng, và đồ thị các bước đề xuất. Cho phép Admin tinh chỉnh bước thủ công (`is_manual`) kèm lý do can thiệp (`operator_reason`).
  4. `EXECUTING / COMPLETED`: Hiển thị tiến độ thực thi thời gian thực từng bước của DAG, nút Thử lại bước lỗi (`retry_step`) và link tải file kết quả.
- **Trình Xem Trước Tệp Đính Kèm Đa Định Dạng (Attachment Preview Modal):**
  - Bảng tính Excel (`.xlsx`, `.xls`): Tự động nạp và kết xuất bảng tính tương tác trực tiếp trong modal client-side bằng SheetJS (`XLSX.read`), hiển thị tối đa 100 hàng và 30 cột của sheet đầu tiên mà không cần tải file về máy.
  - Tài liệu PDF (`.pdf`): Nhúng trực tiếp qua thẻ `iframe` trình duyệt.
  - Tài liệu Office (`.docx`, `.pptx`): Nhúng trực tiếp trình xem Microsoft Office Online Viewer (`view.officeapps.live.com`).
  - Hình ảnh (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`): Hiển thị trực tiếp ảnh phóng to sắc nét.
- **Các Sub-components Chuyên Biệt:**
  - `WorkflowBuilder.tsx`: Trình dựng và chỉnh sửa đồ thị DAG trực quan.
  - `WorkflowStepCard.tsx`: Thẻ hiển thị chi tiết một bước, input mapping, outputs và trạng thái.
  - `WorkflowValidationPanel.tsx`: Bảng kiểm định đồ thị DAG theo thời gian thực (hiển thị lỗi chu trình hoặc thiếu input).

#### 2. [`TaskManagementPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/tasks/TaskManagementPage.tsx) (Quản Trị Hàng Đợi Tác Vụ Bot)
- Quản lý danh sách tác vụ bot đơn lẻ trong bảng `bot_automation_tasks`.
- Lọc theo Bot Type (`workspace_rpa`, `keycloak_api`, `lms_playwright`, `github_issue_creator`...) và Execution Status.
- Modal phê duyệt thủ công: Cho phép Admin xem và trực tiếp chỉnh sửa payload JSON trước khi bấm "Phê duyệt & Chạy".
- Drawer xem chi tiết timeline từng bước thực thi và toàn bộ nhật ký lỗi `execution_logs`.

#### 3. [`WorkBoardPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/board/WorkBoardPage.tsx) (Bảng Kanban Đa Năng)
- Hỗ trợ tạo nhiều Board công việc độc lập cho các nhóm dự án.
- Kéo thả thẻ mượt mà giữa các cột trạng thái (Backlog, To Do, In Progress, Review, Done).
- Tùy biến màu sắc cột, độ mờ (`overlay_opacity`, `card_opacity`), và hình nền background URL.
- Quản lý công việc chi tiết: Phân loại danh mục, mức độ ưu tiên, người phụ trách, ngày hết hạn, và danh sách công việc con (`subtasks`) có thanh tiến độ phần trăm.

#### 4. [`AutomationStudioPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/studio/AutomationStudioPage.tsx) (Xưởng Tự Động Hóa RPA Đa Phân Hệ)
- Bàn điều khiển chạy tay cho kỹ sư tự động hóa, liên thông trực tiếp 7 phân hệ Pythaverse:
  - **School Workspace:** Wizard tạo tài khoản từ file COF Excel, cấp bù hợp đồng Distributor, duyệt đơn hàng Partner.
  - **PLearn LMS:** Ghi danh danh sách học sinh vào môn học, tự động đồng bộ sang Git Repositories tương ứng.
  - **PGit Repos:** Thêm cộng tác viên vào các kho lưu trữ mã nguồn.
  - **Keycloak IDP:** Reset mật khẩu, kích hoạt/khóa tài khoản người dùng hàng loạt.

#### 5. [`CoursesManagerPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/courses/CoursesManagerPage.tsx) (Quản Trị Danh Mục Khóa Học Song Song)
- Quản lý song song 2 bảng dữ liệu: Khóa học School Workspace và Khóa học PLearn LMS.
- Thêm mới, chỉnh sửa thông tin môn học, mã SKU, đường dẫn LMS URL.
- Thiết lập danh sách Git Repositories liên kết với từng khóa học (dùng cho tính năng tự động cấp quyền Git khi học sinh vào lớp).
- Nhập danh mục hàng loạt từ file Excel và công cụ đổi tên danh mục môn học đồng loạt.

#### 6. [`BotCommanderPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/bots/BotCommanderPage.tsx) (Trạm Chỉ Huy Bot & Live Terminal)
- Bảng đồng hồ theo dõi trạng thái hoạt động của các worker chạy ngầm (Gmail, Keycloak, Workspace, LMS, GitHub).
- **Cửa sổ Terminal Trực Quan Thời Gian Thực:** Hiển thị dòng log định dạng GMT+7, lọc theo phân loại sự kiện (LIFECYCLE, STATE, API, PLAYWRIGHT, CHECKPOINT, RETRY, CRON, MEMORY).
- Các nút bấm kích hoạt nhanh (Trigger On-Demand) từng cronjob thu thập dữ liệu mà không cần chờ đến chu kỳ.

#### 7. [`SiteMonitorPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/monitor/SiteMonitorPage.tsx) (Giám Sát Sức Khỏe Hạ Tầng 3 Tab)
- **Tab 1 - Public Sites:** Giám sát độ sẵn sàng Uptime (%) và độ trễ phản hồi (ms) của 10 trang web trong hệ sinh thái.
- **Tab 2 - Authentication Matrix:** Kiểm tra tự động luồng đăng nhập thực tế của tài khoản kiểm thử trên các phân hệ.
- **Tab 3 - Incident Downtime Log:** Nhật ký chi tiết các sự cố gián đoạn dịch vụ, thời gian bắt đầu, thời gian phục hồi và nguyên nhân lỗi HTTP.

#### 8. [`GithubReporterPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/github/GithubReporterPage.tsx) (Trợ Lý Báo Lỗi AI Lên GitHub)
- Tiếp nhận các vé báo lỗi hệ thống từ người dùng.
- Sử dụng Gemini AI đối soát với `knowledge_base.json` để phân tích ngữ cảnh kỹ thuật và tự động soạn thảo tiêu đề, các bước tái hiện, hành vi thực tế và hành vi kỳ vọng.
- Xem trước bản Markdown và bấm một nút để tạo trực tiếp GitHub Issue lên kho mã nguồn tương ứng.

#### 9. [`ReportsExportPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/reports/ReportsExportPage.tsx) (Báo Cáo Hoạt Động & Xuất Dữ Liệu)
- Bảng tổng hợp các chỉ số hoạt động then chốt (KPI): Tổng số vé tiếp nhận, Vé đã giải quyết, Tỷ lệ tự động hóa thành công.
- Biểu đồ hình quạt phân bố danh mục vé và biểu đồ đường xu hướng xử lý hàng ngày.
- Bộ lọc khoảng thời gian (7 ngày, 30 ngày, tháng này) và nút xuất dữ liệu ra file Excel (.xlsx) phục vụ báo cáo ban giám đốc.

#### 10. [`DashboardPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/dashboard/DashboardPage.tsx) (Bảng Tổng Quan Điều Hành)
- Màn hình chính sau khi đăng nhập: Hiển thị nhanh số lượng vé cần duyệt gấp, trạng thái hệ thống máy chủ, các tác vụ bot đang thực thi và lối tắt truy cập nhanh tới các phân hệ nghiệp vụ.

#### 11. [`ProfileSettingsPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/profile/ProfileSettingsPage.tsx) (Cấu Hình Tài Khoản & Két Sắt)
- Thông tin định danh của Quản trị viên, đổi mật khẩu tài khoản Supabase.
- Kiểm tra tình trạng kết nối tới Két Sắt Fernet Vault và cấu hình tích hợp các nền tảng ngoài.

#### 12. [`LandingPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/landing/LandingPage.tsx) (Cổng Thông Tin Giới Thiệu)
- Trang giới thiệu công khai về Trung tâm Điều phối & Tự Động Hóa Pythaverse, nêu bật các tính năng AI Triage, RPA Engine và hạ tầng bảo vệ dữ liệu.

#### 13. [`LoginPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/auth/LoginPage.tsx) (Cổng Xác Thực An Toàn)
- Cổng đăng nhập bảo mật hỗ trợ cả Đăng nhập Google OAuth một chạm lẫn Đăng nhập Mật khẩu qua Supabase Auth.
- Kiểm tra nghiêm ngặt: Chỉ những tài khoản có email thuộc tổ chức (`@dtt.vn`) mới được phép truy cập vào khu vực quản trị.

---

## 🗄️ PHẦN VII: CƠ SỞ DỮ LIỆU SUPABASE POSTGRESQL 16 (20 BẢNG & PROVENANCE HẠ TẦNG)

### Chuỗi Truy Vết Bất Biến Đầy Đủ (Immutable Provenance Chain):
$$\text{Execution Event} \xrightarrow{\text{proposal\_id}} \text{Workflow} \xrightarrow{\text{proposal\_id}} \text{Proposal} \xrightarrow{\text{intent\_assessment\_id}} \text{Assessment} \xrightarrow{\text{ticket\_revision\_id}} \text{Revision} \xrightarrow{\text{ticket\_id}} \text{Source Ticket}$$

### Chi Tiết 20 Bảng Cơ Sở Dữ Liệu:

| STT | Tên Bảng | Khóa Chính | Khóa Ngoại Tham Chiếu | Mục Đích Nghiệp Vụ & Ràng Buộc Quan Trọng |
|---|---|---|---|---|
| **1** | `inbox_tickets` | `id (UUID)` | - | Tiếp nhận vé đa kênh (Gmail, Form, osTicket). Partial Unique Index `(source, source_id)`. |
| **2** | `inbox_ticket_revisions` | `id (UUID)` | `ticket_id ➔ inbox_tickets` | Lưu lịch sử từng lần biến động nội dung vé. Mã băm SHA-256 `content_hash`. Unique `(ticket_id, revision_no)`. |
| **3** | `ticket_ai_assessments` | `id (UUID)` | `ticket_revision_id ➔ inbox_ticket_revisions` | Lưu 2 bản đánh giá AI độc lập (`summary` & `fact_extraction`) kèm Model Name và Prompt Version. |
| **4** | `workflow_proposals` | `id (UUID)` | `ticket_id`, `ticket_revision_id`, `intent_assessment_id` | Đề xuất workflow chuẩn mực mang bằng chứng (`evidence`), danh sách thiếu hụt, `entity_resolution` và `frozen_plan`. |
| **5** | `automation_workflows` | `id (UUID)` | `proposal_id ➔ workflow_proposals`, `ticket_id` | Lưu trữ bản draft và execution timeline phục vụ hiển thị UI và tương thích ngược. |
| **6** | `automation_workflow_history` | `id (UUID)` | `workflow_id ➔ automation_workflows` | Nhật ký ghi nhận từng lần Admin can thiệp chỉnh sửa bước hoặc bổ sung `operator_reason`. |
| **7** | `workflow_execution_events` | `id (UUID)` | `proposal_id ➔ workflow_proposals`, `workflow_id` | Bảng nhật ký thực thi bất biến Append-Only (started, waiting, succeeded, failed) lưu từng mili-giây. |
| **8** | `bot_automation_tasks` | `id (UUID)` | `ticket_id ➔ inbox_tickets` | Hàng đợi thực thi tác vụ bot đơn lẻ, lưu payload JSON, trạng thái và log thực thi. |
| **9** | `templates_config` | `id (UUID)` | - | Cấu hình các mẫu phản hồi Markdown và mapping trường dữ liệu tự động. |
| **10** | `workspace_organizations` | `id (UUID)` | `parent_id ➔ workspace_organizations` | Cây phả hệ 3 cấp của 480 trường học (`distributor` ➔ `partner` ➔ `school`). |
| **11** | `workspace_credentials_vault` | `id (UUID)` | `org_id ➔ workspace_organizations` | Két sắt lưu mật khẩu mã hóa đối xứng Fernet (`VAULT_SECRET_KEY`) của từng đơn vị trường/đối tác. |
| **12** | `workspace_contracts_cache` | `id (UUID)` | - | Bộ nhớ đệm danh sách hợp đồng License Distributor/Partner quét từ School Workspace. |
| **13** | `workspace_orders_cache` | `id (UUID)` | - | Bộ nhớ đệm danh sách đơn hàng School/Partner quét từ School Workspace. |
| **14** | `workspace_courses` | `id (UUID)` | - | Danh mục các khóa học trên School Workspace, mã SKU. |
| **15** | `lms_courses` | `id (UUID)` | - | Danh mục các khóa học trên PLearn Moodle LMS, đường dẫn LMS URL và mảng cấu hình `git_repos`. |
| **16** | `site_monitor_credentials` | `id (UUID)` | - | Tài khoản kiểm thử đăng nhập định kỳ phục vụ Synthetic Auth Matrix. |
| **17** | `site_downtime_events` | `id (UUID)` | - | Nhật ký ghi nhận sự cố gián đoạn dịch vụ của 10 trang web (thời gian sập, mã HTTP, thời gian phục hồi). |
| **18** | `site_deploy_configs` | `id (UUID)` | - | Cấu hình webhook tự động hóa CI/CD cho Vercel và Render. |
| **19** | `work_boards` | `id (UUID)` | - | Bảng quản lý Kanban, thiết lập độ mờ, màu sắc overlay và danh mục thẻ. |
| **20** | `work_board_columns` | `id (UUID)` | `board_id ➔ work_boards` | Cột trạng thái công việc Kanban (Backlog, Todo, In Progress, Done...). |
| **21** | `work_board_cards` | `id (UUID)` | `board_id`, `column_id` | Thẻ nhiệm vụ Kanban, danh sách subtasks, mức ưu tiên, hạn chót và người phụ trách. |

### Stored Procedure Cấp Phát Revision Nguyên Tử (Atomic Revision Allocation):
```sql
CREATE OR REPLACE FUNCTION create_or_get_inbox_ticket_revision(
    p_ticket_id UUID,
    p_content_hash VARCHAR(64),
    p_raw_content TEXT,
    p_attachments JSONB,
    p_source_updated_at TIMESTAMPTZ
)
RETURNS TABLE(id UUID, revision_no INT, is_new BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing inbox_ticket_revisions%ROWTYPE;
    v_next_revision INT;
BEGIN
    -- Khóa bản ghi ticket để đảm bảo tính nguyên tử tuyệt đối chống race condition
    PERFORM 1 FROM inbox_tickets WHERE inbox_tickets.id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown inbox ticket %', p_ticket_id;
    END IF;

    -- Kiểm tra nếu nội dung và file đính kèm không đổi (trùng content_hash)
    SELECT * INTO v_existing
    FROM inbox_ticket_revisions
    WHERE ticket_id = p_ticket_id AND content_hash = p_content_hash;
    IF FOUND THEN
        RETURN QUERY SELECT v_existing.id, v_existing.revision_no, FALSE;
        RETURN;
    END IF;

    -- Cấp phát revision_no tự tăng nguyên tử
    SELECT COALESCE(MAX(r.revision_no), 0) + 1 INTO v_next_revision
    FROM inbox_ticket_revisions r WHERE r.ticket_id = p_ticket_id;

    INSERT INTO inbox_ticket_revisions (
        ticket_id, revision_no, content_hash, raw_content, attachments, source_updated_at
    ) VALUES (
        p_ticket_id, v_next_revision, p_content_hash, COALESCE(p_raw_content, ''),
        COALESCE(p_attachments, '[]'::jsonb), p_source_updated_at
    ) RETURNING inbox_ticket_revisions.id, inbox_ticket_revisions.revision_no INTO id, revision_no;
    
    is_new := TRUE;
    RETURN NEXT;
END;
$$;
```

---

## 🔄 PHẦN VIII: SƠ ĐỒ LUỒNG NGHIỆP VỤ END-TO-END (MERMAID SEQUENCE & FLOWCHARTS)

### 1. Luồng Tiếp Nhận Đa Kênh, Bóc Tách Sự Thật & Tạo Proposal (Intake Pipeline)
```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng gửi yêu cầu
    participant Ingest as Ingestion Crons (Gmail/osTicket)
    participant Processor as TicketProcessor Worker
    participant DB as Supabase PostgreSQL
    participant AI as Gemini Dual-Key Engine
    participant Verifier as EvidenceVerifier Service
    participant Planner as WorkflowPlanner Service

    User->>Ingest: Gửi Email / osTicket / Form
    Ingest->>Processor: Chuyển giao raw content & attachments
    Processor->>Processor: Tính mã băm SHA-256 (Canonical Content Hash)
    Processor->>DB: Gọi RPC create_or_get_inbox_ticket_revision() (FOR UPDATE)
    DB-->>Processor: Trả về revision_id & revision_no
    Processor->>AI: Trích xuất Facts (GEMINI_API_KEY2 + Revision Stamping)
    AI-->>Processor: Extracted Entities, Intents & Evidence Quotes (start/end offsets)
    Processor->>DB: Lưu assessment vào ticket_ai_assessments
    Processor->>Verifier: Đối soát từng ký tự raw_content[start:end] == quote
    Verifier-->>Planner: VerifiedAssessment (Chỉ intent có bằng chứng mới is_valid=True)
    Planner->>Planner: Tra cứu intent_policy.json (Zero-Mockup Invariant)
    alt Thiếu thông tin cốt tử (School / Email / Git role)
        Planner->>DB: Lưu proposal status = 'needs_information' kèm missing_requirements
    else Đủ thông tin xác thực
        Planner->>DB: Lưu proposal status = 'ready_for_review' kèm DAG plan
    end
```

### 2. Luồng Phê Duyệt An Toàn, Đóng Băng Kế Hoạch & Thực Thi DAG (Approval & Execution)
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Quản trị viên (@dtt.vn)
    participant UI as Frontend Unified Inbox
    participant API as Workflows Router (/approve_and_run)
    participant DB as Supabase PostgreSQL
    participant Coordinator as TaskCoordinator (OCC Lease)
    participant Executor as WorkflowExecutor Service (Kahn DAG)
    participant Bot as BotExecutor Worker (Playwright)
    participant Target as Hệ sinh thái Pythaverse

    Admin->>UI: Bấm Phê Duyệt & Chạy Luồng
    UI->>API: POST /{workflow_id}/approve_and_run (Bearer JWT Token)
    API->>API: Xác thực chữ ký JWT, kiểm tra email whitelist @dtt.vn
    API->>DB: Đọc proposal_id, kiểm tra status == 'ready_for_review'
    API->>API: Server-side validate đồ thị DAG
    API->>DB: Dual Freeze: Đóng băng đồng thời proposal.frozen_plan & workflow.steps
    API->>DB: Ghi Audit Event 'approved' kèm proposal_id
    API-->>UI: 200 OK (Workflow chuyển sang Approved)
    API->>Executor: Gọi execute_approved_workflow ngầm
    Executor->>Coordinator: claim_workflow_lease() qua updated_at (OCC)
    Coordinator-->>Executor: Lease granted (Lease Token)
    loop Kahn Topological DAG Execution
        Executor->>Executor: Tìm các bước có In-degree = 0 (Sẵn sàng)
        Executor->>Bot: Thực thi bước (Semaphore 1 slot, VIP Admin lane)
        Bot->>Target: Thao tác tự động hóa (Workspace / LMS / Git / Keycloak)
        Target-->>Bot: Kết quả thực thi
        Bot-->>Executor: Outputs thành công
        Executor->>DB: Ghi Audit Event 'succeeded' kèm proposal_id & outputs
        Executor->>Executor: Giảm bậc In-degree của các bước hạ nguồn
    end
    Executor->>Coordinator: release_workflow_lease(final_status='success')
    Executor->>DB: Cập nhật workflow status = 'success'
```

### 3. Sơ Đồ Thuật Toán Smart BFS Downstream Reset Khi Retry Bước Lỗi
```mermaid
flowchart TD
    Start([Admin bấm Retry bước A bị lỗi]) --> MarkRunning[Đánh dấu bước A: status = 'ready']
    MarkRunning --> InitQueue[Khởi tạo hàng đợi BFS: Queue = [A]]
    InitQueue --> LoopQueue{Hàng đợi Queue rỗng?}
    LoopQueue -- Không --> Dequeue[Lấy bước hiện tại curr_step từ Queue]
    Dequeue --> FindChildren[Duyệt toàn bộ các bước B có depends_on chứa curr_step]
    FindChildren --> ResetChild[Reset bước B: status = 'waiting_dependency', xóa outputs cũ]
    ResetChild --> PushQueue[Đẩy bước B vào Queue]
    PushQueue --> LoopQueue
    LoopQueue -- Đúng --> CheckParents{Các bước độc lập C khác?}
    CheckParents --> KeepSuccess[GIỮ NGUYÊN trạng thái 'success' của C, KHÔNG CHẠY LẠI]
    KeepSuccess --> ExecDAG[Kích hoạt Kahn DAG Executor chạy từ bước A]
    ExecDAG --> End([Hoàn tất Retry thông minh])
```

---

## 🔍 PHẦN IX: BẢNG CHỈ MỤC TRA CỨU NHANH TÊN HÀM ➔ TỆP TIN (FUNCTION-TO-FILE QUICK INDEX)

Bảng tra cứu trực tiếp giúp AI Coder tìm kiếm tức thì vị trí định nghĩa và vai trò của hàm mà không cần quét lại mã nguồn:

| Tên Hàm / Phương Thức | Tệp Tin Định Nghĩa | Module / Lớp | Vai Trò & Nghiệp Vụ Xử Lý |
|---|---|---|---|
| `lifespan` | [`backend/app/main.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/main.py) | Module ASGI | Khởi tạo scheduler 6 crons so le, dọn dẹp Chromium zombie. |
| `safe_job_wrapper` | [`backend/app/main.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/main.py) | Module ASGI | Bọc an toàn cronjob, bắt `CronSlotYieldException`, dọn `gc.collect()`. |
| `poll_workspace_long_tasks` | [`backend/app/main.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/main.py) | Cron Service | Thăm dò batch tài khoản, dán ngược COF, tự động resume workflow. |
| `parse_thread` | [`backend/app/services/email_thread_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/email_thread_service.py) | `EmailThreadService` | Phân tách thread email, khử quoted reply rác, phân loại vòng đời. |
| `is_internal_email` | [`backend/app/services/email_thread_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/email_thread_service.py) | `EmailThreadService` | Kiểm tra email thuộc `@dtt.vn` hoặc `@pythaverse.space`. |
| `verify_evidence_span` | [`backend/app/services/evidence_verifier.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/evidence_verifier.py) | `EvidenceVerifierService` | Đối soát từng ký tự offset, cân chỉnh Substring Calibration $\pm 160$ chars. |
| `load_verified_assessment` | [`backend/app/services/evidence_verifier.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/evidence_verifier.py) | `EvidenceVerifierService` | Factory giải tuần tự an toàn, chỉ giữ Intent có bằng chứng verified. |
| `augment_assessment_with_request_facts` | [`backend/app/services/request_fact_normalizer.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/request_fact_normalizer.py) | Module Normalizer | Bổ trợ fact tất định (Email, Teacher role, Courses) kèm `EvidenceSpan`. |
| `parse_users_from_table_or_text` | [`backend/app/services/request_fact_normalizer.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/request_fact_normalizer.py) | Module Normalizer | Bóc tách danh sách người dùng từ định dạng bảng `\|` hoặc bullet points. |
| `build_workflow_proposal` | [`backend/app/services/workflow_planner.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workflow_planner.py) | `WorkflowPlannerService` | Tra cứu `intent_policy.json`, tự động ghép cặp Git, cấm role GUEST mặc định. |
| `validate_workflow_graph` | [`backend/app/services/workflow_planner.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workflow_planner.py) | `WorkflowPlannerService` | Kiểm tra đồ thị DAG, phát hiện chu trình lặp (Cycle Detection). |
| `execute_approved_workflow` | [`backend/app/services/workflow_executor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workflow_executor.py) | `WorkflowExecutorService` | Sắp xếp Tô-pô Kahn DAG, giải mã `{{ step.property }}`, ghi nhật ký audit. |
| `retry_workflow_step` | [`backend/app/services/workflow_executor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workflow_executor.py) | `WorkflowExecutorService` | Duyệt BFS reset chính xác các bước hạ nguồn, giữ nguyên bước thành công. |
| `parse_cof_file` | [`backend/app/services/excel/cof_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/cof_service.py) | `COFService` | Bóc tách 3 tabs của file COF (Đơn hàng, Học sinh, Giáo viên). |
| `write_results_back_to_cof` | [`backend/app/services/excel/cof_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/cof_service.py) | `COFService` | Dán ngược mã đăng nhập và mật khẩu vào file COF gốc, tô màu xanh. |
| `normalize_input_accounts_excel` | [`backend/app/services/excel/bulk_template_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/bulk_template_service.py) | `BulkTemplateService` | Chuẩn hóa mọi file thành Phôi Chuẩn Của Trường (Hàng 2 tiêu đề, Hàng 5 header). |
| `extract_users_from_raw_text` | [`backend/app/services/excel/bulk_template_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/bulk_template_service.py) | `BulkTemplateService` | Bóc tách text trần sinh phôi Excel cho cỗ máy Bulk Account Creation. |
| `generate_accounts_excel_from_users` | [`backend/app/services/excel/bulk_template_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/bulk_template_service.py) | `BulkTemplateService` | Tạo file Excel phôi chuẩn trực tiếp từ mảng user dictionary. |
| `parse_generic_excel` | [`backend/app/services/excel/generic_excel_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/generic_excel_service.py) | `GenericExcelService` | Bóc tách file Excel tự do, trả về danh sách sheet và mảng dòng. |
| `extract_links_and_emails` | [`backend/app/services/excel/generic_excel_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel/generic_excel_service.py) | `GenericExcelService` | Trích xuất URL Hyperlink Git Repositories và Email từ các ô tính. |
| `login_role` | [`backend/app/services/workspace/base.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/base.py) | `WorkspaceBaseService` | Đăng nhập Workspace bằng kỹ thuật bơm DOM JS (`evaluate`), bảo toàn ký tự đặc biệt. |
| `_setup_snackbar_observer` | [`backend/app/services/workspace/order_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/order_service.py) | `WorkspaceOrderService` | Bắt popup thông báo Toast qua MutationObserver, chống timeout 15s. |
| `bulk_account_creation_pipeline` | [`backend/app/services/workspace/account_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace/account_service.py) | `WorkspaceAccountService` | Điều khiển RPA tải phôi Excel lên cỗ máy Bulk Account Creation. |
| `resolve_by_school` | [`backend/app/services/workspace_lineage_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace_lineage_service.py) | `WorkspaceLineageService` | Tái dựng phả hệ 3 cấp (School->Partner->Distributor), giải mã Fernet Vault. |
| `enroll_users_pipeline` | [`backend/app/services/playwright_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/playwright_service.py) | `PlaywrightService` | RPA ghi danh Moodle LMS 2 nhịp trên selector `td.cell.c2`. |
| `add_collaborators_pipeline` | [`backend/app/services/git_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/git_service.py) | `GitService` | RPA thêm cộng tác viên vào GitBucket qua Keycloak SSO. |
| `execute_approved_bot_task` | [`backend/app/workers/bot_executor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/workers/bot_executor.py) | `BotExecutor` | Router trung tâm thực thi 19 capabilities của hệ thống. |
| `compute_canonical_content_hash` | [`backend/app/workers/ticket_processor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/workers/ticket_processor.py) | Module Intake | Tính mã băm SHA-256 nội dung kèm danh sách tệp đính kèm chuẩn hóa. |
| `claim_workflow_lease` | [`backend/app/core/task_coordinator.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/task_coordinator.py) | `TaskCoordinator` | Chiếm quyền chạy workflow qua Optimistic Concurrency Control (`updated_at`). |
| `acquire_playwright_slot` | [`backend/app/core/playwright_manager.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/playwright_manager.py) | Module Concurrency | Semaphore 1 slot + Re-entrancy ContextVar bảo vệ 512MB RAM Render. |
| `summarize_ticket` | [`backend/app/core/gemini.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/gemini.py) | `GeminiDualPathEngine` | Tóm tắt mềm hiển thị Inbox (Key 1), kèm Fast-Path Triage khi hết Quota. |
| `extract_operational_facts` | [`backend/app/core/gemini.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/gemini.py) | `GeminiDualPathEngine` | Bóc tách ý định và thực thể có trích dẫn offset (Key 2). |
| `get_current_user_email` | [`backend/app/core/security.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/security.py) | Security Dependency | Giải mã Bearer JWT token, cưỡng chế Whitelist domain `@dtt.vn`. |

---

## 🧭 PHẦN X: CẨM NANG KHẮC PHỤC SỰ CỐ & FAQ DÀNH RIÊNG CHO AI CODER

### 1. Vấn Đề: "Hết Quota AI (Lỗi 429 Too Many Requests)"
- **Cơ chế phòng thủ:** Hệ thống sở hữu kiến trúc Dual-Key (`GEMINI_API_KEY` & `GEMINI_API_KEY2`). Khi một key chạm ngưỡng, hệ thống tự động hoán đổi chìa chéo (Cross-Key Failover) trước khi gọi chuỗi 10 model fallback.
- **Phao cứu sinh tất định:** Khi toàn bộ 10 model và cả 2 key đều hết hạn ngạch, bộ **Deterministic Fast-Path Triage v1.2.0** tự động kích hoạt để phân loại và tóm tắt vé mà không làm crash tiến trình.

### 2. Vấn Đề: "Test Bị Lỗi 'AssertionError: assert any(m.get('field') == 'git_role'...)'"
- **Nguyên nhân:** Vi phạm nguyên tắc **Zero-Mockup Invariant**. Không được tự tiện gán vai trò mặc định `"GUEST"` khi người dùng không chỉ định rõ vai trò Git trong yêu cầu.
- **Cách khắc phục:** Trong `workflow_planner.py`, nếu `extracted_intent.type == "repository_access"` mà `entities.get("git_role")` rỗng, bắt buộc phải append `missing_requirements` với field là `"git_role"`.

### 3. Vấn Đề: "Test Bị Lỗi 'assert all(user['role'] == 'teacher'...)'"
- **Nguyên nhân:** Khi bóc tách người dùng từ email có ngữ cảnh giáo viên ("teachers", "giáo viên"), hàm `parse_users_from_table_or_text` bị gán cứng role `"student"`.
- **Cách khắc phục:** Kiểm tra từ khóa ngữ cảnh: `role_match = re.search(r"\bteachers?\b|\bgiáo\s+viên\b", text, re.IGNORECASE)` và gán `detected_role = "teacher" if role_match else "student"`.

### 4. Vấn Đề: "Lỗi Import 'GenericExcelService' từ gói `app.services.excel`"
- **Nguyên nhân:** Gói `app/services/excel/` đã được chuyên biệt hóa thành 4 module. File `generic_excel_service.py` phải chứa class `GenericExcelService` với các phương thức `parse_generic_excel` và `extract_links_and_emails`.

### 5. Vấn Đề: "Tràn Bộ Nhớ Render (512MB RAM OOM Kill)"
- **Nguyên nhân:** Chromium chạy ngầm không được dọn dẹp hoặc mở nhiều hơn 1 phiên Playwright đồng thời.
- **Cách khắc phục:**
  - Tuyệt đối không tăng giá trị `GLOBAL_PLAYWRIGHT_SEMAPHORE = asyncio.Semaphore(1)`.
  - Luôn đảm bảo mọi thao tác Playwright nằm trong khối `try...finally` gọi `gc.collect()` và `force_kill_zombie_chromium()`.
  - Sử dụng bộ lọc mạng `setup_low_ram_routes` để chặn triệt để hình ảnh, video và font chữ.

---

## 🤖 PHẦN XI: CẨM NANG ĐỊNH TUYẾN CHUYÊN GIA AI (INTELLIGENT AGENT ROUTING PLAYBOOK)

Khi thực thi bất kỳ yêu cầu lập trình hay sửa lỗi nào trong dự án, AI Assistant bắt buộc phải tự động kích hoạt năng lực của chuyên gia tương ứng:

| STT | Agent Chuyên Gia | Hồ Sơ Tham Chiếu | Lĩnh Vực / Phạm Vi Trọng Tâm Áp Dụng |
|---|---|---|---|
| **1** | `@[frontend-specialist]` | `.agent/agents/frontend-specialist.md` | React 19, TypeScript Strict, Tailwind CSS v4, Bento Grid, Enterprise Pastel OKLCH, Dark/Light theme, Evidence Provenance UI, loại bỏ nhãn song ngữ thừa, responsive 13 trang, SheetJS Excel Preview modal. |
| **2** | `@[backend-specialist]` | `.agent/agents/backend-specialist.md` | Python 3.11/3.12, FastAPI 0.115, Pydantic v2 validation, Async/Await, Dual-Key Gemini cross-failover, Deterministic Fast-Path Triage, True Topological Sort (Kahn), Safe Job Wrapper, Ma trận 8 RAM Caches 1ms. |
| **3** | `@[database-architect]` | `.agent/agents/database-architect.md` | Supabase PostgreSQL 16 (20 bảng CSDL + Storage Bucket `ticket-attachments`), Revisions, Assessments, Proposals, Append-only Execution Events, RLS Policies `@dtt.vn`, Stored Procedure Atomic Allocation `FOR UPDATE`. |
| **4** | `@[qa-automation-engineer]` | `.agent/agents/qa-automation-engineer.md` | Playwright Async Chromium, Gói `workspace/` modularized 8 modules, Single Playwright Semaphore (1 Slot cho 512MB RAM Render), Re-entrant ContextVar Lock, Zombie process cleanup `gc.collect()`. |
| **5** | `@[security-auditor]` | `.agent/agents/security-auditor.md` | Whitelist Domain `@dtt.vn`, Fernet Credential Vault (`VAULT_SECRET_KEY`), Keycloak Admin REST API + Playwright Fallback, Credential Masking `[PROTECTED]`, Server-Side JWT Approval Gate. |
| **6** | `@[orchestrator]` | `.agent/agents/orchestrator.md` | Phân tích luồng end-to-end, giải quyết xung đột dữ liệu, thiết kế pipeline liên thông đa dịch vụ (Workspace ➔ LMS ➔ Git ➔ Keycloak). |
| **7** | `@[debugger]` | `.agent/agents/debugger.md` | 4-Phase Systematic Debugging, bắt log thực thi chuẩn hóa GMT+7, cô lập nguyên nhân gốc rễ, Gemini 10-model fallback + Deterministic Fast-Path Triage. |
| **8** | `@[documentation-writer]` | `.agent/agents/documentation-writer.md` | Chuẩn hóa README, API Docs, cẩm nang kiến trúc, Single Source of Truth cho toàn bộ dự án, đồng bộ hóa tuyệt đối với mã nguồn. |
| **9** | `@[project-planner]` | `.agent/agents/project-planner.md` | Phương pháp luận 4 pha (Analysis, Planning, Solutioning, Implementation), lập bản đồ công việc, duy trì invariants. |
| **10** | `@[devops-engineer]` | `.agent/agents/devops-engineer.md` | Quản trị CI/CD GitHub Actions, cấu hình Render.com (512MB RAM ASGI), Vercel (Edge CDN Frontend), UptimeRobot (Keep-warm ping & Synthetic monitoring), Dockerfile. |
| **11** | `@[performance-optimizer]` | `.agent/agents/performance-optimizer.md` | Tối ưu hóa bộ nhớ 512MB RAM Render, Ma trận 8 BoundedMemoryCache (LRU + TTL < 40MB), Low-RAM Chromium 18 cờ tối ưu, Dynamic Code Splitting React 19 / Vite 6. |
| **12** | `@[penetration-tester]` | `.agent/agents/penetration-tester.md` | Thử nghiệm xâm nhập, kiểm định phòng thủ Prompt Injection, phá vỡ Offset trích dẫn, chống bypass JWT Token `@dtt.vn`, kiểm định an toàn két sắt Fernet. |
| **13** | `@[test-engineer]` | `.agent/agents/test-engineer.md` | Thiết kế Hermetic Pytest Suite, Contract Tests 19 Capabilities, Mocking in-memory không tốn Quota AI, kiểm thử hồi quy an toàn. |
| **14** | `@[code-archaeologist]` | `.agent/agents/code-archaeologist.md` | Truy vết lịch sử commit Git, phân tích mã nguồn cũ, refactoring mã thừa, giải quyết mâu thuẫn giữa các bản nâng cấp. |
| **15** | `@[explorer-agent]` | `.agent/agents/explorer-agent.md` | Thám sát cây thư mục, kiểm kê tệp tin, lập bản đồ phụ thuộc file (`CODEBASE.md`). |
| **16** | `@[product-manager]` | `.agent/agents/product-manager.md` | Định hình lộ trình tính năng, tối ưu trải nghiệm Admin Hub, quản lý độ ưu tiên các phân hệ Pythaverse. |
| **17** | `@[product-owner]` | `.agent/agents/product-owner.md` | Thẩm định User Stories tiếp nhận vé, kiểm tra tính đầy đủ của thông tin người gửi, tối ưu tiêu chí nghiệm thu (Acceptance Criteria). |
| **18** | `@[seo-specialist]` | `.agent/agents/seo-specialist.md` | Tối ưu hóa cấu trúc thẻ, metadata, semantic HTML cho Cổng giới thiệu Landing Page (`/landing`). |
| **19** | `@[mobile-developer]` | `.agent/agents/mobile-developer.md` | Đảm bảo tính tương thích hiển thị Responsive di động và tablet cho toàn bộ 13 trang quản trị. |
| **20** | `@[game-developer]` | `.agent/agents/game-developer.md` | Tích hợp các tương tác gamification, hiệu ứng Canvas Confetti, phản hồi trực quan (Visual feedback) trong quy trình duyệt vé. |

---

### Hướng Dẫn Vận Hành & Kiểm Thử Nhanh:

```powershell
# 1. Chạy toàn bộ 23 bài kiểm thử an toàn Backend hermetic
.\.venv\Scripts\pytest.exe backend/tests/ -v

# 2. Kiểm tra cú pháp TypeScript strict và đóng gói Frontend
cd frontend
npm run build
```

---
*Bản quyền kiến trúc © 2026 DTT Corporation. Kiến trúc sư trưởng Nguyễn Mạnh Hùng. Tài liệu cập nhật và đồng bộ tự động thành công vào ngày 15 tháng 09 năm 2026.*
