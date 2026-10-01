# backend/app/services/excel/excel_digest_service.py
"""
Executive Excel Digest Service (Multi-File Aggregator with Visual Icons)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Chuyển đổi dữ liệu bóc tách từ các phôi Excel (COF, TOF, BULK_ACCOUNTS, GENERIC)
  thành Bản Lược Kê Quản Trị Nghiệp Vụ (Executive Digest) mạch lạc, sinh động với icon trực quan.
- Hỗ trợ GỘP TOÀN BỘ ĐA TỆP ĐÍNH KÈM (quét sạch tất cả file người dùng gửi, không bỏ sót).
- Làm ngọn hải đăng chỉ dẫn cho AI Summarizer và AI Planner (Workflow DAG).
"""

from typing import Dict, Any, List, Optional
import re
import logging

logger = logging.getLogger(__name__)


def build_single_excel_digest(parsed_file: Dict[str, Any], index: Optional[int] = None) -> str:
    """Tạo bản tóm tắt nghiệp vụ cho một tệp Excel đơn lẻ với icon trực quan."""
    if not parsed_file or not isinstance(parsed_file, dict):
        return "(Không có dữ liệu tệp hợp lệ)"

    fname = parsed_file.get("filename") or "Tệp Excel đính kèm"
    excel_type = parsed_file.get("excel_type") or ("COF" if parsed_file.get("is_cof") else ("TOF" if parsed_file.get("is_tof") else ("BULK_ACCOUNTS" if parsed_file.get("is_bulk_accounts") else "GENERIC")))
    lifecycle = parsed_file.get("lifecycle_status", "new_pending")
    status_tag = " [ĐÃ HOÀN TẤT TRƯỚC ĐÓ - BỎ QUA]" if lifecycle == "processed" else " [TỆP MỚI CẦN XỬ LÝ]"

    file_prefix = f"📁 Tệp #{index}: " if index is not None else "📁 Tệp: "
    type_icon = "📊" if excel_type == "COF" else ("📋" if excel_type == "TOF" else ("👥" if excel_type == "BULK_ACCOUNTS" else "📑"))

    lines: List[str] = [
        f"{file_prefix}{fname}{status_tag}",
        f"   {type_icon} Định dạng phôi: {excel_type}"
    ]

    # =========================================================================
    # 1. PHÔI COF (CURRICULUM ORDER FORM)
    # =========================================================================
    if excel_type == "COF" or parsed_file.get("is_cof"):
        school_name = parsed_file.get("school_name") or "(Chưa rõ tên trường)"
        lines.append(f"   🏫 Trường học: {school_name}")

        courses = parsed_file.get("courses") or []
        if courses:
            lines.append(f"   📚 Khóa học & Bản quyền (License) yêu cầu ({len(courses)} môn):")
            total_licenses = 0
            for c in courses:
                c_name = c.get("course_name") or f"Khóa #{c.get('course_id')}"
                lic = c.get("licenses") or c.get("licenses_quota") or 0
                total_licenses += lic
                dates_info = ""
                if c.get("start_date") or c.get("end_date"):
                    s_date = c.get("start_date") or "N/A"
                    e_date = c.get("end_date") or "N/A"
                    dates_info = f" (Thời hạn: {s_date} ➔ {e_date})"
                lines.append(f"      • {c_name}: 🔑 {lic} licenses{dates_info}")
            lines.append(f"   🏷️ Tổng số bản quyền License toàn trường: {total_licenses} licenses")
        else:
            lines.append("   📚 Khóa học: Chưa phát hiện môn học nào được đăng ký số lượng bản quyền.")

        total_students = parsed_file.get("total_students", 0)
        total_teachers = parsed_file.get("total_teachers", 0)
        lines.append(f"   👥 Nhân sự trường: 🎓 {total_students} học sinh, 👨‍🏫 {total_teachers} giáo viên")

        # Thông tin phân bổ giáo viên nếu có
        teachers_alloc = parsed_file.get("teachers_allocation") or []
        if teachers_alloc:
            alloc_samples = []
            for t in teachers_alloc[:5]:
                t_name = t.get("teacher_name") or t.get("email")
                c_assign = t.get("course_assign") or "Chưa rõ môn"
                alloc_samples.append(f"{t_name} ➔ {c_assign}")
            lines.append(f"   👨‍🏫 Phân bổ GV mẫu: {'; '.join(alloc_samples)}")

    # =========================================================================
    # 2. PHÔI TOF (TRAINING ORDER FORM)
    # =========================================================================
    elif excel_type == "TOF" or parsed_file.get("is_tof"):
        school_name = parsed_file.get("school_name") or "(Chưa rõ tên trường)"
        lines.append(f"   🏫 Trường học: {school_name}")
        detected_c = parsed_file.get("courses_detected") or []
        if detected_c:
            lines.append(f"   📚 Các khóa đào tạo yêu cầu: {', '.join(str(c) for c in detected_c)}")
        else:
            lines.append("   📚 Khóa học đào tạo: Không phát hiện rõ khóa học trong biểu mẫu TOF.")

    # =========================================================================
    # 3. PHÔI BULK_ACCOUNTS (ACCOUNT CREATION REQUEST FORM)
    # =========================================================================
    elif excel_type == "BULK_ACCOUNTS" or parsed_file.get("is_bulk_accounts"):
        total_users = parsed_file.get("total_users", 0)
        account_profiles = parsed_file.get("account_profiles") or []

        teacher_count = 0
        student_count = 0
        sample_teachers = []
        sample_students = []

        for u in account_profiles:
            if not isinstance(u, dict):
                continue
            role = str(u.get("role") or "").lower()
            em = u.get("email") or ""
            fn = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
            display = f"{fn} <{em}>" if fn and em else (em or fn)
            if "teacher" in role or "giáo viên" in role or "gv" in role:
                teacher_count += 1
                if len(sample_teachers) < 3 and display:
                    sample_teachers.append(display)
            else:
                student_count += 1
                if len(sample_students) < 3 and display:
                    sample_students.append(display)

        lines.append(f"   👥 Tổng số tài khoản cần cấp: {total_users} tài khoản")
        lines.append(f"      • 👨‍🏫 Giáo viên: ~{teacher_count} tài khoản" + (f" (Mẫu: {', '.join(sample_teachers)})" if sample_teachers else ""))
        lines.append(f"      • 🎓 Học sinh: ~{student_count} tài khoản" + (f" (Mẫu: {', '.join(sample_students)})" if sample_students else ""))

    # =========================================================================
    # 4. PHÔI GENERIC
    # =========================================================================
    else:
        school = parsed_file.get("school_detected")
        if school:
            lines.append(f"   🏫 Trường học phát hiện: {school}")

        identifiers = parsed_file.get("identifiers") or []
        if identifiers:
            lines.append(f"   📧 Danh sách định danh/email tìm thấy: {len(identifiers)} tài khoản")
            sample_ids = identifiers[:5]
            lines.append(f"      Mẫu: {', '.join(str(i) for i in sample_ids)}")

        courses = parsed_file.get("courses_detected") or []
        if courses:
            lines.append(f"   📚 Khóa học phát hiện: {', '.join(str(c) for c in courses)}")

        repos = parsed_file.get("repo_urls") or []
        if repos:
            lines.append(f"   🐙 Link Git repositories: {', '.join(str(r) for r in repos)}")

    return "\n".join(lines)


def build_executive_excel_digest(parsed_file_or_files: Any) -> str:
    """
    Xây dựng Bản Lược Kê Quản Trị từ 1 tệp hoặc TOÀN BỘ danh sách các tệp Excel người dùng gửi.
    Hỗ trợ hiển thị đầy đủ từng file với icon trực quan.
    """
    if not parsed_file_or_files:
        return "(Không có thông tin tệp Excel đính kèm)"

    if isinstance(parsed_file_or_files, list):
        if len(parsed_file_or_files) == 1:
            return build_single_excel_digest(parsed_file_or_files[0])
        
        # Nhiều file: Đánh số thứ tự từng file rõ ràng
        digests = []
        for idx, f in enumerate(parsed_file_or_files, 1):
            digests.append(build_single_excel_digest(f, index=idx))
        return "\n\n".join(digests)

    elif isinstance(parsed_file_or_files, dict):
        all_files = parsed_file_or_files.get("all_parsed_files")
        if all_files and isinstance(all_files, list) and len(all_files) > 1:
            digests = [build_single_excel_digest(f, index=idx) for idx, f in enumerate(all_files, 1)]
            return "\n\n".join(digests)
        return build_single_excel_digest(parsed_file_or_files)

    return str(parsed_file_or_files)


def merge_all_excel_data(parsed_files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Hợp nhất toàn bộ dữ liệu từ TẤT CẢ các tệp Excel thành 1 cấu trúc duy nhất:
    - Gộp tất cả học sinh, giáo viên, danh sách email identifiers.
    - Gộp tất cả các khóa học và cộng dồn số lượng licenses.
    - Xác định tên trường học chính xác (ưu tiên COF -> TOF -> Bulk -> Generic).
    """
    if not parsed_files:
        return {}

    merged_school = None
    all_courses: List[Dict[str, Any]] = []
    seen_course_ids = set()
    all_identifiers: List[str] = []
    seen_identifiers = set()
    all_users: List[Dict[str, Any]] = []
    seen_user_emails = set()
    all_repos: List[str] = []
    seen_repos = set()
    total_students = 0
    total_teachers = 0

    for f in parsed_files:
        # Trường học
        s_name = f.get("school_name") or f.get("school_detected")
        if s_name and not merged_school:
            merged_school = s_name

        # Khóa học từ COF
        for c in f.get("courses") or []:
            if isinstance(c, dict):
                cid = c.get("course_id") or c.get("course_name")
                if cid not in seen_course_ids:
                    seen_course_ids.add(cid)
                    all_courses.append(c)

        # Khóa học phát hiện từ TOF/Generic
        for c_str in f.get("courses_detected") or []:
            if c_str and c_str not in seen_course_ids:
                seen_course_ids.add(c_str)
                all_courses.append({"course_name": str(c_str), "licenses": 0})

        # Identifiers
        for ident in f.get("identifiers") or []:
            ident_clean = str(ident).strip().lower()
            if ident_clean and ident_clean not in seen_identifiers:
                seen_identifiers.add(ident_clean)
                all_identifiers.append(str(ident).strip())

        # Account profiles từ Bulk Accounts
        for u in f.get("account_profiles") or []:
            if isinstance(u, dict):
                em = str(u.get("email") or "").strip().lower()
                if em and em not in seen_user_emails:
                    seen_user_emails.add(em)
                    all_users.append(u)
                    if em not in seen_identifiers:
                        seen_identifiers.add(em)
                        all_identifiers.append(em)

        # Repos
        for r in f.get("repo_urls") or []:
            if r and r not in seen_repos:
                seen_repos.add(r)
                all_repos.append(r)

        total_students += int(f.get("total_students") or 0)
        total_teachers += int(f.get("total_teachers") or 0)

    # Chọn file đại diện hoặc tạo cấu trúc tổng hợp
    primary_file = parsed_files[0] if parsed_files else {}
    
    return {
        **primary_file,
        "school_name": merged_school or primary_file.get("school_name"),
        "courses": all_courses if all_courses else primary_file.get("courses", []),
        "identifiers": all_identifiers if all_identifiers else primary_file.get("identifiers", []),
        "account_profiles": all_users[:15] if all_users else primary_file.get("account_profiles", []),
        "repo_urls": all_repos if all_repos else primary_file.get("repo_urls", []),
        "total_students": total_students if total_students > 0 else primary_file.get("total_students", 0),
        "total_teachers": total_teachers if total_teachers > 0 else primary_file.get("total_teachers", 0),
        "total_excel_files": len(parsed_files),
        "all_parsed_files": parsed_files
    }
