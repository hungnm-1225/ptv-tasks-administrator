# backend/app/services/cof_excel_service.py
import os
import re
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional, Tuple

import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side

logger = logging.getLogger(__name__)


class COFExcelService:
    """Service chuyên trách bóc tách, chuẩn hóa dữ liệu COF (3 Tabs) và File Danh Sách Tài Khoản (1 Tab)."""

    @staticmethod
    def _clean_str(val: Any) -> str:
        if val is None:
            return ""
        return str(val).strip()

    @staticmethod
    def _format_date_dob(dob_raw: Any) -> str:
        """
        Chuẩn hóa ngày sinh bắt buộc về DD/MM/YYYY sạch sẽ:
        - Xử lý số serial Excel (ví dụ: 42370 -> 01/01/2016).
        - Xử lý datetime/date object (loại bỏ 00:00:00).
        - Xử lý chuỗi text định dạng bất kỳ.
        """
        if not dob_raw or str(dob_raw).strip() in ["", "None", "null", "---"]:
            return "01/01/2000"

        # 1. Nếu là đối tượng datetime hoặc date
        if isinstance(dob_raw, (datetime, date)):
            return f"{dob_raw.day:02d}/{dob_raw.month:02d}/{dob_raw.year}"

        # 2. Nếu là số serial của Excel (ví dụ 42370)
        if isinstance(dob_raw, (int, float)):
            try:
                val_num = float(dob_raw)
                if val_num > 1000:
                    d = datetime(1899, 12, 30) + timedelta(days=val_num)
                    return f"{d.day:02d}/{d.month:02d}/{d.year}"
            except Exception:
                pass

        # 3. Nếu là chuỗi text
        s = str(dob_raw).strip().split(" ")[0].split("T")[0]
        s = s.replace("-", "/").replace(".", "/")
        parts = [p.strip() for p in s.split("/") if p.strip()]

        if len(parts) == 3:
            try:
                if len(parts[0]) == 4:  # YYYY/MM/DD
                    return f"{int(parts[2]):02d}/{int(parts[1]):02d}/{int(parts[0])}"
                elif len(parts[2]) == 4:  # DD/MM/YYYY
                    return f"{int(parts[0]):02d}/{int(parts[1]):02d}/{int(parts[2])}"
            except ValueError:
                pass

        return "01/01/2000"

    @classmethod
    def is_cof_file(cls, file_path: str) -> bool:
        """Kiểm tra xem file có phải là file COF 3 Tabs hay không."""
        try:
            wb = openpyxl.load_workbook(file_path, read_only=True)
            s_lower = [s.lower() for s in wb.sheetnames]
            wb.close()
            return any("student info" in s or "teacher info" in s or "curriculum" in s or s == "cof" for s in s_lower)
        except Exception:
            return False

    @classmethod
    def parse_cof_file(cls, file_path: str) -> Dict[str, Any]:
        """
        Bóc tách toàn diện file COF:
        - Tab 1: Đơn hàng & Môn học
        - Tab 2: Học sinh (Chỉ lọc lấy học sinh CHƯA TẠO đem đi nộp)
        - Tab 3: Giáo viên (Chỉ lọc lấy giáo viên CHƯA TẠO đem đi nộp)
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Không tìm thấy file: {file_path}")

        wb = openpyxl.load_workbook(file_path, data_only=True)
        sheet_names = wb.sheetnames

        # 1. BÓC TÁCH TAB 1: CURRICULUM ORDER FORM (COF)
        tab1_name = next((s for s in sheet_names if "curriculum" in s.lower() or "cof" in s.lower()), sheet_names[0])
        ws1 = wb[tab1_name]

        school_name = ""
        country = ""
        courses_to_order = []

        for row in range(1, 35):
            row_vals = [cls._clean_str(ws1.cell(row=row, column=c).value) for c in range(1, 15)]
            row_text = " ".join(row_vals).lower()
            
            if "school name:" in row_text:
                for idx, v in enumerate(row_vals):
                    if "school name:" in v.lower() and idx + 1 < len(row_vals):
                        school_name = row_vals[idx + 1] or (row_vals[idx + 2] if idx + 2 < len(row_vals) else "")
                        break
            if "country:" in row_text:
                for idx, v in enumerate(row_vals):
                    if "country:" in v.lower() and idx + 1 < len(row_vals):
                        country = row_vals[idx + 1]
                        break

        for r in range(25, ws1.max_row + 1):
            course_name = cls._clean_str(ws1.cell(row=r, column=4).value) or cls._clean_str(ws1.cell(row=r, column=3).value)
            category = cls._clean_str(ws1.cell(row=r, column=7).value) or "SWRP"
            course_id = cls._clean_str(ws1.cell(row=r, column=8).value)
            start_date = cls._clean_str(ws1.cell(row=r, column=9).value)
            end_date = cls._clean_str(ws1.cell(row=r, column=12).value)
            qty_val = cls._clean_str(ws1.cell(row=r, column=17).value)

            if not start_date or not end_date or start_date == "---" or end_date == "---":
                continue
            if "dd-mm-yyyy" in start_date.lower() or "course name" in course_name.lower() or "school start date" in start_date.lower():
                continue

            try:
                licenses = int(float(qty_val)) if qty_val else 1
            except ValueError:
                licenses = 1

            courses_to_order.append({
                "course_id": str(course_id).replace(".0", ""),
                "course_name": course_name,
                "category": category,
                "start_date": start_date,
                "end_date": end_date,
                "licenses": licenses,
                "row_index": r
            })

        # 2. BÓC TÁCH TAB 2: STUDENT INFORMATION
        tab2_name = next((s for s in sheet_names if "student" in s.lower()), None)
        students_all = []
        students_to_create = []

        if tab2_name:
            ws2 = wb[tab2_name]
            for r in range(7, ws2.max_row + 1):
                full_name = cls._clean_str(ws2.cell(row=r, column=2).value)
                first_name = cls._clean_str(ws2.cell(row=r, column=3).value)
                last_name = cls._clean_str(ws2.cell(row=r, column=4).value)
                email = cls._clean_str(ws2.cell(row=r, column=6).value)
                dob_raw = ws2.cell(row=r, column=7).value
                account_exist = cls._clean_str(ws2.cell(row=r, column=8).value).lower()
                grade = cls._clean_str(ws2.cell(row=r, column=9).value)
                class_group = cls._clean_str(ws2.cell(row=r, column=11).value)
                username = cls._clean_str(ws2.cell(row=r, column=12).value)

                if not first_name and not full_name:
                    continue
                if "total" in full_name.lower() or "total" in first_name.lower():
                    continue

                student_record = {
                    "row_index": r,
                    "full_name": full_name or f"{first_name} {last_name}".strip(),
                    "first_name": first_name or (full_name.split()[0] if full_name else "Student"),
                    "last_name": last_name or (" ".join(full_name.split()[1:]) if len(full_name.split()) > 1 else "Auto"),
                    "email": email,
                    "dob": cls._format_date_dob(dob_raw),
                    "grade": grade,
                    "class_group": class_group or "Default Class",
                    "username": username,
                    "role": "student"
                }
                students_all.append(student_record)

                # 🎯 CHỈ ĐƯA ĐI TẠO NẾU CHƯA CÓ USERNAME VÀ CHƯA TỒN TẠI!
                if not username and account_exist != "yes":
                    students_to_create.append(student_record)

        # 3. BÓC TÁCH TAB 3: TEACHER INFORMATION
        tab3_name = next((s for s in sheet_names if "teacher" in s.lower()), None)
        teachers_all = []
        teachers_to_create = []

        if tab3_name:
            ws3 = wb[tab3_name]
            for r in range(7, ws3.max_row + 1):
                class_group = cls._clean_str(ws3.cell(row=r, column=3).value)
                full_name = cls._clean_str(ws3.cell(row=r, column=5).value)
                first_name = cls._clean_str(ws3.cell(row=r, column=6).value)
                last_name = cls._clean_str(ws3.cell(row=r, column=7).value)
                email = cls._clean_str(ws3.cell(row=r, column=8).value)
                dob_raw = ws3.cell(row=r, column=9).value
                account_exist = cls._clean_str(ws3.cell(row=r, column=10).value).lower()
                course_assign = cls._clean_str(ws3.cell(row=r, column=11).value)
                username = cls._clean_str(ws3.cell(row=r, column=12).value)

                if not first_name and not full_name:
                    continue
                if "total" in full_name.lower() or "total" in class_group.lower() or "total" in first_name.lower():
                    continue

                teacher_record = {
                    "row_index": r,
                    "full_name": full_name or f"{first_name} {last_name}".strip(),
                    "first_name": first_name or (full_name.split()[0] if full_name else "Teacher"),
                    "last_name": last_name or "Auto",
                    "email": email,
                    "dob": cls._format_date_dob(dob_raw),
                    "class_group": class_group or "Default Class",
                    "course_assign": course_assign,
                    "username": username,
                    "role": "teacher"
                }
                teachers_all.append(teacher_record)

                # 🎯 CHỈ ĐƯA ĐI TẠO NẾU CHƯA CÓ USERNAME!
                if not username and account_exist != "yes":
                    teachers_to_create.append(teacher_record)

        wb.close()

        return {
            "school_name": school_name,
            "country": country,
            "courses": courses_to_order,
            "students_all": students_all,
            "students_to_create": students_to_create,
            "teachers_all": teachers_all,
            "teachers_to_create": teachers_to_create
        }

    @classmethod
    def normalize_input_accounts_excel(cls, input_file_path: str, output_file_path: str) -> Tuple[str, int, List[Dict[str, Any]]]:
        """
        Chuẩn hóa mọi file người dùng gửi về chuẩn format của trường:
        - Tiêu đề ở Hàng 2.
        - Header nằm ở Hàng 5 (No., First Name, Last Name, Mobile, Email, DOB, Role).
        - Dữ liệu bắt đầu từ Hàng 6 (Chống mất dòng học sinh đầu tiên!).
        - Ngày sinh làm sạch dạng text DD/MM/YYYY chuẩn.
        """
        wb_in = openpyxl.load_workbook(input_file_path, data_only=True)
        ws_in = wb_in.active

        header_row_idx = -1
        col_map = {}

        # 1. Tìm dòng header thực tế (kể cả Hàng 3 hay Hàng 5)
        for r_idx, row in enumerate(ws_in.iter_rows(values_only=True), 1):
            if r_idx > 15:
                break
            row_vals = [str(c or '').strip().lower() for c in row]
            row_str = " ".join(row_vals)
            if "first name" in row_str or ("last name" in row_str and "role" in row_str):
                header_row_idx = r_idx
                for c_idx, val in enumerate(row_vals):
                    if "first name" in val: col_map["first_name"] = c_idx
                    elif "last name" in val: col_map["last_name"] = c_idx
                    elif "mobile" in val or "phone" in val: col_map["mobile"] = c_idx
                    elif "email" in val: col_map["email"] = c_idx
                    elif "birth" in val or "dob" in val: col_map["dob"] = c_idx
                    elif "role" in val: col_map["role"] = c_idx
                break

        if header_row_idx == -1:
            header_row_idx = 3
            col_map = {"first_name": 2, "last_name": 3, "mobile": 4, "email": 5, "dob": 6, "role": 7}

        # 2. Đọc toàn bộ người dùng từ dòng bên dưới Header
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
            dob = cls._format_date_dob(raw_dob)
            role = str(row[col_map.get("role", 6)] or 'Student').strip() if "role" in col_map else "Student"

            extracted_users.append({
                "first_name": fn,
                "last_name": ln,
                "mobile": mob,
                "email": em,
                "dob": dob,
                "role": role
            })

        wb_in.close()

        # 3. Tạo Workbook mới theo CHUẨN ĐÚNG CỦA TRƯỜNG (Header ở hàng 5, data ở hàng 6)
        wb_out = openpyxl.Workbook()
        ws_out = wb_out.active
        ws_out.title = "Class 7s"

        ws_out.merge_cells("B2:G2")
        title_cell = ws_out["B2"]
        title_cell.value = "Account creation request form"
        title_cell.font = Font(name="Arial", size=18, bold=True)
        title_cell.alignment = Alignment(horizontal="center", vertical="center")

        headers = ["No.", "First Name (*)", "Last Name (*)", "Mobile number", "Email (*)", "Date of Birth (*)", "Role (*)"]
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
            ws_out.cell(row=r, column=6, value=u["dob"])  # 🎯 Chuẩn chuỗi DD/MM/YYYY
            ws_out.cell(row=r, column=7, value=u["role"])

        os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
        wb_out.save(output_file_path)
        wb_out.close()
        logger.info(f"✨ Chuẩn hóa thành công {len(extracted_users)} tài khoản vào file chuẩn: {output_file_path}")
        return output_file_path, len(extracted_users), extracted_users

    @classmethod
    def detect_and_process_excel(cls, file_path: str, temp_dir: str) -> Tuple[str, int, int, int, bool, Dict[str, Any]]:
        """
        Bộ điều phối thông minh (Smart Router):
        1. File COF (3 Tabs) -> Tách chỉ những học sinh/GV chưa tạo để đem đi nộp.
        2. File Danh Sách (1 Tab) -> Chuẩn hóa Header Hàng 5, Data Hàng 6.
        """
        os.makedirs(temp_dir, exist_ok=True)
        is_cof = cls.is_cof_file(file_path)

        if is_cof:
            parsed = cls.parse_cof_file(file_path)
            students = parsed.get("students_to_create", [])
            teachers = parsed.get("teachers_to_create", [])
            all_accounts = students + teachers
            
            output_acc_path = os.path.join(temp_dir, f"ready_accounts_{os.path.basename(file_path)}")
            
            # Sinh file chuẩn upload bắt đầu từ hàng 6
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Class 7s"
            ws.cell(row=2, column=2, value="Account creation request form").font = Font(name="Arial", size=18, bold=True)
            
            headers = ["No.", "First Name (*)", "Last Name (*)", "Mobile number", "Email (*)", "Date of Birth (*)", "Role (*)"]
            for col_num, h in enumerate(headers, 1):
                ws.cell(row=5, column=col_num, value=h).font = Font(name="Arial", size=10, bold=True)

            for idx, acc in enumerate(all_accounts, 1):
                r = idx + 5
                ws.cell(row=r, column=1, value=idx)
                ws.cell(row=r, column=2, value=acc.get("first_name", ""))
                ws.cell(row=r, column=3, value=acc.get("last_name", ""))
                ws.cell(row=r, column=4, value="")
                ws.cell(row=r, column=5, value=acc.get("email", ""))
                ws.cell(row=r, column=6, value=acc.get("dob", "01/01/2000"))
                ws.cell(row=r, column=7, value=acc.get("role", "Student").capitalize())

            wb.save(output_acc_path)
            wb.close()
            total_count = len(all_accounts)
            logger.info(f"📋 [COF ROUTER] Đã tách {len(students)} học sinh & {len(teachers)} GV chưa tạo (Tổng: {total_count})")
            return output_acc_path, len(students), len(teachers), total_count, True, parsed
        else:
            normalized_file = os.path.join(temp_dir, f"STANDARDIZED_{os.path.basename(file_path)}")
            ready_file, total_c, users_list = cls.normalize_input_accounts_excel(file_path, normalized_file)
            st_count = sum(1 for u in users_list if u.get("role", "").lower() == "student")
            tc_count = total_c - st_count
            logger.info(f"📋 [STANDARD ROUTER] Đã chuẩn hóa file 1 Tab: {total_c} tài khoản (HS: {st_count}, GV: {tc_count})")
            return ready_file, st_count, tc_count, total_c, False, {}

    @classmethod
    def write_results_back_to_standard_accounts(
        cls,
        standard_file_path: str,
        api_user_records: list,
        output_file_path: str
    ) -> str:
        """
        GIỮ NGUYÊN 7 CỘT GỐC (A ĐẾN G), TẠO THÊM 3 CỘT Ở CUỐI CÙNG:
        - Cột H: Username
        - Cột I: Password
        - Cột J: Note
        Nếu is_create == True: Ghi Username (H), Password (I), bỏ qua Note (J).
        Nếu is_create == False: Bỏ qua H & I, ghi 'Tài khoản đã tồn tại' vào Note (J).
        """
        wb = openpyxl.load_workbook(standard_file_path)
        ws = wb.active

        # 1. Thêm 3 cột H, I, J ở Hàng 5
        ws.cell(row=5, column=8, value="Username").font = Font(name="Arial", size=10, bold=True)
        ws.cell(row=5, column=9, value="Password").font = Font(name="Arial", size=10, bold=True)
        ws.cell(row=5, column=10, value="Note").font = Font(name="Arial", size=10, bold=True)

        for col_idx in [8, 9, 10]:
            ws.cell(row=5, column=col_idx).alignment = Alignment(horizontal="center", vertical="center")

        # 2. Tạo map tra cứu từ API exportData.php
        api_map_by_email = {}
        api_map_by_name = {}
        for item in api_user_records:
            em = str(item.get("email") or '').strip().lower()
            if em:
                api_map_by_email[em] = item
            fn = str(item.get("firstname") or '').strip().lower()
            ln = str(item.get("lastname") or '').strip().lower()
            if fn or ln:
                api_map_by_name[f"{fn}_{ln}"] = item

        # 3. Ghi kết quả từ Hàng 6
        for r in range(6, ws.max_row + 1):
            row_email = str(ws.cell(row=r, column=5).value or '').strip().lower()
            row_fn = str(ws.cell(row=r, column=2).value or '').strip().lower()
            row_ln = str(ws.cell(row=r, column=3).value or '').strip().lower()

            # Làm sạch ngày sinh cột F
            current_dob = ws.cell(row=r, column=6).value
            ws.cell(row=r, column=6, value=cls._format_date_dob(current_dob))

            matched = api_map_by_email.get(row_email) or api_map_by_name.get(f"{row_fn}_{row_ln}")

            if matched:
                is_create = matched.get("is_create", False)
                if is_create:
                    # 🟢 Tài khoản mới tạo: Ghi Username (H), Password (I), bỏ qua Note (J)
                    ws.cell(row=r, column=8, value=matched.get("username", ""))
                    ws.cell(row=r, column=9, value=matched.get("password", ""))
                    ws.cell(row=r, column=10, value="")
                else:
                    # 🟡 Tài khoản đã có sẵn: Bỏ qua H & I, ghi Note (J)
                    ws.cell(row=r, column=8, value="")
                    ws.cell(row=r, column=9, value="")
                    note_cell = ws.cell(row=r, column=10, value="Tài khoản đã tồn tại")
                    note_cell.font = Font(name="Arial", size=9, italic=True, color="7F7F7F")

        os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
        wb.save(output_file_path)
        wb.close()
        logger.info(f"✨ Đã ghi ngược kết quả vào file chuẩn 10 cột: {output_file_path}")
        return output_file_path

    @classmethod
    def write_results_back_to_cof(
        cls, 
        original_cof_path: str, 
        api_user_records: list,
        students_all: List[Dict[str, Any]], 
        students_to_create: List[Dict[str, Any]], 
        teachers_all: List[Dict[str, Any]], 
        teachers_to_create: List[Dict[str, Any]], 
        output_cof_path: str
    ) -> str:
        """
        DÁN KẾT QUẢ VÀO FILE COF (3 TABS):
        - Chỉ dán vào học sinh/GV trong danh sách MỚI TẠO (Highlight cam/đỏ).
        - Người nào đã có tài khoản cũ thì GIỮ NGUYÊN HOÀN TOÀN!
        """
        wb_orig = openpyxl.load_workbook(original_cof_path)

        res_map = {}
        for item in api_user_records:
            em = str(item.get("email") or '').strip().lower()
            fn = str(item.get("firstname") or '').strip().lower()
            ln = str(item.get("lastname") or '').strip().lower()
            u = str(item.get("username") or '').strip()
            p = str(item.get("password") or '').strip()
            
            key = em if em else f"{fn}_{ln}"
            if u:
                res_map[key] = {"username": u, "password": p}

        highlight_fill = PatternFill(start_color="FCE4D6", end_color="FCE4D6", fill_type="solid")
        highlight_font = Font(name="Calibri", size=11, bold=True, color="C00000")

        sheet_names = wb_orig.sheetnames

        # 1. Dán Tab 2: Student Information
        tab2_name = next((s for s in sheet_names if "student" in s.lower()), None)
        if tab2_name:
            ws_student = wb_orig[tab2_name]
            create_rows = {acc["row_index"]: acc for acc in students_to_create}

            for idx, acc in enumerate(students_all):
                r = acc["row_index"]
                grp_name = acc.get("class_group", "")

                if grp_name:
                    cell_grp = ws_student.cell(row=r, column=14, value=grp_name)
                    cell_grp.fill = highlight_fill
                    cell_grp.font = highlight_font

                # 🎯 CHỈ GHI VÀO NHỮNG HỌC SINH MỚI ĐƯỢC TẠO!
                if r in create_rows:
                    key = acc["email"].lower() if acc["email"] else f"{acc['first_name']}_{acc['last_name']}".lower()
                    res = res_map.get(key)
                    if not res and idx < len(res_map):
                        res = list(res_map.values())[idx]

                    if res:
                        cell_u = ws_student.cell(row=r, column=12, value=res["username"])
                        cell_u.fill = highlight_fill
                        cell_u.font = highlight_font

                        cell_p = ws_student.cell(row=r, column=13, value=res["password"])
                        cell_p.fill = highlight_fill
                        cell_p.font = highlight_font

        # 2. Dán Tab 3: Teacher Information
        tab3_name = next((s for s in sheet_names if "teacher" in s.lower()), None)
        if tab3_name:
            ws_teacher = wb_orig[tab3_name]
            create_teacher_rows = {acc["row_index"]: acc for acc in teachers_to_create}

            for idx, acc in enumerate(teachers_all):
                r = acc["row_index"]
                grp_name = acc.get("class_group", "")

                if grp_name:
                    cell_grp = ws_teacher.cell(row=r, column=14, value=grp_name)
                    cell_grp.fill = highlight_fill
                    cell_grp.font = highlight_font

                # 🎯 CHỈ GHI VÀO NHỮNG GIÁO VIÊN MỚI ĐƯỢC TẠO!
                if r in create_teacher_rows:
                    key = acc["email"].lower() if acc["email"] else f"{acc['first_name']}_{acc['last_name']}".lower()
                    res = res_map.get(key)
                    if not res and idx < len(res_map):
                        res = list(res_map.values())[idx]

                    if res:
                        cell_u = ws_teacher.cell(row=r, column=12, value=res["username"])
                        cell_u.fill = highlight_fill
                        cell_u.font = highlight_font

                        cell_p = ws_teacher.cell(row=r, column=13, value=res["password"])
                        cell_p.fill = highlight_fill
                        cell_p.font = highlight_font

        os.makedirs(os.path.dirname(output_cof_path), exist_ok=True)
        wb_orig.save(output_cof_path)
        wb_orig.close()
        logger.info(f"✨ File COF hoàn thiện (Đã dán kết quả mới) lưu tại: {output_cof_path}")
        return output_cof_path