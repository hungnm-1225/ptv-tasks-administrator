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
    """Gọi trực tiếp Google Gemini AI để phân tích sâu nội dung sự cố."""
    
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY chưa được cấu hình trong file .env")

    # Prompt chuyên sâu yêu cầu Gemini phân tích bản chất lỗi của từng ticket cụ thể
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
1. PHẢI phân tích đúng bản chất kỹ thuật của lỗi này (Ví dụ nếu là App Inventor Companion thì phân tích về phiên bản APK/Bluetooth; nếu là Deploy Vercel thì phân tích về Build Logs/Next.js/Env).
2. Các bước tái hiện (Steps to Reproduce) phải được tự suy luận cụ thể theo từng click chuột/hành động tương ứng với lỗi đó, KHÔNG dùng câu chung chung.
3. Kết quả thực tế (Actual Results) và Kết quả mong đợi (Expected Results) phải mô tả chính xác hiện tượng được nhắc đến trong nội dung sự cố.

=== CẤU TRÚC MARKDOWN BẮT BUỘC TRẢ VỀ ===
### [BUG][{req.priority.upper()}] <Tiêu đề ngắn gọn phản ánh đúng lỗi>

**📌 MÔ TẢ TỔNG QUAN (METADATA)**
- **Người báo cáo (Reported By):** {req.sender} (Qua Hùng QA)
- **Mức độ ưu tiên (Priority/Severity):** [{req.priority}]
- **Vai trò bị ảnh hưởng (Affected Roles):** [Admin / Partner / School / Teacher / Student]
- **Hệ thống liên quan (Impacted System):** [{req.impacted_system}]

---

**🌐 MÔI TRƯỜNG & ĐƯỜNG DẪN (ENVIRONMENT & ABSOLUTE URLS)**
- **URL bị lỗi (Absolute URL):** `https://pythaverse.space` (hoặc domain phân hệ phù hợp như `learn.pythaverse.space`, `ide.pythaverse.space`)
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
        
        # Danh sách model Gemini thực tế
        models_to_try = [
            "gemini-1.5-flash",
            "gemini-2.0-flash-exp",
            "gemini-1.5-pro",
            "gemini-pro"
        ]
        
        ai_response_text = ""
        last_error = ""

        for m_name in models_to_try:
            try:
                model = genai.GenerativeModel(m_name)
                res = model.generate_content(prompt)
                if res and res.text:
                    ai_response_text = res.text.strip()
                    logger.info(f"✅ Gemini Model [{m_name}] đã sinh Bug Template thành công.")
                    break
            except Exception as err:
                last_error = str(err)
                logger.warning(f"⚠️ Model [{m_name}] không khả dụng: {err}, chuyển sang model kế tiếp...")

        if not ai_response_text:
            raise Exception(f"Không thể gọi Gemini AI: {last_error}")

        # Tách tiêu đề từ dòng đầu tiên
        first_line = ai_response_text.split("\n")[0].replace("###", "").strip()

        return {
            "status": "success",
            "title": first_line if first_line else f"[BUG][{req.priority.upper()}] {req.subject}",
            "body": ai_response_text
        }

    except Exception as e:
        logger.error(f"❌ Lỗi Gemini AI Dispatcher: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi Gemini AI: {str(e)}")