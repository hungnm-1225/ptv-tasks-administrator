# 🚀 PTV Tasks Administrator – Pythaverse Central Admin & Automation Hub

> **Phiên bản:** 1.0.0 | **Kiến trúc:** Monorepo (Frontend SPA + Backend FastAPI + Supabase DB & Auth)
> **Mục đích:** Đây là tài liệu dành cho AI Coder / Developer mới tiếp cận dự án. Đọc file này là đủ để hiểu và làm việc với toàn bộ hệ thống mà không cần phải đọc từng file source code.

---

## 🧠 Tổng Quan Hệ Thống (Core Concept)

Hệ thống này giải quyết bài toán quản trị nội bộ cho tổ chức Pythaverse (`@dtt.vn`). Luồng chính:

```
[Gmail Workspace @dtt.vn / Google Form / OS Ticket]
    ↓ Webhook/Cron polling
[FastAPI Backend] → [Gemini AI Triage Engine]
    ↓ Phân loại, tóm tắt, đề xuất hành động
[Supabase Database & Auth] → [Telegram Bot Push Notification]
    ↓ Admin xem xét (Google OAuth Sign-In)
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

## 👤 Hướng Dẫn Tự Chỉnh Sửa Thông Tin Tác Giả ("Đánh Dấu Chủ Quyền Cá Nhân")

Để khẳng định quyền sở hữu và cá nhân hóa thông tin tác giả hiển thị tại Trang Chủ (Landing Page), Anh chỉ cần chỉnh sửa trực tiếp file cấu hình:

👉 **`frontend/src/config/authorConfig.ts`**

```ts
export const authorConfig = {
  name: "Nguyễn Mạnh Hùng", // ✏️ Họ tên của Anh
  title: "Lead AI Engineer & Automation Architect", // ✏️ Chức danh
  bio: "Chuyên gia thiết kế hệ thống Tự Động Hóa Doanh Nghiệp...", // ✏️ Giới thiệu
  avatarUrl: "https://your-photo-url.com/avatar.jpg", // ✏️ Link ảnh đại diện
  socials: [
    { name: "GitHub", url: "https://github.com/hungnm-1225" }, // ✏️ Link GitHub
    { name: "LinkedIn", url: "https://linkedin.com/in/your-profile" }, // ✏️ Link LinkedIn
    { name: "Facebook", url: "https://facebook.com/your-profile" }, // ✏️ Link Facebook
    { name: "Email", url: "mailto:hungnm@dtt.vn" }, // ✏️ Email
  ],
  // ...
};
```
Tất cả các nút biểu tượng mạng xã hội tại Trang Chủ sẽ tự động mở trang cá nhân của Anh khi người dùng click vào!

---

## 🔑 Hướng Dẫn Kích Hoạt Đăng Nhập Google OAuth Với Supabase Dashboard (Chi Tiết Từ A - Z)

Để kết nối tính năng **Đăng Nhập Bằng Google** vào Supabase và tài khoản cá nhân của Anh, hãy làm theo 5 bước đơn giản sau:

### 📌 Bước 1: Lấy Callback Redirect URL Từ Supabase
1. Đăng nhập vào [Supabase Dashboard](https://supabase.com/dashboard).
2. Chọn dự án của Anh → Mục **Authentication** → **Providers**.
3. Chọn provider **Google**.
4. Sao chép lại đường dẫn **Callback URL (Redirect URL)** dạng:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`

### 📌 Bước 2: Tạo OAuth 2.0 Credentials Trên Google Cloud Console
1. Truy cập [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Tạo mới một Project (nếu chưa có) hoặc chọn Project hiện tại.
3. Chọn **+ CREATE CREDENTIALS** → **OAuth client ID**.
4. Chọn **Application type**: `Web application`.
5. Đặt tên: `PTV Admin Auth Client`.
6. Tại mục **Authorized JavaScript origins**, thêm:
   - `http://localhost:5173`
   - `https://your-production-app.vercel.app`
7. Tại mục **Authorized redirect URIs**, dán đường dẫn **Callback URL** đã chép ở Bước 1:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
8. Bấm **CREATE**. Google sẽ cấp cho Anh:
   - `Client ID` (dạng `xxxx.apps.googleusercontent.com`)
   - `Client Secret` (dạng `GOCSPX-xxxx`)

### 📌 Bước 3: Nhập Client ID & Secret Vào Supabase
1. Quay lại Supabase Dashboard → **Authentication** → **Providers** → **Google**.
2. Bật công tắc **Enable Google provider**.
3. Dán `Client ID` và `Client Secret` vừa lấy từ Google vào 2 ô tương ứng.
4. Bấm **Save**.

### 📌 Bước 4: Cấu Hình URL Redirect Trên Supabase Auth Settings
1. Trong Supabase Dashboard, chọn **Authentication** → **URL Configuration**.
2. **Site URL**: Đặt là `http://localhost:5173` (hoặc URL trang Vercel sản xuất).
3. **Redirect URLs**: Thêm `http://localhost:5173/**` và `https://your-production-app.vercel.app/**`.
4. Bấm **Save**.

👉 **Hoàn tất!** Giờ đây khi bấm nút *"Đăng Nhập Bằng Google"* tại ứng dụng Web, người dùng sẽ được đưa sang trang xác thực của Google và tự động đăng nhập vào hệ thống PTV Admin.

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
│   │   │       ├── tasks.py          # GET /tasks, POST /tasks, PUT /tasks/{id}/approve
│   │   │       ├── bots.py           # GET /bots/status, POST /bots/{id}/retry
│   │   │       ├── github.py         # POST /github/create-issue
│   │   │       └── reports.py        # GET /reports/summary
│   │   ├── core/
│   │   │   ├── config.py             # Pydantic BaseSettings – nạp tất cả env vars
│   │   │   ├── security.py           # JWT decode + @dtt.vn domain whitelist check
│   │   │   ├── gemini.py             # GeminiEngine class – AI Triage + auto fallback
│   │   │   └── supabase.py           # Singleton Supabase Python client
│   │   ├── models/
│   │   ├── services/
│   │   ├── workers/
│   │   └── main.py                   # FastAPI app entry: CORS, router mounting, healthcheck
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                         # ⚛️ React 19 + Vite 6 + Tailwind CSS v4 SPA
│   ├── src/
│   │   ├── config/
│   │   │   └── authorConfig.ts       # 📌 Cấu hình thông tin Tác Giả & Các link Mạng Xã Hội
│   │   ├── context/
│   │   │   └── AuthContext.tsx       # Supabase Auth Provider & Session State
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── Header.tsx        # Sticky header: User avatar, email, Logout, Home link
│   │   │   │   └── Sidebar.tsx       # Navigation menu + Landing Page Link
│   │   │   └── layout/
│   │   │       └── AppLayout.tsx     # Root Admin layout
│   │   ├── features/
│   │   │   ├── landing/
│   │   │   │   └── LandingPage.tsx   # 🌟 Trang Chủ giới thiệu dự án & Chủ quyền Tác Giả
│   │   │   ├── auth/
│   │   │   │   └── LoginPage.tsx     # 🔐 Trang Đăng Nhập Độc Quyền Google OAuth
│   │   │   ├── dashboard/
│   │   │   ├── inbox/
│   │   │   ├── tasks/
│   │   │   ├── github/
│   │   │   ├── bots/
│   │   │   ├── reports/
│   │   │   └── telegram/
│   │   ├── lib/
│   │   │   ├── supabase.ts           # Supabase JS Client Singleton
│   │   │   └── api.ts                # fetchApi() helper – kết nối Render Backend
│   │   ├── types/
│   │   ├── App.tsx                   # Auth Guard + Router Switch
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── .env.local                    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, ...
│
├── supabase/
│   └── migrations/
│       └── 20260812000000_initial_schema.sql  # DDL: Enums + 3 Tables + Indexes + RLS
│
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
| Supabase JS | `@supabase/supabase-js: ^2.48.x` | Realtime DB client & Google OAuth SSO |
| SheetJS (`xlsx`) | `0.18.5` | Client-side Excel export/import |
| Telegram SDK | `@telegram-apps/sdk-react: ^2.0.0` | Telegram Mini App integration |
| Recharts | `2.15.x` | Dashboard KPI charts |

---

## 🔐 Bảo Vệ Route (Auth Guard)

- Mọi khách truy cập có thể xem Trang Chủ (`LandingPage`) và Trang Đăng Nhập (`LoginPage`).
- Để truy cập bất kỳ module Admin nào (`dashboard`, `unified-inbox`, `task-management`, ...), người dùng bắt buộc phải đăng nhập bằng tài khoản Google (`@dtt.vn`).
- Nếu chưa đăng nhập, hệ thống sẽ tự động chuyển hướng về trang `LoginPage`.

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

---

*README.md này được cập nhật tự động. Last updated: 2026-08-13.*
