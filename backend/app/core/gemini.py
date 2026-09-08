# backend/app/core/gemini.py
import os
import re
import json
import logging
import tempfile
import urllib.request
from typing import Dict, Any, Optional
import google.generativeai as genai
from app.core.supabase import get_supabase_client
from app.services.cof_excel_service import COFExcelService

logger = logging.getLogger(__name__)

# Danh sách 10 model Gemini linh hoạt tự phục hồi
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

class AIEngine:
    """Bộ máy AI Gemini Triage phân tích thông minh toàn bộ tiến trình hội thoại của Ticket & Tiền xử lý Task."""

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

    def analyze_ticket(
        self, 
        subject: str, 
        raw_content: str, 
        source: str,
        excel_summary: Optional[Dict[str, Any]] = None,
        attachments: Optional[list] = None
    ) -> Dict[str, Any]:
        """Phân tích nội dung vé, tài liệu đính kèm và cấu trúc hóa sẵn Bot Task đề xuất."""
        kb_json_str = json.dumps(self.kb, ensure_ascii=False, indent=2)
        excel_info_str = json.dumps(excel_summary, ensure_ascii=False, indent=2) if excel_summary else "Không có file Excel đính kèm hoặc chưa bóc tách."
        
        full_content = raw_content[:20000] if raw_content else ""

        prompt = f"""
Bạn là Trợ lý AI Phân loại & Điều phối Vận hành Cấp cao của Hệ sinh thái Pythaverse & DTT Corporation.
Nhiệm vụ của bạn là đọc kỹ TOÀN BỘ thông tin vé, LỊCH SỬ TRAO ĐỔI và DỮ LIỆU BÓC TÁCH TỪ FILE ĐÍNH KÈM (nếu có) để:
1. Tóm tắt chính xác tiến độ.
2. Phân loại Category & Priority.
3. Đề xuất CHÍNH XÁC Cỗ Máy Bot (suggested_bot_type) và Hành Động (suggested_action).
4. Chuẩn bị sẵn MÂM CỖ DỮ LIỆU (suggested_payload) hoàn chỉnh để Quản trị viên chỉ cần bấm "1-Click Duyệt & Chạy Ngay".

[TRI THỨC HỆ THỐNG & QUY TẮC ĐIỀU PHỐI BOT]
{kb_json_str}

[THÔNG TIN FILE EXCEL BÓC TÁCH ĐƯỢC TỪ TỆP ĐÍNH KÈM]
{excel_info_str}

[NỘI DUNG VÉ CẦN PHÂN TÍCH]
- Nguồn tiếp nhận: {source}
- Tiêu đề vé: {subject}
- Chi tiết nội dung & Tiến trình trao đổi:
{full_content}

[HƯỚNG DẪN QUY CHUẨN ĐẦU RA JSON]
1. 'category': Bắt buộc 1 trong 5 giá trị:
   - "license" (Tạo Order, duyệt hợp đồng, cấp phép môn học, nộp COF tạo tài khoản)
   - "lms_enroll" (Ghi danh/hủy ghi danh học sinh/giáo viên vào khóa học Moodle PLearn)
   - "account_keycloak" (Reset mật khẩu, kích hoạt/khóa tài khoản, xác thực email cá nhân)
   - "bug" (Báo lỗi hệ thống, sự cố phần mềm)
   - "other" (Hỏi đáp, thông báo chung)

2. 'priority': "critical" (khẩn cấp/gần hạn/lỗi diện rộng) hoặc "normal".

3. 'summary_vi': Bắt buộc 3 phần rõ ràng:
   • 🎯 Mục đích gốc: ...
   • 🔄 Tiến trình & Cập nhật mới nhất: ...
   • ⚡ Hành động đề xuất: ...

4. 'suggested_bot_type': 1 trong các giá trị:
   - "workspace_rpa" (Nếu liên quan đến trường học, đơn hàng, file COF hoặc tạo tài khoản batch)
   - "lms_playwright" (Nếu yêu cầu ghi danh vào Moodle LMS learn.pythaverse.space)
   - "keycloak_api" (Nếu yêu cầu reset pass, mở tài khoản IDP)
   - "git_collaborator" (Nếu yêu cầu thêm vào repo git.pythaverse.space)
   - "feedback_doc_triage" (Nếu nguồn là google_form hoặc có Google Doc)
   - null (Nếu là bug chỉ cần báo cáo hoặc trao đổi thông thường)

5. 'suggested_action':
   - Nếu workspace_rpa: "pipeline_end_to_end" (nếu có trường + môn học/COF), "bulk_account_creation" (nếu nộp file tạo user), "approve_school_order_standalone", "admin_approve_contract".
   - Nếu lms_playwright: "direct_moodle_lms_enroll" hoặc "unenrol_users_pipeline".
   - Nếu keycloak_api: "reset_password", "enable_account", v.v.
   - Nếu git_collaborator: "add_repo_collaborators".
   - Nếu feedback_doc_triage: "comment_and_assign".

6. 'suggested_payload': Một JSON Object chứa sẵn mọi tham số đã bóc tách được (ví dụ: school_name, target_email, student_emails, courses, licenses, contact_info...).

HÃY TRẢ VỀ DUY NHẤT MỘT JSON OBJECT HỢP LỆ THEO MẪU:
{{
    "category": "license",
    "priority": "normal",
    "summary_vi": "🎯 Mục đích gốc: ...\\n🔄 Tiến trình & Cập nhật mới nhất: ...\\n⚡ Hành động đề xuất: ...",
    "assigned_name": "Hung Nguyen",
    "assigned_email": "hung.nguyenmanh@dtt.vn",
    "detected_school": "Tên trường học nhận diện được hoặc null",
    "suggested_bot_type": "workspace_rpa",
    "suggested_action": "pipeline_end_to_end",
    "suggested_payload": {{
        "school_name": "...",
        "contact_info": "Admin Automation Hub",
        "additional_notes": "Tự động tạo từ Ticket"
    }}
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
                    logger.info(f"✨ Gemini AI phân tích & đề xuất task thành công với model [{model_name}]")
                    parsed_res = json.loads(response.text)
                    return {
                        "category": parsed_res.get("category", "other"),
                        "priority": parsed_res.get("priority", "normal"),
                        "summary_vi": parsed_res.get("summary_vi", f"Tóm tắt: {subject}"),
                        "assigned_name": parsed_res.get("assigned_name", "Hung Nguyen"),
                        "assigned_email": parsed_res.get("assigned_email", "hung.nguyenmanh@dtt.vn"),
                        "detected_school": parsed_res.get("detected_school"),
                        "suggested_bot_type": parsed_res.get("suggested_bot_type"),
                        "suggested_action": parsed_res.get("suggested_action"),
                        "suggested_payload": parsed_res.get("suggested_payload", {})
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
            "assigned_email": "hung.nguyenmanh@dtt.vn",
            "detected_school": None,
            "suggested_bot_type": None,
            "suggested_action": None,
            "suggested_payload": {}
        }


gemini_engine = AIEngine()


async def process_ticket_with_ai(ticket_id: str) -> Optional[Dict[str, Any]]:
    """Xử lý Tóm tắt AI, Tự động đọc File COF Excel đính kèm & Chuẩn bị sẵn Bot Task vào Supabase."""
    try:
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            logger.warning(f"⚠️ Không tìm thấy ticket ID: {ticket_id}")
            return None

        ticket = res.data[0]
        attachments = ticket.get("attachments") or []
        excel_summary = None

        # 🔍 BƯỚC ĐỘT PHÁ: Tìm và bóc tách file Excel/COF đính kèm ngay lập tức
        for att in attachments:
            fname = att.get("filename", "").lower()
            furl = att.get("url", "")
            if (fname.endswith(".xlsx") or fname.endswith(".xls")) and furl:
                try:
                    logger.info(f"📑 Tìm thấy file Excel đính kèm [{fname}], đang tải tạm để bóc tách...")
                    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp_file:
                        urllib.request.urlretrieve(furl, tmp_file.name)
                        temp_path = tmp_file.name

                    if COFExcelService.is_cof_file(temp_path):
                        parsed_cof = COFExcelService.parse_cof_file(temp_path)
                        excel_summary = {
                            "is_cof": True,
                            "filename": fname,
                            "school_name": parsed_cof.get("school_name"),
                            "courses": parsed_cof.get("courses", []),
                            "total_students": len(parsed_cof.get("students_all", [])),
                            "students_to_create": len(parsed_cof.get("students_to_create", [])),
                            "total_teachers": len(parsed_cof.get("teachers_all", [])),
                            "teachers_to_create": len(parsed_cof.get("teachers_to_create", [])),
                        }
                        logger.info(f"🎉 Bóc tách COF thành công: Trường {excel_summary['school_name']}, {len(excel_summary['courses'])} môn, {excel_summary['students_to_create']} HS cần tạo.")
                    else:
                        excel_summary = {
                            "is_cof": False,
                            "filename": fname,
                            "notice": "File danh sách tài khoản chuẩn"
                        }

                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                    break
                except Exception as ex_err:
                    logger.warning(f"⚠️ Không thể bóc tách file Excel [{fname}]: {ex_err}")

        # Gọi AI phân tích có kèm dữ liệu bóc tách Excel
        engine = AIEngine()
        ai_res = engine.analyze_ticket(
            subject=ticket.get("subject", ""),
            raw_content=ticket.get("raw_content", ""),
            source=ticket.get("source", "gmail"),
            excel_summary=excel_summary,
            attachments=attachments
        )

        # Hợp nhất metadata cũ với dữ liệu tiền xử lý mới
        existing_meta = ticket.get("metadata") or {}
        if not isinstance(existing_meta, dict):
            existing_meta = {}

        suggested_payload = ai_res.get("suggested_payload") or {}
        
        # Nếu có thông tin file Excel COF, tự động bổ sung vào payload
        if excel_summary:
            existing_meta["excel_summary"] = excel_summary
            if excel_summary.get("school_name") and not suggested_payload.get("school_name"):
                suggested_payload["school_name"] = excel_summary["school_name"]
            if excel_summary.get("courses"):
                existing_meta["cof_courses"] = excel_summary["courses"]
                if "order_details" in suggested_payload:
                    suggested_payload["order_details"]["courses"] = excel_summary["courses"]

        if ai_res.get("detected_school"):
            existing_meta["school_name"] = ai_res.get("detected_school")

        # Lưu trọn gói thông tin đề xuất
        existing_meta["suggested_bot_task"] = {
            "bot_type": ai_res.get("suggested_bot_type"),
            "action": ai_res.get("suggested_action"),
            "payload": suggested_payload
        }

        update_data = {
            "ai_summary": ai_res.get("summary_vi"),
            "category": ai_res.get("category", "other"),
            "priority": ai_res.get("priority", "normal"),
            "assigned_name": ai_res.get("assigned_name", "Hung Nguyen"),
            "assigned_email": ai_res.get("assigned_email", "hung.nguyenmanh@dtt.vn"),
            "metadata": existing_meta
        }

        supabase.table("inbox_tickets").update(update_data).eq("id", ticket_id).execute()
        logger.info(f"✅ Đã tiền xử lý AI hoàn tất cho ticket #{ticket_id} (Đề xuất bot: {ai_res.get('suggested_bot_type')})")
        return ai_res

    except Exception as e:
        logger.error(f"❌ Lỗi process_ticket_with_ai: {e}")
        return None