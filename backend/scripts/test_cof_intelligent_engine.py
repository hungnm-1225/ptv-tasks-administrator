# backend/test_cof_intelligent_engine.py
"""
=====================================================================
🧠 CỖ MÁY PHÂN TÍCH COF THÔNG MINH (INTELLIGENT COF ENGINE)
=====================================================================
Tự động giải mã toàn bộ logic nghiệp vụ thực chiến của anh:
1. Đọc chuẩn xác Tab 1 (Cột G, Cột H, Cột I/L, Cột Q).
2. Tra cứu Course Name từ ID đối chiếu hệ thống.
3. Bóc tách Group Name, khử 100% ký tự đặc biệt theo chuẩn:
   [Tên trường sạch] + [Tên lớp sạch] + [YYYYMon]
4. Thuật toán Heuristic Grade Matcher: Tự động ghép nối Khối lớp vào Khóa học tương ứng (SWRP {N} <-> Grade {N}).
5. Tính toán sức chứa Khay khóa học (License Bucket Capacity Check): Đủ (Xanh) vs Tràn (Đỏ).
6. Phân bổ giáo viên: Gán vào group cụ thể hoặc gán vào TOÀN BỘ group của môn học.
=====================================================================
"""

import os
import sys
import re
import json
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
import openpyxl

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("COF_INTELLIGENT")

# Từ điển ánh xạ ID khóa học mẫu từ CSDL Pythaverse
COURSE_DB_MAP = {
    "679": {"name": "SWRP 7: Intelligent Robotics: Expanding Horizons with LEANBOT (EN)", "grade": 7, "cat": "SWRP"},
    "654": {"name": "SWRP 9: LEANBOT Programming Applications with IoT [V2] (EN)", "grade": 9, "cat": "SWRP"},
    "695": {"name": "SWRP 11: Exploring IoT and AI with LEANBOT Intermediate [V2] (EN)", "grade": 11, "cat": "SWRP"},
    "780": {"name": "ASP Elementary Intermediate (EN)", "grade": None, "cat": "ASP"},
    "242": {"name": "Basic C++ Programming with Leanbot", "grade": None, "cat": "Other"}
}


def clean_text(text: str) -> str:
    """Khử sạch sành sanh ký tự đặc biệt, chỉ giữ lại chữ cái, số và khoảng trắng đơn."""
    if not text:
        return ""
    # Thay thế các ký tự đặc biệt bằng khoảng trắng
    cleaned = re.sub(r"[^\w\s]", " ", str(text))
    # Gom nhiều khoảng trắng liên tiếp thành 1
    return re.sub(r"\s+", " ", cleaned).strip()


def extract_grade_number(text: str) -> Optional[int]:
    """Trích xuất con số khối lớp từ chuỗi (Gr7 -> 7, Stem11-2 -> 11, Grade 9 -> 9)."""
    if not text:
        return None
    # Tìm các mẫu như gr7, grade 7, year 7, stem 11, khối 7
    match = re.search(r"(?:gr|grade|year|khối|stem|lớp)\s*(\d+)", text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    # Fallback: tìm con số đầu tiên đứng cạnh chữ cái
    match_num = re.search(r"\b(\d{1,2})\b", text)
    if match_num:
        return int(match_num.group(1))
    return None


def generate_lms_group_name(school_name: str, grade_or_class: str, target_date: Optional[datetime] = None) -> str:
    """Sinh tên Group chuẩn mực: [School Clean] [Class Clean] [YYYYMon]."""
    clean_school = clean_text(school_name)
    clean_class = clean_text(grade_or_class) or "General"
    date_obj = target_date or datetime.now()
    month_year_suffix = date_obj.strftime("%Y%b")  # Ví dụ: 2026Sep

    full_name = f"{clean_school} {clean_class} {month_year_suffix}"
    return re.sub(r"\s+", " ", full_name).strip()


def find_cof_file() -> str:
    """Dò tìm file COF trong backend/ hoặc thư mục hiện tại."""
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        return sys.argv[1]

    search_dirs = [
        Path(__file__).resolve().parent,
        Path(__file__).resolve().parent / "data" / "cof_input",
        Path.cwd(),
        Path.cwd() / "backend"
    ]

    for d in search_dirs:
        if d.exists():
            for f in os.listdir(d):
                if f.endswith(".xlsx") and not f.startswith("~") and ("cof" in f.lower() or "maasin" in f.lower()):
                    return str(d / f)
    return ""


def run_intelligent_cof_test(file_path: str):
    logger.info("=" * 80)
    logger.info(f"🧠 KHỞI ĐỘNG CỖ MÁY PHÂN TÍCH COF THÔNG MINH CHO: {os.path.basename(file_path)}")
    logger.info("=" * 80)

    wb = openpyxl.load_workbook(file_path, data_only=True)
    try:
        # =========================================================================
        # 1. PHÂN TÍCH TAB 1: CURRICULUM ORDER FORM
        # =========================================================================
        ws1 = wb[next((s for s in wb.sheetnames if "curriculum" in s.lower() or "cof" in s.lower()), wb.sheetnames[0])]
        school_name = str(ws1.cell(row=6, column=3).value or "Pythaverse School").strip()
        school_address = str(ws1.cell(row=7, column=3).value or "").strip()

        ordered_courses: Dict[str, Dict[str, Any]] = {}

        for r in range(28, ws1.max_row + 1):
            raw_course_id = ws1.cell(row=r, column=8).value
            if not raw_course_id:
                continue

            course_id_str = str(int(float(raw_course_id))) if str(raw_course_id).replace(".", "").isdigit() else str(raw_course_id).strip()
            course_name_col_g = str(ws1.cell(row=r, column=7).value or "").strip()
            
            # Lấy thông tin từ hệ thống CSDL nếu Cột G bị trống
            db_info = COURSE_DB_MAP.get(course_id_str, {})
            course_name = course_name_col_g or db_info.get("name") or f"Course #{course_id_str}"
            category = db_info.get("cat") or "SWRP"

            start_date = str(ws1.cell(row=r, column=9).value or "").strip()
            end_date = str(ws1.cell(row=r, column=12).value or "").strip()
            qty_raw = ws1.cell(row=r, column=17).value
            
            try:
                licenses = int(float(qty_raw)) if qty_raw else 0
            except ValueError:
                licenses = 0

            # Lọc cốt tử: ít nhất 1 trong 3 thông tin phải có
            if not (start_date or end_date or licenses > 0):
                continue

            # Bóc tách số khối lớp từ tên khóa học (ví dụ: SWRP 7 -> grade 7)
            swrp_match = re.search(r"SWRP\s*(\d+)", course_name, re.IGNORECASE)
            target_grade = int(swrp_match.group(1)) if swrp_match else db_info.get("grade")

            ordered_courses[course_id_str] = {
                "course_id": course_id_str,
                "course_name": course_name,
                "category": category,
                "target_grade": target_grade,
                "licenses_quota": licenses,     # Hạn ngạch giấy phép
                "start_date": start_date,
                "end_date": end_date,
                "assigned_students_count": 0,
                "assigned_classes": {}          # Danh sách các lớp được ghép vào khay này
            }

        logger.info(f"🏫 Trường: [{school_name}]")
        logger.info(f"📚 Phát hiện {len(ordered_courses)} Khay khóa học thực đặt:")
        for cid, cinfo in ordered_courses.items():
            logger.info(f"   👉 [Khay ID {cid}] {cinfo['course_name']} | Khối mục tiêu: Grade {cinfo['target_grade']} | Hạn ngạch: {cinfo['licenses_quota']} slots")

        # =========================================================================
        # 2. PHÂN TÍCH TAB 2: HỌC SINH & GOM LỚP (STUDENT SEGREGATION)
        # =========================================================================
        ws2 = wb[next((s for s in wb.sheetnames if "student" in s.lower()), None)]
        classes_map: Dict[str, List[Dict[str, Any]]] = {}

        if ws2:
            for r in range(7, ws2.max_row + 1):
                fn = str(ws2.cell(row=r, column=3).value or "").strip()
                ln = str(ws2.cell(row=r, column=4).value or "").strip()
                em = str(ws2.cell(row=r, column=6).value or "").strip().lower()
                account_exist = str(ws2.cell(row=r, column=8).value or "").strip().lower()
                
                # Ưu tiên lấy Class Group Name (Cột 11) -> Nếu không có thì lấy Grade Name (Cột 10) -> Year/Grade (Cột 9)
                raw_class_name = (
                    str(ws2.cell(row=r, column=11).value or "").strip()
                    or str(ws2.cell(row=r, column=10).value or "").strip()
                    or str(ws2.cell(row=r, column=9).value or "").strip()
                    or "General Class"
                )

                if not fn and not em:
                    continue

                clean_group_lms = generate_lms_group_name(school_name, raw_class_name)

                student_rec = {
                    "row_index": r,
                    "name": f"{fn} {ln}".strip(),
                    "email": em,
                    "raw_class": raw_class_name,
                    "lms_group_name": clean_group_lms,
                    "already_exists": account_exist == "yes" or bool(ws2.cell(row=r, column=12).value)
                }
                classes_map.setdefault(raw_class_name, []).append(student_rec)

        # =========================================================================
        # 3. THUẬT TOÁN HEURISTIC GRADE MATCHER: XẾP LỚP VÀO KHAY KHÓA HỌC
        # =========================================================================
        unmatched_classes = []

        for class_name, students_list in classes_map.items():
            class_grade = extract_grade_number(class_name)
            matched_course_id = None

            # Tìm xem có Khay khóa học nào khớp với số khối lớp này không
            for cid, cinfo in ordered_courses.items():
                if cinfo["target_grade"] is not None and class_grade == cinfo["target_grade"]:
                    matched_course_id = cid
                    break

            if matched_course_id:
                cinfo = ordered_courses[matched_course_id]
                cinfo["assigned_students_count"] += len(students_list)
                cinfo["assigned_classes"][class_name] = {
                    "lms_group_name": generate_lms_group_name(school_name, class_name),
                    "students_count": len(students_list)
                }
            else:
                unmatched_classes.append({"class_name": class_name, "count": len(students_list), "grade_detected": class_grade})

        # =========================================================================
        # 4. PHÂN BỔ GIÁO VIÊN (ZERO-COST ALLOCATION)
        # =========================================================================
        ws3 = wb[next((s for s in wb.sheetnames if "teacher" in s.lower()), None)]
        teachers_allocation = []

        if ws3:
            for r in range(7, ws3.max_row + 1):
                t_name = str(ws3.cell(row=r, column=5).value or "").strip()
                t_email = str(ws3.cell(row=r, column=8).value or ws3.cell(row=r, column=4).value or "").strip().lower()
                raw_target_class = str(ws3.cell(row=r, column=3).value or "").strip()
                course_assign_str = str(ws3.cell(row=r, column=11).value or "").strip()

                if not t_name and not t_email:
                    continue

                assigned_groups = []
                assigned_course_ids = []

                # Nếu ghi rõ tên lớp
                if raw_target_class and raw_target_class in classes_map:
                    assigned_groups.append(generate_lms_group_name(school_name, raw_target_class))
                else:
                    # Nếu để trống tên lớp nhưng có ghi tên môn (ví dụ SWRP 7 hoặc SWRP 11)
                    for cid, cinfo in ordered_courses.items():
                        # Kiểm tra xem tên môn có nằm trong course_assign không
                        if (cinfo["course_name"].lower() in course_assign_str.lower()) or (f"swrp {cinfo['target_grade']}" in course_assign_str.lower() if cinfo['target_grade'] else False):
                            assigned_course_ids.append(cid)
                            # 🎯 QUY TẮC VÀNG: Gán giáo viên vào TẤT CẢ các Group của môn đó!
                            for c_name, c_detail in cinfo["assigned_classes"].items():
                                assigned_groups.append(c_detail["lms_group_name"])

                teachers_allocation.append({
                    "row_index": r,
                    "teacher_name": t_name,
                    "email": t_email,
                    "course_assign_raw": course_assign_str,
                    "assigned_courses": list(set(assigned_course_ids)),
                    "assigned_lms_groups": list(set(assigned_groups))
                })

        # =========================================================================
        # 📊 BÁO CÁO TRỰC QUAN BẢN THIẾT KẾ KHAY KHÓA HỌC (VISUAL BENTO TRAYS)
        # =========================================================================
        print("\n" + "=" * 85)
        print("🏆 KẾT QUẢ MÔ PHỎNG KHAY KHÓA HỌC (VISUAL LICENSE TRAYS):")
        print("=" * 85)

        for cid, cinfo in ordered_courses.items():
            quota = cinfo["licenses_quota"]
            assigned = cinfo["assigned_students_count"]
            diff = quota - assigned
            status_badge = "🟢 ĐỦ CHỖ (HEALTHY)" if diff >= 0 else f"🔴 TRÀN KHAY (OVERFLOW by {abs(diff)})"

            print(f"\n📦 [KHAY KHÓA HỌC #{cid}] : {cinfo['course_name']}")
            print(f"   • Khối lớp mục tiêu  : Khối {cinfo['target_grade']}")
            print(f"   • Hạn ngạch (Quota)   : {quota} giấy phép")
            print(f"   • Học sinh đã xếp vào : {assigned} học sinh")
            print(f"   • Tình trạng          : {status_badge} (Còn dư: {diff} slots)")
            print(f"   • Danh sách Lớp & Group LMS ghép vào:")
            for cl_name, cl_data in cinfo["assigned_classes"].items():
                print(f"       + Lớp gốc: '{cl_name:<15}' ➔ Group LMS: '{cl_data['lms_group_name']}' ({cl_data['students_count']} hs)")

        if unmatched_classes:
            print("\n⚠️ DANH SÁCH LỚP CHƯA TỰ ĐỘNG XẾP ĐƯỢC VÀO KHAY (CẦN ADMIN KÉO THẢ TAY):")
            for uc in unmatched_classes:
                print(f"   • Lớp: '{uc['class_name']}' ({uc['count']} học sinh) - Khối nhận diện: {uc['grade_detected']}")

        print("\n" + "-" * 85)
        print("👨‍🏫 PHÂN BỔ GIÁO VIÊN VÀO CÁC KHÓA & GROUP LMS (ZERO-COST ALLOCATION):")
        print("-" * 85)
        for t in teachers_allocation:
            print(f"• GV: {t['teacher_name']:<25} ({t['email']})")
            print(f"  Môn phụ trách: {t['course_assign_raw']}")
            print(f"  Được gán vào {len(t['assigned_lms_groups'])} Group LMS: {t['assigned_lms_groups']}")

        print("=" * 85 + "\n")

    finally:
        wb.close()


if __name__ == "__main__":
    target = find_cof_file()
    if not target:
        logger.error("❌ Không tìm thấy file COF nào!")
        sys.exit(1)
    run_intelligent_cof_test(target)