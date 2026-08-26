# backend/app/core/gemini.py
import os
import re
import json
import logging
from typing import Dict, Any, Optional
import google.generativeai as genai
from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)

# Danh sách fallback 10 model Gemini linh hoạt, ưu tiên tốc độ & độ ổn định
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

class AIEngine:
    """Bộ máy AI Gemini Triage phân tích thông minh toàn bộ tiến trình hội thoại của Ticket."""

    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
        
        # Nạp tri thức doanh nghiệp từ knowledge_base.json
        kb_path = os.path.join(os.path.dirname(__file__), "../brain/knowledge_base.json")
        try:
            with open(kb_path, 'r', encoding='utf-8') as f:
                self.kb = json.load(f)
        except Exception as e:
            logger.warning(f"⚠️ Không đọc được knowledge_base.json: {e}")
            self.kb = {
                "categories": ["bug", "account_keycloak", "lms_enroll", "license", "other"],
                "default_assignee": {
                    "name": "Hung Nguyen",
                    "email": "hung.nguyenmanh@dtt.vn"
                }
            }

    def analyze_ticket(self, subject: str, raw_content: str, source: str) -> Dict[str, Any]:
        """Phân tích toàn bộ thông tin vé và lịch sử trao đổi đa chiều."""
        kb_json_str = json.dumps(self.kb, ensure_ascii=False, indent=2)
        
        # Không cắt cụt nội dung ở 2000 ký tự nữa, cho phép đọc đến 20.000 ký tự để nắm trọn thread
        full_content = raw_content[:20000] if raw_content else ""

        prompt = f"""
Bạn là Trợ lý AI Phân loại & Điều phối Vận hành Cấp cao của Hệ sinh thái Pythaverse & DTT Corporation.
Nhiệm vụ của bạn là đọc kỹ TOÀN BỘ thông tin vé cùng LỊCH SỬ HỘI THOẠI TRAO ĐỔI (từ tin nhắn đầu tiên đến tin nhắn mới nhất) để tóm tắt chính xác tiến độ và đề xuất hành động.

[TRI THỨC HỆ THỐNG & ĐỊNH NGHĨA PHÂN QUYỀN (KNOWLEDGE BASE)]
{kb_json_str}

[NỘI DUNG VÉ CẦN PHÂN TÍCH]
- Nguồn tiếp nhận: {source}
- Tiêu đề vé: {subject}
- Chi tiết nội dung & Tiến trình trao đổi:
{full_content}

[HƯỚNG DẪN QUY CHUẨN ĐẦU RA]
1. 'category': Bắt buộc chọn DUY NHẤT 1 trong các giá trị:
   - "bug" (Lỗi kỹ thuật, hệ thống hỏng, không đăng nhập được)
   - "account_keycloak" (Yêu cầu reset mật khẩu, kích hoạt/xóa tài khoản cá nhân hoặc giáo viên)
   - "lms_enroll" (Yêu cầu ghi danh học sinh/giáo viên vào môn học trên Moodle LMS PLearn)
   - "license" (Yêu cầu tạo đơn hàng School Order, duyệt Hợp đồng Partner/Distributor, nộp file COF tạo tài khoản hàng loạt)
   - "other" (Thông báo chung, lịch nghỉ lễ, hỏi đáp ngoài lề)

2. 'priority': Chọn "critical" nếu là sự cố khẩn cấp/lỗi nghẽn diện rộng/gần deadline, hoặc "normal".

3. 'summary_vi': Tóm tắt thông minh bằng Tiếng Việt súc tích, PHẢI có cấu trúc 3 phần rõ ràng:
   • 🎯 Mục đích gốc: (Mục đích ban đầu khi mở ticket)
   • 🔄 Tiến trình & Cập nhật mới nhất: (Nêu rõ các bên đã xử lý tới đâu, đặc biệt nhấn mạnh các thay đổi/hủy bỏ/yêu cầu mới/file mới nộp trong các tin nhắn gần nhất)
   • ⚡ Hành động đề xuất: (Việc admin cần làm tiếp theo, ví dụ: Đóng vé do đã có vé thay thế #..., hoặc phê duyệt License, hoặc nộp batch tài khoản...)

4. 'assigned_name' & 'assigned_email': Đề xuất cán bộ phụ trách từ Knowledge Base (hoặc mặc định là 'Hung Nguyen' - 'hung.nguyenmanh@dtt.vn').

HÃY TRẢ VỀ DUY NHẤT MỘT JSON OBJECT HỢP LỆ:
{{
    "category": "license",
    "priority": "normal",
    "summary_vi": "🎯 Mục đích gốc: ...\\n🔄 Tiến trình & Cập nhật mới nhất: ...\\n⚡ Hành động đề xuất: ...",
    "assigned_name": "Hung Nguyen",
    "assigned_email": "hung.nguyenmanh@dtt.vn"
}}
"""
        for model_name in GEMINI_MODELS:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                if response and response.text:
                    logger.info(f"✨ Gemini AI tóm tắt thành công với model [{model_name}]")
                    parsed_res = json.loads(response.text)
                    return {
                        "category": parsed_res.get("category", "other"),
                        "priority": parsed_res.get("priority", "normal"),
                        "summary_vi": parsed_res.get("summary_vi", f"Tóm tắt: {subject}"),
                        "assigned_name": parsed_res.get("assigned_name", "Hung Nguyen"),
                        "assigned_email": parsed_res.get("assigned_email", "hung.nguyenmanh@dtt.vn")
                    }
            except Exception as e:
                err_msg = str(e).lower()
                logger.warning(f"⚠️ Model {model_name} gặp lỗi ({err_msg[:60]}...), đang chuyển fallback...")
                continue

        logger.error("❌ Tất cả các model Gemini đều thất bại, sử dụng fallback mặc định.")
        return {
            "category": "other",
            "priority": "normal",
            "summary_vi": f"🎯 Mục đích gốc: {subject}\n🔄 Tiến trình: Tiếp nhận vé từ {source}\n⚡ Hành động đề xuất: Kiểm tra và xử lý thủ công.",
            "assigned_name": "Hung Nguyen",
            "assigned_email": "hung.nguyenmanh@dtt.vn"
        }


gemini_engine = AIEngine()


async def process_ticket_with_ai(ticket_id: str):
    """Xử lý Tóm tắt AI & Tự động gắn Tag/Assignee cho Ticket và cập nhật vào Supabase."""
    try:
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            logger.warning(f"⚠️ Không tìm thấy ticket ID: {ticket_id}")
            return

        ticket = res.data[0]
        engine = AIEngine()
        ai_res = engine.analyze_ticket(
            subject=ticket.get("subject", ""),
            raw_content=ticket.get("raw_content", ""),
            source=ticket.get("source", "gmail")
        )

        update_data = {
            "ai_summary": ai_res.get("summary_vi"),
            "category": ai_res.get("category", "other"),
            "priority": ai_res.get("priority", "normal"),
            "assigned_name": ai_res.get("assigned_name", "Hung Nguyen"),
            "assigned_email": ai_res.get("assigned_email", "hung.nguyenmanh@dtt.vn")
        }

        supabase.table("inbox_tickets").update(update_data).eq("id", ticket_id).execute()
        logger.info(f"✅ Đã tóm tắt AI hoàn tất cho ticket #{ticket_id} (Category: {update_data['category']})")

    except Exception as e:
        logger.error(f"❌ Lỗi process_ticket_with_ai: {e}")