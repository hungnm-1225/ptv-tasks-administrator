"""
Bulk Account Creation Template Service
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Chuẩn hóa file Excel thành 'phôi' chuẩn của trường (Header hàng 5, Data hàng 6).
- Tự động bóc tách text trần sinh phôi Excel.
- Ghi kết quả tài khoản đã tạo vào các cột H (Username), I (Password), J (Note).
"""
import os
import gc
import re
import logging
from typing import Dict, Any, List, Tuple
import openpyxl
from openpyxl.styles import Font, Alignment
from app.services.excel.cof_service import COFService

logger = logging.getLogger(__name__)


class BulkTemplateService:

    @classmethod
    def is_already_standard_accounts_file(cls, ws_in) -> Tuple[bool, int, Dict[str, int]]:
        """Kiểm tra xem file đã là phôi chuẩn của trường chưa (Header ở hàng 5)."""
        for r_idx, row in enumerate(ws_in.iter_rows(values_only=True), 1):
            if r_idx > 10:
                break
            row_vals = [str(c or '').strip().lower() for c in row]
            row_str = " ".join(row_vals)
            if "first name" in row_str and "last name" in row_str:
                col_map = {}
                for c_idx, val in enumerate(row_vals):
                    if "first name" in val: col_map["first_name"] = c_idx
                    elif "last name" in val: col_map["last_name"] = c_idx
                    elif "mobile" in val or "phone" in val: col_map["mobile"] = c_idx
                    elif "email" in val: col_map["email"] = c_idx
                    elif "birth" in val or "dob" in val: col_map["dob"] = c_idx
                    elif "role" in val: col_map["role"] = c_idx
                return True, r_idx, col_map
        return False, -1, {}

    @classmethod
    def normalize_input_accounts_excel(cls, input_file_path: str, output_file_path: str) -> Tuple[str, int, List[Dict[str, Any]]]:
        """Chuẩn hóa mọi file thành PHÔI CHUẨN: Tiêu đề Hàng 2, Header Hàng 5, Data Hàng 6."""
        wb_in = openpyxl.load_workbook(input_file_path, data_only=True)
        try:
            ws_in = wb_in.active
            is_std, header_row_idx, col_map = cls.is_already_standard_accounts_file(ws_in)

            if not is_std:
                header_row_idx = 5
                col_map = {"first_name": 1, "last_name": 2, "mobile": 3, "email": 4, "dob": 5, "role": 6}

            extracted_users = []
            for row in ws_in.iter_rows(min_row=header_row_idx + 1, values_only=True):
                if not any(row):
                    continue
                fn = str(row[col_map.get("first_name", 1)] or '').strip()
                ln = str(row[col_map.get("last_name", 2)] or '').strip()
                if not fn and not ln:
                    continue

                mob = str(row[col_map.get("mobile", 3)] or '').strip() if "mobile" in col_map else ""
                em = str(row[col_map.get("email", 4)] or '').strip() if "email" in col_map else ""
                raw_dob = row[col_map.get("dob", 5)] if "dob" in col_map else ""
                dob = COFService.format_date_dob(raw_dob)
                role = str(row[col_map.get("role", 6)] or 'Student').strip() if "role" in col_map else "Student"

                extracted_users.append({
                    "first_name": fn, "last_name": ln, "mobile": mob, "email": em, "dob": dob, "role": role
                })

            # 🎯 NẾU FILE VỐN ĐÃ LÀ PHÔI CHUẨN Ở HÀNG 5: GIỮ NGUYÊN BẢN GỐC ĐỂ BẢO TOÀN ĐỊNH DẠNG!
            if is_std and header_row_idx == 5:
                os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
                import shutil
                shutil.copyfile(input_file_path, output_file_path)
                logger.info(f"🛡️ File đã là phôi chuẩn (Header hàng 5), giữ nguyên vẹn {len(extracted_users)} users: {output_file_path}")
                return output_file_path, len(extracted_users), extracted_users
        finally:
            wb_in.close()
            del wb_in
            gc.collect()

        # 🎯 NẾU LÀ FILE TỰ DO CẦN TẠO PHÔI: KHỞI TẠO ĐỦ CÁC HÀNG 1..4 ĐỂ CHỐNG COLLAPSE
        wb_out = openpyxl.Workbook()
        try:
            ws_out = wb_out.active
            ws_out.title = "Class 7s"

            # Đảm bảo hàng 1 đến 4 luôn tồn tại ô dữ liệu để parser không co rút dòng
            for r in range(1, 5):
                for c in range(1, 8):
                    ws_out.cell(row=r, column=c, value="")

            ws_out.merge_cells("B2:G2")
            ws_out["B2"].value = "Account creation request form"
            ws_out["B2"].font = Font(name="Arial", size=18, bold=True)
            ws_out["B2"].alignment = Alignment(horizontal="center", vertical="center")

            # Sử dụng đúng tên cột theo chuẩn Workspace
            headers = ["No.", "First Name (*)", "Last Name (*)", "Mobile number (Optional)", "Email (*)", "Date of Birth (*)", "Role (*)"]
            for c_i, h in enumerate(headers, 1):
                cell = ws_out.cell(row=5, column=c_i, value=h)
                cell.font = Font(name="Arial", size=10, bold=True)
                cell.alignment = Alignment(horizontal="center", vertical="center")

            for idx, u in enumerate(extracted_users, 1):
                r = idx + 5
                ws_out.cell(row=r, column=1, value=idx)
                ws_out.cell(row=r, column=2, value=u["first_name"])
                ws_out.cell(row=r, column=3, value=u["last_name"])
                ws_out.cell(row=r, column=4, value=u["mobile"])
                ws_out.cell(row=r, column=5, value=u["email"])
                ws_out.cell(row=r, column=6, value=u["dob"])
                ws_out.cell(row=r, column=7, value=u["role"])

            os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
            wb_out.save(output_file_path)
            logger.info(f"✨ Chuẩn hóa phôi mới cố định lưới ({len(extracted_users)} users): {output_file_path}")
            return output_file_path, len(extracted_users), extracted_users
        finally:
            wb_out.close()
            del wb_out
            gc.collect()

    @classmethod
    def write_results_back_to_standard_accounts(
        cls,
        standard_file_path: str,
        api_user_records: list,
        output_file_path: str
    ) -> str:
        """Ghi kết quả tài khoản đã tạo vào các cột H (Username), I (Password), J (Note)."""
        wb = openpyxl.load_workbook(standard_file_path)
        try:
            ws = wb.active
            ws.cell(row=5, column=8, value="Username").font = Font(name="Arial", size=10, bold=True)
            ws.cell(row=5, column=9, value="Password").font = Font(name="Arial", size=10, bold=True)
            ws.cell(row=5, column=10, value="Note").font = Font(name="Arial", size=10, bold=True)

            api_map_by_email = {str(item.get("email") or '').strip().lower(): item for item in api_user_records if item.get("email")}
            api_map_by_name = {f"{str(i.get('firstname') or '').strip().lower()}_{str(i.get('lastname') or '').strip().lower()}": i for i in api_user_records}

            for r in range(6, ws.max_row + 1):
                row_email = str(ws.cell(row=r, column=5).value or '').strip().lower()
                row_fn = str(ws.cell(row=r, column=2).value or '').strip().lower()
                row_ln = str(ws.cell(row=r, column=3).value or '').strip().lower()

                matched = api_map_by_email.get(row_email) or api_map_by_name.get(f"{row_fn}_{row_ln}")
                if matched:
                    if matched.get("is_create", False):
                        # Tài khoản MỚI tạo thành công trên Workspace
                        ws.cell(row=r, column=8, value=matched.get("username", ""))
                        ws.cell(row=r, column=9, value=matched.get("password", ""))
                        ws.cell(row=r, column=10, value="Tạo mới thành công")
                        ws.cell(row=r, column=10).font = Font(name="Arial", size=9, color="2E7D32", bold=True)
                    else:
                        # Tài khoản ĐÃ TỒN TẠI: Điền Real Username và Password (= Email)
                        real_username = matched.get("username", "")
                        reset_password = matched.get("password") or row_email
                        ws.cell(row=r, column=8, value=real_username)
                        ws.cell(row=r, column=9, value=reset_password)
                        
                        note_c = ws.cell(row=r, column=10, value="Tài khoản đã tồn tại (Đã reset pass về email)")
                        note_c.font = Font(name="Arial", size=9, italic=True, color="1565C0", bold=True)
                else:
                    note_c = ws.cell(row=r, column=10, value="Chưa xử lý")
                    note_c.font = Font(name="Arial", size=9, italic=True, color="7F7F7F")

            os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
            wb.save(output_file_path)
            return output_file_path
        finally:
            wb.close()
            del wb
            gc.collect()

    @classmethod
    def extract_users_from_raw_text(cls, text: str) -> List[Dict[str, Any]]:
        """Tự động bóc tách danh sách người dùng từ văn bản trần dạng bullet points."""
        if not text:
            return []
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        extracted: List[Dict[str, Any]] = []
        pending_name = ""
        email_pattern = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')

        for line in lines:
            clean_line = re.sub(r'^[\s\-\*•\d\.\)]+', '', line).strip()
            emails = email_pattern.findall(clean_line)
            if emails:
                email = emails[0].lower().strip()
                inline_name = email_pattern.sub('', clean_line).strip(' -:()')
                name_to_use = inline_name or pending_name or email.split('@')[0]
                parts = [p for p in name_to_use.split() if p]
                first_name = parts[-1] if len(parts) > 1 else (parts[0] if parts else "Teacher")
                last_name = " ".join(parts[:-1]) if len(parts) > 1 else "Auto"

                extracted.append({
                    "full_name": name_to_use,
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email,
                    "dob": "01/01/2000",
                    "role": "Teacher"
                })
                pending_name = ""
            else:
                lower_line = clean_line.lower()
                if not any(kw in lower_line for kw in ["hi ", "dear ", "thank", "support", "request"]):
                    if 2 <= len(clean_line.split()) < 8 and len(clean_line) < 60:
                        pending_name = clean_line
        return extracted

    @classmethod
    def generate_accounts_excel_from_users(cls, users: List[Dict[str, Any]], output_file_path: str) -> str:
        """Tự sinh file Excel phôi chuẩn từ mảng users."""
        os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
        wb = openpyxl.Workbook()
        try:
            ws = wb.active
            ws.title = "Class 7s"
            ws.merge_cells("B2:G2")
            ws["B2"].value = "Account creation request form"
            ws["B2"].font = Font(name="Arial", size=18, bold=True)
            ws["B2"].alignment = Alignment(horizontal="center", vertical="center")

            headers = ["No.", "First Name (*)", "Last Name (*)", "Mobile number", "Email (*)", "Date of Birth (*)", "Role (*)"]
            for c_i, h in enumerate(headers, 1):
                cell = ws.cell(row=5, column=c_i, value=h)
                cell.font = Font(name="Arial", size=10, bold=True)
                cell.alignment = Alignment(horizontal="center", vertical="center")

            for idx, u in enumerate(users, 1):
                r = idx + 5
                ws.cell(row=r, column=1, value=idx)
                ws.cell(row=r, column=2, value=u.get("first_name", ""))
                ws.cell(row=r, column=3, value=u.get("last_name", ""))
                ws.cell(row=r, column=4, value=u.get("mobile", ""))
                ws.cell(row=r, column=5, value=u.get("email", ""))
                ws.cell(row=r, column=6, value=COFService.format_date_dob(u.get("dob", "01/01/2000")))
                ws.cell(row=r, column=7, value=str(u.get("role", "Teacher")).capitalize())

            wb.save(output_file_path)
            return output_file_path
        finally:
            wb.close()
            del wb
            gc.collect()

    @classmethod
    def detect_and_process_excel(cls, file_path: str, temp_dir: str) -> Tuple[str, int, int, int, bool, Dict[str, Any]]:
        """Bộ điều phối thông minh: Phân luồng COF 3 Tabs vs File Phôi 1 Tab."""
        os.makedirs(temp_dir, exist_ok=True)
        is_cof = COFService.is_cof_file(file_path)

        if is_cof:
            parsed = COFService.parse_cof_file(file_path)
            students = parsed.get("students_to_create", [])
            teachers = parsed.get("teachers_to_create", [])
            all_accounts = students + teachers
            output_acc_path = os.path.join(temp_dir, f"ready_accounts_{os.path.basename(file_path)}")
            cls.generate_accounts_excel_from_users(all_accounts, output_acc_path)
            return output_acc_path, len(students), len(teachers), len(all_accounts), True, parsed
        else:
            normalized_file = os.path.join(temp_dir, f"STANDARDIZED_{os.path.basename(file_path)}")
            ready_file, total_c, users_list = cls.normalize_input_accounts_excel(file_path, normalized_file)
            st_count = sum(1 for u in users_list if u.get("role", "").lower() == "student")
            tc_count = total_c - st_count
            return ready_file, st_count, tc_count, total_c, False, {}