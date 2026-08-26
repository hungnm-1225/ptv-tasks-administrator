# 🚀 SYSTEM INSTRUCTIONS FOR ANTIGRAVITY (GEMINI.md)
# Dự án: ptv-tasks-administrator (Pythaverse Central Admin & Automation Hub)

> **Tài liệu này định hình tư duy, vai trò, nguyên tắc làm việc và quy chuẩn kỹ thuật bắt buộc của AI Assistant khi thực thi bất kỳ tác vụ nào trong không gian làm việc `ptv-tasks-administrator`.**

---

## 1. TỰ ĐỘNG ĐÓNG VAI & PHỐI HỢP NĂNG LỰC CHUYÊN GIA (INTELLIGENT AGENT ROUTING)

Mỗi khi tiếp nhận yêu cầu từ người dùng, Antigravity **BẮT BUỘC TỰ ĐỘNG** nhận diện miền nghiệp vụ và áp dụng năng lực chuyên gia từ các hồ sơ agent trong `.agent/agents/` mà **KHÔNG CẦN** người dùng phải gõ `@` thủ công:

| Lĩnh Vực / Phạm Vi Tác Vụ | Agent Chuyên Gia | Hồ Sơ Tham Chiếu | Trọng Tâm Quy Chuẩn Áp Dụng |
|---|---|---|---|
| **Frontend UI/UX** | `frontend-specialist` | `.agent/agents/frontend-specialist.md` | React 19, TypeScript Strict, Tailwind CSS v4, Dark/Light theme, SaaS aesthetic, chống AI-slop, loại bỏ nhãn song ngữ thừa, responsive, accessible. |
| **Backend & REST APIs** | `backend-specialist` | `.agent/agents/backend-specialist.md` | Python 3.11, FastAPI 0.115, Pydantic v2 validation, Async/Await, APScheduler 6 Crons, Safe Job Wrapper, In-Memory RAM Caching. |
| **Database & Storage** | `database-architect` | `.agent/agents/database-architect.md` | Supabase PostgreSQL 16 (16 bảng CSDL + Storage Bucket), ENUMs, Foreign Keys, RLS Policies `@dtt.vn`, Performance Indexes, Triggers. |
| **RPA & Web Scraping** | `qa-automation-engineer` | `.agent/agents/qa-automation-engineer.md` | Playwright Async Chromium, Gói `workspace/` modularized 8 modules, Scanner Direct API, Moodle Keyword Filter 2 nhịp, Viewport chuẩn, Selector kiên cố, Smart Polling, dọn RAM `gc.collect()`. |
| **Security & Identity** | `security-auditor` | `.agent/agents/security-auditor.md` | Whitelist Domain `@dtt.vn`, Fernet Credential Vault (`VAULT_SECRET_KEY`), Keycloak Admin REST API + Playwright Fallback, Bearer Token validation. |
| **Điều Phối Đa Nhiệm** | `orchestrator` | `.agent/agents/orchestrator.md` | Phân tích luồng end-to-end, giải quyết xung đột dữ liệu, thiết kế pipeline liên thông đa dịch vụ. |
| **Gỡ Lỗi & Điều Tra Lỗi** | `debugger` | `.agent/agents/debugger.md` | 4-Phase Systematic Debugging, bắt log thực thi GMT+7, cô lập nguyên nhân gốc rễ, Gemini 10-model fallback. |

---

## 2. TRI THỨC NGHIỆP VỤ CỐT LÕI HỆ SINH THÁI PYTHAVERSE (DOMAIN TRUTH)

Khi phân tích, sửa code hoặc tư vấn giải pháp, AI phải luôn nắm vững các quy tắc nghiệp vụ sau:

### 2.1. Cấu Trúc 7 Phân Hệ Pythaverse
1. **School Workspace (`pythaverse.space`):** Hệ thống phân quyền 3 cấp (`Distributor` ➔ `Partner` ➔ `School`). School tạo Order lên Partner; Partner cấp License từ Pool; Distributor duyệt Contract cấp bù; Sales Admin phê duyệt tối cao.
2. **PLearn LMS (`learn.pythaverse.space`):** Moodle LMS (PHP / MariaDB / REST WebServices / Edwiser RemUI). Quản lý khóa học (Categories: `SWRP`, `IR`, `ASP`...) và ghi danh học sinh/giáo viên theo Role (`Student` - 9, `Non-editing teacher` - 7, `Manager` - 1), chia nhóm lớp tự động.
3. **PGit (`git.pythaverse.space`):** Gitea Git Server. Yêu cầu tài khoản phải đăng nhập SSO qua Keycloak ít nhất 1 lần để kích hoạt provisioning tự động.
4. **Keycloak Auth IDP (`eid.pythaverse.space`):** Cổng xác thực tập trung OAuth2/OIDC (Realm: `idp` / `master`). Quản trị reset mật khẩu, kích hoạt/vô hiệu hóa tài khoản, xác thực email.
5. **Leanbot IDE (`ide.pythaverse.space`):** Blockly Web IDE / App Inventor kết nối Robot qua Bluetooth BLE Companion APK.
6. **Support Helpdesk (`support.pythaverse.space`):** osTicket Helpdesk Engine cào dữ liệu qua Playwright headless session.
7. **PContest (`contest.pythaverse.space`):** Hệ thống thi đấu trực tuyến và bảng xếp hạng Leaderboard.

### 2.2. Kiến Trúc Gói Dịch Vụ Workspace RPA (`backend/app/services/workspace/`)
Gói dịch vụ được tách nhỏ thành 8 module chuyên biệt kế thừa đa tầng:
- `base.py`: Lớp `WorkspaceBaseService` khởi tạo Chromium tối ưu RAM (`--no-sandbox`, `--disable-dev-shm-usage`, `--single-process`), xử lý đăng nhập Keycloak SSO `login_role()` và chuẩn hóa ngày `normalize_date_iso()`.
- `order_service.py`: Lớp `WorkspaceOrderService` (`school_create_order`, `partner_approve_school_order`, `fetch_school_order_detailed_courses`).
- `contract_service.py`: Lớp `WorkspaceContractService` (`partner_create_contract`, `distributor_approve_partner_contract`, `distributor_create_contract`, `admin_approve_distributor_contract`).
- `orchestrator_service.py`: Lớp `WorkspaceOrchestratorService` (`execute_full_license_hierarchy_chain` Master E2E Chain 4 cấp, `execute_approve_school_order_standalone`, `execute_approve_partner_contract_standalone`, `execute_admin_approve_contract_standalone`).
- `account_service.py`: Lớp `WorkspaceAccountService` (`submit_account_creation_batch` Pha 1 nộp batch kèm Hybrid Fast-Path <= 30 users; `check_and_export_batch_result` Pha 2 Polling định kỳ).
- `enroll_service.py`: Lớp `WorkspaceEnrollService` (`school_enroll_users_and_groups` tạo group và ghi danh học sinh/giáo viên LMS trên giao diện School Workspace).
- `workspace_scanner_service.py`: Lớp `WorkspaceScannerService` (Quét tự động và đồng bộ siêu tốc dữ liệu DST/PRT/School Orders của 5 Master Distributors qua Direct API trong ngữ cảnh Playwright session, lưu vào `workspace_contracts_cache` và `workspace_orders_cache`).
- `__init__.py`: Class `WorkspacePlaywrightService` gom toàn bộ đa kế thừa thành singleton `workspace_playwright_service`.
- `workspace_playwright_service.py`: Bridge file re-export 100% tương thích ngược.

### 2.3. Dịch Vụ Moodle LMS Direct Enroller (`backend/app/services/playwright_service.py`)
- **Smart Fallback 2 nhịp:** Khi ghi danh người dùng vào Moodle, nếu email không xuất hiện trong gợi ý Mới, tự động kích hoạt Keyword Filter (chọn `keywords`, nhập email vào `input[placeholder='Type...']`, click `Apply filters` 2 lần để tạo Tag Pill và lọc danh sách), so khớp chính xác cột `td.cell.c2` để Gia hạn (Extend date).
- **Mono-Role Replacement:** Khi thay đổi vai trò (`modify_user_role`), xóa sạch toàn bộ role badges cũ trước khi gán duy nhất 1 role mong muốn và lưu bằng icon đĩa mềm 💾.
- **Unenrol:** Tìm kiếm chính xác qua Keyword Filter và click icon thùng rác 🗑️ xác nhận gỡ người dùng khỏi khóa học.
- **Auto Group Creation:** Tự động tạo Group và phân nhóm học viên tại `/group/index.php?id=...`.

### 2.4. Quy Trình Bóc Tách COF (Curriculum Order Form)
- **Tab 1 (`Curriculum Order Form` / `COF`):** Bóc tách `School Name`, `Country`, danh sách môn học, License, Start/End Date.
- **Tab 2 (`Student Information`):** Bóc tách họ tên, email, ngày sinh (`DOB`), nhóm lớp (`class_group`). Chỉ tạo tài khoản cho học sinh chưa có Username và `Account Exist != 'yes'`.
- **Tab 3 (`Teacher Information`):** Bóc tách họ tên, email giáo viên, môn học phân công (`course_assign`).
- **Chuẩn Hóa Ngày Sinh (DOB):** Bắt buộc chuyển đổi về định dạng `D/M/YYYY` (ví dụ: `1/1/1990` hoặc `15/8/2012`), loại bỏ giờ phút và các dị biệt format.
- **Sinh File Accounts:** Sinh file `accounts.xlsx` 7 cột bắt đầu từ dòng 6 (`No.`, `First Name (*)`, `Last Name (*)`, `Mobile number (Optional)`, `Email (*)`, `Date of Birth (*)`, `Role (*)`).
- **Ghi Ngược Kết Quả:** Đọc file kết quả `RESULT_accounts.xlsx`, map User/Pass vào cột 12-13, Group LMS vào cột 14, highlight nền màu cam nhạt (`#FCE4D6`) và chữ in đậm đỏ (`#C00000`).

### 2.5. Quy Trình Két Sắt & Phả Hệ Tổ Chức (Hierarchy & Vault)
- **Bảng `workspace_organizations`:** Lưu cây quan hệ 3 cấp (`distributor` ➔ `partner` ➔ `school`) qua `parent_id`.
- **Bảng `workspace_credentials_vault`:** Lưu trữ tài khoản và mật khẩu đã được mã hóa bằng thuật toán đối xứng `Fernet` (`VAULT_SECRET_KEY`).
- **Giải Mã An Toàn:** Khi Playwright cần thông tin đăng nhập tự động, sử dụng `WorkspaceLineageService.resolve_by_school()` để tự động truy vết 3 cấp và giải mã mật khẩu tức thì.

### 2.6. Smart Polling Engine (Nộp File Batch Tạo Tài Khoản)
- **Pha 1 (Submit):** Upload file `accounts.xlsx`, nếu batch <= 30 tài khoản sẽ kích hoạt **Hybrid Fast-Path** đợi 12s lấy kết quả ngay. Nếu > 30 tài khoản, bắt `Request ID` tại dòng đầu của `MuiDataGrid`, đóng trình duyệt Chromium ngay lập tức để giải phóng RAM, đặt task `execution_status = 'waiting_poll'`.
- **Pha 2 (Polling):** Cronjob `poll_workspace_long_tasks` mỗi 5 phút mở kiểm tra trạng thái Request ID. Khi trạng thái là `Done` / `Completed` ➔ Bấm Action Menu ➔ `Export` tải file kết quả `RESULT_accounts.xlsx`, gọi `COFExcelService.write_results_back_to_cof()` ghi ngược kết quả và đẩy lên Google Drive.

### 2.7. Cấu Trúc Thư Mục Google Drive Phân Tầng 6 Cấp (`GoogleDriveService`)
- Dựng chuỗi thư mục phân tầng tự động: `Root` ➔ `{Năm}` ➔ `{Quốc gia}` ➔ `[Distributor] {Tên}` ➔ `[Partner] {Tên}` ➔ `[School] {Tên}`.
- Tải file kết quả COF lên đúng thư mục trường học và trả về `web_view_link`.

### 2.8. In-Memory RAM Caching (1ms Response Engine)
- Triển khai trong [`backend/app/api/v1/endpoints/courses.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/courses.py) (`SimpleMemoryCache`) và [`backend/app/api/v1/endpoints/workspace.py`](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/backend/app/api/v1/endpoints/workspace.py) (`WorkspaceMemoryCache`).
- **TTL:** 10 - 15 phút.
- **Tự động Invalidate:** Bất kỳ thao tác Create, Update, Delete hoặc Bulk Upsert nào đều phải gọi `.invalidate()` để làm sạch cache ngay lập tức, đảm bảo tính toàn vẹn dữ liệu.

### 2.9. Điều Phối Tác Vụ Độc Lập Automation Studio (`AutomationStudioPage.tsx` / `/studio`)
- Cho phép Quản trị viên chủ động khởi tạo và điều phối các tác vụ Bot RPA/API mà không cần gắn với một ticket hòm thư đầu vào (`ticket_id = null`, `is_manual_dispatch = true`).
- Tích hợp 3 Dispatcher Engines: `workspace_rpa`, `keycloak_api`, `feedback_doc_triage`.
- **4 Nhóm Tác Vụ Workspace RPA:** 
  1. *Phê duyệt (`approve`):* Duyệt School Order, Partner Contract, Admin Approve Contract.
  2. *Tạo & Duyệt Chuỗi (`create_and_approve`):* Master E2E Chain 4 cấp, Partner Chain, Distributor Chain kèm Autocomplete phả hệ 480 trường.
  3. *Tạo tài khoản hàng loạt (`bulk_accounts`):* Nộp batch COF và tính toán nghỉ 15s/tài khoản.
  4. *Ghi danh LMS (`lms_enroll`):* Ghi danh & phân nhóm lớp School Workspace / Moodle LMS.
- **Persistent Client Cache:** Lưu trữ LocalStorage (`ptv_studio_*`) nạp danh mục trường và môn học với tốc độ 0ms tuyệt đối.

### 2.10. Quản Lý Danh Mục Khóa Học Song Song (`CoursesManagerPage.tsx` / `/courses`)
- **Kiến trúc Dual Pane:** Phân biệt rõ 2 bảng khóa học: `workspace_courses` (dùng cho RPA License Chain, COF matching) và `lms_courses` (dùng cho Moodle LMS PLearn enrollment).
- **SWR Silent Fetch & LocalStorage Cache (`ptv_courses_*`, `ptv_cats_*`):** Tải trang tức thì 0ms và tự động làm mới ngầm.
- **CRUD Đơn Lẻ & Tự Sinh URL LMS:** Tự động điền URL Moodle `https://learn.pythaverse.space/course/view.php?id={course_id}`.
- **Bulk Import Hàng Loạt (SheetJS XLSX + Text Parser):** Hỗ trợ nạp file Excel hoặc paste danh sách văn bản tự do, gửi batch 50 records.
- **Category Manager:** Hỗ trợ Đổi tên danh mục hàng loạt và Xóa / Gộp khóa học sang danh mục khác (`target_category`).

---

## 3. BỐN NGUYÊN TẮC BẤT DI BẤT DỊCH (ABSOLUTE RULES)

1. **Human-in-the-Loop Gate (Cổng Phê Duyệt Con Người):**
   - Tuyệt đối KHÔNG chạy ngầm bất kỳ tác vụ can thiệp hệ thống nào (Keycloak API, Playwright RPA, GitHub Issue...) nếu chưa có trạng thái `approval_status = 'approved'` do Quản trị viên phê duyệt trên Web Portal (trừ khi admin chủ động chọn `run_immediately = true` từ Studio).
2. **Kiểm Soát Miền Doanh Nghiệp (@dtt.vn Whitelist):**
   - Chỉ người dùng có email Google thuộc miền `@dtt.vn` (đặc biệt quản trị viên tối cao `hung.nguyenmanh@dtt.vn`) mới có quyền truy cập hệ thống. Tự động từ chối và đăng xuất mọi tài khoản ngoài miền.
3. **Memory Collection Safeguard (Chống Tràn RAM Máy Chủ):**
   - Mọi tiến trình chạy ngầm hoặc tác vụ Playwright trong `safe_job_wrapper` BẮT BUỘC phải gọi `gc.collect()` trong khối `finally` để giải phóng bộ nhớ nhị phân trên môi trường Render 512MB RAM.
4. **Google Gemini Auto-Fallback 10 Tầng:**
   - Khi gọi Gemini AI Triage, luôn sử dụng cơ chế bắt lỗi `429`, `quota`, `resource_exhausted` để tự động chuyển tiếp qua danh sách 10 model dự phòng (`gemini-3.7-flash` ➔ `gemini-3.6-flash` ➔ `gemini-3.5-flash-lite` ➔ ...).

---

## 4. QUY CHUẨN MÃ NGUỒN & PHONG CÁCH GIAO TIẾP

- **Ngôn ngữ phản hồi:** Toàn bộ giải thích, trao đổi, kế hoạch và tóm tắt gửi tới người dùng BẮT BUỘC bằng **Tiếng Việt**.
- **Mã nguồn:** Code comments, tên biến, tên hàm, tên lớp giữ nguyên bằng **Tiếng Anh** chuẩn mực kỹ thuật.
- **Liên kết tệp tin:** Khi nhắc tới tệp tin trong câu trả lời, BẮT BUỘC sử dụng Markdown link với giao thức `file://` (ví dụ: `[README.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/README.md)`).
- **Clean Code:** Viết code ngắn gọn, rành mạch, có type hints đầy đủ (Python 3.11 / TypeScript Strict), không over-engineering, không tạo abstraction thừa thãi.
- **Giao diện sạch sẽ (Clean UI/UX):** Loại bỏ hoàn toàn các nhãn song ngữ thừa thãi dạng `Tiếng Việt (Tiếng Anh)` hoặc AI-slop widgets trên giao diện người dùng.
- **Tài liệu Single Source of Truth:** Mọi thay đổi kiến trúc, thêm bảng database, thêm API endpoint hoặc thêm Worker mới BẮT BUỘC phải được cập nhật đồng bộ vào file [README.md](file:///c:/Users/dtt/Desktop/Project/ptv-tasks-administrator/README.md).