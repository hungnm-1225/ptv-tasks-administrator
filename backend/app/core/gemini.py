# backend/app/core/gemini.py
import os
import re
import json
import logging
import tempfile
import urllib.request
from typing import Dict, Any, Optional, List
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
                "workflow_outcome": "NO_ACTION",
                "goal": subject,
                "summary_vi": f"🎯 Mục đích gốc: {subject}\n🔄 Tiến trình: Thiếu API Key AI\n⚡ Hành động đề xuất: Cần cấu hình GEMINI_API_KEY.",
                "assigned_name": "Hung Nguyen",
                "assigned_email": "hung.nguyenmanh@dtt.vn",
                "target_email": None,
                "detected_school": None,
                "requested_operations": [],
                "entities": {},
                "suggested_bot_type": None,
                "suggested_action": None,
                "suggested_payload": {},
                "reason_summary_vi": "Thiếu API Key AI để lập kế hoạch."
            }

        kb_json_str = json.dumps(self.kb, ensure_ascii=False, indent=2)
        excel_info_str = json.dumps(excel_summary, ensure_ascii=False, indent=2) if excel_summary else "Không có file Excel đính kèm hoặc chưa bóc tách."
        full_content = raw_content[:20000] if raw_content else ""

        prompt = f"""
Bạn là Trợ lý AI Phân loại & Kiến trúc sư Vận hành Tự động hóa Cấp cao của Pythaverse & DTT Corporation.
Nhiệm vụ của bạn là đọc kỹ TOÀN BỘ thông tin vé, LỊCH SỬ TRAO ĐỔI và TẬP TIN ĐÍNH KÈM (nếu có) để phân tích Ý ĐỊNH NGHIỆP VỤ THỰC SỰ (Business Intent).

[TRI THỨC HỆ THỐNG]
{kb_json_str}

[THÔNG TIN FILE EXCEL BÓC TÁCH ĐƯỢC]
{excel_info_str}

[NỘI DUNG VÉ CẦN PHÂN TÍCH]
- Nguồn tiếp nhận: {source}
- Tiêu đề vé: {subject}
- Chi tiết nội dung & Lịch sử trao đổi:
{full_content}

[QUY TẮC NHẬN DIỆN VÀ PHÂN BIỆT ĐẶC BIỆT QUAN TRỌNG]
1. KIỂM TRA TÍNH HÀNH ĐỘNG (ACTIONABLE CHECK):
   - Nếu đây là EMAIL QUẢNG CÁO, TIẾP THỊ, THÔNG BÁO TỰ ĐỘNG KHÔNG CẦN CAN THIỆP (ví dụ: UptimeRobot giảm giá, Newsletter, Chúc mừng năm mới, Xác nhận đơn hàng đối tác...):
     -> 'workflow_outcome' BẮT BUỘC LÀ: "NO_ACTION"
     -> 'requested_operations' BẮT BUỘC LÀ: [] (mảng rỗng)
     -> 'suggested_bot_type': null

2. BÓC TÁCH ĐA MỤC TIÊU (MULTI-INTENT EXTRACTION):
   - Một yêu cầu có thể chứa NHIỀU YÊU CẦU CON ĐỘC LẬP. Ví dụ: "Tạo tài khoản giáo viên + Cấp quyền khóa học SWRP + Cấp quyền kho mã nguồn Git".
   - BẮT BUỘC phải trích xuất đầy đủ từng yêu cầu vào 'requested_operations'.
   - KHÔNG ĐƯỢC NHẦM LẪN giữa "Tạo tài khoản (Account Provisioning)" với "Quản trị mật khẩu Keycloak (Reset Password / Verify Email)".
     Chỉ khi nào khách nói rõ "quên mật khẩu", "reset password", "verify email" thì mới gán intent "reset_password" hoặc "verify_email".
     Nếu khách yêu cầu "tạo tài khoản", "create account" -> intent là "create_accounts".

3. CÁC INTENT HỢP LỆ TRONG 'requested_operations':
   - "create_accounts": Yêu cầu tạo mới tài khoản cho học sinh/giáo viên.
   - "course_access": Yêu cầu ghi danh/add học sinh, giáo viên vào khóa học LMS.
   - "repository_access": Yêu cầu thêm collaborator vào Git repository.
   - "license_order": Yêu cầu tạo đơn hàng, cấp license trường học.
   - "reset_password": Yêu cầu cấp lại mật khẩu.
   - "verify_email": Yêu cầu xác thực email.
   - "doc_triage": Báo cáo sự cố cần tag người phụ trách vào Google Doc.

[HƯỚNG DẪN ĐẦU RA JSON CHUẨN XÁC]
Trả về DUY NHẤT một JSON Object với các trường sau:
{{
    "workflow_outcome": "ACTIONABLE" | "NO_ACTION" | "NEEDS_INFORMATION",
    "category": "license" | "lms_enroll" | "account_keycloak" | "bug" | "other",
    "priority": "critical" | "normal",
    "goal": "Tuyên bố mục đích ngắn gọn bằng tiếng Việt (ví dụ: Tạo 4 tài khoản giáo viên và cấp quyền SWRP 4-12 LMS + Git)",
    "summary_vi": "🎯 Mục đích gốc: ...\\n🔄 Tiến trình & Cập nhật mới nhất: ...\\n⚡ Hành động đề xuất: ...",
    "assigned_name": "Hung Nguyen",
    "assigned_email": "hung.nguyenmanh@dtt.vn",
    "detected_school": "Tên trường nếu có, hoặc null",
    "entities": {{
        "users": [
            {{"name": "Kimberly E. Mabagos", "email": "kimmabagos26@gmail.com", "role": "teacher"}}
        ],
        "courses": ["SWRP 4–12"],
        "repositories": ["SWRP 4–12"],
        "school_name": null
    }},
    "requested_operations": [
        {{"intent": "create_accounts", "target": "teachers", "count": 4}},
        {{"intent": "course_access", "courses": ["SWRP 4–12"], "role": "teacher"}},
        {{"intent": "repository_access", "repositories": ["SWRP 4–12"]}}
    ],
    "reason_summary_vi": "Giải thích logic vì sao hệ thống cần chạy hoặc không cần chạy bước nào.",
    "suggested_bot_type": "workspace_rpa" | "keycloak_api" | "lms_playwright" | "git_collaborator" | null,
    "suggested_action": "Tên action tương ứng hoặc null",
    "suggested_payload": {{}}
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
                        "workflow_outcome": parsed_res.get("workflow_outcome", "ACTIONABLE"),
                        "category": parsed_res.get("category", "other"),
                        "priority": parsed_res.get("priority", "normal"),
                        "goal": parsed_res.get("goal", subject),
                        "summary_vi": parsed_res.get("summary_vi", f"Tóm tắt: {subject}"),
                        "assigned_name": parsed_res.get("assigned_name", "Hung Nguyen"),
                        "assigned_email": parsed_res.get("assigned_email", "hung.nguyenmanh@dtt.vn"),
                        "detected_school": parsed_res.get("detected_school"),
                        "entities": parsed_res.get("entities", {}),
                        "requested_operations": parsed_res.get("requested_operations", []),
                        "reason_summary_vi": parsed_res.get("reason_summary_vi"),
                        "suggested_bot_type": parsed_res.get("suggested_bot_type"),
                        "suggested_action": parsed_res.get("suggested_action"),
                        "suggested_payload": parsed_res.get("suggested_payload", {})
                    }
            except Exception as e:
                logger.warning(f"⚠️ Model {model_name} gặp lỗi: {e}, đang chuyển fallback...")
                continue

        return {
            "workflow_outcome": "NO_ACTION",
            "category": "other",
            "priority": "normal",
            "goal": subject,
            "summary_vi": f"🎯 Mục đích gốc: {subject}\n🔄 Tiến trình: Tiếp nhận vé\n⚡ Hành động đề xuất: Không yêu cầu can thiệp tự động.",
            "assigned_name": "Hung Nguyen",
            "assigned_email": "hung.nguyenmanh@dtt.vn",
            "detected_school": None,
            "entities": {},
            "requested_operations": [],
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

        # Lưu AI Output có cấu trúc sâu vào metadata của ticket
        existing_meta["ai_analysis"] = ai_res
        existing_meta["workflow_outcome"] = ai_res.get("workflow_outcome", "ACTIONABLE")
        existing_meta["requested_operations"] = ai_res.get("requested_operations", [])
        existing_meta["entities"] = ai_res.get("entities", {})

        if ai_res.get("detected_school"):
            existing_meta["school_name"] = ai_res.get("detected_school")

        if excel_summary:
            existing_meta["excel_summary"] = excel_summary
            if excel_summary.get("school_name"):
                existing_meta["school_name"] = excel_summary["school_name"]
            if excel_summary.get("courses"):
                existing_meta["cof_courses"] = excel_summary["courses"]

        if ai_res.get("suggested_bot_type"):
            existing_meta["suggested_bot_task"] = {
                "bot_type": ai_res.get("suggested_bot_type"),
                "action": ai_res.get("suggested_action"),
                "payload": ai_res.get("suggested_payload", {})
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
        logger.info(f"✅ Đã tiền xử lý AI hoàn tất cho ticket #{ticket_id} (Outcome: {ai_res.get('workflow_outcome')})")
        return ai_res

    except Exception as e:
        logger.error(f"❌ Lỗi process_ticket_with_ai: {e}")
        return None