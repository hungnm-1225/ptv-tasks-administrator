# backend/app/core/gemini.py
import os
import re
import json
import logging
import tempfile
import urllib.request
from typing import Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

import google.generativeai as genai
from app.core.supabase import get_supabase_client
from app.services.cof_excel_service import COFExcelService

try:
    from app.core.config import settings
except Exception:
    settings = None

logger = logging.getLogger(__name__)

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
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = (
            api_key
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
            or (getattr(settings, "GEMINI_API_KEY", None) if settings else None)
        )
        if self.api_key:
            genai.configure(api_key=self.api_key)
            logger.info("🔑 Đã kết nối và xác thực thành công Gemini API Key!")
        else:
            logger.error("❌ Không tìm thấy GEMINI_API_KEY hoặc GOOGLE_API_KEY trong môi trường!")

        brain_dir = os.path.join(os.path.dirname(__file__), "../brain")
        kb_path = os.path.join(brain_dir, "knowledge_base.json")
        try:
            with open(kb_path, 'r', encoding='utf-8') as f:
                self.kb = json.load(f)
        except Exception as e:
            logger.warning(f"⚠️ Không đọc được knowledge_base.json: {e}")
            self.kb = {
                "categories": ["bug", "account_keycloak", "lms_enroll", "license", "other"],
                "default_assignee": {"name": "Hung Nguyen", "email": "hung.nguyenmanh@dtt.vn"}
            }

        # Nạp Capabilities & Workflow Rules để grounding AI
        self.capabilities_summary = []
        try:
            cap_path = os.path.join(brain_dir, "capabilities.json")
            if os.path.exists(cap_path):
                with open(cap_path, 'r', encoding='utf-8') as f:
                    caps = json.load(f).get("capabilities", [])
                    self.capabilities_summary = [
                        {"id": c["id"], "name": c["name"], "domain": c["domain"], "action": c["action"]}
                        for c in caps
                    ]
        except Exception as cap_err:
            logger.warning(f"⚠️ Lỗi nạp capabilities: {cap_err}")

        self.workflow_archetypes_summary = []
        try:
            wf_path = os.path.join(brain_dir, "workflow_rules.json")
            if os.path.exists(wf_path):
                with open(wf_path, 'r', encoding='utf-8') as f:
                    rules = json.load(f).get("workflow_archetypes", [])
                    self.workflow_archetypes_summary = [
                        {"rule_id": r["rule_id"], "title": r["title"], "description": r["description"]}
                        for r in rules
                    ]
        except Exception as wf_err:
            logger.warning(f"⚠️ Lỗi nạp workflow rules: {wf_err}")

    def analyze_ticket(
        self, 
        subject: str, 
        raw_content: str, 
        source: str,
        excel_summary: Optional[Dict[str, Any]] = None,
        attachments: Optional[list] = None
    ) -> Dict[str, Any]:
        if not self.api_key:
            return {
                "category": "other",
                "priority": "normal",
                "summary_vi": f"🎯 Mục đích gốc: {subject}\n🔄 Tiến trình: Thiếu API Key AI\n⚡ Hành động đề xuất: Cần cấu hình GEMINI_API_KEY.",
                "assigned_name": "Hung Nguyen",
                "assigned_email": "hung.nguyenmanh@dtt.vn",
                "target_email": None,
                "detected_school": None,
                "suggested_bot_type": None,
                "suggested_action": None,
                "suggested_payload": {},
                "recommended_workflow_rule": None,
                "reason_summary_vi": "Thiếu API Key AI để lập kế hoạch."
            }

        kb_json_str = json.dumps(self.kb, ensure_ascii=False, indent=2)
        caps_str = json.dumps(self.capabilities_summary, ensure_ascii=False, indent=2)
        wf_rules_str = json.dumps(self.workflow_archetypes_summary, ensure_ascii=False, indent=2)
        excel_info_str = json.dumps(excel_summary, ensure_ascii=False, indent=2) if excel_summary else "Không có file Excel đính kèm hoặc chưa bóc tách."
        full_content = raw_content[:20000] if raw_content else ""

        prompt = f"""
Bạn là Trợ lý AI Phân loại & Điều phối Vận hành Cấp cao của Hệ sinh thái Pythaverse & DTT Corporation.
Nhiệm vụ của bạn là đọc kỹ TOÀN BỘ thông tin vé, LỊCH SỬ TRAO ĐỔI và DỮ LIỆU BÓC TÁCH TỪ FILE ĐÍNH KÈM (nếu có).

[TRI THỨC HỆ THỐNG & DANH MỤC CAPABILITY ĐƯỢC PHÉP CHỌN]
- Hệ thống tri thức chung:
{kb_json_str}

- Danh mục Capabilities hợp lệ (KHÔNG ĐƯỢC TỰ PHÁT MINH CAPABILITY NGOÀI DANH SÁCH):
{caps_str}

- Các sườn Workflow Archetypes chuẩn:
{wf_rules_str}

[THÔNG TIN FILE EXCEL BÓC TÁCH ĐƯỢC]
{excel_info_str}

[NỘI DUNG VÉ CẦN PHÂN TÍCH]
- Nguồn tiếp nhận: {source}
- Tiêu đề vé: {subject}
- Chi tiết nội dung & Tiến trình trao đổi:
{full_content}

[QUY TẮC PHÂN BIỆT EMAIL ĐẶC BIỆT QUAN TRỌNG]:
- Phải phân biệt rõ ràng giữa:
  1. Người gửi/Người báo cáo (Sender/Submitter): người gửi email yêu cầu hỗ trợ.
  2. Tài khoản mục tiêu (target_email/target_users): là tài khoản học sinh, giáo viên hoặc người dùng ĐƯỢC NHẮC ĐẾN TRONG NỘI DUNG cần reset mật khẩu, kích hoạt hoặc ghi danh.
  -> ĐỌC KỸ VÀ PHÂN TÍCH NGỮ CẢNH CẨN THẬN ĐỂ XÁC ĐỊNH ĐÂU LÀ ĐỐI TƯỢNG CẦN XỬ LÝ.

[HƯỚNG DẪN QUY CHUẨN ĐẦU RA JSON]
1. 'category': 1 trong 5 giá trị: "license", "lms_enroll", "account_keycloak", "bug", "other".
2. 'priority': "critical" hoặc "normal".
3. 'summary_vi': Bắt buộc 3 phần:
   • 🎯 Mục đích gốc: ...
   • 🔄 Tiến trình & Cập nhật mới nhất: ...
   • ⚡ Hành động đề xuất: ...
4. 'target_email': Email hoặc username của người dùng/học sinh cần can thiệp (ví dụ: reset pass, active, ghi danh). Nếu không có, để null.
5. 'detected_school': Tên hoặc mã trường học nhắc đến (ví dụ: ICA, Vinschool, FPT, Nguyễn Du...) hoặc null.
6. 'recommended_workflow_rule': 1 trong các rule archetype ("CREATE_ACCOUNTS_AND_ENROLL_LMS", "COF_FULL_ONBOARDING", "KEYCLOAK_IDENTITY_MANAGEMENT", "GIT_COLLABORATOR_ACCESS", "FEEDBACK_DOC_TRIAGE").
7. 'reason_summary_vi': Giải thích ngắn gọn lý do vì sao chọn workflow và thứ tự các bước (Why this workflow?).
8. 'suggested_bot_type': "workspace_rpa" | "keycloak_api" | "lms_playwright" | "git_collaborator" | "feedback_doc_triage" | null.
9. 'suggested_action': Tên action cụ thể.
10. 'suggested_payload': JSON chứa sẵn các tham số (ví dụ: target_email, identifiers, school_name, courses...).

HÃY TRẢ VỀ DUY NHẤT MỘT JSON OBJECT HỢP LỆ:
{{
    "category": "lms_enroll",
    "priority": "normal",
    "summary_vi": "🎯 Mục đích gốc: ...\\n🔄 Tiến trình & Cập nhật mới nhất: ...\\n⚡ Hành động đề xuất: ...",
    "assigned_name": "Hung Nguyen",
    "assigned_email": "hung.nguyenmanh@dtt.vn",
    "target_email": null,
    "detected_school": "Nguyễn Du Primary School",
    "recommended_workflow_rule": "CREATE_ACCOUNTS_AND_ENROLL_LMS",
    "reason_summary_vi": "Yêu cầu cần tạo tài khoản cho học sinh trường Nguyễn Du trước, sau đó dùng chính các tài khoản này để ghi danh vào khóa học LMS, do đó bước tạo tài khoản phải chạy trước bước ghi danh.",
    "suggested_bot_type": "workspace_rpa",
    "suggested_action": "bulk_account_creation",
    "suggested_payload": {{
        "school_name": "Nguyễn Du Primary School"
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
                    logger.info(f"✨ Gemini AI phân tích thành công với model [{model_name}]")
                    parsed_res = json.loads(response.text)
                    return {
                        "category": parsed_res.get("category", "other"),
                        "priority": parsed_res.get("priority", "normal"),
                        "summary_vi": parsed_res.get("summary_vi", f"Tóm tắt: {subject}"),
                        "assigned_name": parsed_res.get("assigned_name", "Hung Nguyen"),
                        "assigned_email": parsed_res.get("assigned_email", "hung.nguyenmanh@dtt.vn"),
                        "target_email": parsed_res.get("target_email"),
                        "detected_school": parsed_res.get("detected_school"),
                        "recommended_workflow_rule": parsed_res.get("recommended_workflow_rule"),
                        "reason_summary_vi": parsed_res.get("reason_summary_vi"),
                        "suggested_bot_type": parsed_res.get("suggested_bot_type"),
                        "suggested_action": parsed_res.get("suggested_action"),
                        "suggested_payload": parsed_res.get("suggested_payload", {})
                    }
            except Exception as e:
                logger.warning(f"⚠️ Model {model_name} gặp lỗi, đang chuyển fallback...")
                continue

        return {
            "category": "other",
            "priority": "normal",
            "summary_vi": f"🎯 Mục đích gốc: {subject}\n🔄 Tiến trình: Tiếp nhận vé\n⚡ Hành động đề xuất: Kiểm tra thủ công.",
            "assigned_name": "Hung Nguyen",
            "assigned_email": "hung.nguyenmanh@dtt.vn",
            "target_email": None,
            "detected_school": None,
            "suggested_bot_type": None,
            "suggested_action": None,
            "suggested_payload": {}
        }

gemini_engine = AIEngine()

async def process_ticket_with_ai(ticket_id: str) -> Optional[Dict[str, Any]]:
    try:
        supabase = get_supabase_client()
        res = supabase.table("inbox_tickets").select("*").eq("id", ticket_id).execute()
        if not res.data:
            return None

        ticket = res.data[0]
        attachments = ticket.get("attachments") or []
        excel_summary = None

        for att in attachments:
            fname = att.get("filename", "").lower()
            furl = att.get("url", "")
            if (fname.endswith(".xlsx") or fname.endswith(".xls")) and furl:
                try:
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
                    logger.warning(f"⚠️ Lỗi bóc tách file Excel [{fname}]: {ex_err}")

        engine = AIEngine()
        ai_res = engine.analyze_ticket(
            subject=ticket.get("subject", ""),
            raw_content=ticket.get("raw_content", ""),
            source=ticket.get("source", "gmail"),
            excel_summary=excel_summary,
            attachments=attachments
        )

        existing_meta = ticket.get("metadata") or {}
        if not isinstance(existing_meta, dict):
            existing_meta = {}

        suggested_payload = ai_res.get("suggested_payload") or {}

        # Nếu có target_email từ AI, lưu chặt chẽ vào metadata
        if ai_res.get("target_email"):
            existing_meta["target_email"] = ai_res.get("target_email")
            suggested_payload["target_email"] = ai_res.get("target_email")
            suggested_payload["identifiers"] = [ai_res.get("target_email")]

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
        logger.info(f"✅ Đã tiền xử lý AI hoàn tất cho ticket #{ticket_id} (Target Email: {ai_res.get('target_email')})")
        return ai_res

    except Exception as e:
        logger.error(f"❌ Lỗi process_ticket_with_ai: {e}")
        return None