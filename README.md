# 🚀 BÁCH KHOA TOÀN THƯ KIẾN TRÚC HỆ THỐNG PTV-TASKS-ADMINISTRATOR
## Pythaverse Central Admin & Automation Hub (Enterprise Single Source of Truth)

> **Tài liệu kiến trúc:** Tài liệu này mô tả mã nguồn, luồng dữ liệu, schema và các safety invariant hiện hành của **`ptv-tasks-administrator`**. AI có thể đưa ra đề xuất sai; vì vậy một workflow chỉ trở thành executable khi evidence thuộc đúng revision được kiểm chứng, policy chấp nhận và người dùng đã xác thực phê duyệt. Phần “Giới hạn vận hành” bên dưới là một phần của contract, không phải ngoại lệ.

---

## 📌 THÔNG TIN BẢN QUYỀN & TÁC GIẢ SÁNG LẬP

- **Dự án:** `ptv-tasks-administrator` (Pythaverse Central Admin & Automation Hub)
- **Tác giả & Kiến trúc sư trưởng:** **Nguyễn Mạnh Hùng** (*Lead AI Engineer & Automation Architect – DTT Corporation / Pythaverse Ecosystem*)
- **GitHub:** [`https://github.com/hungnm-1225`](https://github.com/hungnm-1225)
- **Email:** `hungnm@dtt.vn` / `hung.nguyenmanh@dtt.vn`
- **Hệ sinh thái:** [Pythaverse Space](https://pythaverse.space)
- **Phiên bản:** `v3.1.2 Enterprise Provenance & Evidence-Grounded Hardened Edition` (Cập nhật ngày 12 tháng 09 năm 2026)

---

## 📑 MỤC LỤC TỔNG QUAN

1. [PHẦN I: TẦM NHÌN HỆ THỐNG & SÁU NGUYÊN TẮC BẤT BIẾN (SAFETY INVARIANTS)](#-phần-i-tầm-nhìn-hệ-thống--sáu-nguyên-tắc-bất-biến-safety-invariants)
2. [PHẦN II: 7 PHÂN HỆ NGHIỆP VỤ PYTHAVERSE (DOMAIN TRUTH)](#-phần-ii-7-phân-hệ-nghiệp-vụ-pythaverse-domain-truth)
3. [PHẦN III: STACK CÔNG NGHỆ, HẠ TẦNG ĐA NỀN TẢNG & THÔNG SỐ VẬN HÀNH](#-phần-iii-stack-công-nghệ-hạ-tầng-đa-nền-tảng--thông-số-vận-hành)
4. [PHẦN IV: SƠ ĐỒ CẤU TRÚC THƯ MỤC MONOREPO TỔNG THỂ & VAI TRÒ TỪNG FILE](#-phần-iv-sơ-đồ-cấu-trúc-thư-mục-monorepo-tổng-thể--vai-trò-từng-file)
5. [PHẦN V: GIẢI PHẪU CHI TIẾT TỪNG FILE & HÀM XỬ LÝ BACKEND (FASTAPI 0.115)](#-phần-v-giải-phẫu-chi-tiết-từng-file--hàm-xử-lý-backend-fastapi-0115)
   - [5.1. Entrypoint, Cron Polling & Provenance Events (`main.py`)](#51-entrypoint-cron-polling--provenance-events-mainpy)
   - [5.2. Lõi Hệ Thống Core (`app/core/`) – Dual-Key Gemini, OCC Lease & JWT Security](#52-lõi-hệ-thống-core-appcore)
   - [5.3. Định Nghĩa Schemas & Thẩm Định Bằng Chứng (`app/models/`, `app/services/`)](#53-định-nghĩa-schemas--thẩm-định-bằng-chứng-appmodels-appservices)
   - [5.4. Tri Thức Nghiệp Vụ & Grounding Registry (`app/brain/`)](#54-tri-thức-nghiệp-vụ--grounding-registry-appbrain)
   - [5.5. Cổng Giao Tiếp REST API Endpoints & Frozen Safety Gate (`app/api/v1/endpoints/`)](#55-cổng-giao-tiếp-rest-api-endpoints--frozen-safety-gate-appapiv1endpoints)
   - [5.6. Bộ Lập Kế Hoạch Registry-Driven & Điều Phối Thực Thi DAG (`app/services/`)](#56-bộ-lập-kế-hoạch-registry-driven--điều-phối-thực-thi-dag-appservices)
   - [5.7. Bộ Điều Phối Workers Chạy Ngầm & Atomic Intake (`app/workers/`)](#57-bộ-điều-phối-workers-chạy-ngầm--atomic-intake-appworkers)
   - [5.8. Bộ Kiểm Thử An Toàn Tự Động Hermetic Pytest Suite (`backend/tests/`)](#58-bộ-kiểm-thử-an-toàn-tự-động-hermetic-pytest-suite-backendtests)
6. [PHẦN VI: GIẢI PHẪU CHI TIẾT GIAO DIỆN FRONTEND SPA (REACT 19 + VITE 6 + TAILWIND CSS V4)](#-phần-vi-giải-phẫu-chi-tiết-giao-diện-frontend-spa-react-19--vite-6--tailwind-css-v4)
7. [PHẦN VII: CƠ SỞ DỮ LIỆU SUPABASE POSTGRESQL 16 (20 BẢNG & PROVENANCE HẠ TẦNG)](#-phần-vii-cơ-sở-dữ-liệu-supabase-postgresql-16-20-bảng--provenance-hạ-tầng)
8. [PHẦN VIII: SƠ ĐỒ LUỒNG NGHIỆP VỤ END-TO-END (MERMAID SEQUENCE & FLOWCHARTS)](#-phần-viii-sơ-đồ-luồng-nghiệp-vụ-end-to-end-mermaid-sequence--flowcharts)
9. [PHẦN IX: CẨM NANG VẬN HÀNH & HƯỚNG DẪN TEST DÀNH CHO KỸ SƯ HỆ THỐNG](#-phần-ix-cẩm-nang-vận-hành--hướng-dẫn-test-dành-cho-kỹ-sư-hệ-thống)
10. [PHẦN X: CẨM NANG ĐỊNH TUYẾN CHUYÊN GIA AI (INTELLIGENT AGENT ROUTING PLAYBOOK)](#-phần-x-cẩm-nang-định-tuyến-chuyên-gia-ai-intelligent-agent-routing-playbook)

---

## 🏛️ PHẦN I: TẦM NHÌN HỆ THỐNG & SÁU NGUYÊN TẮC BẤT BIẾN (SAFETY INVARIANTS)

`ptv-tasks-administrator` được định vị là **Trung tâm Thần kinh Điều phối & Tự Động Hóa Tập Trung (Pythaverse Central Admin & Automation Hub)** cho toàn bộ tập đoàn DTT Corporation và hệ sinh thái giáo dục công nghệ Pythaverse.

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 ĐẦU VÀO ĐA KÊNH (INGESTION)             │
                  │   [Gmail Workspace]  [Google Forms]  [OS Ticket SCP]   │
                  └───────────────────────────┬────────────────────────────┘
                                              │ Ingestion Crons (Lệch pha)
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                      LÕI TRUNG TÂM PTV-TASKS-ADMINISTRATOR (BACKEND FASTAPI)             │
│                                                                                          │
│  ┌─────────────────────────┐   ┌───────────────────────────┐   ┌──────────────────────┐  │
│  │ Dual-Path Cognition AI  │   │ EvidenceVerifier Service  │   │  Human-in-the-Loop   │  │
│  │ • Summary (Key 1)       │──▶│ • raw_content[start:end]  │──▶│  Safety Gate         │  │
│  │ • Facts (Key 2)         │   │ • Substring Calibration   │   │  JWT Authenticated   │  │
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
│  │  • Diệt tận gốc lỗi Request #None tại bước waiting_poll                            │  │
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
   - Mọi ý định vận hành trích xuất bắt buộc phải có đoạn trích dẫn nguyên văn (`quote`) kèm định vị ký tự (`start_offset`, `end_offset`) và mã revision `source_revision_id`. `EvidenceVerifierService` đối soát từng ký tự: $\text{raw\_content}[\text{start}:\text{end}] == \text{quote}$. Nếu quote không tồn tại hoặc sai lệch revision, intent đó bị gạch bỏ và outcome hạ xuống `needs_information`.
2. **Attachment Evidence Fail-Closed Invariant (File đính kèm chưa đối soát ➔ Không Action):**
   - Các trích dẫn có `source_kind == "attachment_extract"` tạm thời bị gắn cờ `is_verified = False` (chuyển sang `needs_information`), nghiêm cấm việc dùng text thân email để đối soát trích dẫn từ file đính kèm khi chưa qua hạ tầng bóc tách bất biến.
3. **Zero-Mockup Invariant (Cấm Tuyệt Đối Dữ Liệu Bịa Đặt / Fallback Giả Định):**
   - Nghiêm cấm sử dụng bất kỳ giá trị mặc định giả lập nào (`SWRP 4-12`, count=4, mật khẩu `Ptv@2026`). **Đặc biệt: Khai tử hoàn toàn default Git role `GUEST`**. Yêu cầu cấp quyền Git không nêu rõ vai trò bắt buộc sinh `missing_requirement: git_role`, chuyển trạng thái sang `needs_information` và không tạo bước `git.add_collaborators`.
4. **Dual-Freeze Proposal & Immutable Provenance Linkage:**
   - Khi Admin phê duyệt, hệ thống đóng băng đồng thời cả `workflow_proposals.frozen_plan` và `automation_workflows.steps`. Toàn bộ execution events bắt buộc phải mang theo `proposal_id`. Tuyệt đối không cho phép chỉnh sửa workflow hay proposal sau khi đã ở trạng thái `approved`.
5. **Real JWT Identity Enforcement (Chống Mạo Danh Người Phê Duyệt):**
   - Bỏ qua trường `approved_by` do Frontend gửi lên trong payload body. Danh tính người duyệt được giải mã trực tiếp từ Bearer JWT Token qua dependency `get_current_user_email` và bắt buộc thuộc whitelist domain `@dtt.vn`.
6. **Optimistic Concurrency Control (OCC) Lease & Single-Instance Concurrency:**
   - Chiếm Lease độc quyền cấp Workflow qua `TaskCoordinator.claim_workflow_lease()` sử dụng kiểm soát đồng thời lạc quan (OCC) trên `updated_at`. Heartbeat và release cũng kiểm tra phiên bản trước khi ghi; xung đột được xử lý fail-closed.
   - Hàm `update_workflow_heartbeat()` ném `RuntimeError` dừng khẩn cấp worker nếu bị cướp lease. Hàm `release_workflow_lease()` chỉ cập nhật status khi token khớp chính xác.

---

## 🌐 PHẦN II: 7 PHÂN HỆ NGHIỆP VỤ PYTHAVERSE (DOMAIN TRUTH)

| STT | Phân Hệ | Tên Miền / Giao Thức | Core Platform | Vai Trò Kỹ Thuật & Nghiệp Vụ Cốt Lõi | Phương Thức Tự Động Hóa |
|---|---|---|---|---|---|
| **1** | **School Workspace** | `https://pythaverse.space` | React MUI / Direct REST APIs | Quản trị phân cấp 3 tầng (`Distributor` ➔ `Partner` ➔ `School`). Cấp phát License Pool, bù Contract, nộp batch tài khoản số lượng lớn qua Bulk Account Creation. | Playwright Headless + Direct API Scanner (Gói `workspace/` 8 modules). |
| **2** | **PLearn LMS** | `https://learn.pythaverse.space` | Moodle LMS (PHP / MariaDB / Edwiser RemUI) | Cổng đào tạo Moodle LMS. Quản lý danh mục khóa học (`SWRP`, `IR`, `ASP`...) và ghi danh tài khoản theo Vai trò (`Student` - 9, `Teacher` - 7, `Manager` - 1). | Playwright Headless + Keyword Filter 2 nhịp trên `td.cell.c2` (`playwright_service.py`). |
| **3** | **PGit Repos** | `https://git.pythaverse.space` | GitBucket Server (Scala / JVM / SQLite) | Máy chủ lưu trữ mã nguồn dự án học sinh & giáo viên. Quản lý Collaborators tại `/settings/collaborators`. Yêu cầu đăng nhập SSO Keycloak. | Playwright Chromium tự động hóa OIDC Keycloak SSO Form, gán vai trò `ADMIN`, `DEVELOPER`, `GUEST` (`git_service.py`). |
| **4** | **Keycloak Auth IDP** | `https://eid.pythaverse.space` | Keycloak (Java / WildFly / PostgreSQL) | Cổng xác thực định danh tập trung OpenID Connect / OAuth2 (Realm: `idp` / `master`). Reset mật khẩu, kích hoạt/khóa tài khoản và xác thực email. | 2-Tier Hybrid: Direct REST API (300ms) ➔ Playwright RPA Fallback (`keycloak_service.py`). |
| **5** | **Leanbot IDE** | `https://ide.pythaverse.space` | Blockly / Web Bluetooth BLE | Web IDE lập trình khối kéo thả Blockly kết nối Robot Leanbot qua Bluetooth BLE. | Synthetic Monitoring Uptime & Latency (`site_monitor_service.py`). |
| **6** | **Support Helpdesk** | `https://support.pythaverse.space` | osTicket (PHP / MySQL) | Hệ thống tiếp nhận sự cố kỹ thuật osTicket. Cào dữ liệu định kỳ qua Playwright Headless session và chuyển giao cho Canonical Intake. | Playwright headless scraper cào vé, custom form fields & files đính kèm (`osticket_service.py`). |
| **7** | **PContest** | `https://contest.pythaverse.space` | Next.js / Python Judge | Hệ thống tổ chức thi đấu lập trình trực tuyến, quản lý Leaderboard và chấm điểm tự động. | Synthetic Monitoring Uptime & Latency (`site_monitor_service.py`). |

---

## 🛠️ PHẦN III: STACK CÔNG NGHỆ, HẠ TẦNG ĐA NỀN TẢNG & THÔNG SỐ VẬN HÀNH

### 1. Thế Trận Hạ Tầng Đa Nền Tảng (Multi-Platform Topology)
- **Vercel**: Máy chủ Edge CDN lưu trữ ứng dụng Frontend React 19 SPA (Build siêu tốc, Dynamic Chunk Splitting).
- **Render.com**: Máy chủ khởi chạy Backend FastAPI trên môi trường tài nguyên nghiêm ngặt (**512MB RAM Free/Starter Tier**). Khoá cứng Semaphore 1 slot, thu hồi bộ nhớ `gc.collect()` và tiêu diệt Chromium zombie.
- **Supabase**: Cơ sở dữ liệu PostgreSQL 16 (20 bảng chuyên biệt, RLS `@dtt.vn`, Storage Bucket `ticket-attachments`, Két sắt mã hóa Fernet, và PostgreSQL Stored Procedure Atomic Locking).
- **Google Cloud Console**: Quản trị tài khoản dịch vụ (Service Account) tích hợp bộ ba Gmail Workspace API, Google Sheets API và Google Drive API.
- **UptimeRobot**: Giám sát ngoại vi Synthetic Ping Uptime (chu kỳ 5 phút) kiêm nhiệm vụ giữ ấm (keep-warm ping) cho Render chống ngủ đông.
- **GitHub**: Quản lý mã nguồn Monorepo, GitHub Actions CI/CD và Dispatcher Issue tự động vào Private Repositories.

### 2. Backend Stack Chuẩn
- **Ngôn ngữ & Runtime:** Python `3.11.x` / `3.12.x`
- **Web Framework:** FastAPI `0.115.x` (Asynchronous)
- **Validation Engine:** Pydantic `2.10.x` (Strict Schema Validation & Typed Entities)
- **RPA & Automation Engine:** Playwright Async Chromium (`playwright.async_api: 1.50.x`)
- **Lập lịch chạy ngầm:** APScheduler `3.10.x` (`AsyncIOScheduler`) với 6 Crons so le lệch pha.
- **In-Memory Caching:** Ma trận 8 In-Memory RAM Caches (TTL 15s - 15m, phản hồi 1ms).
- **Trí tuệ nhân tạo (AI):** `google-generativeai: ^0.8.4` tích hợp Dual-Key Engine (`GEMINI_API_KEY` & `GEMINI_API_KEY2`) kết hợp chuỗi 10 models fallback.
- **Kiểm Thử Hồi Quy:** `pytest: ^9.x` / `pytest-asyncio: ^1.4.x` (Hermetic in-memory test suite, **15/15 green in 1.01s**).

---

## 📁 PHẦN IV: SƠ ĐỒ CẤU TRÚC THƯ MỤC MONOREPO TỔNG THỂ

```
ptv-tasks-administrator/
├── backend/                            # Ứng dụng Backend FastAPI (Python 3.11/3.12)
│   ├── app/
│   │   ├── api/v1/endpoints/           # 10 Router REST API (Authenticated JWT)
│   │   │   ├── workflows.py            # Safety Gate, Dual Freeze, Depends(get_current_user_email)
│   │   │   ├── tickets.py              # Canonical Intake, RPC Revision, Re-summarize
│   │   │   └── ...                     # Các endpoints khác (board, bots, courses, monitor...)
│   │   ├── brain/                      # Tri thức nghiệp vụ & Grounding Registry
│   │   │   ├── capabilities.json       # 19 Capabilities hệ thống (Schemas, Handlers)
│   │   │   ├── intent_policy.json      # Bảng chính sách tất định (v1.1.0)
│   │   │   └── prompts/                # Versioned Prompts (ticket_summary_v1, intent_extraction_v1)
│   │   ├── core/                       # Lõi hệ thống & Quản trị tài nguyên
│   │   │   ├── gemini.py               # AI Engine Dual-Key & Dual-Path, Evidence Stamping
│   │   │   ├── security.py             # Whitelist Domain @dtt.vn, Bearer JWT Auth Dependency
│   │   │   ├── task_coordinator.py     # OCC Workflow Lease Claiming via updated_at, Heartbeat Fail-Closed
│   │   │   └── playwright_manager.py   # Single-Instance Playwright Semaphore (1 Slot), Zombie Killer
│   │   ├── models/                     # Schemas Pydantic Validation
│   │   │   ├── intent.py               # EvidenceSpan (offsets), ExtractedEntity, TypedEntities, VerifiedAssessment
│   │   │   └── workflow.py             # WorkflowStepDraft (is_manual), WorkflowApprovalRequest, WorkflowResponse
│   │   ├── services/                   # Các dịch vụ nghiệp vụ chuyên biệt
│   │   │   ├── evidence_verifier.py    # Deterministic Verifier, Substring Calibration, load_verified_assessment
│   │   │   ├── workflow_planner.py     # Registry-Driven Policy Engine, Entity Resolution, Fail-Closed Draft
│   │   │   ├── workflow_executor.py    # Topological Kahn DAG, Frozen Plan SOT, BFS Downstream Retry
│   │   │   └── ...                     # Các services RPA (workspace, git, keycloak, lms...)
│   │   ├── workers/                    # Bộ điều phối thực thi chạy ngầm
│   │   │   ├── bot_executor.py         # Router Worker trung tâm thực thi bot
│   │   │   └── ticket_processor.py     # Atomic Revision RPC, Canonical Hash, Provenance Pipeline
│   │   └── main.py                     # Lifespan 6 Crons so le, Polling với Proposal ID audit
│   ├── tests/                          # Bộ Kiểm Thử Hermetic Pytest (15/15 Green in 1.01s)
│   │   ├── test_capability_contracts.py# Contract Test 19 capabilities vs bot_executor
│   │   ├── test_planning_policy.py     # Test Zero-Mockup, EvidenceVerifier, Injection, Skewed Offset
│   │   └── test_execution_safety.py    # Test Kahn Topological sort, [PROTECTED] Masking, Data Binding
│   ├── pytest.ini                      # Cấu hình Pytest asyncio
│   └── requirements.txt                # Thư viện Python Backend
├── frontend/                           # Ứng dụng Frontend SPA (React 19 + Vite 6 + Tailwind CSS v4)
│   ├── src/
│   │   ├── features/inbox/             # AI Workflow Console V3.1 (Bento Grid, 4 States, Evidence Quotes)
│   │   ├── types/index.ts              # TypeScript strict interfaces (is_manual, operator_reason, proposal_id)
│   │   └── App.tsx                     # React 19 SPA Router
├── supabase/
│   ├── migrations/
│   │   ├── 20260911000000_add_provenance_and_proposals.sql # Migration Revisions, Proposals, Events
│   │   └── 20260912000000_harden_workflow_provenance.sql   # Migration entity_resolution, proposal_id, RPC
│   └── schema.sql                      # Schema chuẩn mực 20 bảng CSDL, RLS, Indexes, Triggers
├── GEMINI.md                           # System Instructions & Quy chuẩn tác nghiệp của AI Assistant
└── README.md                           # Bách khoa toàn thư kiến trúc hệ thống (Single Source of Truth)
```

---

## 🔬 PHẦN V: GIẢI PHẪU CHI TIẾT TỪNG FILE & HÀM XỬ LÝ BACKEND

### 5.1. Entrypoint, Cron Polling & Provenance Events (`main.py`)
- **Tệp tin:** [`backend/app/main.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/main.py)
- **Hàm `poll_workspace_long_tasks()` – Đồng Bộ Waiting Poll & Khóa Chặt Provenance:**
  - Quét bảng `bot_automation_tasks` tìm các task `execution_status = 'waiting_poll'`.
  - **Diệt tận gốc lỗi `Request #None`:** Nếu thiếu `request_id`, lập tức fail-closed cả bot task lẫn bước workflow, cập nhật `automation_workflows = 'failed'` và ghi audit event `failed` mang đầy đủ `proposal_id`.
  - **Đóng dấu `proposal_id` vào mọi event:** Đọc `proposal_id` từ `automation_workflows`, đảm bảo mọi sự kiện (`waiting`, `succeeded`, `failed`) trong `workflow_execution_events` đều có liên kết khóa ngoại tới proposal gốc.
  - Sau khi lấy kết quả batch thành công:
    - Ghi nhận sự kiện `succeeded` kèm `proposal_id`.
    - Đánh dấu bước `status = 'success'`, gán outputs và **tự động gọi `workflow_executor_service.execute_approved_workflow(workflow_id)` chạy ngầm** để tiếp tục các bước hạ nguồn.

---

### 5.2. Lõi Hệ Thống Core (`app/core/`)

#### [`security.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/security.py) (Strict Bearer JWT Authenticator)
- **`get_current_user_email` Dependency:**
  - Bắt buộc trích xuất email trực tiếp từ Bearer JWT token.
  - Cưỡng chế nghiêm ngặt whitelist domain `@dtt.vn`. Người dùng ngoài domain hoặc token giả mạo bị ném mã `403 Forbidden` / `401 Unauthorized` ngay lập tức.
  - Hỗ trợ fallback an toàn cho môi trường kiểm thử hermetic (`TESTING=true`).

#### [`task_coordinator.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/task_coordinator.py) (Optimistic Concurrency Control Lease)
- **`claim_workflow_lease(workflow_id, operator, lease_duration_seconds=600)`:**
  - Sử dụng **Optimistic Concurrency Control (OCC)**: Cập nhật có điều kiện trên trường `updated_at`. Nếu có 2 tiến trình cố chiếm lease cùng lúc (click đúp hoặc cron tranh chấp), tiến trình sau match 0 dòng và bị từ chối ngay lập tức (`Fail-closed`).
- **`update_workflow_heartbeat(workflow_id, lease_token)`:**
  - Nếu token không khớp hoặc lease bị tắt, ném ngay `RuntimeError` để dừng khẩn cấp worker đã mất quyền sở hữu lease.
- **`release_workflow_lease(workflow_id, lease_token, final_status)`:**
  - Chỉ giải phóng lease và cập nhật trạng thái kết thúc khi `lease_token` khớp chính xác 100% với token trên CSDL. Ngăn chặn triệt để worker cũ ghi đè trạng thái lên worker mới.

#### [`gemini.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/core/gemini.py) (Dual-Path AI & Revision Stamping)
- **`extract_operational_facts`:**
  - Đóng dấu trực tiếp `source_revision_id` vào từng `EvidenceSpan`.
  - Bóc tách đầy đủ cấu trúc `extracted_entities` có bằng chứng đi kèm trước khi chuyển qua bộ thẩm định `evidence_verifier`.

---

### 5.3. Định Nghĩa Schemas & Thẩm Định Bằng Chứng (`app/models/`, `app/services/`)

#### [`intent.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/models/intent.py)
- `EvidenceSpan`: Bắt buộc mang `source_revision_id`, `source_kind` (`ticket_body` | `attachment_extract`), `quote`, `start_offset`, `end_offset`, `is_verified`.
- `ExtractedEntity`: Đại diện thực thể có bằng chứng trích dẫn và cờ xác thực `is_verified`.
- `TypedEntities`: Khung dữ liệu thực thể chuẩn (`school_name`, `courses`, `repositories`, `users`, `target_email`, `git_role`).

#### [`evidence_verifier.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/evidence_verifier.py) (Deterministic Verifier & Factory)
- **Attachment Fail-Closed Invariant:** Tạm thời đánh dấu `is_verified = False` cho `source_kind == "attachment_extract"` nhằm ngăn chặn việc đối soát quote file đính kèm trên text thân email.
- **`load_verified_assessment(assessment_record, expected_revision_id)`:**
  - Factory function giải tuần tự an toàn từ `ticket_ai_assessments`.
  - Kiểm tra nghiêm ngặt `source_revision_id == expected_revision_id`. Bằng chứng không khớp revision bị loại bỏ.
  - Intent chỉ được giữ cờ `is_valid = True` khi có ít nhất 1 bằng chứng đã được verified.
  - Tự động dựng đối tượng `TypedEntities` đã kiểm chứng làm cơ sở dữ liệu duy nhất cho Planner.

---

### 5.4. Cổng Giao Tiếp REST API Endpoints (`app/api/v1/endpoints/workflows.py`)
- **Server-Side Safety Approval Gate (`POST /{workflow_id}/approve_and_run`):**
  - **Xác thực JWT Thật:** Nhận `current_user_email = Depends(get_current_user_email)`, bỏ qua trường `approved_by` trong body client.
  - **Kiểm tra `proposal_id`:** Workflow thiếu `proposal_id` bị từ chối phê duyệt ngay lập tức.
  - **Chống Phê Duyệt Proposal Superseded:** Proposal đã bị thay thế hoặc không ở trạng thái `ready_for_review` bị từ chối phê duyệt.
  - **Đối soát Plan:** Nếu các bước thực thi khác với plan do AI đề xuất, bắt buộc phải cung cấp `operator_reason` (tối thiểu 5 ký tự).
  - **Dual Freeze:** Đóng băng đồng thời `workflow_proposals.frozen_plan` và `automation_workflows.steps`.
  - **Ghi Audit Event `approved`:** Lưu sự kiện vào `workflow_execution_events` kèm đầy đủ `proposal_id`.
- **Khóa Bất Biến Bản Draft (`PUT /{workflow_id}`):**
  - Cấm tuyệt đối việc chỉnh sửa các bước sau khi workflow đã ở trạng thái `approved`, `running`, hoặc `success`.

---

### 5.5. Dịch Vụ Lập Kế Hoạch & Thực Thi DAG

#### [`workflow_planner.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workflow_planner.py)
- Sử dụng `load_verified_assessment()` đọc trực tiếp từ `ticket_ai_assessments`.
- Chỉ duyệt các ý định có `is_valid == True`.
- `_save_workflow_proposal()` Fail-Closed: Quăng `RuntimeError` khi insert thất bại, không tạo workflow draft mồ côi. Truyền `proposal_id` vào `automation_workflows`.

#### [`workflow_executor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workflow_executor.py)
- **Frozen Plan Single Source of Truth:** Bắt buộc đọc `frozen_plan` từ proposal đã được approved làm căn cứ thực thi.
- **Đóng dấu `proposal_id`:** 100% lời gọi `_record_execution_event()` đều truyền `proposal_id`.
- **Smart BFS Downstream Retry:** Khi retry một bước lỗi (`retry_workflow_step`), thuật toán BFS duyệt tìm và reset chính xác toàn bộ các bước hạ nguồn phụ thuộc về `waiting_dependency`, tuyệt đối không chạy lại các bước thượng nguồn độc lập đã thành công.

---

### 5.6. Bộ Điều Phối Workers & Atomic Intake (`ticket_processor.py`)
- **`compute_canonical_content_hash()`:** Chuẩn hóa text kết hợp băm danh sách canonical attachments snapshot (filename, url, size). File đính kèm đổi ➔ Hash đổi.
  - **`create_or_get_ticket_revision()`:** Chỉ gọi PostgreSQL RPC `create_or_get_inbox_ticket_revision` (khóa ticket bằng `FOR UPDATE`). Nếu RPC không tồn tại hoặc lỗi, intake thất bại có thể retry; backend không dùng fallback `MAX(revision_no)+1`.
- **`process_ticket_revision()`:** Truyền tường minh `source_revision_id=revision_id` vào AI Facts Extraction và `workflow_planner_service.plan_workflow_for_ticket(ticket_id, revision_id)`.

---

### 5.7. Bộ Kiểm Thử An Toàn Hermetic Pytest Suite (`backend/tests/`)
Hệ thống tích hợp bộ kiểm thử an toàn hermetic, chạy siêu tốc **1.01 giây** mà không tốn quota AI:
- `test_capability_contracts.py`: Contract Test 19 capabilities vs bot_executor.
- `test_execution_safety.py`: Kahn Topological Sort, `[PROTECTED]` Masking, Data Binding.
- `test_planning_policy.py`: Mở rộng 9 bài test kiểm định Zero-Mockup, EvidenceVerifier, Injection, Skewed Offset, Unsupported Capability.
- **Kết quả thực tế:** `15 passed in 1.01s` (100% Green).

---

## 🗄️ PHẦN VI: CƠ SỞ DỮ LIỆU SUPABASE POSTGRESQL 16 (20 BẢNG & PROVENANCE HẠ TẦNG)

### Chuỗi Truy Vết Bất Biến Đầy Đủ (Immutable Provenance Chain):
$$\text{Execution Event} \xrightarrow{\text{proposal\_id}} \text{Workflow} \xrightarrow{\text{proposal\_id}} \text{Proposal} \xrightarrow{\text{intent\_assessment\_id}} \text{Assessment} \xrightarrow{\text{ticket\_revision\_id}} \text{Revision} \xrightarrow{\text{ticket\_id}} \text{Source Ticket}$$

```sql
-- PostgreSQL Stored Procedure Atomic Allocation (Pha D)
SELECT * FROM create_or_get_inbox_ticket_revision(
    p_ticket_id := '...',
    p_content_hash := '...',
    p_raw_content := '...',
    p_attachments := '[]'::jsonb,
    p_source_updated_at := NOW()
);
```

---

## 🧭 PHẦN VII: CẨM NANG VẬN HÀNH & HƯỚNG DẪN TEST DÀNH CHO KỸ SƯ

### Giới hạn vận hành quan trọng

- File đính kèm chỉ có thể làm cơ sở cho action khi extraction snapshot thuộc đúng revision và quote/offset của nó đã được kiểm chứng. Nếu không, workflow phải là `needs_information`.
- Planner không được tự dựng repo URL, Git role, email đích, course hay số lượng user. Thiếu giá trị verified là thiếu thông tin.
- Backend phải cấu hình JWT issuer, audience và secret/public key/JWKS tương ứng với Supabase Auth trước khi bật approval production.
- Workflow legacy thiếu `proposal_id` phải được lập kế hoạch và phê duyệt lại, không được execute tự động.

### 1. Chạy Hermetic Pytest Suite
```powershell
cd backend
.\venv\Scripts\Activate.ps1
pytest -v
```

### 2. Kiểm Tra Build Frontend (Vercel Strict Typecheck)
```powershell
cd frontend
npm run build
```

---
*Tài liệu được cập nhật và kiểm định tự động thành công vào ngày 12 tháng 09 năm 2026 bởi Lead AI Engineer Nguyễn Mạnh Hùng và Co-pilot AI Senior Architect.*
