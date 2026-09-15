"""
COF (Curriculum Order Form) Excel Service
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách: Bóc tách file COF 3 Tabs & Dán ngược kết quả tài khoản vào COF gốc.
"""
import os
import gc
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Tuple
import openpyxl
from openpyxl.styles import PatternFill, Font

logger = logging.getLogger(__name__)


class COFService:

    @staticmethod
    def clean_str(val: Any) -> str:
        return str(val).strip() if val is not None else ""

    @staticmethod
    def format_date_dob(dob_raw: Any) -> str:
        """Chuẩn hóa ngày sinh bắt buộc về DD/MM/YYYY."""
        if not dob_raw or str(dob_raw).strip() in ["", "None", "null", "---"]:
            return "01/01/2000"

        if isinstance(dob_raw, (datetime, date)):
            return f"{dob_raw.day:02d}/{dob_raw.month:02d}/{dob_raw.year}"

        if isinstance(dob_raw, (int, float)):
            try:
                val_num = float(dob_raw)
                if val_num > 1000:
                    d = datetime(1899, 12, 30) + timedelta(days=val_num)
                    return f"{d.day:02d}/{d.month:02d}/{d.year}"
            except Exception:
                pass

        s = str(dob_raw).strip().split(" ")[0].split("T")[0].replace("-", "/").replace(".", "/")
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
        """Nhận diện file COF 3 Tabs."""
        try:
            wb = openpyxl.load_workbook(file_path, read_only=True)
            s_lower = [s.lower() for s in wb.sheetnames]
            wb.close()
            return any("student info" in s or "teacher info" in s or "curriculum" in s or s == "cof" for s in s_lower)
        except Exception:
            return False

    @classmethod
    def parse_cof_file(cls, file_path: str) -> Dict[str, Any]:
        """Bóc tách 3 Tabs của file COF: Đơn hàng, Học sinh, Giáo viên."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Không tìm thấy file COF: {file_path}")

        wb = openpyxl.load_workbook(file_path, data_only=True)
        try:
            sheet_names = wb.sheetnames

            # 1. TAB 1: CURRICULUM ORDER FORM
            tab1_name = next((s for s in sheet_names if "curriculum" in s.lower() or "cof" in s.lower()), sheet_names[0])
            ws1 = wb[tab1_name]

            school_name = ""
            country = ""
            courses_to_order = []

            for row in range(1, 35):
                row_vals = [cls.clean_str(ws1.cell(row=row, column=c).value) for c in range(1, 15)]
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
                course_name = cls.clean_str(ws1.cell(row=r, column=4).value) or cls.clean_str(ws1.cell(row=r, column=3).value)
                category = cls.clean_str(ws1.cell(row=r, column=7).value) or "SWRP"
                course_id = cls.clean_str(ws1.cell(row=r, column=8).value)
                start_date = cls.clean_str(ws1.cell(row=r, column=9).value)
                end_date = cls.clean_str(ws1.cell(row=r, column=12).value)
                qty_val = cls.clean_str(ws1.cell(row=r, column=17).value)

                if not start_date or not end_date or start_date == "---" or end_date == "---":
                    continue
                if "dd-mm-yyyy" in start_date.lower() or "course name" in course_name.lower():
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

            # 2. TAB 2: STUDENT INFORMATION
            tab2_name = next((s for s in sheet_names if "student" in s.lower()), None)
            students_all = []
            students_to_create = []

            if tab2_name:
                ws2 = wb[tab2_name]
                for r in range(7, ws2.max_row + 1):
                    full_name = cls.clean_str(ws2.cell(row=r, column=2).value)
                    first_name = cls.clean_str(ws2.cell(row=r, column=3).value)
                    last_name = cls.clean_str(ws2.cell(row=r, column=4).value)
                    email = cls.clean_str(ws2.cell(row=r, column=6).value)
                    dob_raw = ws2.cell(row=r, column=7).value
                    account_exist = cls.clean_str(ws2.cell(row=r, column=8).value).lower()
                    grade = cls.clean_str(ws2.cell(row=r, column=9).value)
                    class_group = cls.clean_str(ws2.cell(row=r, column=11).value)
                    username = cls.clean_str(ws2.cell(row=r, column=12).value)

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
                        "dob": cls.format_date_dob(dob_raw),
                        "grade": grade,
                        "class_group": class_group or "Default Class",
                        "username": username,
                        "role": "student"
                    }
                    students_all.append(student_record)
                    if not username and account_exist != "yes":
                        students_to_create.append(student_record)

            # 3. TAB 3: TEACHER INFORMATION
            tab3_name = next((s for s in sheet_names if "teacher" in s.lower()), None)
            teachers_all = []
            teachers_to_create = []

            if tab3_name:
                ws3 = wb[tab3_name]
                for r in range(7, ws3.max_row + 1):
                    class_group = cls.clean_str(ws3.cell(row=r, column=3).value)
                    full_name = cls.clean_str(ws3.cell(row=r, column=5).value)
                    first_name = cls.clean_str(ws3.cell(row=r, column=6).value)
                    last_name = cls.clean_str(ws3.cell(row=r, column=7).value)
                    email = cls.clean_str(ws3.cell(row=r, column=8).value)
                    dob_raw = ws3.cell(row=r, column=9).value
                    account_exist = cls.clean_str(ws3.cell(row=r, column=10).value).lower()
                    course_assign = cls.clean_str(ws3.cell(row=r, column=11).value)
                    username = cls.clean_str(ws3.cell(row=r, column=12).value)

                    if not first_name and not full_name:
                        continue
                    if "total" in full_name.lower() or "total" in class_group.lower():
                        continue

                    teacher_record = {
                        "row_index": r,
                        "full_name": full_name or f"{first_name} {last_name}".strip(),
                        "first_name": first_name or (full_name.split()[0] if full_name else "Teacher"),
                        "last_name": last_name or "Auto",
                        "email": email,
                        "dob": cls.format_date_dob(dob_raw),
                        "class_group": class_group or "Default Class",
                        "course_assign": course_assign,
                        "username": username,
                        "role": "teacher"
                    }
                    teachers_all.append(teacher_record)
                    if not username and account_exist != "yes":
                        teachers_to_create.append(teacher_record)

            return {
                "school_name": school_name,
                "country": country,
                "courses": courses_to_order,
                "students_all": students_all,
                "students_to_create": students_to_create,
                "teachers_all": teachers_all,
                "teachers_to_create": teachers_to_create
            }
        finally:
            wb.close()
            del wb
            gc.collect()

    @classmethod
    def write_results_back_to_cof(
        cls, 
        original_cof_path: str, 
        result_excel_path: str,
        students_all: List[Dict[str, Any]], 
        students_to_create: List[Dict[str, Any]], 
        teachers_all: List[Dict[str, Any]], 
        teachers_to_create: List[Dict[str, Any]], 
        output_cof_path: str
    ) -> str:
        """DÁN KẾT QUẢ VÀO FILE COF 3 TABS (Highlight cam/đỏ cho tài khoản tạo mới)."""
        res_map = {}
        if os.path.exists(result_excel_path):
            wb_res = openpyxl.load_workbook(result_excel_path, data_only=True)
            try:
                ws_res = wb_res.active
                for r in range(2, ws_res.max_row + 1):
                    fn = str(ws_res.cell(row=r, column=2).value or '').strip().lower()
                    ln = str(ws_res.cell(row=r, column=3).value or '').strip().lower()
                    u = str(ws_res.cell(row=r, column=4).value or ws_res.cell(row=r, column=8).value or '').strip()
                    p = str(ws_res.cell(row=r, column=5).value or ws_res.cell(row=r, column=9).value or '').strip()
                    em = str(ws_res.cell(row=r, column=6).value or '').strip().lower()

                    if u:
                        key = em if em else f"{fn}_{ln}"
                        res_map[key] = {"username": u, "password": p}
            finally:
                wb_res.close()
                del wb_res

        wb_orig = openpyxl.load_workbook(original_cof_path)
        try:
            highlight_fill = PatternFill(start_color="FCE4D6", end_color="FCE4D6", fill_type="solid")
            highlight_font = Font(name="Calibri", size=11, bold=True, color="C00000")
            sheet_names = wb_orig.sheetnames

            # Tab 2: Students
            tab2_name = next((s for s in sheet_names if "student" in s.lower()), None)
            if tab2_name:
                ws_student = wb_orig[tab2_name]
                create_rows = {acc["row_index"]: acc for acc in students_to_create}

                for idx, acc in enumerate(students_all):
                    r = acc["row_index"]
                    grp_name = acc.get("class_group", "")
                    if grp_name:
                        c_grp = ws_student.cell(row=r, column=14, value=grp_name)
                        c_grp.fill, c_grp.font = highlight_fill, highlight_font

                    if r in create_rows:
                        key = acc["email"].lower() if acc["email"] else f"{acc['first_name']}_{acc['last_name']}".lower()
                        res = res_map.get(key)
                        if not res and idx < len(res_map):
                            res = list(res_map.values())[idx]
                        if res:
                            ws_student.cell(row=r, column=12, value=res["username"]).fill = highlight_fill
                            ws_student.cell(row=r, column=12).font = highlight_font
                            ws_student.cell(row=r, column=13, value=res["password"]).fill = highlight_fill
                            ws_student.cell(row=r, column=13).font = highlight_font

            # Tab 3: Teachers
            tab3_name = next((s for s in sheet_names if "teacher" in s.lower()), None)
            if tab3_name:
                ws_teacher = wb_orig[tab3_name]
                create_teacher_rows = {acc["row_index"]: acc for acc in teachers_to_create}

                for idx, acc in enumerate(teachers_all):
                    r = acc["row_index"]
                    grp_name = acc.get("class_group", "")
                    if grp_name:
                        c_grp = ws_teacher.cell(row=r, column=14, value=grp_name)
                        c_grp.fill, c_grp.font = highlight_fill, highlight_font

                    if r in create_teacher_rows:
                        key = acc["email"].lower() if acc["email"] else f"{acc['first_name']}_{acc['last_name']}".lower()
                        res = res_map.get(key)
                        if not res and idx < len(res_map):
                            res = list(res_map.values())[idx]
                        if res:
                            ws_teacher.cell(row=r, column=12, value=res["username"]).fill = highlight_fill
                            ws_teacher.cell(row=r, column=12).font = highlight_font
                            ws_teacher.cell(row=r, column=13, value=res["password"]).fill = highlight_fill
                            ws_teacher.cell(row=r, column=13).font = highlight_font

            os.makedirs(os.path.dirname(output_cof_path), exist_ok=True)
            wb_orig.save(output_cof_path)
            logger.info(f"✨ File COF đã dán kết quả: {output_cof_path}")
            return output_cof_path
        finally:
            wb_orig.close()
            del wb_orig
            gc.collect()