# backend/app/services/workspace/account_service.py
"""
Pythaverse Central Admin - Workspace Bulk Account Provisioning Service
ĐỘNG CƠ HYBRID V4.0: Ephemeral Session Caching + Pure HTTPX Polling + Precision Delay
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI (Master Enterprise Comprehensive Edition)
"""
import os
import re
import gc
import json
import asyncio
import logging
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone, timedelta
import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import httpx
from playwright.async_api import async_playwright

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot
from app.core.supabase import get_supabase_client
from app.core.config import to_vn_time_str

logger = logging.getLogger(__name__)


def is_status_done(status_val: Any) -> bool:
    """Nhận diện mã 1, '1' hoặc chữ Done/Completed/Success là hoàn thành."""
    s = str(status_val or "").strip().lower()
    return s in ["1", "done", "completed", "success", "approved"]

def generate_excel_from_api_data(user_records: List[Dict[str, Any]], output_file_path: str):
    """Sinh file Excel kết quả chuẩn mực có đầy đủ cột Username thật & Password lowercase email."""
    wb = Workbook()
    try:
        ws = wb.active
        ws.title = "Accounts Result"

        # 🎯 ĐẦY ĐỦ CỘT KẾT QUẢ THEO ĐÚNG CHUẨN
        headers = [
            "No.", "First Name (*)", "Last Name (*)", "Username (*)", 
            "Password (*)", "Email (*)", "Mobile number", "Date of Birth (*)", 
            "Role (*)", "Status"
        ]
        ws.append(headers)

        header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
        header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
        thin_border = Border(
            left=Side(style='thin', color='D9D9D9'),
            right=Side(style='thin', color='D9D9D9'),
            top=Side(style='thin', color='D9D9D9'),
            bottom=Side(style='thin', color='D9D9D9')
        )

        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for idx, item in enumerate(user_records, 1):
            is_created = item.get("is_create", False)
            status_label = "Created" if is_created else "Already Exists"
            
            # 🎯 BỎ CHỮ 'S' Ở ROLE: "students" -> "Student"
            raw_role = str(item.get("role", "")).strip().lower()
            clean_role = "Teacher" if any(k in raw_role for k in ["teach", "gv"]) else "Student"

            # 🎯 MẬT KHẨU BẮT BUỘC CHUYỂN VỀ EMAIL VIẾT THƯỜNG (KHÔNG HOA)
            clean_email = str(item.get("email", "")).strip().lower()
            clean_pass = str(item.get("password") or clean_email).strip().lower()

            row_data = [
                idx,
                item.get("firstname", ""),
                item.get("lastname", ""),
                item.get("username", ""),     # 🎯 Username thật từ Keycloak
                clean_pass,                   # 🎯 Mật khẩu email chữ thường
                clean_email,
                item.get("phone", ""),
                item.get("dob", ""),
                clean_role,                   # 🎯 Role chuẩn (bỏ 's')
                status_label
            ]
            ws.append(row_data)

            for col_idx in range(1, len(row_data) + 1):
                c = ws.cell(row=idx + 1, column=col_idx)
                c.border = thin_border
                c.font = Font(name="Arial", size=9)
                if col_idx in [1, 8, 9, 10]:
                    c.alignment = Alignment(horizontal="center")

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = col[0].column_letter
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
        wb.save(output_file_path)
        logger.info(f"📁 [DIRECT EXCEL] Đã tạo thành công file Excel kết quả ({len(user_records)} tài khoản): {output_file_path}")
    finally:
        wb.close()
        del wb

class WorkspaceAccountService(WorkspaceBaseService):
    """
    Xử lý nộp file batch tạo tài khoản học sinh/giáo viên qua Direct API & Pure HTTPX Polling.
    ĐỘNG CƠ HYBRID V4.0: Bốc Session 1 lần ➔ Lưu Supabase ➔ HTTPX nộp batch ➔ HTTPX Poll định kỳ (Zero RAM).
    """

    # =========================================================================
    # 🛠️ SESSION KEEPALIVE & CACHING: ƯU TIÊN SUPABASE, KHÔNG MỞ PLAYWRIGHT THỪA
    # =========================================================================
    async def get_or_steal_school_session(
        self, 
        username: str, 
        password: str, 
        school_id: Optional[str] = None,
        force_fresh: bool = False
    ) -> Tuple[Dict[str, str], Dict[str, Any]]:
        """Ưu tiên đọc session School hợp lệ (< 60 phút); tự làm mới nếu hết hạn hoặc ép buộc."""
        supabase = get_supabase_client()
        clean_user = username.strip().lower()
        session_key = f"school_{clean_user}" if clean_user else f"school_{school_id or 'default'}"
        
        # 1. Kiểm tra Session cũ trên Supabase kèm điều kiện TTL 60 phút
        if not force_fresh:
            try:
                res = supabase.table("workspace_active_sessions")\
                    .select("session_key, cookies, metadata, updated_at")\
                    .eq("session_key", session_key)\
                    .eq("is_active", True)\
                    .execute()
                
                if res.data:
                    row = res.data[0]
                    updated_at_str = row.get("updated_at")
                    is_valid_ttl = False
                    
                    if updated_at_str:
                        try:
                            # Parse UTC timestamp từ Supabase
                            clean_ts = updated_at_str.replace("Z", "+00:00")
                            session_time = datetime.fromisoformat(clean_ts)
                            age_seconds = (datetime.now(timezone.utc) - session_time).total_seconds()
                            # Chỉ chấp nhận session còn sống dưới 60 phút (3600s)
                            if age_seconds < 3600:
                                is_valid_ttl = True
                            else:
                                logger.warning(f"⏰ Session School '{session_key}' đã cũ ({int(age_seconds/60)} phút > 60 phút). Tự động hủy để bốc mới!")
                        except Exception as parse_err:
                            logger.warning(f"⚠️ Lỗi parse timestamp session: {parse_err}")

                    if is_valid_ttl:
                        cookies = row.get("cookies", {})
                        meta = row.get("metadata") or {}
                        identity = {
                            "school_id": meta.get("school_id") or school_id,
                            "partner_id": meta.get("partner_id"),
                            "username": username
                        }
                        logger.info(f"⚡ [Account Auth] Tái sử dụng Session School [{session_key}] còn tươi mới (< 60p) từ Supabase!")
                        return cookies, identity
                    else:
                        # Session quá hạn -> Xóa dọn rác ngay
                        supabase.table("workspace_active_sessions").delete().eq("session_key", session_key).execute()
            except Exception as e:
                logger.warning(f"⚠️ Không thể đọc session School từ Supabase: {e}")

        # 2. Mở Playwright bốc Session mới toanh
        logger.info(f"🔑 [Account Auth] Đang mở Chromium đăng nhập School cho '{username}'...")
        async with acquire_playwright_slot(f"School Auth [{username}]", lane="admin"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, username, password, "School")
                    if not is_ok:
                        raise RuntimeError(f"Đăng nhập School thất bại: {login_err}")

                    wp_identity = await page.evaluate("""() => {
                        const u = window.user || {};
                        let localUser = {};
                        try { localUser = JSON.parse(localStorage.getItem('user') || '{}'); } catch(e) {}
                        return {
                            school_id: u.school_id || localUser.school_id || '',
                            partner_id: u.partner_id || localUser.partner_id || '',
                            username: u.username || localUser.username || ''
                        };
                    }""")

                    cookies = await context.cookies()
                    cookies_dict = {c["name"]: c["value"] for c in cookies}
                    s_id = wp_identity.get("school_id") or school_id or ""

                    # Lưu session mới kèm thông tin chuẩn xác vào Supabase
                    try:
                        from app.services.session_keepalive_service import session_keepalive_service
                        await session_keepalive_service.save_session_cookies(
                            session_key=session_key,
                            system_name=f"School Session ({username})",
                            cookies=cookies_dict,
                            metadata={"school_id": s_id, "partner_id": wp_identity.get("partner_id"), "user": username}
                        )
                        logger.info(f"💾 [Account Auth] Đã lưu Session chuẩn '{session_key}' lên Supabase (TTL: 60p)!")
                    except Exception as s_err:
                        logger.warning(f"⚠️ Lỗi lưu session school: {s_err}")

                    return cookies_dict, wp_identity
                finally:
                    await browser.close()
                    gc.collect()

    @staticmethod
    def _parse_excel_accounts(file_path: str) -> List[Dict[str, str]]:
        """Bóc tách thông minh: Khử sạch dòng rỗng/dòng vàng ngăn cách, chỉ lấy đúng tài khoản hợp lệ."""
        accounts = []
        wb = openpyxl.load_workbook(file_path, data_only=True)
        try:
            ws = wb.active
            
            # 🎯 1. TỰ ĐỘNG DÒ TỌA ĐỘ CỘT TỪ DÒNG HEADER (DÒNG 1 ĐẾN 6)
            header_row_idx = 5
            col_map = {
                "first_name": 3,  # Cột C: First Name
                "last_name": 4,   # Cột D: Last Name
                "mobile": 5,      # Cột E: Mobile number
                "email": 6,       # Cột F: Email
                "dob": 7,         # Cột G: Date of Birth
                "role": 8,        # Cột H: Role
                "note": 9
            }

            for r in range(1, 7):
                row_vals = [str(ws.cell(row=r, column=c).value or "").strip().lower() for c in range(1, 15)]
                if any("email" in v for v in row_vals) and any("first" in v for v in row_vals):
                    header_row_idx = r
                    for col_idx in range(1, 15):
                        val = str(ws.cell(row=r, column=col_idx).value or "").strip().lower()
                        if "first name" in val:
                            col_map["first_name"] = col_idx
                        elif "last name" in val:
                            col_map["last_name"] = col_idx
                        elif "mobile" in val or "phone" in val:
                            col_map["mobile"] = col_idx
                        elif "email" in val:
                            col_map["email"] = col_idx
                        elif "birth" in val or "dob" in val:
                            col_map["dob"] = col_idx
                        elif "role" in val:
                            col_map["role"] = col_idx
                        elif "note" in val:
                            col_map["note"] = col_idx
                    break

            logger.info(f"📊 [Excel Dynamic Parser] Định vị Header tại dòng {header_row_idx}: {col_map}")

            # 🎯 2. ĐỌC DỮ LIỆU & LỌC CHẶT CHẼ (CHỐNG DÒNG RỖNG, DÒNG VÀNG NGĂN CÁCH)
            start_row = header_row_idx + 1
            for r in range(start_row, ws.max_row + 1):
                raw_email = str(ws.cell(row=r, column=col_map["email"]).value or "").strip()
                raw_fn = str(ws.cell(row=r, column=col_map["first_name"]).value or "").strip()
                raw_ln = str(ws.cell(row=r, column=col_map["last_name"]).value or "").strip()

                # 🛑 CHỐT CHẶN: Dòng rỗng, dòng vàng ngăn cách (như dòng 30), hoặc dòng header bị lặp sẽ bị BỎ QUA NGAY!
                if not raw_email or "@" not in raw_email or "." not in raw_email:
                    continue
                if not raw_fn or not raw_ln or "first name" in raw_fn.lower():
                    continue

                clean_email = raw_email.lower().strip()
                mobile = str(ws.cell(row=r, column=col_map["mobile"]).value or "").strip()
                if mobile.lower() in ("none", "null"):
                    mobile = ""

                # Chuẩn hóa ngày sinh sang DD/MM/YYYY chuẩn xác
                dob_raw = ws.cell(row=r, column=col_map["dob"]).value
                dob = "01/01/2016"
                if dob_raw:
                    if isinstance(dob_raw, datetime):
                        dob = dob_raw.strftime("%d/%m/%Y")
                    else:
                        clean_dob = str(dob_raw).strip()
                        if re.match(r"^\d{4}-\d{2}-\d{2}", clean_dob):
                            parts = clean_dob.split("-")
                            dob = f"{parts[2]}/{parts[1]}/{parts[0]}"
                        elif re.match(r"^\d{1,2}/\d{1,2}/\d{4}", clean_dob):
                            dob = clean_dob
                        else:
                            dob = clean_dob

                # Chuẩn hóa vai trò: Student hoặc Teacher
                role_raw = str(ws.cell(row=r, column=col_map["role"]).value or "student").strip().lower()
                role = "Teacher" if any(k in role_raw for k in ["teach", "gv", "giáo viên"]) else "Student"

                note_val = str(ws.cell(row=r, column=col_map["note"]).value or "").strip()
                if note_val.lower() in ("none", "null"):
                    note_val = ""

                accounts.append({
                    "firstName": raw_fn,
                    "lastName": raw_ln,
                    "mobileNumber": mobile,
                    "email": clean_email,
                    "dob": dob,
                    "role": role,
                    "note": note_val
                })

            logger.info(f"✅ Đã trích xuất CHÍNH XÁC {len(accounts)} tài khoản (Không thừa, không thiếu)!")
        finally:
            wb.close()
        return accounts


    # =========================================================================
    # 🚀 NỘP BATCH TẠO TÀI KHOẢN
    # =========================================================================
    async def submit_account_creation_batch(
        self,
        credentials: Dict[str, str],
        upload_file_path: str,
        record_count: int,
        download_dir: str = "/tmp/ptv_results",
        checkpoint: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Nộp batch tạo tài khoản qua Direct API chuẩn xác từng trường dữ liệu."""
        os.makedirs(download_dir, exist_ok=True)
        checkpoint = checkpoint or {}

        existing_req_id = checkpoint.get("account_batch_request_id")
        if existing_req_id and str(existing_req_id).strip() not in ["None", "null", ""]:
            logger.info(f"⏩ [CHECKPOINT] Đã có Request ID #{existing_req_id}. Đi lấy file kết quả...")
            return await self.check_and_export_batch_result(credentials, existing_req_id, download_dir)

        try:
            school_user = credentials.get("username", "")
            school_pwd = credentials.get("password", "")
            
            # 1. Bốc session School
            cookies, identity = await self.get_or_steal_school_session(
                school_user, 
                school_pwd,
                credentials.get("school_id")
            )

            # 2. Giải mã Integer School ID & Partner ID
            clean_school_id = ""
            clean_partner_id = ""

            for cand in [identity.get("school_id"), credentials.get("school_id"), credentials.get("code"), credentials.get("school_code")]:
                if cand:
                    m = re.search(r"\d+", str(cand))
                    if m:
                        clean_school_id = m.group(0)
                        break

            for cand in [identity.get("partner_id"), credentials.get("partner_id"), credentials.get("partner_code")]:
                if cand:
                    m = re.search(r"\d+", str(cand))
                    if m:
                        clean_partner_id = m.group(0)
                        break

            if not clean_school_id or not clean_partner_id:
                try:
                    from app.core.supabase import get_supabase_client
                    supabase = get_supabase_client()
                    
                    vault_res = supabase.table("workspace_credentials_vault") \
                        .select("org_id") \
                        .ilike("username", school_user) \
                        .execute()
                    
                    org_id = vault_res.data[0].get("org_id") if vault_res.data else None
                    if org_id:
                        school_org = supabase.table("workspace_organizations") \
                            .select("code, parent_id") \
                            .eq("id", org_id) \
                            .execute()
                        if school_org.data:
                            s_data = school_org.data[0]
                            if not clean_school_id and s_data.get("code"):
                                m = re.search(r"\d+", str(s_data["code"]))
                                if m:
                                    clean_school_id = m.group(0)
                            
                            parent_id = s_data.get("parent_id")
                            if parent_id and not clean_partner_id:
                                partner_org = supabase.table("workspace_organizations") \
                                    .select("code") \
                                    .eq("id", parent_id) \
                                    .execute()
                                if partner_org.data and partner_org.data[0].get("code"):
                                    pm = re.search(r"\d+", str(partner_org.data[0]["code"]))
                                    if pm:
                                        clean_partner_id = pm.group(0)
                except Exception as db_err:
                    logger.warning(f"⚠️ Lỗi resolve School/Partner ID: {db_err}")

            if not clean_partner_id:
                clean_partner_id = "60"

            logger.info(f"🏫 [Bulk Accounts] Gửi batch: School ID = [{clean_school_id}] | Partner ID = [{clean_partner_id}]")

            # 3. Parse file Excel chuẩn xác
            accounts = self._parse_excel_accounts(upload_file_path)
            if not accounts:
                return {"status": "failed", "error": "Không trích xuất được tài khoản nào từ file Excel tải lên."}

            logger.info(f"📄 Đã bóc tách thành công {len(accounts)} tài khoản. Chuẩn bị nộp batch...")

            # 🎯 4. ĐÓNG GÓI PAYLOAD 100% CHUẨN XÁC THEO DEVTOOLS CỦA ANH
            payload: Dict[str, str] = {
                "schoolId": str(clean_school_id),
                "partnerId": str(clean_partner_id),
                "fileName": os.path.basename(upload_file_path)
            }
            for idx, acc in enumerate(accounts):
                payload[f"accounts[{idx}][firstName]"] = acc["firstName"]
                payload[f"accounts[{idx}][lastName]"] = acc["lastName"]
                payload[f"accounts[{idx}][mobileNumber]"] = acc["mobileNumber"]
                payload[f"accounts[{idx}][email]"] = acc["email"]
                payload[f"accounts[{idx}][dob]"] = acc["dob"]
                payload[f"accounts[{idx}][role]"] = acc["role"]
                payload[f"accounts[{idx}][note]"] = acc["note"]

            upload_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/uploadFileAccount.php"

            # 5. Gửi Request Direct HTTPX
            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=40.0) as client:
                up_res = await client.post(upload_url, files=self._to_multipart(payload))

                # Tự động re-login nếu 302
                if up_res.status_code == 302:
                    logger.warning("🔄 Phát hiện 302 Redirect! Mở Chromium làm mới session và gửi lại...")
                    cookies, identity = await self.get_or_steal_school_session(school_user, school_pwd, credentials.get("school_id"), force_fresh=True)
                    async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=40.0) as fresh_client:
                        up_res = await fresh_client.post(upload_url, files=self._to_multipart(payload))

                if up_res.status_code != 200:
                    err_msg = f"Lỗi uploadFileAccount (HTTP {up_res.status_code}): {up_res.text[:300]}"
                    logger.error(f"❌ {err_msg}")
                    return {"status": "failed", "error": err_msg}

                up_json = up_res.json()
                request_id = str(up_json.get("request_id") or up_json.get("id") or "").strip()

                if not request_id or request_id.lower() in ("none", "null", ""):
                    err_msg = f"API uploadFileAccount không trả về request_id: {up_res.text}"
                    logger.error(f"❌ {err_msg}")
                    return {"status": "failed", "error": err_msg}

                logger.info(f"🎉 NỘP DANH SÁCH THÀNH CÔNG! Request ID: [ #{request_id} ] ({len(accounts)} tài khoản)")

                # Bước 2: Kích hoạt createMultipleUser.php ngầm
                trigger_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/createMultipleUser.php"
                trig_payload = {"request_id": request_id, "status": "1"}
                await client.post(trigger_url, files=self._to_multipart(trig_payload))
                logger.info(f"🚀 Đã kích hoạt lệnh tạo tài khoản ngầm cho Request #{request_id}!")

                account_count = len(accounts)
                wait_seconds = max(account_count * 15, 30)
                next_check_dt = datetime.now(timezone.utc) + timedelta(seconds=wait_seconds)
                next_check_iso = next_check_dt.isoformat()
                next_check_vn = to_vn_time_str(next_check_dt)

                eta_mins = wait_seconds // 60
                eta_secs = wait_seconds % 60
                eta_text = f"{eta_mins} phút {eta_secs} giây" if eta_mins > 0 else f"{eta_secs} giây"

                eta_summary_msg = (
                    f"⏱️ [TIẾN ĐỘ ƯỚC TÍNH] Nộp batch thành công {account_count} tài khoản (Request #{request_id})! "
                    f"Thời gian xử lý dự kiến: ~{eta_text} (Hoàn tất vào khoảng: {next_check_vn} GMT+7)."
                )
                logger.info(eta_summary_msg)

                checkpoint["account_batch_request_id"] = request_id
                checkpoint["next_check_at"] = next_check_iso
                checkpoint["next_check_vn"] = next_check_vn
                checkpoint["estimated_duration_text"] = eta_text
                checkpoint["total_accounts"] = account_count

                task_id = checkpoint.get("task_id")
                if task_id:
                    try:
                        supabase = get_supabase_client()
                        
                        # Đọc log cũ để append thêm log ước tính lên đầu
                        existing_task = supabase.table("bot_automation_tasks").select("execution_logs").eq("id", task_id).execute()
                        old_logs = existing_task.data[0].get("execution_logs") or "" if existing_task.data else ""
                        new_logs = f"{eta_summary_msg}\n{old_logs}".strip()

                        task_update_payload = {
                            "request_id": request_id,
                            "school_credentials": credentials,
                            "next_check_at": next_check_iso,
                            "next_check_vn": next_check_vn,
                            "estimated_wait_seconds": wait_seconds,
                            "estimated_duration_text": eta_text,
                            "total_count": account_count,
                            "upload_file_path": upload_file_path,
                            "checkpoint": checkpoint
                        }
                        supabase.table("bot_automation_tasks").update({
                            "execution_status": "waiting_poll",
                            "execution_logs": new_logs,
                            "current_step": f"Đang tạo ngầm ({eta_text})",
                            "payload_data": task_update_payload
                        }).eq("id", task_id).execute()
                        logger.info(f"💾 Đã cập nhật ETA ({eta_text}) vào bot_automation_tasks #{task_id}!")
                    except Exception as t_err:
                        logger.warning(f"⚠️ Không thể cập nhật trạng thái bot task: {t_err}")

                return {
                    "status": "waiting_poll",
                    "request_id": request_id,
                    "record_count": account_count,
                    "estimated_wait_seconds": wait_seconds,
                    "estimated_duration_text": eta_text,
                    "next_check_at": next_check_iso,
                    "next_check_vn": next_check_vn,
                    "school_credentials": credentials,
                    "message": eta_summary_msg,
                    "checkpoint": checkpoint
                }

        except Exception as e:
            logger.error(f"❌ Lỗi submit_account_creation_batch: {e}", exc_info=True)
            return {"status": "failed", "error": str(e), "checkpoint": checkpoint}

    @staticmethod
    def _to_multipart(data_dict: Dict[str, Any]) -> Dict[str, Tuple[None, str]]:
        return {k: (None, str(v) if v is not None else "") for k, v in data_dict.items()}

    # =========================================================================
    # 📥 XUẤT KẾT QUẢ & KHÔI PHỤC USERNAME CHUẨN TỪ KEYCLOAK
    # =========================================================================
    
    async def _download_export_file_httpx(
        self,
        client: httpx.AsyncClient,
        request_id: str,
        download_dir: str,
        standard_input_file: Optional[str] = None
    ) -> Tuple[str, Optional[str]]:
        """
        Gọi exportData.php, khôi phục username thật từ Keycloak cho tài khoản is_create=false,
        reset mật khẩu Keycloak về email chữ thường, và UPLOAD FILE LÊN SUPABASE STORAGE.
        """
        os.makedirs(download_dir, exist_ok=True)
        result_excel_path = os.path.join(download_dir, f"RESULT_{request_id}_accounts.xlsx")
        public_url = None

        logger.info(f"📥 [DIRECT HTTPX] Truy vấn exportData.php cho Request #{request_id}...")
        try:
            payload = {"request_id": str(request_id), "type": "preview"}
            export_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/exportData.php"
            res = await client.post(export_url, files=self._to_multipart(payload))

            if res.status_code == 200:
                raw_records = res.json()
                if isinstance(raw_records, list) and len(raw_records) > 0:
                    logger.info(f"✨ Lấy được {len(raw_records)} tài khoản từ exportData.php!")

                    # 🎯 1. LỌC RA CÁC TÀI KHOẢN CÓ IS_CREATE = FALSE ĐỂ ĐỒNG BỘ KEYCLOAK
                    from app.services.keycloak_service import keycloak_service
                    
                    emails_to_sync = []
                    for item in raw_records:
                        # Chuẩn hóa role bỏ 's'
                        r = str(item.get("role", "")).lower()
                        item["role"] = "Teacher" if any(k in r for k in ["teach", "gv"]) else "Student"

                        em = str(item.get("email") or "").strip().lower()
                        # Nếu tài khoản đã tồn tại (is_create=false) thì bắt buộc phải lấy lại username từ Keycloak
                        if not item.get("is_create", False) and em and "@" in em:
                            emails_to_sync.append(em)

                    emails_to_sync = list(dict.fromkeys(emails_to_sync))

                    # 🎯 2. GỌI KEYCLOAK ĐỂ LẤY USERNAME CHUẨN & RESET PASS VỀ EMAIL CHỮ THƯỜNG
                    if emails_to_sync:
                        logger.info(f"🔍 Phát hiện {len(emails_to_sync)} tài khoản đã tồn tại! Kích hoạt Keycloak để lấy Username thật & Reset Pass về email...")
                        for em in emails_to_sync:
                            try:
                                clean_em = em.lower().strip()
                                # 2.1 Tra cứu username thật trên Keycloak
                                resolved_map = await keycloak_service.resolve_identifiers_to_usernames([clean_em])
                                real_username = resolved_map.get(clean_em)
                                
                                # 2.2 Reset mật khẩu Keycloak về chính email chữ thường
                                await keycloak_service.reset_user_password(clean_em, clean_em)

                                # 2.3 Cập nhật vào mảng bản ghi
                                for item in raw_records:
                                    if str(item.get("email") or "").strip().lower() == clean_em:
                                        if real_username:
                                            item["username"] = real_username
                                        item["password"] = clean_em
                                        item["is_keycloak_synced"] = True
                            except Exception as kc_err:
                                logger.warning(f"⚠️ Lỗi sync Keycloak cho {em}: {kc_err}")

                    # 🎯 3. SINH FILE EXCEL KẾT QUẢ ĐẦY ĐỦ CỘT
                    generate_excel_from_api_data(raw_records, result_excel_path)

                    # 🎯 4. [MẮT XÍCH QUAN TRỌNG NHẤT]: UPLOAD LÊN SUPABASE STORAGE ĐỂ UI TẢI VỀ
                    try:
                        from app.core.supabase import get_supabase_client
                        supabase = get_supabase_client()
                        bucket_name = "ticket-attachments"
                        storage_file_name = f"studio_results/RESULT_{request_id}_accounts.xlsx"

                        with open(result_excel_path, "rb") as f:
                            file_bytes = f.read()

                        supabase.storage.from_(bucket_name).upload(
                            path=storage_file_name,
                            file=file_bytes,
                            file_options={"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "upsert": "true"}
                        )

                        public_url = supabase.storage.from_(bucket_name).get_public_url(storage_file_name)
                        logger.info(f"☁️ [Supabase Storage] Đã upload file kết quả thành công: {public_url}")
                    except Exception as up_err:
                        logger.warning(f"⚠️ Lỗi upload file kết quả lên Supabase Storage: {up_err}")

                    return result_excel_path, public_url
        except Exception as e:
            logger.error(f"❌ Lỗi exportData.php qua HTTPX: {e}")

        return result_excel_path, public_url

    
    # =========================================================================
    # ⏳ CRONJOB POLL KẾT QUẢ ĐỊNH KỲ (100% PURE HTTPX - KHÔNG CẦN PLAYWRIGHT)
    # =========================================================================
    async def check_and_export_batch_result(
        self,
        credentials: Dict[str, str],
        request_id: str,
        download_dir: str
    ) -> Dict[str, Any]:
        """Cronjob kiểm tra tiến độ và tải kết quả thuần HTTPX (Zero RAM Render)."""
        os.makedirs(download_dir, exist_ok=True)
        if not request_id or str(request_id).strip() in ["None", "null", ""]:
            return {"status": "failed", "error": "Request ID không hợp lệ"}

        try:
            cookies, identity = await self.get_or_steal_school_session(
                credentials.get("username", ""), 
                credentials.get("password", ""),
                credentials.get("school_id")
            )
            school_id = identity.get("school_id") or credentials.get("school_id")

            async with httpx.AsyncClient(base_url=BASE_WORKSPACE_URL, cookies=cookies, timeout=25.0) as client:
                chk_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/request_approval/getListRequest.php?school_id={school_id}"
                chk_res = await client.get(chk_url)
                
                if chk_res.status_code == 200:
                    req_list = chk_res.json().get("data", {}).get("accountData", [])
                    matched_req = next((r for r in req_list if str(r.get("id")) == str(request_id)), None)
                    
                    if matched_req:
                        current_status = str(matched_req.get("status", "")).strip()
                        logger.info(f"📊 Trạng thái Request #{request_id}: '{current_status}'")

                        if not is_status_done(current_status):
                            return {
                                "status": "still_processing",
                                "current_status": current_status,
                                "request_id": request_id
                            }

                # Khi đã Done: Xuất file kết quả & upload lên Supabase Storage
                result_path, public_url = await self._download_export_file_httpx(client, request_id, download_dir)

                # Dọn dẹp session tạm
                try:
                    supabase = get_supabase_client()
                    supabase.table("workspace_active_sessions")\
                        .delete()\
                        .eq("session_key", f"school_{credentials.get('username', '').strip().lower()}")\
                        .execute()
                except Exception:
                    pass

                return {
                    "status": "completed",
                    "request_id": request_id,
                    "result_file_path": result_path,
                    "result_file_url": public_url
                }
        except Exception as e:
            logger.error(f"❌ Lỗi check_and_export_batch_result: {e}")
            return {"status": "failed", "error": str(e)}

workspace_account_service = WorkspaceAccountService()