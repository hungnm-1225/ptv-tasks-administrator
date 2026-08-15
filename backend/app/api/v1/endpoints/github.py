# backend/app/api/v1/endpoints/github.py
import logging
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
import google.generativeai as genai
from app.services.github_service import github_service
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Danh sách Model Gemini chuẩn của hệ thống
GEMINI_MODELS = [
"gemini-3.7-flash",
"gemini-3.6-flash",
"gemini-3.5-flash-lite",
"gemini-3.5-flash",
"gemini-3.1-flash-lite",
"gemini-3.1-pro-preview",
"gemini-3-flash-preview",
"gemini-pro-latest",
"gemini-flash-latest",
"gemini-flash-lite-latest"
]

class GenerateBugPromptRequest(BaseModel):
    ticket_id: Optional[str] = None
    subject: str = ""
    raw_content: str = ""
    source: str = "osticket"
    sender: str = "hung.nguyenmanh@dtt.vn"
    impacted_system: str = "Workspace"
    priority: str = "Urgent"

@router.post("/create-issue")
async def create_github_issue(payload: Dict[str, Any]):
    """Endpoint tạo GitHub Issue 1-click gửi vào Private Repo."""
    res = await github_service.create_issue(payload)
    return res

@router.post("/ai-generate-template")
async def ai_generate_bug_template(req: GenerateBugPromptRequest):
    """Gọi Gemini AI phân tích sâu nội dung sự cố theo danh sách Model mới."""
    
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY chưa được cấu hình.")

    prompt = f"""
Bạn là Chuyên gia Lead QA & Automation của Công ty Công nghệ DTT (Hệ sinh thái Pythaverse).
Nhiệm vụ: Đọc kỹ thông tin sự cố dưới đây và viết một bản Báo Cáo Lỗi (Bug Report) CHUYÊN SÂU bằng tiếng Việt theo ĐÚNG CẤU TRÚC MARKDOWN quy định.

=== THÔNG TIN SỰ CỐ ĐẦU VÀO ===
- Mã Ticket / Nguồn: #{req.ticket_id or 'N/A'} ({req.source.upper()})
- Người báo cáo: {req.sender}
- Tiêu đề sự cố: {req.subject}
- Nội dung / Logs chi tiết:
\"\"\"
{req.raw_content or req.subject}
\"\"\"
- Phân hệ dự kiến: {req.impacted_system}
- Mức độ: {req.priority}

=== YÊU CẦU ĐẶC BIỆT DÀNH CHO AI ===
1. Phân tích đúng bản chất kỹ thuật của lỗi này (Ví dụ: App Inventor Companion APK/Bluetooth, Vercel Build Logs, Keycloak SSO, LMS Enroll...).
2. Các bước tái hiện (Steps to Reproduce) phải suy luận chi tiết, logic theo từng hành động cụ thể.
3. Kết quả thực tế (Actual Results) và Kết quả mong đợi (Expected Results) phải mô tả chính xác hiện tượng trong sự cố.

=== CẤU TRÚC MARKDOWN BẮT BUỘC TRẢ VỀ ===
### [BUG][{req.priority.upper()}] <Tiêu đề ngắn gọn phản ánh đúng lỗi>

**📌 MÔ TẢ TỔNG QUAN (METADATA)**
- **Người báo cáo (Reported By):** {req.sender} (Qua Hùng QA)
- **Mức độ ưu tiên (Priority/Severity):** [{req.priority}]
- **Vai trò bị ảnh hưởng (Affected Roles):** [Admin / Partner / School / Teacher / Student]
- **Hệ thống liên quan (Impacted System):** [{req.impacted_system}]

---

**🌐 MÔI TRƯỜNG & ĐƯỜNG DẪN (ENVIRONMENT & ABSOLUTE URLS)**
- **URL bị lỗi (Absolute URL):** `https://pythaverse.space`
- **So sánh Môi trường (QA vs Prod):**
  - **Môi trường QA (`qa.pythaverse.space`):** [Bị lỗi]
  - **Môi trường Production (`pythaverse.space`):** [Bị lỗi]

---

**📝 ĐIỀU KIỆN TIÊN QUYẾT & DỮ LIỆU TEST (PREREQUISITES & TEST DATA)**
- **Tài khoản test (Credentials):** `hung.nguyenmanh@dtt.vn`
- **Định danh thực thể:** Ticket #{req.ticket_id or 'N/A'}
- **Link báo cáo từ người dùng (User Report Link):** Link {req.source.upper()} #{req.ticket_id or ''}

---

**👣 CÁC BƯỚC TÁI HIỆN (STEPS TO REPRODUCE)**
1. <Bước 1 cụ thể theo lỗi trên>
2. <Bước 2 cụ thể>
3. <Bước 3 cụ thể>
4. Quan sát phản hồi của hệ thống.

---

**⚖️ KẾT QUẢ THỰC TẾ VS MONG ĐỢI (EXPECTED VS ACTUAL)**
- **Kết quả mong đợi (Expected Results):** <Mô tả trạng thái hoạt động chính xác khi chưa có lỗi>
- **Kết quả thực tế (Actual Results):** <Mô tả chi tiết triệu chứng lỗi trích xuất từ ticket>

---

**🔍 BẰNG CHỨNG KỸ THUẬT (TECHNICAL EVIDENCE & LOGS)**
- **HTTP Status Code:** 500 Internal Server Error / 400 Bad Request
- **API Endpoint:** `https://pythaverse.space/api/...`
- **Payload gửi đi (Request Payload):** 
```json
{{
  "system": "{req.impacted_system}",
  "error_title": "{req.subject[:60]}"
}}
```

CHÚ Ý: Chỉ trả về nội dung Markdown thuần, KHÔNG thêm lời chào hay giải thích ngoài lề.
"""

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        
        ai_response_text = ""
        last_error = ""

        # Duyệt qua danh sách Model thế hệ mới với cơ chế Auto-Fallback
        for m_name in GEMINI_MODELS:
            try:
                model = genai.GenerativeModel(m_name)
                res = model.generate_content(prompt)
                if res and res.text:
                    ai_response_text = res.text.strip()
                    logger.info(f"✅ Gemini Model [{m_name}] đã sinh Bug Template thành công.")
                    break
            except Exception as err:
                last_error = str(err)
                logger.warning(f"⚠️ Model [{m_name}] lỗi ({err}), chuyển sang model kế tiếp...")

        if not ai_response_text:
            raise Exception(f"Tất cả model Gemini đều không phản hồi: {last_error}")

        first_line = ai_response_text.split("\n")[0].replace("###", "").strip()

        return {
            "status": "success",
            "title": first_line if first_line else f"[BUG][{req.priority.upper()}] {req.subject}",
            "body": ai_response_text
        }

    except Exception as e:
        logger.error(f"❌ Lỗi Gemini AI Dispatcher: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi Gemini AI: {str(e)}")