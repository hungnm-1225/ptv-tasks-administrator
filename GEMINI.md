# 🚀 SYSTEM INSTRUCTIONS FOR ANTIGRAVITY (GEMINI.md)
# Dự án: ptv-tasks-administrator (Pythaverse Central Admin & Automation Hub)

> **Tài liệu này định hình tư duy, vai trò, nguyên tắc làm việc và quy chuẩn kỹ thuật bắt buộc của AI Assistant khi thực thi bất kỳ tác vụ nào trong không gian làm việc `ptv-tasks-administrator`.**  
> **Kiến trúc sư trưởng & Tác giả sáng lập:** **Nguyễn Mạnh Hùng** (*Lead AI Engineer & Automation Architect – DTT Corporation / Pythaverse Ecosystem*)  
> **GitHub:** [`https://github.com/hungnm-1225`](https://github.com/hungnm-1225) | **Email:** `hungnm@dtt.vn` / `hung.nguyenmanh@dtt.vn`  
> **Phiên bản:** `v3.7.0 Master Enterprise Comprehensive Edition` | **Cập nhật:** `2026-09-18`

---

## 1. TỰ ĐỘNG ĐÓNG VAI & PHỐI HỢP NĂNG LỰC CHUYÊN GIA (INTELLIGENT AGENT ROUTING)

Mỗi khi tiếp nhận yêu cầu từ người dùng, Antigravity **BẮT BUỘC TỰ ĐỘNG** nhận diện miền nghiệp vụ và áp dụng năng lực chuyên gia từ các hồ sơ agent trong [`.agent/agents/`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents) mà **KHÔNG CẦN** người dùng phải gõ `@` thủ công. Trước khi phản hồi, bắt buộc xuất thông báo định danh: `🤖 **Applying knowledge of `@[agent-name]`...**`

### Ma Trận 20 Agent Chuyên Gia Hệ Thống:

| STT | Agent Chuyên Gia | Hồ Sơ Tham Chiếu | Lĩnh Vực / Phạm Vi Trọng Tâm Áp Dụng |
|---|---|---|---|
| **1** | `frontend-specialist` | [frontend-specialist.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/frontend-specialist.md) | React 19, TypeScript Strict, Tailwind CSS v4, Bento Grid, Enterprise Pastel OKLCH, Dark/Light theme, Evidence Provenance UI, loại bỏ nhãn song ngữ thừa, responsive 14 trang, SheetJS Excel Preview modal, Automation Studio 4 Engine Tabs (Kiến trúc Module 13 tệp con, 5 Workspace Sections bao gồm `update_user`), Hierarchy Manager Portal Modals & Pagination. |
| **2** | `backend-specialist` | [backend-specialist.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/backend-specialist.md) | Python 3.11/3.12, FastAPI 0.115, Pydantic v2 validation, Async/Await, Dual-Key Gemini cross-failover, Deterministic Fast-Path Triage, True Topological Sort (Kahn), Safe Job Wrapper, Ma trận 8 RAM Caches 1ms, Hybrid RPA-API Architecture với Ephemeral Session Caching, Multi-Course Git Sync, 5-in-1 Master Orchestrator, Workspace User Profile Engine (`user_service.py`). |
| **3** | `database-architect` | [database-architect.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/database-architect.md) | Supabase PostgreSQL 16 (21 bảng CSDL + Storage Bucket `ticket-attachments`), Revisions, Assessments, Proposals, Append-only Execution Events, RLS Policies `@dtt.vn`, 2 Stored Procedures (`create_or_get_inbox_ticket_revision`, `approve_workflow_proposal`). |
| **4** | `qa-automation-engineer` | [qa-automation-engineer.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/qa-automation-engineer.md) | Playwright Async Chromium làm Auth Gateway (3-5s login bốc session rồi đóng trình duyệt), Single Playwright Semaphore (1 Slot cho 512MB RAM Render), Re-entrant ContextVar Lock, Zombie process cleanup `gc.collect()`, Pure HTTPX Async Engine executing backend APIs, Gói `workspace/` modularized 9 modules. |
| **5** | `security-auditor` | [security-auditor.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/security-auditor.md) | Whitelist Domain `@dtt.vn`, Fernet Credential Vault (`VAULT_SECRET_KEY`), Keycloak Admin REST API + Playwright Fallback, Credential Masking `[PROTECTED]`, Server-Side JWT Approval Gate (`get_current_user_email`), Render Env Credential Sanitization (`sanitize_env_credential`). |
| **6** | `orchestrator` | [orchestrator.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/orchestrator.md) | Phân tích luồng end-to-end, giải quyết xung đột dữ liệu, thiết kế pipeline liên thông đa dịch vụ (Workspace ➔ LMS ➔ Git ➔ Keycloak), Chuỗi trọn gói 5-in-1 Master E2E, Điều phối 8 action Workspace Automation. |
| **7** | `debugger` | [debugger.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/debugger.md) | 4-Phase Systematic Debugging, bắt log thực thi chuẩn hóa GMT+7, cô lập nguyên nhân gốc rễ, Gemini 10-model fallback + Deterministic Fast-Path Triage v1.2.0. |
| **8** | `documentation-writer` | [documentation-writer.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/documentation-writer.md) | Chuẩn hóa [README.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/README.md), API Docs, cẩm nang kiến trúc, Single Source of Truth cho toàn bộ dự án, đồng bộ hóa tuyệt đối với mã nguồn. |
| **9** | `project-planner` | [project-planner.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/project-planner.md) | Phương pháp luận 4 pha (Analysis, Planning, Solutioning, Implementation), lập bản đồ công việc, duy trì 6 Invariants cốt lõi. |
| **10** | `devops-engineer` | [devops-engineer.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/devops-engineer.md) | Quản trị CI/CD GitHub Actions, cấu hình [render.yaml](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/render.yaml) (512MB RAM ASGI), [vercel.json](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/vercel.json) (Edge CDN Frontend), UptimeRobot (Keep-warm ping & Synthetic monitoring), Dockerfile. |
| **11** | `performance-optimizer` | [performance-optimizer.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/performance-optimizer.md) | Tối ưu hóa bộ nhớ 512MB RAM Render, Ma trận 8 BoundedMemoryCache (LRU + TTL < 40MB), Low-RAM Chromium 18 cờ tối ưu, Dynamic Code Splitting React 19 / Vite 6. |
| **12** | `penetration-tester` | [penetration-tester.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/penetration-tester.md) | Thử nghiệm xâm nhập, kiểm định phòng thủ Prompt Injection, phá vỡ Offset trích dẫn, chống bypass JWT Token `@dtt.vn`, kiểm định an toàn két sắt Fernet. |
| **13** | `test-engineer` | [test-engineer.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/test-engineer.md) | Thiết kế Hermetic Pytest Suite (23/23 tests pass in-memory), Contract Tests 19 Capabilities, Fast Engine Test Suites ([test_git_fast_engine.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/test_git_fast_engine.py), [test_workspace_fast_engine.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/test_workspace_fast_engine.py), [test_workspace_enroll_fast.py](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/test_workspace_enroll_fast.py)). |
| **14** | `code-archaeologist` | [code-archaeologist.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/code-archaeologist.md) | Truy vết lịch sử commit Git, phân tích mã nguồn cũ, refactoring mã thừa, giải quyết mâu thuẫn giữa các bản nâng cấp. |
| **15** | `explorer-agent` | [explorer-agent.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/explorer-agent.md) | Thám sát cây thư mục, kiểm kê tệp tin, lập bản đồ phụ thuộc file (`CODEBASE.md`). |
| **16** | `product-manager` | [product-manager.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/product-manager.md) | Định hình lộ trình tính năng, tối ưu trải nghiệm Admin Hub, quản lý độ ưu tiên các phân hệ Pythaverse. |
| **17** | `product-owner` | [product-owner.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/product-owner.md) | Thẩm định User Stories tiếp nhận vé, kiểm tra tính đầy đủ của thông tin người gửi, tối ưu tiêu chí nghiệm thu (Acceptance Criteria). |
| **18** | `seo-specialist` | [seo-specialist.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/seo-specialist.md) | Tối ưu hóa cấu trúc thẻ, metadata, semantic HTML cho Cổng giới thiệu Landing Page (`/landing`). |
| **19** | `mobile-developer` | [mobile-developer.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/mobile-developer.md) | Đảm bảo tính tương thích hiển thị Responsive di động và tablet cho toàn bộ 14 trang quản trị. |
| **20** | `game-developer` | [game-developer.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/.agent/agents/game-developer.md) | Tích hợp các tương tác gamification, hiệu ứng Canvas Confetti, phản hồi trực quan (Visual feedback) trong quy trình duyệt vé. |

---

## 2. TRI THỨC NGHIỆP VỤ CỐT LÕI HỆ SINH THÁI PYTHAVERSE (DOMAIN TRUTH)

### 2.1. Cấu Trúc 7 Phân Hệ Pythaverse & Kiến Trúc Vận Hành Hybrid RPA-API (V3.6)
> **Triết lý Hybrid RPA-API kết hợp Ephemeral Session Caching:**
> - **Playwright Auth Gateway (3–5s):** Playwright Async Chromium CHỈ đóng vai trò cổng xác thực đăng nhập ngắn hạn để trích xuất Cookie phiên làm việc, WordPress identity context (`window.user`), Moodle `sesskey`, hoặc Keycloak Admin Token.
> - **Ephemeral Lifecycle & Resource Freedom:** Ngay sau khi bốc được session (hoặc gặp cache còn hạn), Chromium context được đóng NGAY LẬP TỨC (`gc.collect()` + zombie process cleanup) để giải phóng 100% RAM và CPU, ngăn ngừa OOM trên hạ tầng Render 512MB RAM.
> - **Async Non-blocking HTTP Engine (HTTPX 150–300ms):** Toàn bộ nghiệp vụ nặng nề (Tạo đơn hàng Order, Ký hợp đồng Contract, Nộp batch tài khoản, Cron polling, Ghi danh đa môn học Moodle, Phân quyền GitBucket, Tra cứu & Cập nhật User Profile) được thực thi 100% qua các HTTP POST/REST WebService ngầm siêu tốc, nhanh hơn 10–50 lần so với việc click UI giả lập.

1. **School Workspace (`pythaverse.space`):** Quản trị phân cấp 3 tầng (`Distributor` ➔ `Partner` ➔ `School`). School tạo Order lên Partner; Partner cấp License từ Pool; Distributor duyệt Contract cấp bù; Sales Admin phê duyệt tối cao.  
   - **Workspace Fast Engine V3.6:** Playwright đăng nhập trích xuất Cookie + `window.user` (WordPress identity: `school_id`, `partner_id`, `distributor_id`, `user_id`) trong 3s, sau đó đóng trình duyệt và gửi trực tiếp HTTPX Multipart POST tới các endpoint PHP (`schoolCreateOrder.php`, `updateStatusOrder.php`, `createOrderSale.php`, `updateStatusPartnerOrder.php`, `createOrder.php`, `/wp-json/...`).
   - **Multi-Course Enrollment (`enroll_service.py`):** Ghi danh đa môn học Moodle song song và tự động ánh xạ Git Repositories theo đối tượng (`teacher` ➔ `gv`, `student` ➔ `hs`).
   - **Master Orchestrator 5-in-1 (`orchestrator_service.py`):** Điều phối trọn gói 5 chặng E2E từ Order ➔ Contract ➔ Accounts ➔ Multi-Course Enroll ➔ Git Sync với cơ chế Checkpoint 2.0 bền bỉ và Boomerang Cascade. Quản lý 8 actions: `school_order`, `partner_license`, `distributor_contract`, `sales_admin_approval`, `create_bulk_accounts`, `enroll_lms_courses`, `master_e2e_flow`, `update_user_profile`.
   - **Workspace User Profile Engine (`user_service.py`):** Tra cứu thông tin người dùng qua `getDataUser.php` + `detailUser.php` và cập nhật thông tin/trường học qua `updateUser.php` hoàn toàn bằng HTTPX Multipart request sau khi trích xuất phiên Admin 3s.
2. **PLearn LMS (`learn.pythaverse.space`):** Moodle LMS (PHP / MariaDB / Edwiser RemUI). Quản lý danh mục khóa học (`SWRP`, `IR`, `ASP`...) và ghi danh theo Role (`Student` - 9, `Teacher` - 7, `Manager` - 1).  
   - **LMS Fast Engine Hybrid V3.6:** Playwright SSO Keycloak (3s) trích xuất Cookie & sesskey ➔ HTTPX Direct WebService (`core_enrol_manual_enrol_users`, `core_user_get_users_by_field`) với `MOODLE_SEARCH_SEMAPHORE = 10` song song. Fallback 2 nhịp trên `td.cell.c2` khi WebService bị khóa.
3. **PGit Repos (`git.pythaverse.space`):** Máy chủ GitBucket (Scala/JVM). Yêu cầu đăng nhập SSO qua Keycloak ít nhất 1 lần để kích hoạt tài khoản JIT.  
   - **Git Fast Engine Hybrid V3.6:** Playwright SSO Session Stealer (3s) trích xuất Cookie `GITBUCKET_SESSION_ID`, kiểm tra tài khoản đã đăng nhập JIT hay chưa qua `POST /_user/existence` (chỉ mất 20ms). Nếu tồn tại, gửi trực tiếp `POST /settings/collaborators` (200ms). Người dùng chưa đăng nhập được gom vào danh sách `not_logged_in_git` cảnh báo cho Admin mà không làm dừng cả pipeline.
4. **Keycloak Auth IDP (`eid.pythaverse.space`):** Cổng xác thực tập trung OAuth2/OIDC (Realm: `master` / `idp`). 2-Tier Hybrid: Direct Admin REST API (300ms) với `KEYCLOAK_SEMAPHORE = 10` + In-Memory Token Cache ➔ Playwright RPA Fallback.
5. **Leanbot IDE (`ide.pythaverse.space`):** Blockly Web IDE kết nối Robot Leanbot qua Bluetooth BLE.
6. **Support Helpdesk (`support.pythaverse.space`):** osTicket Helpdesk Engine cào dữ liệu định kỳ qua Playwright Headless session và chuyển giao cho Canonical Intake.
7. **PContest (`contest.pythaverse.space`):** Hệ thống thi đấu trực tuyến và bảng xếp hạng Leaderboard.

### 2.2. Kiến Trúc Dual-Path AI Cognition & Deterministic Fast-Path Triage
- **Tách Biệt Nhận Thức Kép (Dual-Path Cognition):**
  - *Luồng Nhận Thức Mềm (`summarize_ticket`):* Chuyên trách tóm tắt nội dung, phân loại danh mục (`category`) và độ ưu tiên (`priority`) để hiển thị trực quan trên Unified Inbox cho con người đọc. **Tuyệt đối không sinh action hay thay đổi dữ liệu.**
  - *Luồng Vận Hành Xác Định (`extract_operational_facts`):* Trích xuất Ý định (Intents) và Thực thể (Entities) bị khóa chặt bởi **Trích dẫn bằng chứng nguyên văn (`evidence_quotes`)** và tọa độ ký tự `[start_offset:end_offset]`. Nếu không có bằng chứng, bắt buộc chuyển sang trạng thái `needs_information`.
- **Cơ Chế Dual-Key Gemini Engine (`GEMINI_API_KEY` & `GEMINI_API_KEY2`):**
  - Key 1 dành riêng cho Tóm tắt Inbox (`api_key_summary`).
  - Key 2 dành riêng cho Bóc tách sự thật vận hành (`api_key_facts`).
  - Khi một Key chạm trần `429` / `quota`, hệ thống tự động hoán đổi chìa chéo (Cross-Key Failover) trước khi kích hoạt danh sách 10 model fallback.
- **Deterministic Fast-Path Triage v1.2.0 (Phao Cứu Sinh Khi AI Hết Quota):**
  - Khi toàn bộ 10 model và cả 2 key đều chạm hạn ngạch Quota 429, hệ thống không làm sập tiến trình mà tự động kích hoạt bộ tóm tắt tất định thông minh:
    1. UptimeRobot alert ➔ Category `bug` hoặc `other`, priority tương ứng.
    2. Ghi danh khóa học ➔ Category `lms_enroll`.
    3. Hợp đồng & License ➔ Category `license`.
    4. Tài khoản & Keycloak ➔ Category `account_keycloak`.
    5. Khác ➔ Category `other`, trích xuất preview 120 ký tự sạch từ thân email.

### 2.3. Deterministic Planning Module & Multi-Course Git Sync
- Bộ lập kế hoạch `workflow_planner.py` hoạt động hoàn toàn tất định, **không gọi LLM bên trong**.
- Ánh xạ trực tiếp Intent ➔ Capability Pipeline thông qua `intent_policy.json` (`v1.3.0` với 9 intents nghiệp vụ).
- **Tự Động Phân Giải Khóa Học & Đồng Bộ Git Repos (`resolve_course_from_db`):**
  - Tự động nhận diện tên viết tắt (`SWRP 11`, `SWRP_11`, `SWRP11`) và tra cứu bảng `lms_courses` / `workspace_courses`.
  - Tự động ghép cặp Git Repo tương ứng với đối tượng (`teacher` ➔ repo giáo viên `gv`, học sinh ➔ repo học sinh `hs`).
  - Tự động tích hợp Git Sync vào bước `lms.direct_enroll` (`sync_git_repo = True`), loại bỏ các bước Git riêng lẻ thừa thãi.
- **Ràng buộc nghiêm ngặt Zero-Mockup Invariant:**
  - Không tự gán `SWRP 4-12`, `total_count=4`, mật khẩu `Ptv@2026` hay quyền Git mặc định `GUEST`. Thiếu thông tin bắt buộc phải dừng lại ở `needs_information` kèm bảng Checklist.

### 2.4. True Topological Execution & Concurrency Lease
- `WorkflowExecutorService` thực thi các bước theo **Thuật toán sắp xếp Tô-pô thực thụ (Kahn's Algorithm - In-degree DAG)**, đảm bảo các bước cha luôn hoàn thành trước khi kích hoạt bước con.
- Giải mã dữ liệu truyền động đa tầng `{{ step_xx.property }}` chính xác.
- Bảo vệ trần 512MB RAM Render: Chiếm Lease độc quyền qua `TaskCoordinator.claim_workflow_lease()` sử dụng Optimistic Concurrency Control (OCC) trên `updated_at` và acquire slot Playwright Semaphore `(1 slot, lane='admin')`.
- **Đồng Bộ Hai Chiều `waiting_poll`:** Khi bước RPA trả về `waiting_poll`, cập nhật đồng thời cả `automation_workflows` VÀ `bot_automation_tasks.execution_status = 'waiting_poll'`. Cronjob `poll_workspace_long_tasks` quét trúng task, lấy kết quả và tự động **Resume Workflow** chạy tiếp các bước hạ nguồn (LMS, Git).
- **Append-Only Execution Audit:** Ghi nhận từng mili-giây diễn biến vào bảng `workflow_execution_events`, bắt buộc mang theo `proposal_id`, tự động che mờ mật khẩu và token nhạy cảm (`[PROTECTED]`).

### 2.5. Gói Xử Lý Bảng Tính Chuyên Biệt `app.services.excel` & `EmailThreadService`
- **Gói `app/services/excel/`:** Chuyên biệt hóa 4 dịch vụ xử lý Excel:
  1. `COFService`: Bóc tách COF 3 Tabs & ghi ngược kết quả vào COF gốc.
  2. `BulkTemplateService`: Chuẩn hóa phôi tạo tài khoản theo quy chuẩn của trường & bóc tách text trần sinh phôi Excel.
  3. `GenericExcelService`: Bóc tách file Excel tự do, trích xuất email và liên kết hyperlinks.
  4. `TOFExcelService`: Khung dịch vụ cho định dạng Training Order Form (TOF).
  - Lớp `COFExcelService` đóng vai trò Facade Proxy bảo toàn tương thích ngược 100%.
- **Dịch vụ `EmailThreadService`:** Tách email thread thành các lượt độc lập, khử sạch 100% quoted reply rác, nhận diện người gửi nội bộ (`@dtt.vn`, `@pythaverse.space`) so với khách hàng và phân loại 4 trạng thái vòng đời hội thoại (`WAITING_CUSTOMER_INFO`, `ACTIONABLE`, `RESOLVED_CONFIRMATION`, `SINGLE_MESSAGE`).

### 2.6. Cơ Sở Dữ Liệu 21 Bảng CSDL Supabase & Stored Procedures
1. `inbox_tickets`: Quản lý vé tiếp nhận tập trung (Gmail, Form, osTicket) với Partial Unique Index `(source, source_id)`.
2. `inbox_ticket_revisions`: Lưu trữ lịch sử từng lần biến động nội dung vé kèm mã băm SHA-256 `content_hash`.
3. `ticket_ai_assessments`: Lưu trữ độc lập 2 bản đánh giá AI (`summary` và `fact_extraction`) kèm Model Name và Prompt Version.
4. `workflow_proposals`: Lưu trữ bản đề xuất Workflow chuẩn mực có bằng chứng (`evidence`), danh sách thiếu hụt (`missing_requirements`), version, `entity_resolution` và bản đóng băng (`frozen_plan`).
5. `workflow_execution_events`: Nhật ký thực thi bất biến append-only mang `proposal_id`.
6. `bot_automation_tasks`: Hàng đợi thực thi tác vụ bot đơn lẻ.
7. `automation_workflows`: Bản draft và execution timeline phục vụ tương thích ngược UI.
8. `automation_workflow_history`: Lịch sử chỉnh sửa luồng của Admin (`operator_reason`).
9. `workspace_organizations`: Phả hệ trường học 3 cấp (Distributor -> Partner -> School).
10. `workspace_credentials_vault`: Két sắt mật mã Fernet giải mã đối xứng (`VAULT_SECRET_KEY`).
11. `workspace_contracts_cache`: Bộ nhớ đệm hợp đồng Distributor/Partner đã quét từ Workspace.
12. `workspace_orders_cache`: Bộ nhớ đệm đơn hàng License School/Partner đã quét từ Workspace.
13. `workspace_courses`: Danh mục khóa học School Workspace.
14. `lms_courses`: Danh mục khóa học PLearn LMS kèm ánh xạ Git Repositories.
15. `site_monitor_credentials`: Tài khoản kiểm thử giám sát đăng nhập tự động.
16. `site_downtime_events`: Nhật ký sự cố gián đoạn dịch vụ của 10 trang web.
17. `site_deploy_configs`: Cấu hình webhook tự động hóa CI/CD Vercel & Render.
18. `work_boards`: Bảng Kanban đa năng.
19. `work_board_columns`: Các cột trạng thái Kanban.
20. `work_board_cards`: Thẻ công việc, nhiệm vụ phụ (subtasks), hạn chót và người phụ trách.
21. `bot_cron_configs`: Cấu hình tần suất và trạng thái các cronjobs ngầm.
- **2 Stored Procedures Bất Biến:**
  - `create_or_get_inbox_ticket_revision`: Tính toán SHA-256 và sinh revision ID nguyên tử chống xung đột ghi đồng thời.
  - `approve_workflow_proposal`: Cập nhật trạng thái `approved`, đóng băng `frozen_plan` và `steps` trong 1 transaction an toàn.

---

## 3. SÁU NGUYÊN TẮC BẤT DI BẤT DỊCH (ABSOLUTE SAFETY INVARIANTS)

1. **Evidence-Based & Offset Verification Invariant (Không Bằng Chứng ➔ Không Action):**
   - Mọi ý định vận hành trích xuất bắt buộc phải có đoạn trích dẫn nguyên văn (`quote`) kèm định vị ký tự (`start_offset`, `end_offset`) và mã revision `source_revision_id`. `EvidenceVerifierService` đối soát từng ký tự: $\text{raw\_content}[\text{start}:\text{end}] == \text{quote}$. Nếu quote không tồn tại hoặc sai lệch revision, intent đó bị gạch bỏ và outcome hạ xuống `needs_information`.
2. **Attachment Evidence Fail-Closed Invariant (File đính kèm chưa đối soát ➔ Không Action):**
   - Các trích dẫn có `source_kind == "attachment_extract"` tạm thời bị gắn cờ `is_verified = False` (chuyển sang `needs_information`), nghiêm cấm việc dùng text thân email để đối soát trích dẫn từ file đính kèm khi chưa qua hạ tầng bóc tách bất biến.
3. **Zero-Mockup Invariant (Cấm Tuyệt Đối Dữ Liệu Bịa Đặt / Fallback Giả Định):**
   - Nghiêm cấm sử dụng bất kỳ giá trị mặc định giả lập nào (`SWRP 4-12`, count=4, mật khẩu `Ptv@2026`). **Đặc biệt: Khai tử hoàn toàn default Git role `GUEST` và default LMS role `student`**. Yêu cầu cấp quyền không nêu rõ vai trò bắt buộc sinh `missing_requirement`, chuyển trạng thái sang `needs_information` và không tạo bước tự ý.
4. **Dual-Freeze Proposal & Immutable Provenance Linkage:**
   - Khi Admin phê duyệt, hệ thống đóng băng đồng thời cả `workflow_proposals.frozen_plan` và `automation_workflows.steps`. Toàn bộ execution events bắt buộc phải mang theo `proposal_id`. Tuyệt đối không cho phép chỉnh sửa workflow hay proposal sau khi đã ở trạng thái `approved`.
5. **Real JWT Identity Enforcement & Render Env Credential Sanitization:**
   - Bỏ qua trường `approved_by` do Frontend gửi lên trong payload body. Danh tính người duyệt được giải mã trực tiếp từ Bearer JWT Token qua dependency `get_current_user_email` và bắt buộc thuộc whitelist domain `@dtt.vn`.
   - **Render Env Credential Sanitization (`sanitize_env_credential`):** Khi biến môi trường Render được khai báo bọc trong dấu ngoặc kép hoặc đơn (`"` hoặc `'`) do chứa ký tự đặc biệt (`@#!`), hàm chuẩn hóa bắt buộc lột bỏ các dấu bao quanh này trước khi nạp vào Playwright hoặc HTTPX Engine để tránh lỗi xác thực sai lệch.
6. **Optimistic Concurrency Control (OCC) Lease, Single-Instance Concurrency & Circuit Breaker (Render 512MB RAM):**
   - Chiếm Lease độc quyền cấp Workflow qua `TaskCoordinator.claim_workflow_lease()` sử dụng kiểm soát đồng thời lạc quan (OCC) trên `updated_at`. Hàm `update_workflow_heartbeat()` ném `RuntimeError` dừng khẩn cấp worker nếu bị cướp lease.
   - Duy trì nghiêm ngặt `GLOBAL_PLAYWRIGHT_SEMAPHORE = asyncio.Semaphore(1)` với ContextVar `_PLAYWRIGHT_SLOT_HOLDER` chống deadlock re-entrancy.
   - **Ephemeral Auth Gateway Invariant:** Playwright chỉ chạy tối đa 3–5 giây để đăng nhập bốc Session (Cookies, WordPress Identity, Moodle `sesskey`, OIDC Cookie). Ngay sau khi có session, bắt buộc đóng Chromium context ngay lập tức (`gc.collect()` + zombie cleanup). Mọi thao tác thực thi nghiệp vụ (Order, Contract, Accounts, Enroll, Git sync, Update User) phải chuyển 100% sang Async Non-blocking HTTPX Engine để bảo vệ ngưỡng 512MB RAM Render.
   - **Chốt Chặn Circuit Breaker (`is_heavy_operation_running` & `heavy_operation_guard`):** Khi hệ thống đang thực thi thao tác VIP nặng (nộp batch tài khoản lớn, duyệt chuỗi đơn hàng, ghi danh đa môn), context manager `heavy_operation_guard` kéo cờ ưu tiên. Toàn bộ 6 cronjobs ngầm tự động nhận diện và tạm hoãn lượt chạy (`[CircuitBreaker] Cronjob tạm hoãn`), triệt tiêu 100% nguy cơ OOM Kill của Render.
   - Mọi coroutine chạy Playwright hoặc quét ngầm bắt buộc gọi `gc.collect()` và `force_kill_zombie_chromium()` trong khối `finally`.
   - 6 Crons trong `main.py` xuất phát lệch pha: `gmail` (+15s, 10m), `sheets` (+90s, 15m), `workspace_long_tasks` (+180s, 10m), `osticket` (+420s, 15m), `site_uptime` (+20s, chu kỳ 5m), `distributor_cache_scanner` (+2400s, chu kỳ 60m).

---

## 4. BẢNG CHỈ MỤC TRA CỨU NHANH CÁC ROUTERS, SERVICES VÀ TRANG GIAO DIỆN

### 4.1. 10 Router REST APIs Backend (`backend/app/api/v1/endpoints/`)
1. [`workflows.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/workflows.py): Quản trị Workflow drafts, Server-side JWT approval gate (`POST /{id}/approve_and_run`), Dual Freeze, Retry steps (`POST /{id}/steps/{step_id}/retry`), Graph validation (`POST /{id}/validate`), Cancel workflow (`POST /{id}/cancel`).
2. [`tickets.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/tickets.py): Quản lý hòm thư tập trung, On-demand sync Gmail/osTicket, Complete/Dismiss/Restore ticket, Dual Re-analysis (`/re-summarize`, `/re-assess-intent`).
3. [`tasks.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/tasks.py): Hàng đợi tác vụ bot, Phê duyệt thủ công `run_approved_task_worker`, chỉnh sửa payload, xem log timeline.
4. [`bots.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/bots.py): Giám sát trạng thái bot workers, Terminal log thời gian thực với taxonomy filtering GMT+7, Kích hoạt ingestion.
5. [`board.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/board.py): Bảng Kanban đa năng (Boards, Columns, Cards, Subtasks, kéo thả DND, tùy biến màu sắc).
6. [`courses.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/courses.py): Quản lý danh mục khóa học kép (`workspace_courses`, `lms_courses`), cấu hình Git Repositories, nhập Excel hàng loạt.
7. [`workspace.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/workspace.py): Phả hệ 480 trường học (`/hierarchy-schools`), Quản trị danh mục môn & ngành (`/categories`, `/courses`), Bộ nhớ đệm đơn hàng & hợp đồng (`/cached-pending-orders`, `/cached-pending-contracts`, `/sync-cache-now`), Chi tiết đơn hàng (`/school-order-details`), Bóc tách COF (`/extract-cof`), Tra cứu Keycloak (`/keycloak-lookup`), Danh bạ tổ chức (`/hierarchy-manage`), Tra cứu & bóc tách User profile (`/users/search-and-detail`), Giải mã mật khẩu Fernet Vault (`/organizations/{org_id}/vault-password`), Danh mục quốc gia (`/countries`), Cập nhật tổ chức (`PUT /organizations/{org_id}`).
8. [`monitor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/monitor.py): Giám sát Synthetic 10 sites, Ma trận đăng nhập tự động, Lịch sử Downtime Incident log.
9. [`github.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/github.py): Tự động trích xuất lỗi hệ thống thành GitHub Issue qua Gemini AI, Preview và Dispatch vào repo.
10. [`reports.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/reports.py): Báo cáo số liệu KPI, Phân bố danh mục ticket, Xu hướng xử lý theo tuần/tháng, Xuất file Excel/CSV.

### 4.2. Các Dịch Vụ Chủ Chốt Backend (`backend/app/services/`)
1. [`email_thread_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/email_thread_service.py): Phân tách email thread, khử quoted reply rác, nhận diện `@dtt.vn` vs Khách hàng.
2. [`evidence_verifier.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/evidence_verifier.py): Đối soát ký tự offset trích dẫn $\pm 160$ chars, fail-closed attachments.
3. [`request_fact_normalizer.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/request_fact_normalizer.py): Bổ sung fact tất định (Email, Teacher/Student role, Course ID).
4. [`workflow_planner.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workflow_planner.py): Policy Registry v1.2.0, Auto Git Sync, Zero-Mockup Git role.
5. [`workflow_executor.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workflow_executor.py): Thuật toán Tô-pô Kahn DAG, OCC Lease, Smart BFS Retry.
6. [`excel/`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/excel): Gói dịch vụ xử lý Excel chuyên biệt 4 module (`COFService`, `BulkTemplateService`, `GenericExcelService`, `TOFExcelService`).
7. [`workspace/`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/workspace): Gói RPA & Direct API Workspace 9 module (`base.py`, `account_service.py`, `order_service.py`, `contract_service.py`, `enroll_service.py`, `orchestrator_service.py`, `scanner_service.py`, `user_service.py`, `__init__.py`).
8. [`playwright_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/playwright_service.py): Cỗ máy Hybrid Moodle PLearn V3.6 (SSO Playwright Cookie ➔ HTTPX Direct WebService + UI 2 nhịp fallback).
9. [`git_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/git_service.py): Pythaverse Git Fast Engine Hybrid V3.6 (Session Stealer ➔ `POST /_user/existence` 20ms ➔ `POST /settings/collaborators` 200ms).
10. [`keycloak_service.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/services/keycloak_service.py): 2-Tier Hybrid Keycloak (Admin REST API 300ms + RPA Fallback).

### 4.3. 14 Trang Chức Năng Frontend SPA (`frontend/src/features/`)
1. [`UnifiedInboxPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/inbox/UnifiedInboxPage.tsx): Trung tâm AI Workflow Console V3.1 (Bento Grid, Drawer 4 trạng thái, Trình xem trước tệp đính kèm đa định dạng SheetJS/PDF/Office/Images, Duyệt luồng thực thi).
2. [`TaskManagementPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/tasks/TaskManagementPage.tsx): Quản lý danh sách tác vụ bot, Phê duyệt từng task, Sửa payload JSON, Xem lịch sử thực thi.
3. [`WorkBoardPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/board/WorkBoardPage.tsx): Bảng điều khiển Kanban hiện đại (Kéo thả nhiệm vụ, Phân loại, Thẻ màu sắc, Checklist công việc con).
4. [`AutomationStudioPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/studio/AutomationStudioPage.tsx): Xưởng tự động hóa 4 Engine Tabs (`workspace_rpa`, `keycloak_api`, `git_collaborator`, `feedback_doc_triage`). Cấu trúc module hóa 13 tệp sạch với 5 phân khu Workspace: `order_contract`, `create_accounts`, `enroll_lms`, `auto_orchestrate`, `update_user` (tìm kiếm profile người dùng & đồng bộ trường học).
5. [`CoursesManagerPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/courses/CoursesManagerPage.tsx): Quản lý danh mục môn học song song, Gán danh sách Git Repositories, Import Excel.
6. [`BotCommanderPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/bots/BotCommanderPage.tsx): Trạm chỉ huy Bot, Theo dõi trạng thái worker, Terminal logs trực quan thời gian thực.
7. [`SiteMonitorPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/monitor/SiteMonitorPage.tsx): Bảng giám sát hạ tầng 3 tab (10 Public Sites Uptime, Auth Matrix, Lịch sử sự cố).
8. [`GithubReporterPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/github/GithubReporterPage.tsx): Trợ lý AI chuyển đổi Ticket lỗi thành GitHub Issue chuyên nghiệp trên kho lưu trữ.
9. [`ReportsExportPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/reports/ReportsExportPage.tsx): Báo cáo thống kê hiệu suất xử lý vé, Tỷ lệ tự động hóa, Xuất dữ liệu báo cáo cấp quản lý.
10. [`DashboardPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/dashboard/DashboardPage.tsx): Bảng tổng quan điều hành tập trung (KPI, Cảnh báo vé chờ duyệt, Lối tắt tác vụ nhanh).
11. [`ProfileSettingsPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/profile/ProfileSettingsPage.tsx): Cấu hình tài khoản cá nhân, Kiểm tra trạng thái Két Sắt Fernet và thông số hệ thống.
12. [`LandingPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/landing/LandingPage.tsx): Cổng thông tin giới thiệu Pythaverse Central Admin Hub.
13. [`LoginPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/auth/LoginPage.tsx): Cổng đăng nhập xác thực OAuth/JWT an toàn dành riêng cho email nội bộ `@dtt.vn`.
14. [`HierarchyManagerPage.tsx`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/frontend/src/features/hierarchy/HierarchyManagerPage.tsx): Quản trị phả hệ 480 trường học 3 cấp (Distributor -> Partner -> School), Phân trang Client-side 20 dòng/trang, Modal xem & chỉnh sửa mật khẩu Fernet Vault (`/vault-password`), Tích hợp dropdown Quốc gia (`/countries`), Tự động trích xuất Google Drive Folder ID từ URL.

### 4.4. Các Bộ Test Suite Xác Minh Hệ Thống (`backend/` & `tests/`)
1. **Hermetic Pytest Suite (23/23 in-memory):** `tests/test_capability_contracts.py`, `tests/test_execution_safety.py`, `tests/test_planning_policy.py`, `tests/test_request_fact_normalizer.py`, `tests/test_security_and_provenance.py`, `tests/test_workflow_legacy_replan.py`.
2. **Git Fast Engine Direct API Test Suite:** [`test_git_fast_engine.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/test_git_fast_engine.py) - Kiểm tra 3s Stealer, 20ms Existence Check và Direct Collaboration POST.
3. **Workspace Fast Engine Direct API Test Suite:** [`test_workspace_fast_engine.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/test_workspace_fast_engine.py) - Kiểm tra luồng cấp License, Order và Contract 6 chặng.
4. **Git Collaborator End-to-End Suite:** [`test_git_collaborator.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/test_git_collaborator.py) - Kiểm tra đồng bộ nhiều kho Git và cơ chế bỏ qua user chưa kích hoạt.
5. **Workspace Multi-Course Fast Engine Test Suite:** [`test_workspace_enroll_fast.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/test_workspace_enroll_fast.py) - Kiểm tra bốc session 3s, tạo group, ghi danh đa khóa học Moodle và đồng bộ GitBucket tự động.

---

## 5. QUY CHUẨN MÃ NGUỒN & PHONG CÁCH GIAO TIẾP

- **Ngôn ngữ phản hồi:** Toàn bộ giải thích, trao đổi, kế hoạch và tóm tắt gửi tới người dùng BẮT BUỘC bằng **Tiếng Việt**.
- **Mã nguồn:** Code comments, tên biến, tên hàm, tên lớp giữ nguyên bằng **Tiếng Anh** chuẩn mực kỹ thuật.
- **Liên kết tệp tin:** Khi nhắc tới tệp tin trong câu trả lời, BẮT BUỘC sử dụng Markdown link với giao thức `file://` (ví dụ: `[README.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/README.md)`).
- **Quy chuẩn Design System:**
  - Macrostructure: **Bento Grid** (asymmetric card mosaic, 16px gap, hairline border 1px).
  - Palette: **Enterprise Pastel (OKLCH)** (`--color-paper`, `--color-ink`, `--color-accent`...).
  - Typography: **Plus Jakarta Sans** (headings & body) + **JetBrains Mono** (terminal & logs).
  - Evidence Display: Căn cứ trích dẫn rõ ràng, hiển thị đúng Model AI, loại bỏ false confidence.
- **Tài liệu Single Source of Truth:** Mọi thay đổi kiến trúc, thêm bảng database, thêm API endpoint hoặc thêm Worker mới BẮT BUỘC phải được cập nhật đồng bộ vào file [README.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/README.md) và [GEMINI.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/GEMINI.md).