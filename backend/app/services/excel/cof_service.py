# backend/app/services/excel/cof_service.py
"""
COF (Curriculum Order Form) Intelligent Excel Service
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI (Master Enterprise Edition)
Chuyên trách: 
- Bóc tách file COF 3 Tabs chuẩn xác từng tọa độ (Cột G, H, I, L, Q).
- Thuật toán Heuristic Grade Matcher: Tự động ghép Khối lớp vào Khay khóa học (SWRP {N} <-> Grade {N}).
- ĐẶC TRỊ GIÁO VIÊN: Forward-fill hàng trống, tách nhiều môn trong 1 ô, gộp giáo viên trùng lặp theo Email.
- Chuẩn hóa tên Group LMS không ký tự đặc biệt: [School Clean] [Class Clean] [YYYYMon].
- Dán ngược kết quả tài khoản & Group vào Cột L, M, N, O (Highlight cam/đỏ FCE4D6).
"""
import os
import re
import gc
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Tuple, Optional, Set
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side

logger = logging.getLogger(__name__)

# Từ điển đối chiếu ID khóa học Pythaverse
COURSE_METADATA_MAP = {
    "679": {"name": "SWRP 7: Intelligent Robotics: Expanding Horizons with LEANBOT (EN)", "grade": 7, "cat": "SWRP"},
    "654": {"name": "SWRP 9: LEANBOT Programming Applications with IoT [V2] (EN)", "grade": 9, "cat": "SWRP"},
    "695": {"name": "SWRP 11: Exploring IoT and AI with LEANBOT Intermediate [V2] (EN)", "grade": 11, "cat": "SWRP"},
    "780": {"name": "ASP Elementary Intermediate (EN)", "grade": None, "cat": "ASP"},
    "242": {"name": "Basic C++ Programming with Leanbot", "grade": None, "cat": "Other"}
}


class COFService:

    @staticmethod
    def clean_str(val: Any) -> str:
        return str(val).strip() if val is not None else ""

    @staticmethod
    def clean_text_no_special(text: str) -> str:
        """Khử sạch sành sanh ký tự đặc biệt, chỉ giữ lại chữ cái, số và khoảng trắng đơn."""
        if not text:
            return ""
        cleaned = re.sub(r"[^\w\s]", " ", str(text))
        return re.sub(r"\s+", " ", cleaned).strip()

    @classmethod
    def generate_lms_group_name(cls, school_name: str, class_name: str, date_obj: Optional[datetime] = None) -> str:
        """Sinh tên Group chuẩn LMS: [School Clean] [Class Clean] [YYYYMon]."""
        c_school = cls.clean_text_no_special(school_name)
        c_class = cls.clean_text_no_special(class_name) or "General"
        dt = date_obj or datetime.now()
        suffix = dt.strftime("%Y%b")
        return re.sub(r"\s+", " ", f"{c_school} {c_class} {suffix}").strip()

    @staticmethod
    def extract_grade_number(text: str) -> Optional[int]:
        """Trích xuất khối lớp, hỗ trợ các phân ban Senior High School: STEM, ABM, HUMSS, TVL, GAS."""
        if not text:
            return None
        shs_match = re.search(r"(?:stem|abm|humss|humms|tvl|gas|shs)\s*(\d{1,2})", text, re.IGNORECASE)
        if shs_match:
            return int(shs_match.group(1))

        gr_match = re.search(r"(?:gr|grade|year|khối|lớp)\s*(\d{1,2})", text, re.IGNORECASE)
        if gr_match:
            return int(gr_match.group(1))

        num_match = re.search(r"\b(\d{1,2})\b", text)
        if num_match:
            return int(num_match.group(1))
        return None

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

    @staticmethod
    def format_date_iso(val: Any) -> str:
        """Chuẩn hóa ngày tháng về YYYY-MM-DD an toàn."""
        if not val or str(val).strip() in ["", "None", "null", "---"]:
            return ""
        if isinstance(val, (datetime, date)):
            return val.strftime("%Y-%m-%d")
        if isinstance(val, (int, float)):
            try:
                val_num = float(val)
                if val_num > 1000:
                    d = datetime(1899, 12, 30) + timedelta(days=val_num)
                    return d.strftime("%Y-%m-%d")
            except Exception:
                pass

        val_str = str(val).strip().split(" ")[0].split("T")[0]
        d_match = re.match(r"^(\d{1,2})[-/\.](\d{1,2})[-/\.](\d{4})$", val_str)
        if d_match:
            d, m, y = d_match.groups()
            return f"{y}-{int(m):02d}-{int(d):02d}"
        if re.match(r"^\d{4}-\d{2}-\d{2}$", val_str):
            return val_str
        return val_str

    @classmethod
    def is_cof_file(cls, file_path: str) -> bool:
        """Nhận diện file COF 3 Tabs."""
        try:
            wb = openpyxl.load_workbook(file_path, read_only=True)
            s_lower = [s.lower() for s in wb.sheetnames]
            wb.close()
            return any("student" in s or "teacher" in s or "curriculum" in s or s == "cof" for s in s_lower)
        except Exception:
            return False

    @classmethod
    def parse_cof_file(cls, file_path: str) -> Dict[str, Any]:
        """Bóc tách 3 Tabs của file COF với độ chính xác tuyệt đối từng tọa độ."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Không tìm thấy file COF: {file_path}")

        wb = openpyxl.load_workbook(file_path, data_only=True)
        try:
            sheet_names = wb.sheetnames

            # =========================================================================
            # 1. TAB 1: CURRICULUM ORDER FORM
            # =========================================================================
            tab1_name = next((s for s in sheet_names if "curriculum" in s.lower() or "cof" in s.lower()), sheet_names[0])
            ws1 = wb[tab1_name]

            school_name = cls.clean_str(ws1.cell(row=6, column=3).value) or "Pythaverse School"
            school_address = cls.clean_str(ws1.cell(row=7, column=3).value)
            country = "Philippines" if "leyte" in school_address.lower() or "ph" in school_address.lower() else "Vietnam"

            courses_to_order = []
            ordered_trays: Dict[str, Dict[str, Any]] = {}

            # Bảng môn học bắt đầu từ hàng 28
            for r in range(28, ws1.max_row + 1):
                raw_course_id = ws1.cell(row=r, column=8).value  # Cột H (Course ID)
                if not raw_course_id:
                    continue

                course_id_str = str(int(float(raw_course_id))) if str(raw_course_id).replace(".", "").isdigit() else str(raw_course_id).strip()
                course_name_col_g = cls.clean_str(ws1.cell(row=r, column=7).value)  # Cột G (Tên môn thật)
                course_link = cls.clean_str(ws1.cell(row=r, column=3).value)        # Cột C (Course Link)

                meta = COURSE_METADATA_MAP.get(course_id_str, {})
                course_name = course_name_col_g or meta.get("name") or f"Course #{course_id_str}"
                category = meta.get("cat") or ("ASP" if "ASP" in course_name else ("IR" if "IR" in course_name else "SWRP"))

                start_date = cls.format_date_iso(ws1.cell(row=r, column=9).value)   # Cột I (Start Date - merge I-K)
                end_date = cls.format_date_iso(ws1.cell(row=r, column=12).value)    # Cột L (End Date - merge L-N)
                date_req = cls.format_date_iso(ws1.cell(row=r, column=15).value)    # Cột O (Date Request)
                qty_raw = ws1.cell(row=r, column=17).value                          # Cột Q (Số lượng bản quyền thật!)

                try:
                    licenses = int(float(qty_raw)) if qty_raw else 0
                except (ValueError, TypeError):
                    licenses = 0

                # Lọc cốt tử: ít nhất 1 trong 3 thông tin phải có
                if not (start_date or end_date or licenses > 0):
                    continue

                swrp_m = re.search(r"SWRP\s*(\d+)", course_name, re.IGNORECASE)
                target_grade = int(swrp_m.group(1)) if swrp_m else meta.get("grade")

                course_entry = {
                    "course_id": course_id_str,
                    "course_name": course_name,
                    "course_link": course_link,
                    "category": category,
                    "target_grade": target_grade,
                    "start_date": start_date or None,
                    "end_date": end_date or None,
                    "date_request": date_req or None,
                    "licenses": licenses,
                    "licenses_quota": licenses,
                    "assigned_students_count": 0,
                    "assigned_classes": {},
                    "row_index": r
                }
                courses_to_order.append(course_entry)
                ordered_trays[course_id_str] = course_entry

            # =========================================================================
            # 2. TAB 2: STUDENT INFORMATION & PHÂN LỚP
            # =========================================================================
            tab2_name = next((s for s in sheet_names if "student" in s.lower()), None)
            students_all = []
            students_to_create = []
            classes_map: Dict[str, List[Dict[str, Any]]] = {}

            if tab2_name:
                ws2 = wb[tab2_name]
                for r in range(7, ws2.max_row + 1):
                    fn = cls.clean_str(ws2.cell(row=r, column=3).value)
                    ln = cls.clean_str(ws2.cell(row=r, column=4).value)
                    email = cls.clean_str(ws2.cell(row=r, column=6).value).lower()
                    dob_raw = ws2.cell(row=r, column=7).value
                    account_exist = cls.clean_str(ws2.cell(row=r, column=8).value).lower()
                    
                    # Lấy tên lớp: Cột 11 -> Cột 10 -> Cột 9 (Trim từng ô tránh ô dấu cách rác!)
                    c11 = cls.clean_str(ws2.cell(row=r, column=11).value)
                    c10 = cls.clean_str(ws2.cell(row=r, column=10).value)
                    c9 = cls.clean_str(ws2.cell(row=r, column=9).value)
                    raw_class_name = c11 or c10 or c9 or "Chưa phân lớp (No Class)"
                    username = cls.clean_str(ws2.cell(row=r, column=12).value)

                    if not fn and not email:
                        continue
                    if "total" in fn.lower():
                        continue

                    clean_group_lms = cls.generate_lms_group_name(school_name, raw_class_name)

                    student_record = {
                        "row_index": r,
                        "full_name": f"{fn} {ln}".strip(),
                        "first_name": fn or "Student",
                        "last_name": ln or "Auto",
                        "email": email,
                        "dob": cls.format_date_dob(dob_raw),
                        "class_group": raw_class_name,
                        "lms_group_name": clean_group_lms,
                        "username": username,
                        "already_exists": account_exist == "yes" or bool(username),
                        "role": "student"
                    }
                    students_all.append(student_record)
                    classes_map.setdefault(raw_class_name, []).append(student_record)

                    if not username and account_exist != "yes":
                        students_to_create.append(student_record)

            # HEURISTIC GRADE MATCHER: Xếp các lớp vào Khay khóa học
            unmatched_classes = []
            for class_name, std_list in classes_map.items():
                class_grade = cls.extract_grade_number(class_name)
                matched_cid = None

                for cid, cinfo in ordered_trays.items():
                    if cinfo["target_grade"] is not None and class_grade == cinfo["target_grade"]:
                        matched_cid = cid
                        break

                if matched_cid:
                    t_info = ordered_trays[matched_cid]
                    t_info["assigned_students_count"] += len(std_list)
                    t_info["assigned_classes"][class_name] = {
                        "lms_group_name": cls.generate_lms_group_name(school_name, class_name),
                        "students_count": len(std_list)
                    }
                else:
                    unmatched_classes.append({
                        "class_name": class_name,
                        "count": len(std_list),
                        "grade_detected": class_grade
                    })

            # =========================================================================
            # 3. TAB 3: TEACHER INFORMATION (GỘP GIÁO VIÊN & FORWARD-FILL)
            # =========================================================================
            tab3_name = next((s for s in sheet_names if "teacher" in s.lower()), None)
            teachers_all = []
            teachers_to_create = []
            teachers_allocation = []

            if tab3_name:
                ws3 = wb[tab3_name]
                
                # Bảng gộp giáo viên theo Email
                teacher_map: Dict[str, Dict[str, Any]] = {}
                last_teacher_name = ""
                last_teacher_email = ""
                last_fn = ""
                last_ln = ""
                last_dob = ""
                last_acc_exist = ""

                for r in range(7, ws3.max_row + 1):
                    raw_target_class = cls.clean_str(ws3.cell(row=r, column=3).value)
                    fn = cls.clean_str(ws3.cell(row=r, column=6).value) or cls.clean_str(ws3.cell(row=r, column=5).value)
                    ln = cls.clean_str(ws3.cell(row=r, column=7).value)
                    email = cls.clean_str(ws3.cell(row=r, column=8).value or ws3.cell(row=r, column=4).value).lower()
                    dob_raw = ws3.cell(row=r, column=9).value
                    account_exist = cls.clean_str(ws3.cell(row=r, column=10).value).lower()
                    course_assign = cls.clean_str(ws3.cell(row=r, column=11).value)
                    username = cls.clean_str(ws3.cell(row=r, column=12).value)

                    if not course_assign and not fn and not email:
                        continue
                    if "total" in fn.lower():
                        continue

                    # 🎯 FORWARD-FILL: Nếu hàng dưới trống tên/email nhưng có ghi môn học -> Kế thừa thầy ở hàng trên!
                    if not email and last_teacher_email:
                        email = last_teacher_email
                        fn = fn or last_fn
                        ln = ln or last_ln
                        dob_raw = dob_raw or last_dob
                        account_exist = account_exist or last_acc_exist
                    elif email:
                        last_teacher_email = email
                        last_fn = fn
                        last_ln = ln
                        last_dob = dob_raw
                        last_acc_exist = account_exist

                    if not email:
                        continue

                    # Lưu danh sách phẳng để phục vụ dán ngược kết quả vào Excel
                    teacher_row_record = {
                        "row_index": r,
                        "full_name": f"{fn} {ln}".strip(),
                        "first_name": fn or "Teacher",
                        "last_name": ln or "Auto",
                        "email": email,
                        "dob": cls.format_date_dob(dob_raw),
                        "class_group": raw_target_class or "Default Class",
                        "course_assign": course_assign,
                        "username": username,
                        "already_exists": account_exist == "yes" or bool(username),
                        "role": "teacher"
                    }
                    teachers_all.append(teacher_row_record)
                    if not username and account_exist != "yes":
                        teachers_to_create.append(teacher_row_record)

                    # 🎯 GỘP THEO EMAIL: Bóc tách nhiều môn trong 1 ô & gom nhóm
                    if email not in teacher_map:
                        teacher_map[email] = {
                            "teacher_name": teacher_row_record["full_name"],
                            "email": email,
                            "courses": set(),
                            "classes": set(),
                            "rows": []
                        }

                    teacher_map[email]["rows"].append(r)
                    if raw_target_class:
                        teacher_map[email]["classes"].add(raw_target_class)

                    # Chẻ nhỏ nếu trong ô có nhiều môn (ngăn cách bởi xuống dòng, dấu phẩy, chấm phẩy)
                    course_tokens = [c.strip() for c in re.split(r"[\r\n;]+", course_assign) if c.strip()]
                    for c_tok in course_tokens:
                        teacher_map[email]["courses"].add(c_tok)

                # Chuyển đổi sang danh sách teachers_allocation duy nhất (Không còn bị duplicate thẻ!)
                for email, t_data in teacher_map.items():
                    assigned_cids = set()
                    assigned_groups = set()

                    for c_str in t_data["courses"]:
                        for cid, cinfo in ordered_trays.items():
                            if (cinfo["course_name"].lower() in c_str.lower()) or \
                               (cinfo["target_grade"] and f"swrp {cinfo['target_grade']}" in c_str.lower()):
                                assigned_cids.add(cid)

                                # Nếu có lớp cụ thể
                                if t_data["classes"]:
                                    for cls_name in t_data["classes"]:
                                        if cls_name in cinfo["assigned_classes"]:
                                            assigned_groups.add(cls_name)
                                else:
                                    # Gán toàn bộ group của môn
                                    for _, c_detail in cinfo["assigned_classes"].items():
                                        assigned_groups.add(c_detail["lms_group_name"])

                    teachers_allocation.append({
                        "teacher_name": t_data["teacher_name"],
                        "email": email,
                        "course_assign": " | ".join(t_data["courses"]),
                        "assigned_courses": list(assigned_cids),
                        "assigned_lms_groups": list(assigned_groups),
                        "row_indices": t_data["rows"]
                    })

            return {
                "school_name": school_name,
                "school_address": school_address,
                "country": country,
                "courses": courses_to_order,
                "ordered_trays": ordered_trays,
                "unmatched_classes": unmatched_classes,
                "teachers_allocation": teachers_allocation,
                "students_all": students_all,
                "students_to_create": students_to_create,
                "teachers_all": teachers_all,
                "teachers_to_create": teachers_to_create
            }
        finally:
            wb.close()
            gc.collect()

    # =========================================================================
    # 📝 4. DÁN KẾT QUẢ NGƯỢC LẠI VÀO COF (CỘT L, M, N, O HIGHLIGHT CAM/ĐỎ)
    # =========================================================================
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
        """Dán kết quả tài khoản & Group LMS vào file COF gốc với định dạng màu nổi bật."""
        res_map = {}
        if os.path.exists(result_excel_path):
            wb_res = openpyxl.load_workbook(result_excel_path, data_only=True)
            try:
                ws_res = wb_res.active
                for r in range(2, ws_res.max_row + 1):
                    u = str(ws_res.cell(row=r, column=4).value or ws_res.cell(row=r, column=8).value or '').strip()
                    p = str(ws_res.cell(row=r, column=5).value or ws_res.cell(row=r, column=9).value or '').strip()
                    em = str(ws_res.cell(row=r, column=6).value or '').strip().lower()
                    if em and u:
                        res_map[em] = {"username": u, "password": p}
            finally:
                wb_res.close()

        wb_orig = openpyxl.load_workbook(original_cof_path)
        try:
            highlight_fill = PatternFill(start_color="FCE4D6", end_color="FCE4D6", fill_type="solid")
            highlight_font = Font(name="Calibri", size=11, bold=True, color="C00000")

            # 1. Điền vào Tab 2: Students
            tab2_name = next((s for s in wb_orig.sheetnames if "student" in s.lower()), None)
            if tab2_name:
                ws2 = wb_orig[tab2_name]
                for acc in students_all:
                    r = acc["row_index"]
                    em = acc["email"].lower()
                    lms_grp = acc.get("lms_group_name", "")

                    # Cột N (14): Group Name on LMS
                    if lms_grp:
                        c_grp = ws2.cell(row=r, column=14, value=lms_grp)
                        c_grp.fill, c_grp.font = highlight_fill, highlight_font

                    # Cột L (12): Username & Cột M (13): Password
                    u_data = res_map.get(em)
                    if u_data:
                        ws2.cell(row=r, column=12, value=u_data["username"]).fill = highlight_fill
                        ws2.cell(row=r, column=12).font = highlight_font
                        ws2.cell(row=r, column=13, value=u_data["password"]).fill = highlight_fill
                        ws2.cell(row=r, column=13).font = highlight_font

                        # Cột O (15): Note
                        note_text = "Already exists - Password reset to email" if acc.get("already_exists") else "Created"
                        ws2.cell(row=r, column=15, value=note_text).fill = highlight_fill
                        ws2.cell(row=r, column=15).font = highlight_font

            # 2. Điền vào Tab 3: Teachers
            tab3_name = next((s for s in wb_orig.sheetnames if "teacher" in s.lower()), None)
            if tab3_name:
                ws3 = wb_orig[tab3_name]
                for acc in teachers_all:
                    r = acc["row_index"]
                    em = acc["email"].lower()
                    grp_name = acc.get("class_group", "")

                    if grp_name:
                        c_grp = ws3.cell(row=r, column=14, value=grp_name)
                        c_grp.fill, c_grp.font = highlight_fill, highlight_font

                    u_data = res_map.get(em)
                    if u_data:
                        ws3.cell(row=r, column=12, value=u_data["username"]).fill = highlight_fill
                        ws3.cell(row=r, column=12).font = highlight_font
                        ws3.cell(row=r, column=13, value=u_data["password"]).fill = highlight_fill
                        ws3.cell(row=r, column=13).font = highlight_font

                        note_text = "Already exists - Password reset to email" if acc.get("already_exists") else "Created"
                        ws3.cell(row=r, column=15, value=note_text).fill = highlight_fill
                        ws3.cell(row=r, column=15).font = highlight_font

            os.makedirs(os.path.dirname(output_cof_path), exist_ok=True)
            wb_orig.save(output_cof_path)
            logger.info(f"✨ File COF đã dán kết quả thành công: {output_cof_path}")
            return output_cof_path
        finally:
            wb_orig.close()
            gc.collect()