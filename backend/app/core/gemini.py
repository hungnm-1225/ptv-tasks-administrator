import os
import json
import logging
import google.generativeai as genai
from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)

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
    def __init__(self, api_key: str = None):
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
        
        kb_path = os.path.join(os.path.dirname(__file__), "../brain/knowledge_base.json")
        try:
            with open(kb_path, 'r', encoding='utf-8') as f:
                self.kb = json.load(f)
        except Exception:
            self.kb = {"categories": ["bug", "account_keycloak", "lms_enroll", "license", "other"]}

    def analyze_ticket(self, subject: str, raw_content: str, source: str) -> dict:
        prompt = f"""
Bạn là trợ lý AI chuyên phân loại ticket cho Pythaverse. Hãy phân tích nội dung sau:

[NỘI DUNG TICKET]
- Nguồn: {source}
- Tiêu đề: {subject}
- Nội dung: {raw_content[:2000]}

[DANH MỤC HỢP LỆ]
Chỉ chọn 1 trong các giá trị: "bug", "account_keycloak", "lms_enroll", "license", "other"

Hãy trả về DUY NHẤT một JSON object:
{{
    "category": "Chọn 1 danh mục hợp lệ ở trên",
    "summary_vi": "Tóm tắt ngắn gọn bằng tiếng Việt về vấn đề chính.",
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
                logger.info(f"✨ Gemini AI tóm tắt thành công với model [{model_name}]")
                return json.loads(response.text)
            except Exception as e:
                err_msg = str(e).lower()
                if "429" in err_msg or "quota" in err_msg or "resource_exhausted" in err_msg:
                    logger.warning(f"⚠️ Model {model_name} hết quota, chuyển model...")
                    continue
                continue

        return {
            "category": "other",
            "summary_vi": f"Tóm tắt: {subject}",
            "assigned_name": "Hung Nguyen",
            "assigned_email": "hung.nguyenmanh@dtt.vn"
        }

async def process_ticket_with_ai(ticket_id: str):
    """Xử lý Tóm tắt AI & Tự động gắn Tag cho Ticket"""
    try:
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            return

        ticket = res.data[0]
        engine = AIEngine()
        ai_res = engine.analyze_ticket(
            subject=ticket.get("subject", ""),
            raw_content=ticket.get("raw_content", ""),
            source=ticket.get("source", "gmail")
        )

        supabase.table("inbox_tickets").update({
            "ai_summary": ai_res.get("summary_vi"),
            "category": ai_res.get("category", "other"),
            "assigned_name": ai_res.get("assigned_name"),
            "assigned_email": ai_res.get("assigned_email")
        }).eq("id", ticket_id).execute()
        
        logger.info(f"✅ Đã tóm tắt AI cho ticket #{ticket_id}")

    except Exception as e:
        logger.error(f"❌ Lỗi process_ticket_with_ai: {e}")


gemini_engine = AIEngine()