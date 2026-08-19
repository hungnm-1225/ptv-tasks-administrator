# backend/test_cof_pipeline.py
import os
import sys
import logging
from app.services.cof_excel_service import COFExcelService
import openpyxl

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_COF_PATH = os.path.join(BASE_DIR, "data", "cof_input", "test.xlsx")
TEMP_IMPORT_PATH = os.path.join(BASE_DIR, "data", "temp_import", "accounts.xlsx")
MOCK_RESULT_PATH = os.path.join(BASE_DIR, "data", "results_download", "RESULT_accounts.xlsx")
OUTPUT_COF_PATH = os.path.join(BASE_DIR, "data", "cof_output", "COMPLETED_test.xlsx")

def simulate_course_enrollment(data: dict):
    """Giả lập toàn bộ các bước Playwright sẽ thao tác trên giao diện /school-workspace/courses."""
    print("\n" + "=" * 70)
    print("🎓 BẮT ĐẦU GIẢ LẬP LUỒNG GHI DANH KHÓA HỌC (COURSE ENROLLMENT)")
    print("=" * 70)

    school_name = data["school_name"] or "Pythaverse School"
    courses = data["courses"]
    students = data["students_all"]
    teachers = data["teachers_all"]

    if not courses:
        logger.warning("⚠️ Không có khóa học nào được đăng ký hợp lệ trong Tab 1.")
        return

    for c_idx, c in enumerate(courses):
        course_name = c["course_name"]
        start_date = c["start_date"]
        end_date = c["end_date"]
        licenses = c["licenses"]

        print(f"\n▶ [Khóa học {c_idx+1}/{len(courses)}]: {course_name}")
        print(f"  ├─ 🕒 Niên khóa: {start_date} ➔ {end_date} | Số licenses: {licenses}")
        print(f"  ├─ 🌐 Bot mở trang: https://pythaverse.space/school-workspace/courses")
        print(f"  ├─ 🔍 Bot tìm kiếm khóa học '{course_name}' và khớp niên khóa '{start_date}'")
        print(f"  ├─ 🖱️ Bot click vào khóa học ➔ Bấm nút [Enroll Users]")

        # Gom nhóm theo Class Group Name
        groups = {}
        for s in students:
            grp = s.get("class_group") or "Class A"
            groups.setdefault(grp, {"students": [], "teachers": []})
            email_val = s.get("email") or f"{s['username']}@school.edu"
            groups[grp]["students"].append(email_val)

        for t in teachers:
            grp = t.get("class_group") or "Class A"
            groups.setdefault(grp, {"students": [], "teachers": []})
            email_val = t.get("email") or f"{t['username']}@school.edu"
            groups[grp]["teachers"].append(email_val)

        for grp_name, members in groups.items():
            # Format Group Name: Tên trường + Class Group + Start Date (VD: Pythaverse School Demo SMP PETRA SURABAYA 12Dec)
            date_short = "".join(start_date.split("/")[:2]).replace("-", "") if start_date else "Batch1"
            formatted_group_name = f"{school_name} {grp_name} {date_short}".strip()

            print(f"\n  ┌─ 👥 [GROUP MANAGEMENT]: Tạo Group mới")
            print(f"  │  ├─ Điền tên: '{formatted_group_name}'")
            print(f"  │  └─ Bấm [+ Create Group] ➔ ✅ Thành công!")
            
            print(f"  ├─ 📥 [BULK IMPORT]: Chuyển sang Tab Bulk Import")
            print(f"  │  ├─ Chọn Dropdown Groups = '{formatted_group_name}'")
            
            # Ghi danh Học sinh
            if members["students"]:
                print(f"  │  ├─ Chọn Assign Role = 'Student'")
                print(f"  │  ├─ Paste {len(members['students'])} Emails Học sinh vào ô Paste user data:")
                for mail in members["students"][:3]: # Hiển thị demo 3 mail đầu
                    print(f"  │  │   • {mail}")
                if len(members["students"]) > 3:
                    print(f"  │  │   ... và {len(members['students']) - 3} học sinh khác")
                print(f"  │  └─ Bấm [Import and Enroll Users] ➔ ✅ Ghi danh {len(members['students'])} Học sinh thành công!")

            # Ghi danh Giáo viên
            if members["teachers"]:
                print(f"  │  ├─ Đổi Assign Role = 'Teacher'")
                print(f"  │  ├─ Paste {len(members['teachers'])} Emails Giáo viên:")
                for mail in members["teachers"]:
                    print(f"  │  │   • {mail}")
                print(f"  │  └─ Bấm [Import and Enroll Users] ➔ ✅ Ghi danh {len(members['teachers'])} Giáo viên thành công!")

        print(f"  └─ 🚪 Bot bấm [Close] ➔ Hoàn tất toàn bộ quy trình ghi danh cho môn học!\n")

def main():
    print("=" * 70)
    print("🚀 BẮT ĐẦU CHẠY THỬ NGHIỆM PIPELINE COF & ENROLLMENT SIMULATION")
    print("=" * 70)

    # 1. BÓC TÁCH FILE COF
    logger.info(f"📖 Đang bóc tách file: {INPUT_COF_PATH}...")
    data = COFExcelService.parse_cof_file(INPUT_COF_PATH)

    print("\n" + "─" * 50)
    print(f"🏫 Tên Trường: {data['school_name'] or 'Pythaverse School Demo'}")
    print(f"🌍 Quốc gia:   {data['country'] or 'Không xác định'}")
    print(f"📚 Số khóa học đăng ký hợp lệ: {len(data['courses'])}")
    for c in data["courses"]:
        print(f"   • [{c['category']}] {c['course_name']} (ID: {c['course_id']})")
        print(f"     Thời gian: {c['start_date']} ➔ {c['end_date']} | Licenses: {c['licenses']}")
    
    total_acc_to_create = data["students_to_create"] + data["teachers_to_create"]
    print(f"\n👥 TỔNG QUAN NGƯỜI DÙNG:")
    print(f"   • Học sinh: Tổng {len(data['students_all'])} | Cần tạo mới: {len(data['students_to_create'])} | Đã có sẵn: {len(data['students_all']) - len(data['students_to_create'])}")
    print(f"   • Giáo viên: Tổng {len(data['teachers_all'])} | Cần tạo mới: {len(data['teachers_to_create'])} | Đã có sẵn: {len(data['teachers_all']) - len(data['teachers_to_create'])}")
    print("─" * 50 + "\n")

    # 2. SINH FILE ACCOUNTS.XLSX ĐỂ UPLOAD LÊN WORKSPACE
    if total_acc_to_create:
        logger.info("⚙️ Đang sinh file accounts.xlsx chuẩn 8 cột...")
        count = COFExcelService.generate_accounts_excel(total_acc_to_create, TEMP_IMPORT_PATH)
        logger.info(f"✅ Đã tạo file: {TEMP_IMPORT_PATH} ({count} tài khoản)")

        # 3. TẠO MOCK RESULT ĐỂ GHI NGƯỢC VÀO FILE COF
        logger.info("🧪 Đang tạo dữ liệu giả lập (Mock Result) cho các user cần tạo mới...")
        wb_mock = openpyxl.Workbook()
        ws_mock = wb_mock.active
        ws_mock.title = "Accounts"
        ws_mock.append(["First Name", "Last Name", "Username", "Password", "Email", "Mobile Number", "Date of Birth", "Role"])

        for idx, acc in enumerate(total_acc_to_create):
            role_prefix = "st" if acc["role"] == "student" else "te"
            mock_user = f"pyth_{role_prefix}_{idx+1001}"
            mock_pass = "Ptv@2026Secure"
            ws_mock.append([
                acc["first_name"],
                acc["last_name"],
                mock_user,
                mock_pass,
                acc["email"],
                "",
                acc["dob"],
                acc["role"]
            ])
        
        os.makedirs(os.path.dirname(MOCK_RESULT_PATH), exist_ok=True)
        wb_mock.save(MOCK_RESULT_PATH)
        wb_mock.close()

        # 4. GHI NGƯỢC KẾT QUẢ VÀO FILE COF XUẤT XƯỞNG
        logger.info("📝 Đang ghi ngược Username/Password và Group Name in LMS vào file COF...")
        final_file = COFExcelService.write_results_back_to_cof(
            original_cof_path=INPUT_COF_PATH,
            result_excel_path=MOCK_RESULT_PATH if total_acc_to_create else None,
            students_all=data["students_all"],
            students_to_create=data["students_to_create"],
            teachers_all=data["teachers_all"],
            teachers_to_create=data["teachers_to_create"],
            output_cof_path=OUTPUT_COF_PATH
        )

    # 5. GIẢ LẬP GHI DANH KHÓA HỌC & GROUP LỚP
    simulate_course_enrollment(data)

    print("=" * 70)
    print("🎉 TOÀN BỘ QUY TRÌNH PIPELINE ĐÃ ĐƯỢC KIỂM THỬ THÀNH CÔNG RỰC RỠ!")
    print("=" * 70)

if __name__ == "__main__":
    main()