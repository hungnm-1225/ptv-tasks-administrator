from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from pydantic import BaseModel
from app.services.github_service import github_service
from app.core.gemini import ai_engine

router = APIRouter()

class GenerateBugPromptRequest(BaseModel):
    raw_issue_summary: str
    impacted_system: str = "Workspace"
    priority: str = "High"

@router.post("/create-issue")
async def create_github_issue(payload: Dict[str, Any]):
    """Endpoint tạo GitHub Issue 1-click gửi vào Private Repo."""
    res = await github_service.create_issue(payload)
    return res

@router.post("/ai-generate-template")
async def ai_generate_bug_template(req: GenerateBugPromptRequest):
    """Sử dụng Gemini AI để điền mẫu Bug Markdown chuẩn QA DTT từ nội dung tóm tắt ngắn."""
    prompt = f"""
Bạn là Chuyên gia QA Lead tại Pythaverse. Hãy chuyển đổi thông tin sự cố dưới đây thành một bản Báo Cáo Lỗi (Bug Report) hoàn chỉnh theo đúng cấu trúc Markdown sau:

### [BUG][{req.priority.upper()}] <Tiêu đề ngắn gọn, rõ ràng>

**📌 MÔ TẢ TỔNG QUAN (METADATA)**
- **Người báo cáo (Reported By):** Hùng QA
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
- **Định danh thực thể:** Course_ID, School_ID nếu có
- **Link báo cáo từ người dùng (User Report Link):** Support Ticket / Feedback Form

---

**👣 CÁC BƯỚC TÁI HIỆN (STEPS TO REPRODUCE)**
1. Đăng nhập hệ thống với vai trò tương ứng.
2. Điều hướng đến tính năng xảy ra sự cố.
3. Thực hiện thao tác gây ra lỗi.
4. Quan sát kết quả.

---

**⚖️ KẾT QUẢ THỰC TẾ VS MONG ĐỢI (EXPECTED VS ACTUAL)**
- **Kết quả mong đợi (Expected Results):** Hệ thống xử lý mượt mà, trả về dữ liệu chuẩn xác.
- **Kết quả thực tế (Actual Results):** {req.raw_issue_summary}

---

**🔍 BẰNG CHỨNG KỸ THUẬT (TECHNICAL EVIDENCE & LOGS)**
- **HTTP Status Code:** 500 Internal Server Error / 400 Bad Request
- **API Endpoint:** `https://pythaverse.space/api/...`
- **Payload gửi đi (Request Payload):** 
```json
{{ "action": "test_action" }}
```

Dựa trên thông tin sự cố sau: "{req.raw_issue_summary}", hãy suy luận và điền chi tiết vào mẫu trên, giữ nguyên cấu trúc Markdown tiếng Việt. Trả về toàn bộ nội dung Markdown thuần túy.
"""
    try:
        model = ai_engine.get_model()
        response = model.generate_content(prompt)
        generated_markdown = response.text.strip()
        
        # Tách tiêu đề từ dòng đầu tiên
        first_line = generated_markdown.split("\n")[0].replace("###", "").strip()
        
        return {
            "title": first_line if first_line else f"[BUG][{req.priority.upper()}] {req.raw_issue_summary[:50]}",
            "body": generated_markdown
        }
    except Exception as e:
        # Fallback mẫu tĩnh nếu AI bận
        return {
            "title": f"[BUG][{req.priority.upper()}] {req.raw_issue_summary}",
            "body": f"### [BUG][{req.priority.upper()}] {req.raw_issue_summary}\n\n**📌 MÔ TẢ TỔNG QUAN (METADATA)**\n- **Người báo cáo:** Hùng QA\n- **Hệ thống:** {req.impacted_system}\n- **Nội dung:** {req.raw_issue_summary}"
        }