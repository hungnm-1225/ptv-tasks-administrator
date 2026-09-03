# backend/app/api/v1/endpoints/github.py
import os
import json
import logging
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import google.generativeai as genai
from app.services.github_service import github_service
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Danh sách Model Gemini chuẩn của hệ thống (Fallback 10 tầng)
GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
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


class AttachmentItem(BaseModel):
    filename: str
    url: str


class GenerateBugPromptRequest(BaseModel):
    ticket_id: Optional[str] = None
    subject: str = ""
    raw_content: str = ""
    source: str = "osticket"
    sender: str = "hung.nguyenmanh@dtt.vn"
    impacted_system: str = "Workspace"
    priority: str = "Urgent"
    qa_notes: Optional[str] = ""  # Ghi chú khảo sát thực tế & telemetry của QA
    attachments: Optional[List[AttachmentItem]] = []  # Tệp đính kèm / ảnh lỗi


@router.post("/create-issue")
async def create_github_issue(payload: Dict[str, Any]):
    """Endpoint tạo GitHub Issue 1-click gửi vào Private Repo."""
    res = await github_service.create_issue(payload)
    return res


@router.post("/ai-generate-template")
async def ai_generate_bug_template(req: GenerateBugPromptRequest):
    """
    Gọi Gemini AI kết hợp Domain Knowledge Pythaverse + Ghi chú QA thực tế.
    QUY TẮC ĐẶC BIỆT: CHỈ BÁO CÁO SỰ CỐ VÀ DỮ LIỆU THỰC TẾ (LOGS, ERROR CODE, REPRODUCTION).
    TUYỆT ĐỐI KHÔNG SUY DIỄN NGUYÊN NHÂN VÀ KHÔNG ĐƯA RA GIẢI PHÁP SỬA LỖI.
    """
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY chưa được cấu hình.")

    system_tech_context = load_system_knowledge(req.impacted_system)

    # Xử lý danh sách attachments thành markdown images / links
    attachments_markdown = ""
    if req.attachments and len(req.attachments) > 0:
        attachments_markdown = "\n".join([
            f"- ![{att.filename}]({att.url})" if any(att.filename.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp'])
            else f"- [📄 {att.filename}]({att.url})"
            for att in req.attachments
        ])
    else:
        attachments_markdown = "*(Không có tệp đính kèm)*"

    prompt = f"""
Bạn là Chuyên gia QA Kỹ thuật cấp cao tại Công ty Công nghệ DTT (Hệ sinh thái Pythaverse).
Nhiệm vụ: Soạn thảo một bản BÁO CÁO LỖI (BUG REPORT) KỸ THUẬT CHÍNH XÁC, THUẦN DỮ LIỆU THỰC NGHIỆM cho AI Coding Agent (Claude Code) xử lý mã nguồn.

=== QUY TẮC BẮT BUỘC (VI PHẠM SẼ BỊ TỪ CHỐI) ===
1. TUYỆT ĐỐI KHÔNG phân tích nguyên nhân gốc rễ (No Root Cause Analysis / No Hypothesis).
2. TUYỆT ĐỐI KHÔNG đề xuất giải pháp sửa chữa code (No Proposed Fix / No Solution Hints). AI Coding Agent sẽ tự đọc source code và tìm cách giải quyết.
3. CHỈ tập trung vào: Môi trường, Các bước tái hiện, Dữ liệu thực tế nhận về (HTTP code, Error log, Payload) và Ảnh chụp đính kèm.

=== 1. KIẾN TRÚC HỆ THỐNG NỘI BỘ ===
{system_tech_context}

=== 2. THÔNG TIN BÁO CÁO GỐC ===
- Nguồn: {req.source.upper()} | Mã Ticket: #{req.ticket_id or 'N/A'}
- Người gửi: {req.sender}
- Tiêu đề gốc: {req.subject}
- Nội dung gốc:
\"\"\"
{req.raw_content or req.subject}
\"\"\"

=== 3. DỮ LIỆU THỰC NGHIỆM & GHI CHÚ TỪ QA LEAD ===
\"{req.qa_notes or 'Không có ghi chú thêm.'}\"

=== 4. TỆP ĐÍNH KÈM SẴN CÓ ===
{attachments_markdown}

=== CẤU TRÚC MARKDOWN BẮT BUỘC PHẢI TRẢ VỀ ===
### [BUG][{req.priority.upper()}] <Mô tả ngắn gọn, chính xác hiện tượng lỗi>

**📌 THÔNG TIN SỰ CỐ (METADATA)**
- **Hệ thống liên quan (Impacted System):** [{req.impacted_system}]
- **Mức độ ưu tiên (Priority):** [{req.priority}]
- **Người báo cáo:** {req.sender} (Ticket #{req.ticket_id or 'N/A'})
- **Môi trường ghi nhận (Environment):** `https://{req.impacted_system.lower().replace(' ', '')}.pythaverse.space` (hoặc URL phân hệ thực tế)

---

**👣 CÁC BƯỚC TÁI HIỆN (STEPS TO REPRODUCE)**
1. <Bước 1>
2. <Bước 2>
3. <Bước 3>
4. Quan sát phản hồi lỗi nhận được.

---

**⚖️ KẾT QUẢ THỰC TẾ & MONG ĐỢI (ACTUAL VS EXPECTED)**
- **Hành vi mong đợi (Expected):** <Mô tả hành vi đúng chuẩn của hệ thống>
- **Hành vi thực tế (Actual):** <Mô tả chính xác lỗi xảy ra, thông báo lỗi UI hiển thị>

---

**🔍 DỮ LIỆU LỖI & BẰNG CHỨNG KỸ THUẬT (RAW TELEMETRY & LOGS)**
- **API Endpoint:** `<Điền endpoint thực tế nếu có, ví dụ /api/v1/... hoặc để N/A>`
- **HTTP Status / Error Code:** `<Mã lỗi HTTP hoặc Exception>`
- **Raw Log / Error Trace / Payload:**
```
<Trích dẫn nguyên văn log lỗi, request/response payload hoặc ghi chú của QA>
```

---

**📷 HÌNH ẢNH & TỆP ĐÍNH KÈM (MEDIA & ATTACHMENTS)**
{attachments_markdown}

---
*Báo cáo được tự động khởi tạo bởi Pythaverse QA Dispatcher.*
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
                    logger.info(f"✅ Gemini Model [{m_name}] đã sinh Bug Template chuẩn xác.")
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