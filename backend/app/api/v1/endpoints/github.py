# backend/app/api/v1/endpoints/github.py
import os
import json
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

def load_system_knowledge(system_name: str) -> str:
    """Đọc thông tin kiến trúc kỹ thuật nội bộ từ knowledge_base.json."""
    try:
        kb_path = os.path.join(os.path.dirname(__file__), "../../../brain/knowledge_base.json")
        if os.path.exists(kb_path):
            with open(kb_path, "r", encoding="utf-8") as f:
                kb_data = json.load(f)
                sys_info = kb_data.get("systems", {}).get(system_name)
                if sys_info:
                    return f"""
- Tên phân hệ: {system_name}
- Domain hoạt động: https://{sys_info.get('domain')}
- Nền tảng cốt lõi (Core Engine): {sys_info.get('core_platform')}
- Đặc tả kỹ thuật nội bộ: {sys_info.get('tech_notes')}
- Endpoint liên quan: {sys_info.get('common_endpoints')}
"""
    except Exception as e:
        logger.warning(f"Không thể load knowledge_base: {e}")
    return f"- Tên phân hệ: {system_name} (Hệ sinh thái Pythaverse)"

class GenerateBugPromptRequest(BaseModel):
    ticket_id: Optional[str] = None
    subject: str = ""
    raw_content: str = ""
    source: str = "osticket"
    sender: str = "hung.nguyenmanh@dtt.vn"
    impacted_system: str = "Workspace"
    priority: str = "Urgent"
    qa_notes: Optional[str] = ""  # 🎯 Ghi chú điều tra chuyên sâu của QA

@router.post("/create-issue")
async def create_github_issue(payload: Dict[str, Any]):
    """Endpoint tạo GitHub Issue 1-click gửi vào Private Repo."""
    res = await github_service.create_issue(payload)
    return res

@router.post("/ai-generate-template")
async def ai_generate_bug_template(req: GenerateBugPromptRequest):
    """Gọi Gemini AI kết hợp Kiến thức Domain Pythaverse + Ghi chú QA để viết Bug Report chuẩn xác."""
    
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY chưa được cấu hình.")

    # Lấy kiến trúc hệ thống tương ứng
    system_tech_context = load_system_knowledge(req.impacted_system)

    prompt = f"""
Bạn là Chuyên gia Lead QA & Automation của Công ty Công nghệ DTT (Hệ sinh thái Pythaverse).
Nhiệm vụ: Viết một bản Báo Cáo Lỗi (Bug Report) KỸ THUẬT CHUYÊN SÂU bằng tiếng Việt theo ĐÚNG CẤU TRÚC MARKDOWN quy định.

=== 1. KIẾN THỨC KIẾN TRÚC HỆ THỐNG NỘI BỘ (GROUND TRUTH CONTEXT) ===
{system_tech_context}

=== 2. THÔNG TIN SỰ CỐ TỪ NGƯỜI DÙNG ===
- Mã Ticket: #{req.ticket_id or 'N/A'} (Nguồn: {req.source.upper()})
- Người báo cáo: {req.sender}
- Tiêu đề gốc: {req.subject}
- Nội dung gốc:
\"\"\"
{req.raw_content or req.subject}
\"\"\"

=== 3. GHI CHÚ KHẢO SÁT & ĐIỀU TRA CỦA QA LEAD (QUAN TRỌNG NHẤT) ===
\"{req.qa_notes or 'Chưa có ghi chú bổ sung, hãy tự suy luận dựa theo kiến trúc hệ thống và nội dung ticket.'}\"

=== YÊU CẦU BẮT BUỘC ĐỐI VỚI AI ===
1. PHẢI kết hợp kiến trúc nền tảng (ví dụ Moodle LMS, Keycloak, Gitea, App Inventor Companion Bluetooth, Order/Contract Workspace) vào nội dung báo cáo.
2. Các bước tái hiện (Steps to Reproduce) phải viết logic, chuẩn xác theo giao diện và flow kỹ thuật của hệ thống đó.
3. Kết quả thực tế & Mong đợi phải làm nổi bật nguyên nhân kỹ thuật mà QA đã ghi chú.
4. Bằng chứng kỹ thuật (HTTP status, API endpoint, Payload) phải khớp với domain và endpoint của hệ thống được báo cáo.

=== CẤU TRÚC MARKDOWN BẮT BUỘC TRẢ VỀ ===
### [BUG][{req.priority.upper()}] <Tiêu đề kỹ thuật ngắn gọn, chuẩn xác>

**📌 MÔ TẢ TỔNG QUAN (METADATA)**
- **Người báo cáo (Reported By):** {req.sender} (Qua Hùng QA)
- **Mức độ ưu tiên (Priority/Severity):** [{req.priority}]
- **Vai trò bị ảnh hưởng (Affected Roles):** [Admin / Partner / School / Teacher / Student]
- **Hệ thống liên quan (Impacted System):** [{req.impacted_system}]

---

**🌐 MÔI TRƯỜNG & ĐƯỜNG DẪN (ENVIRONMENT & ABSOLUTE URLS)**
- **URL bị lỗi (Absolute URL):** `https://{req.impacted_system.lower().replace(' ', '')}.pythaverse.space` (hoặc URL chuẩn của phân hệ)
- **So sánh Môi trường (QA vs Prod):**
  - **Môi trường QA (`qa.pythaverse.space`):** [Bị lỗi]
  - **Môi trường Production (`pythaverse.space`):** [Bị lỗi]

---

**📝 ĐIỀU KIỆN TIÊN QUYẾT & DỮ LIỆU TEST (PREREQUISITES & TEST DATA)**
- **Tài khoản test (Credentials):** `hung.nguyenmanh@dtt.vn`
- **Định danh thực thể:** Ticket #{req.ticket_id or 'N/A'}, School_ID / Course_ID
- **Link báo cáo từ người dùng (User Report Link):** Link {req.source.upper()} #{req.ticket_id or ''}

---

**👣 CÁC BƯỚC TÁI HIỆN (STEPS TO REPRODUCE)**
1. <Bước 1 cụ thể>
2. <Bước 2 cụ thể>
3. <Bước 3 cụ thể>
4. Quan sát phản hồi của hệ thống.

---

**⚖️ KẾT QUẢ THỰC TẾ VS MONG ĐỢI (EXPECTED VS ACTUAL)**
- **Kết quả mong đợi (Expected Results):** <Mô tả trạng thái đúng tiêu chuẩn>
- **Kết quả thực tế (Actual Results):** <Mô tả chi tiết lỗi, tích hợp ghi chú khảo sát của QA>

---

**🔍 BẰNG CHỨNG KỸ THUẬT (TECHNICAL EVIDENCE & LOGS)**
- **HTTP Status Code:** 500 Internal Server Error / 400 Bad Request
- **API Endpoint:** `https://...` (sử dụng endpoint thực tế từ kiến trúc)
- **Payload gửi đi (Request Payload):** 
```json
{{
  "system": "{req.impacted_system}",
  "action": "debug_inspection"
}}
```

CHÚ Ý: Chỉ trả về nội dung Markdown thuần, KHÔNG thêm lời chào mở đầu hay kết thúc.
"""

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        
        ai_response_text = ""
        last_error = ""

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
                logger.warning(f"⚠️ Model [{m_name}] lỗi ({err}), thử model tiếp...")

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