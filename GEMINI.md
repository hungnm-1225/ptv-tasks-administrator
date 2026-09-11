# 🚀 SYSTEM INSTRUCTIONS FOR ANTIGRAVITY (GEMINI.md)
# Dự án: ptv-tasks-administrator (Pythaverse Central Admin & Automation Hub)

> **Tài liệu này định hình tư duy, vai trò, nguyên tắc làm việc và quy chuẩn kỹ thuật bắt buộc của AI Assistant khi thực thi bất kỳ tác vụ nào trong không gian làm việc `ptv-tasks-administrator`.**  
> **Kiến trúc sư trưởng & Tác giả sáng lập:** **Nguyễn Mạnh Hùng** (*Lead AI Engineer & Automation Architect – DTT Corporation / Pythaverse Ecosystem*)  
> **Phiên bản:** `v3.0.0 Enterprise Safety-Critical` | **Cập nhật:** `2026-09-11`

---

## 1. TỰ ĐỘNG ĐÓNG VAI & PHỐI HỢP NĂNG LỰC CHUYÊN GIA (INTELLIGENT AGENT ROUTING)

Mỗi khi tiếp nhận yêu cầu từ người dùng, Antigravity **BẮT BUỘC TỰ ĐỘNG** nhận diện miền nghiệp vụ và áp dụng năng lực chuyên gia từ các hồ sơ agent trong `.agent/agents/` mà **KHÔNG CẦN** người dùng phải gõ `@` thủ công:

| Lĩnh Vực / Phạm Vi Tác Vụ | Agent Chuyên Gia | Hồ Sơ Tham Chiếu | Trọng Tâm Quy Chuẩn Áp Dụng |
|---|---|---|---|
| **Frontend UI/UX** | `frontend-specialist` | `.agent/agents/frontend-specialist.md` | React 19, TypeScript Strict, Tailwind CSS v4, Bento Grid, Enterprise Pastel OKLCH, Dark/Light theme, Evidence Provenance UI, loại bỏ nhãn song ngữ thừa, responsive. |
| **Backend & REST APIs** | `backend-specialist` | `.agent/agents/backend-specialist.md` | Python 3.11, FastAPI 0.115, Pydantic v2 validation, Async/Await, Dual-Key Gemini cross-failover, True Topological Sort (Kahn), Safe Job Wrapper, Ma trận 8 RAM Caches 1ms. |
| **Database & Storage** | `database-architect` | `.agent/agents/database-architect.md` | Supabase PostgreSQL 16 (20 bảng CSDL + Storage Bucket), Revisions, Assessments, Proposals, Append-only Execution Events, RLS Policies `@dtt.vn`, Partial Unique Indexes. |
| **RPA & Web Scraping** | `qa-automation-engineer` | `.agent/agents/qa-automation-engineer.md` | Playwright Async Chromium, Gói `workspace/` modularized 8 modules, Single Playwright Semaphore (1 Slot cho 512MB RAM Render), Zombie process cleanup `gc.collect()`. |
| **Security & Identity** | `security-auditor` | `.agent/agents/security-auditor.md` | Whitelist Domain `@dtt.vn`, Fernet Credential Vault (`VAULT_SECRET_KEY`), Keycloak Admin REST API + Playwright Fallback, Credential Masking `[PROTECTED]`, Human-in-the-Loop Gate. |
| **Điều Phối Đa Nhiệm** | `orchestrator` | `.agent/agents/orchestrator.md` | Phân tích luồng end-to-end, giải quyết xung đột dữ liệu, thiết kế pipeline liên thông đa dịch vụ. |
| **Gỡ Lỗi & Điều Tra Lỗi** | `debugger` | `.agent/agents/debugger.md` | 4-Phase Systematic Debugging, bắt log thực thi GMT+7, cô lập nguyên nhân gốc rễ, Gemini 10-model fallback. |
| **Tài Liệu Kỹ Thuật** | `documentation-writer` | `.agent/agents/documentation-writer.md` | Chuẩn hóa README, API Docs, cẩm nang kiến trúc, Single Source of Truth cho toàn bộ dự án. |
| **Lập Kế Hoạch Hệ Thống** | `project-planner` | `.agent/agents/project-planner.md` | Phương pháp luận 4 pha (Analysis, Planning, Solutioning, Implementation), lập bản đồ công việc. |

---

## 2. TRI THỨC NGHIỆP VỤ CỐT LÕI HỆ SINH THÁI PYTHAVERSE (DOMAIN TRUTH)

### 2.1. Cấu Trúc 7 Phân Hệ Pythaverse
1. **School Workspace (`pythaverse.space`):** Hệ thống phân quyền 3 cấp (`Distributor` ➔ `Partner` ➔ `School`). School tạo Order lên Partner; Partner cấp License từ Pool; Distributor duyệt Contract cấp bù; Sales Admin phê duyệt tối cao.
2. **PLearn LMS (`learn.pythaverse.space`):** Moodle LMS (PHP / MariaDB / Edwiser RemUI). Quản lý khóa học (`SWRP`, `IR`, `ASP`...) và ghi danh theo Role (`Student` - 9, `Teacher` - 7, `Manager` - 1), tạo nhóm lớp tự động.
3. **PGit (`git.pythaverse.space`):** Gitea / GitBucket Server. Yêu cầu tài khoản đăng nhập SSO qua Keycloak ít nhất 1 lần để kích hoạt JIT provisioning.
4. **Keycloak Auth IDP (`eid.pythaverse.space`):** Cổng xác thực tập trung OAuth2/OIDC. Quản trị reset mật khẩu, kích hoạt/vô hiệu hóa tài khoản, xác thực email.
5. **Leanbot IDE (`ide.pythaverse.space`):** Blockly Web IDE kết nối Robot qua BLE.
6. **Support Helpdesk (`support.pythaverse.space`):** osTicket Helpdesk Engine cào dữ liệu qua Playwright headless session.
7. **PContest (`contest.pythaverse.space`):** Hệ thống thi đấu trực tuyến và bảng xếp hạng Leaderboard.

### 2.2. Kiến Trúc Dual-Path AI Cognition & Dual-Key Resiliency
- **Tách Biệt Nhận Thức Kép (Dual-Path Cognition):**
  - *Luồng Nhận Thức Mềm (`summarize_ticket`):* Chuyên trách tóm tắt nội dung, phân loại danh mục và độ ưu tiên để hiển thị trực quan trên Unified Inbox cho con người đọc. **Tuyệt đối không sinh action hay thay đổi dữ liệu.**
  - *Luồng Vận Hành Xác Định (`extract_operational_facts`):* Trích xuất Ý định (Intents) và Thực thể (Entities) bị khóa chặt bởi **Trích dẫn bằng chứng nguyên văn (`evidence_quotes`)**. Nếu không có bằng chứng, bắt buộc chuyển sang trạng thái `needs_information`.
- **Cơ Chế Dual-Key Gemini Engine (`GEMINI_API_KEY` & `GEMINI_API_KEY2`):**
  - Key 1 dành riêng cho Tóm tắt Inbox (`api_key_summary`).
  - Key 2 dành riêng cho Bóc tách sự thật vận hành (`api_key_facts`).
  - Khi một Key chạm trần `429` / `quota`, hệ thống tự động hoán đổi chìa chéo (Cross-Key Failover) trước khi kích hoạt danh sách 10 model fallback.

### 2.3. Deterministic Planning Module & Policy Registry (`intent_policy.json`)
- Bộ lập kế hoạch `workflow_planner.py` hoạt động hoàn toàn tất định, **không gọi LLM bên trong**.
- Ánh xạ trực tiếp Intent ➔ Capability Pipeline thông qua `intent_policy.json`.
- Ràng buộc nghiêm ngặt: Chỉ những capability có `available=true` và `supported_by_handler=true` mới được phép đưa vào đồ thị thực thi. Bất kỳ capability nào bị khóa đều gây lỗi validation `fail-closed`.
- **Tuyệt đối xóa sổ toàn bộ giá trị mặc định giả định (Zero-Mockup Invariant):** Không tự gán `SWRP 4-12`, `total_count=4`, mật khẩu `Ptv@2026` hay quyền `DEVELOPER`. Thiếu thông tin bắt buộc phải dừng lại ở `needs_information` kèm bảng Checklist.

### 2.4. True Topological Execution & Concurrency Lease
- `WorkflowExecutorService` thực thi các bước theo **Thuật toán sắp xếp Tô-pô thực thụ (Kahn's Algorithm - In-degree DAG)**, đảm bảo các bước cha luôn hoàn thành trước khi kích hoạt bước con.
- Giải mã dữ liệu truyền động đa tầng `{{ step_xx.property }}` chính xác.
- Bảo vệ trần 512MB RAM Render: Chiếm Lease độc quyền qua `TaskCoordinator.claim_task_for_execution()` và acquire slot Playwright Semaphore `(1 slot, lane='admin')`.
- **Đồng Bộ Hai Chiều `waiting_poll`:** Khi bước RPA trả về `waiting_poll`, cập nhật đồng thời cả `automation_workflows` VÀ `bot_automation_tasks.execution_status = 'waiting_poll'`. Cronjob `poll_workspace_long_tasks` quét trúng task, lấy kết quả và tự động **Resume Workflow** chạy tiếp các bước hạ nguồn (LMS, Git).
- **Append-Only Execution Audit:** Ghi nhận từng mili-giây diễn biến vào bảng `workflow_execution_events`, tự động che mờ mật khẩu và token nhạy cảm (`[PROTECTED]`).

### 2.5. Cơ Sở Dữ Liệu 20 Bảng CSDL Supabase (Data Provenance & Traceability)
1. `inbox_tickets`: Quản lý vé tiếp nhận tập trung (Gmail, Form, osTicket) với Partial Unique Index `(source, source_id)`.
2. `inbox_ticket_revisions`: Lưu trữ lịch sử từng lần biến động nội dung vé kèm mã băm `content_hash`.
3. `ticket_ai_assessments`: Lưu trữ độc lập 2 bản đánh giá AI (`summary` và `fact_extraction`) kèm Model Name và Prompt Version.
4. `workflow_proposals`: Lưu trữ bản đề xuất Workflow chuẩn mực có bằng chứng (`evidence`), danh sách thiếu hụt (`missing_requirements`), version và bản đóng băng (`frozen_plan`).
5. `workflow_execution_events`: Nhật ký thực thi bất biến append-only.
6. `bot_automation_tasks`: Hàng đợi thực thi tác vụ bot.
7. `automation_workflows`: Bản draft và execution timeline phục vụ tương thích ngược UI.
8. `automation_workflow_history`: Lịch sử chỉnh sửa luồng của Admin.
9-20: Các bảng Phả hệ (`workspace_organizations`), Két sắt Fernet (`workspace_credentials_vault`), Scanner Cache (`workspace_contracts_cache`, `workspace_orders_cache`), Danh mục khóa học kép (`workspace_courses`, `lms_courses`), Giám sát (`site_monitor_credentials`, `site_downtime_events`, `site_deploy_configs`), Bảng Kanban (`work_boards`, `work_board_columns`, `work_board_cards`) và Mẫu (`templates_config`).

---

## 3. NĂM NGUYÊN TẮC BẤT DI BẤT DỊCH (ABSOLUTE SAFETY INVARIANTS)

1. **Evidence-Based Invariant (Không Bằng Chứng ➔ Không Action):**
   - Một ý định (Intent) chỉ được công nhận nếu có đoạn trích dẫn nguyên văn (`evidence_quotes`) từ nội dung vé gốc. Tuyệt đối không suy đoán ý định ngoài nguồn. Thiếu bằng chứng bắt buộc trả về `needs_information`.
2. **Zero-Mockup Invariant (Cấm Tuyệt Đối Dữ Liệu Bịa Đặt):**
   - Nghiêm cấm sử dụng bất kỳ giá trị mặc định giả lập nào (`SWRP 4-12`, count=4, mật khẩu `Ptv@2026`, role `DEVELOPER`) khi người dùng chưa cung cấp. Thiếu dữ kiện đầu vào cốt tử ➔ Chặn phê duyệt thực thi và hiển thị Checklist thiếu thông tin.
3. **Fail-Closed Capability Policy:**
   - Mọi capability trong đồ thị bắt buộc phải có `available=true` và `supported_by_handler=true` trong `capabilities.json`. Tuyệt đối không sinh bước cho các capability chưa có code bot xử lý trong `bot_executor.py`.
4. **Server-Side Approval Revalidation:**
   - Endpoint `/approve_and_run` bắt buộc kiểm tra lại toàn bộ đồ thị DAG, contract đầu vào và trạng thái workflow ở Backend trước khi chuyển sang `approved`. Tuyệt đối không tin tưởng client validation. Khước từ hoàn toàn các workflow `no_action`, `needs_information`, `invalid` hoặc rỗng (0 bước).
5. **Memory Collection Safeguard & Single-Instance Concurrency (Render 512MB RAM):**
   - Duy trì nghiêm ngặt `GLOBAL_PLAYWRIGHT_SEMAPHORE = asyncio.Semaphore(1)`.
   - Mọi coroutine chạy Playwright hoặc quét ngầm bắt buộc gọi `gc.collect()` và `force_kill_zombie_chromium()` trong khối `finally`.
   - 6 Crons trong `main.py` xuất phát lệch pha (15s, 90s, 180s, 420s, 1200s, 2400s) để ngăn tràn RAM.

---

## 4. QUY CHUẨN MÃ NGUỒN & PHONG CÁCH GIAO TIẾP

- **Ngôn ngữ phản hồi:** Toàn bộ giải thích, trao đổi, kế hoạch và tóm tắt gửi tới người dùng BẮT BUỘC bằng **Tiếng Việt**.
- **Mã nguồn:** Code comments, tên biến, tên hàm, tên lớp giữ nguyên bằng **Tiếng Anh** chuẩn mực kỹ thuật.
- **Liên kết tệp tin:** Khi nhắc tới tệp tin trong câu trả lời, BẮT BUỘC sử dụng Markdown link với giao thức `file://` (ví dụ: `[README.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/README.md)`).
- **Quy chuẩn Design System:**
  - Macrostructure: **Bento Grid** (asymmetric card mosaic, 16px gap, hairline border 1px).
  - Palette: **Enterprise Pastel (OKLCH)** (`--color-paper`, `--color-ink`, `--color-accent`...).
  - Typography: **Plus Jakarta Sans** (headings & body) + **JetBrains Mono** (terminal & logs).
  - Evidence Display: Căn cứ trích dẫn rõ ràng, hiển thị đúng Model AI, loại bỏ false confidence.
- **Tài liệu Single Source of Truth:** Mọi thay đổi kiến trúc, thêm bảng database, thêm API endpoint hoặc thêm Worker mới BẮT BUỘC phải được cập nhật đồng bộ vào file [README.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/README.md) và [GEMINI.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/GEMINI.md).