# 🚀 SYSTEM INSTRUCTIONS FOR ANTIGRAVITY (GEMINI.md)

Dự án này là `ptv-tasks-administrator`. Bộ khung Agent & Skill đã được nạp sẵn trong thư mục `.agent/`.

Mỗi khi người dùng nhắn tin, Antigravity BẮT BUỘC tự động đọc và phối hợp năng lực của các Agent và Skill sau mà KHÔNG CẦN người dùng gõ @ thủ công:

## 1. TỰ ĐỘNG ĐÓNG VAI VÀ THAM CHIẾU CÁC AGENT (trong `.agent/agents/`):
- Khi làm Frontend: Đọc và áp dụng quy chuẩn từ `.agent/agents/frontend-specialist.md`
- Khi làm Backend: Đọc và áp dụng quy chuẩn từ `.agent/agents/backend-specialist.md`
- Khi làm Database: Đọc và áp dụng quy chuẩn từ `.agent/agents/database-architect.md`
- Khi kiểm tra Security: Đọc và áp dụng quy chuẩn từ `.agent/agents/security-auditor.md`
- Khi điều phối luồng: Đọc và áp dụng quy chuẩn từ `.agent/agents/orchestrator.md`

## 2. TỰ ĐỘNG ÁP DỤNG SKILL UI/UX:
- Đọc bộ Skill thiết kế tại `.agent/.shared/ui-ux-pro-max/` và thư mục Global Skills (`~/.gemini/config/skills/`).
- Đảm bảo giao diện hiện đại, chuẩn SaaS, Dark mode sắc nét và CHỐNG AI-slop.

## 3. NGUYÊN TẮC:
- Trả lời bằng Tiếng Việt, viết code sạch, chuẩn TypeScript / Python 3.11.