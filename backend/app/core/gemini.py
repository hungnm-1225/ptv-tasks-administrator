import os
import json
import logging
import google.generativeai as genai
from typing import Dict, Any

logger = logging.getLogger(__name__)

GEMINI_MODELS = [
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
        genai.configure(api_key=api_key)
        
        # Đọc file knowledge_base.json
        kb_path = os.path.join(os.path.dirname(__file__), "../brain/knowledge_base.json")
        with open(kb_path, 'r', encoding='utf-8') as f:
            self.kb = json.load(f)

    def analyze_feedback(self, subject: str, remarks: str, doc_content: str, country: str) -> dict:
        prompt = f"""
Bạn là trợ lý AI chuyên phân loại ticket hỗ trợ cho hệ thống Pythaverse. Hãy phân tích thông tin sau:

[THÔNG TIN FEEDBACK]
- Quốc gia: {country}
- Tiêu đề (Subject): {subject}
- Ghi chú (Remarks): {remarks}
- Nội dung file Doc đính kèm: {doc_content if doc_content else "Không có file Doc."}

[KNOWLEDGE BASE]
Danh mục hợp lệ (Category): {json.dumps(self.kb['categories'])}
Danh sách nhân sự (Team): {json.dumps(self.kb['team_members'], ensure_ascii=False)}

[QUY TẮC GÁN NGƯỜI PHỤ TRÁCH]
1. Nếu vấn đề khớp rõ ràng với từ khóa/vai trò của nhân sự nào, hãy gán cho nhân sự đó.
2. Nếu không khớp cụ thể, MẶC ĐỊNH gán cho Administrator: Hung Nguyen (email: hung.nguyenmanh@dtt.vn).

Trả về DUY NHẤT một JSON object:
{{
    "category": "Chọn 1 Category phù hợp nhất",
    "assigned_name": "Tên người phụ trách",
    "assigned_email": "Email người phụ trách",
    "summary_vi": "Tóm tắt ngắn 2 câu bằng tiếng Việt cho Telegram và Web Admin.",
    "summary_en": "Short 2-sentence summary in English for Google Doc comment."
}}
"""
        for model_name in GEMINI_MODELS:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                return json.loads(response.text)
            except Exception as e:
                logger.warning(f"Lỗi model {model_name}: {e}")
                continue

        # Fallback an toàn nếu AI lỗi
        default_person = self.kb.get("default_assignee", {"name": "Hung Nguyen", "email": "hung.nguyenmanh@dtt.vn"})
        return {
            "category": "other",
            "assigned_name": default_person["name"],
            "assigned_email": default_person["email"],
            "summary_vi": f"Tiêu đề: {subject}",
            "summary_en": f"Subject: {subject}"
        }


async def process_ticket_with_ai(ticket_id: str):
    """Xử lý ticket qua Gemini AI: phân loại và ghi kết quả vào Supabase."""
    try:
        from app.core.supabase import get_supabase_client
        client = get_supabase_client()

        result = client.table("inbox_tickets").select("*").eq("id", ticket_id).single().execute()
        if not result.data:
            logger.warning(f"Không tìm thấy ticket {ticket_id} trong Supabase.")
            return

        ticket = result.data
        engine = AIEngine()
        analysis = engine.analyze_feedback(
            subject=ticket.get("subject", ""),
            remarks=ticket.get("raw_content", ""),
            doc_content="",
            country=""
        )

        client.table("inbox_tickets").update({
            "category": analysis.get("category"),
            "assigned_name": analysis.get("assigned_name"),
            "assigned_email": analysis.get("assigned_email"),
            "summary_vi": analysis.get("summary_vi"),
            "status": "analyzed"
        }).eq("id", ticket_id).execute()

        logger.info(f"✅ AI đã phân tích ticket {ticket_id}: {analysis.get('category')}")
    except Exception as e:
        logger.error(f"❌ Lỗi process_ticket_with_ai({ticket_id}): {e}")


class GeminiEngine:
    """High-level engine used by ticket_processor for triage workflows."""

    async def triage_ticket(self, raw_content: str, subject: str) -> Dict[str, Any]:
        """Phân tích ticket và trả về category, bot_type gợi ý, và payload."""
        try:
            engine = AIEngine()
            result = engine.analyze_feedback(
                subject=subject,
                remarks=raw_content,
                doc_content="",
                country=""
            )
            # Map sang format ticket_processor expects
            return {
                "category": result.get("category", "other"),
                "summary": result.get("summary_vi", subject),
                "suggested_bot_type": None,
                "suggested_payload": {
                    "assigned_name": result.get("assigned_name"),
                    "assigned_email": result.get("assigned_email"),
                    "category": result.get("category"),
                }
            }
        except Exception as e:
            logger.error(f"❌ GeminiEngine.triage_ticket lỗi: {e}")
            return {
                "category": "other",
                "summary": subject,
                "suggested_bot_type": None,
                "suggested_payload": {}
            }


gemini_engine = GeminiEngine()