# backend/app/api/v1/endpoints/github.py
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
import google.generativeai as genai
from app.services.github_service import github_service
from app.core.config import settings
from app.core.gemini import ai_engine

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
    """Gọi Gemini AI để phân tích sự cố và soạn thảo mẫu Bug Report chuẩn QA DTT."""
    
    prompt = f"""
Bạn là Chuyên gia Lead QA & Automation tại Pythaverse (Công ty DTT).
Nhiệm vụ của bạn: Đọc thông tin sự cố/ticket dưới đây và tự động viết một bản Báo Cáo Lỗi (Bug Report) CHUYÊN NGHIỆP, CHI TIẾT bằng tiếng Việt theo ĐÚNG CẤU TRÚC MARKDOWN dưới đây:

### THÔNG TIN ĐẦU VÀO TỪ TICKET:
- Tiêu đề gốc: {req.subject}
- Nội dung chi tiết: {req.raw_content}
- Nguồn tiếp nhận: {req.source}
- Người báo cáo gốc: {req.sender}
- Hệ thống nghi vấn: {req.impacted_system}
- Mức độ ưu tiên: {req.priority}

---

### CẤU TRÚC MARKDOWN BẮT BUỘC TRẢ VỀ:

### [BUG][{req.priority.upper()}] <Tiêu đề ngắn gọn, chuẩn xác thể hiện đúng bản chất lỗi>

**📌 MÔ TẢ TỔNG QUAN (METADATA)**
- **Người báo cáo (Reported By):** {req.sender} (Qua Hùng QA)
- **Mức độ ưu tiên (Priority/Severity):** [{req.priority}]
- **Vai trò bị ảnh hưởng (Affected Roles):** [Admin / Partner / School / Teacher / Student]
- **Hệ thống liên quan (Impacted System):** [{req.impacted_system}]

---

**🌐 MÔI TRƯỜNG & ĐƯỜNG DẪN (ENVIRONMENT & ABSOLUTE URLS)**
- **URL bị lỗi (Absolute URL):** `https://pythaverse.space` (hoặc domain phù hợp như `https://learn.pythaverse.space` hay `https://ide.pythaverse.space`)
- **So sánh Môi trường (QA vs Prod):**
  - **Môi trường QA (`qa.pythaverse.space`):** [Bị lỗi]
  - **Môi trường Production (`pythaverse.space`):** [Bị lỗi]

---

**📝 ĐIỀU KIỆN TIÊN QUYẾT & DỮ LIỆU TEST (PREREQUISITES & TEST DATA)**
- **Tài khoản test (Credentials):** `hung.nguyenmanh@dtt.vn`
- **Định danh thực thể:** School_ID / User_ID / Ticket #{req.ticket_id or 'N/A'}
- **Link báo cáo từ người dùng (User Report Link):** OS Ticket #{req.ticket_id or ''} / Google Form

---

**👣 CÁC BƯỚC TÁI HIỆN (STEPS TO REPRODUCE)**
1. <Tự suy luận bước 1 cụ thể theo nghiệp vụ của lỗi trên>
2. <Tự suy luận bước 2>
3. <Tự suy luận bước 3>
4. Quan sát thông báo lỗi và phản hồi của hệ thống.

---

**⚖️ KẾT QUẢ THỰC TẾ VS MONG ĐỢI (EXPECTED VS ACTUAL)**
- **Kết quả mong đợi (Expected Results):** <Mô tả trạng thái hoạt động đúng tiêu chuẩn>
- **Kết quả thực tế (Actual Results):** <Mô tả chính xác lỗi đang xảy ra dựa theo nội dung ticket>

---

**🔍 BẰNG CHỨNG KỸ THUẬT (TECHNICAL EVIDENCE & LOGS)**
- **HTTP Status Code:** 500 Internal Server Error / 400 Bad Request
- **API Endpoint:** `https://pythaverse.space/api/...`
- **Payload gửi đi (Request Payload):** 
```json
{{
  "system": "{req.impacted_system}",
  "error_context": "{req.subject}"
}}
```

CHÚ Ý: Chỉ trả về nội dung Markdown hoàn chỉnh, không thêm lời chào mở đầu hay kết thúc.
"""

    try:
        # Cấu hình API Key và gọi Model Gemini
        genai.configure(api_key=settings.GEMINI_API_KEY)
        
        # Thử lần lượt các model để đảm bảo luôn thành công
        models_to_try = [
            getattr(settings, "GEMINI_PRIMARY_MODEL", "gemini-2.5-flash"),
            getattr(settings, "GEMINI_FALLBACK_MODEL", "gemini-1.5-flash"),
            "gemini-pro-latest"
        ]
        
        generated_text = ""
        for model_name in models_to_try:
            try:
                model = genai.GenerativeModel(model_name)
                res = model.generate_content(prompt)
                if res and res.text:
                    generated_text = res.text.strip()
                    break
            except Exception as model_err:
                print(f"⚠️ Model {model_name} lỗi: {model_err}, thử model kế tiếp...")

        if not generated_text:
            raise Exception("Tất cả model Gemini đều bận.")

        # Tách tiêu đề từ dòng đầu tiên
        first_line = generated_text.split("\n")[0].replace("###", "").strip()
        
        return {
            "status": "success",
            "title": first_line if first_line else f"[BUG][{req.priority.upper()}] {req.subject}",
            "body": generated_text
        }
    except Exception as e:
        print(f"❌ Lỗi gọi Gemini AI: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi AI Engine: {str(e)}")