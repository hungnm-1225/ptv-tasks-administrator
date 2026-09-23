# backend/app/services/excel/generic_excel_service.py

"""
Generic & Universal Polymorphic Data Extractor Service
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Kiến trúc 2 Tầng (Universal Primitives + Intent Adapters): Phục vụ đa mục đích
  (Tạo tài khoản, Gán Git Repo, Ghi danh LMS, Reset Password, Tra cứu Keycloak).
- Bóc tách phi cấu trúc từ File Excel (Path, Bytes, BytesIO) và Text trần Email.
- Khai thác siêu tốc trong RAM (Zero Disk I/O, giải phóng bộ nhớ cho Render 512MB RAM).
- Bảo toàn 100% tương thích ngược với các dịch vụ cũ.
"""

import io
import os
import re
import gc
import logging
import unicodedata
from datetime import datetime, date
from typing import Dict, Any, List, Optional, Union, Tuple, Set
import openpyxl
from openpyxl.utils.datetime import from_excel

logger = logging.getLogger(__name__)


class GenericExcelService:
    """Service bóc tách dữ liệu thông minh đa mục đích (Universal Data Extractor)."""

    # Danh mục từ khóa nhận diện cột thông minh (Fuzzy Aliases)
    COLUMN_ALIASES = {
        "name": [
            "ho va ten", "ho ten", "full name", "fullname", "ten", "name",
            "nguoi dung", "ho va ten dem va ten", "danh sach", "thanh vien"
        ],
        "email": [
            "email", "mail", "hop thu", "thu dien tu", "e-mail", "email ca nhan"
        ],
        "username": [
            "username", "user name", "ten dang nhap", "tai khoan", "account", "login", "user_id"
        ],
        "dob": [
            "ngay sinh", "dob", "birth", "birthday", "nam sinh", "ngaysinh", "ngay thang nam sinh"
        ],
        "role": [
            "vai tro", "role", "chuc vu", "doi tuong", "loai tai khoan", "phan loai", "vi tri", "git role"
        ],
        "class_name": [
            "lop", "class", "grade", "khoi", "nhom", "ten lop"
        ],
        "school": [
            "truong", "school", "don vi", "co so", "to chuc"
        ],
        "course": [
            "khoa hoc", "mon hoc", "course", "subject", "chuong trinh", "ma mon"
        ],
        "repo": [
            "repo", "repository", "git", "link repo", "du an", "project url"
        ]
    }

    # Regex patterns nhận diện thực thể
    RE_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
    RE_GIT_URL = re.compile(r"https?://(?:git\.[^\s\"'<>]+|github\.com/[^\s\"'<>]+|[^\s\"'<>]*(?:/settings/collaborators|/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+))")
    RE_COURSE_CODE = re.compile(r"\b(?:SWRP|IR|ASP|PYTH|ROBOT|STEM|AI)[_\s-]*\d+\b", re.IGNORECASE)
    RE_CLASS_CODE = re.compile(r"\b(?:Lớp|Class|Grade|Khối)?\s*([1-9]|1[0-2])[A-Za-z0-9_-]*\b", re.IGNORECASE)

    # =========================================================================
    # 1. TIỆN ÍCH CHUẨN HÓA CƠ SỞ (BASE NORMALIZERS)
    # =========================================================================

    @classmethod
    def strip_accents(cls, text: str) -> str:
        """Khử dấu tiếng Việt và chuẩn hóa về chữ thường để so khớp chuỗi an toàn."""
        if not text:
            return ""
        text = unicodedata.normalize("NFD", str(text))
        text = re.sub(r"[\u0300-\u036f]", "", text)
        return text.lower().strip()

    @classmethod
    def split_vietnamese_name(cls, full_name: str, role: str = "student") -> Tuple[str, str]:
        """
        Tách Họ & Tên theo chuẩn thực chiến:
        - Tên nhiều từ: Last Name = Tên chính (từ cuối), First Name = Họ và tên đệm.
        - Tên đúng 1 từ: First Name = 'Teacher' hoặc 'Student', Last Name = Tên đó.
        """
        clean_name = re.sub(r"\s+", " ", str(full_name or "").strip())
        words = clean_name.split()

        if not words:
            prefix = "Teacher" if role == "teacher" else "Student"
            return (prefix, "User")

        if len(words) == 1:
            prefix = "Teacher" if role == "teacher" else "Student"
            return (prefix, words[0].title())

        last_name = words[-1].title()
        first_name = " ".join(words[:-1]).title()
        return (first_name, last_name)

    @classmethod
    def normalize_dob(cls, raw_val: Any, role: str = "student") -> str:
        """
        Chuẩn hóa ngày sinh sang DD/MM/YYYY:
        - Bỏ trống: Học sinh -> 01/01/2016, Giáo viên -> 01/01/1990.
        - Hỗ trợ Excel serial date, datetime object và các định dạng chuỗi.
        """
        default_dob = "01/01/1990" if role == "teacher" else "01/01/2016"

        if raw_val is None or str(raw_val).strip() == "":
            return default_dob

        if isinstance(raw_val, (datetime, date)):
            return raw_val.strftime("%d/%m/%Y")

        if isinstance(raw_val, (int, float)):
            try:
                dt = from_excel(raw_val)
                return dt.strftime("%d/%m/%Y")
            except Exception:
                return default_dob

        val_str = str(raw_val).strip()
        dmy_match = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$", val_str)
        if dmy_match:
            d, m, y = dmy_match.groups()
            return f"{int(d):02d}/{int(m):02d}/{y}"

        ymd_match = re.match(r"^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$", val_str)
        if ymd_match:
            y, m, d = ymd_match.groups()
            return f"{int(d):02d}/{int(m):02d}/{y}"

        year_match = re.match(r"^(\d{4})$", val_str)
        if year_match:
            return f"01/01/{year_match.group(1)}"

        return default_dob

    @classmethod
    def detect_role(cls, raw_role: Any, email: Optional[str] = None, context: str = "") -> str:
        """Nhận diện vai trò LMS / Workspace (teacher hoặc student)."""
        combined = cls.strip_accents(f"{raw_role or ''} {context}")
        if any(k in combined for k in ["teach", "giao vien", "gv", "thay", "co ", "giang vien"]):
            return "teacher"
        if any(k in combined for k in ["student", "hoc sinh", "hs", "em ", "tre em", "lop"]):
            return "student"
        if email and "@" in email and not any(k in combined for k in ["hs", "lop"]):
            return "teacher"
        return "student"

    @classmethod
    def detect_git_role(cls, raw_role: Any) -> str:
        """Nhận diện vai trò GitBucket: ADMIN, DEVELOPER, hoặc GUEST."""
        text = str(raw_role or "").strip().upper()
        if "ADMIN" in text:
            return "ADMIN"
        if any(k in text for k in ["DEV", "DEVELOPER", "WRITE", "TEACHER", "GV"]):
            return "DEVELOPER"
        return "GUEST"

    # =========================================================================
    # 2. TẦNG 1: BÓC TÁCH THỰC THỂ PHỔ QUÁT (UNIVERSAL DATA EXTRACTOR)
    # =========================================================================

    @classmethod
    def extract_universal_data(
        cls, 
        file_source: Union[str, bytes, io.BytesIO], 
        default_school: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Trích xuất toàn bộ thực thể có trong bảng tính, không định kiến mục đích sử dụng.
        Đáp ứng mọi phân hệ: Workspace, LMS, Git, Keycloak, Reset Password.
        """
        wb = None
        try:
            # 1. Khởi tạo workbook tối ưu RAM
            if isinstance(file_source, bytes):
                wb = openpyxl.load_workbook(io.BytesIO(file_source), data_only=True)
            elif isinstance(file_source, io.BytesIO):
                wb = openpyxl.load_workbook(file_source, data_only=True)
            elif isinstance(file_source, str):
                if not os.path.exists(file_source):
                    raise FileNotFoundError(f"Không tìm thấy file: {file_source}")
                wb = openpyxl.load_workbook(file_source, data_only=True)
            else:
                raise ValueError("Nguồn file không hợp lệ (hỗ trợ path, bytes hoặc BytesIO)")

            ws = wb.active
            if not ws:
                return cls._empty_universal_result()

            # Quét tối đa 5000 dòng để chống tràn bộ nhớ 512MB RAM
            raw_matrix: List[List[Any]] = []
            for row in ws.iter_rows(values_only=True):
                if any(cell is not None and str(cell).strip() != "" for cell in row):
                    raw_matrix.append(list(row))
                if len(raw_matrix) >= 5000:
                    break

            if not raw_matrix:
                return cls._empty_universal_result()

            # 2. Quét tìm Hyperlinks (Đặc biệt là link Git Repositories)
            extracted_links: List[str] = []
            try:
                for row in ws.iter_rows():
                    for cell in row:
                        if cell.hyperlink and cell.hyperlink.target:
                            target = str(cell.hyperlink.target).strip()
                            if cls.RE_GIT_URL.search(target):
                                extracted_links.append(target)
            except Exception as e:
                logger.warning(f"Lỗi khi quét hyperlinks: {e}")

            # 3. Dò tìm dòng Header
            header_row_idx = -1
            col_map: Dict[str, int] = {}
            for idx, row in enumerate(raw_matrix[:15]):
                norm_row = [cls.strip_accents(str(c or "")) for c in row]
                temp_map = {}
                for col_idx, cell_text in enumerate(norm_row):
                    for field, aliases in cls.COLUMN_ALIASES.items():
                        if field not in temp_map and any(alias in cell_text for alias in aliases):
                            temp_map[field] = col_idx

                if any(k in temp_map for k in ["name", "email", "username"]):
                    header_row_idx = idx
                    col_map = temp_map
                    break

            data_start_idx = header_row_idx + 1 if header_row_idx != -1 else 0

            # 4. Gom nhặt thực thể toàn diện (Universal Primitives Collection)
            identifiers_set: Set[str] = set()
            emails_set: Set[str] = set()
            usernames_set: Set[str] = set()
            courses_set: Set[str] = set()
            classes_set: Set[str] = set()
            repos_set: Set[str] = set(extracted_links)
            suggested_roles: Set[str] = set()
            school_detected = default_school

            structured_records: List[Dict[str, Any]] = []
            account_profiles: List[Dict[str, Any]] = []
            invalid_profiles: List[Dict[str, Any]] = []

            for row_idx, row in enumerate(raw_matrix[data_start_idx:], start=data_start_idx + 1):
                def get_val(f: str) -> Any:
                    return row[col_map[f]] if f in col_map and col_map[f] < len(row) else None

                raw_name = str(get_val("name") or "").strip()
                raw_email = str(get_val("email") or "").strip().lower()
                raw_username = str(get_val("username") or "").strip()
                raw_dob = get_val("dob")
                raw_role = get_val("role")
                raw_class = str(get_val("class_name") or "").strip()
                raw_school = str(get_val("school") or "").strip()
                raw_course = str(get_val("course") or "").strip()
                raw_repo = str(get_val("repo") or "").strip()

                # Quét mọi ô trong dòng để nhặt link/email/môn nếu không có cột cố định
                for cell in row:
                    val_str = str(cell or "").strip()
                    if not val_str:
                        continue
                    # Bắt email
                    for m in cls.RE_EMAIL.findall(val_str):
                        emails_set.add(m.lower())
                        identifiers_set.add(m.lower())
                    # Bắt Git repo
                    if cls.RE_GIT_URL.search(val_str):
                        repos_set.add(val_str)
                    # Bắt mã môn
                    course_match = cls.RE_COURSE_CODE.search(val_str)
                    if course_match:
                        courses_set.add(course_match.group(0).upper())

                if raw_school and not school_detected:
                    school_detected = raw_school
                if raw_course:
                    courses_set.add(raw_course.upper())
                if raw_repo:
                    repos_set.add(raw_repo)
                if raw_class:
                    classes_set.add(raw_class.upper())

                # Xác định định danh (Identifier: Username hoặc Email)
                clean_email = raw_email if cls.RE_EMAIL.match(raw_email) else None
                clean_user = raw_username if raw_username else None
                if not clean_user and clean_email:
                    clean_user = clean_email.split("@")[0]
                elif not clean_user and raw_name and "@" not in raw_name and not get_val("name"):
                    # Trường hợp bảng chỉ có 1 cột danh sách username
                    clean_user = raw_name

                if clean_email:
                    emails_set.add(clean_email)
                    identifiers_set.add(clean_email)
                if clean_user:
                    usernames_set.add(clean_user)
                    identifiers_set.add(clean_user)

                # Xác định Role
                role = cls.detect_role(raw_role, clean_email, f"{raw_name} {raw_class}")
                suggested_roles.add(role)

                record = {
                    "row": row_idx,
                    "name": raw_name or clean_user or "Unknown",
                    "email": clean_email,
                    "username": clean_user,
                    "dob": raw_dob,
                    "role": role,
                    "class_name": raw_class or None,
                    "school": raw_school or school_detected,
                    "raw_data": row
                }
                structured_records.append(record)

                # =============================================================
                # TẦNG 2A: ADAPTER TẠO TÀI KHOẢN (ACCOUNT CREATION PROFILES)
                # =============================================================
                if raw_name or clean_user or clean_email:
                    effective_name = raw_name or clean_user or clean_email.split("@")[0]
                    first_name, last_name = cls.split_vietnamese_name(effective_name, role=role)
                    dob_clean = cls.normalize_dob(raw_dob, role=role)

                    if role == "teacher" and not clean_email:
                        invalid_profiles.append({
                            "row": row_idx,
                            "raw_name": effective_name,
                            "role": role,
                            "reason": "Thiếu email giáo viên bắt buộc",
                            "first_name": first_name,
                            "last_name": last_name,
                            "dob": dob_clean
                        })
                    else:
                        account_profiles.append({
                            "row": row_idx,
                            "first_name": first_name,
                            "last_name": last_name,
                            "full_name": f"{first_name} {last_name}".strip(),
                            "email": clean_email,
                            "dob": dob_clean,
                            "role": role,
                            "class_name": raw_class or None,
                            "school": raw_school or school_detected
                        })

            return {
                # TẦNG 1: DỮ LIỆU ĐA NĂNG DÙNG NGAY CHO MỌI CAPABILITY
                "identifiers": sorted(list(identifiers_set)),
                "emails": sorted(list(emails_set)),
                "usernames": sorted(list(usernames_set)),
                "repo_urls": sorted(list(repos_set)),
                "courses_detected": sorted(list(courses_set)),
                "classes_detected": sorted(list(classes_set)),
                "suggested_roles": sorted(list(suggested_roles)),
                "school_detected": school_detected,
                
                # TẦNG 2A: DÀNH RIÊNG CHO WORKSPACE TẠO TÀI KHOẢN HÀNG LOẠT
                "account_profiles": account_profiles,
                "invalid_profiles": invalid_profiles,

                # DỮ LIỆU CẤU TRÚC CHI TIẾT
                "records": structured_records,
                "summary": {
                    "total_identifiers": len(identifiers_set),
                    "total_emails": len(emails_set),
                    "total_usernames": len(usernames_set),
                    "total_account_profiles": len(account_profiles),
                    "total_invalid_profiles": len(invalid_profiles),
                    "sheet_names": wb.sheetnames
                }
            }
        finally:
            if wb:
                wb.close()
                del wb
            gc.collect()

    @classmethod
    def _empty_universal_result(cls) -> Dict[str, Any]:
        """Trả về cấu trúc rỗng chuẩn mực khi không có dữ liệu."""
        return {
            "identifiers": [],
            "emails": [],
            "usernames": [],
            "repo_urls": [],
            "courses_detected": [],
            "classes_detected": [],
            "suggested_roles": [],
            "school_detected": None,
            "account_profiles": [],
            "invalid_profiles": [],
            "records": [],
            "summary": {"total_identifiers": 0, "total_account_profiles": 0}
        }

    # =========================================================================
    # 3. BÓC TÁCH NGUYÊN LIỆU TỪ TEXT EMAIL (NATURAL LANGUAGE ADAPTER)
    # =========================================================================

    @classmethod
    def parse_universal_text(cls, raw_text: str, default_school: Optional[str] = None) -> Dict[str, Any]:
        """
        Bóc tách toàn diện nguyên liệu từ nội dung văn bản email/ticket:
        Ví dụ: "Add các bạn namnv, hoangvt vào repo https://git.../swrp11_hs role GUEST"
               "Reset pass cho user lannt, mail: lannt@dtt.vn"
        """
        if not raw_text:
            return cls._empty_universal_result()

        emails_set = set(cls.RE_EMAIL.findall(raw_text))
        repos_set = set(cls.RE_GIT_URL.findall(raw_text))
        courses_set = set(c.upper() for c in cls.RE_COURSE_CODE.findall(raw_text))
        classes_set = set(c.upper() for c in cls.RE_CLASS_CODE.findall(raw_text))
        
        identifiers_set = set(emails_set)
        suggested_roles = set()

        # Nhận diện Git Role
        if "ADMIN" in raw_text.upper():
            suggested_roles.add("ADMIN")
        if any(k in raw_text.upper() for k in ["DEV", "DEVELOPER"]):
            suggested_roles.add("DEVELOPER")
        if "GUEST" in raw_text.upper():
            suggested_roles.add("GUEST")

        # Tách dòng tìm username hoặc tên
        account_profiles = []
        for line in raw_text.split("\n"):
            line_clean = line.strip()
            if not line_clean:
                continue

            role = cls.detect_role("", context=line_clean)
            suggested_roles.add(role)

            # Tìm tên người dùng
            name_match = re.search(
                r"(?:cho|acc|user|ten|thay|co|ong|ba|em|hoc sinh|giao vien)[:\s]+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)*)",
                line_clean
            )
            line_emails = cls.RE_EMAIL.findall(line_clean)
            target_email = line_emails[0].lower() if line_emails else None

            if name_match or target_email:
                name = name_match.group(1).strip() if name_match else target_email.split("@")[0].title()
                first_name, last_name = cls.split_vietnamese_name(name, role=role)
                account_profiles.append({
                    "first_name": first_name,
                    "last_name": last_name,
                    "full_name": f"{first_name} {last_name}".strip(),
                    "email": target_email,
                    "dob": cls.normalize_dob("", role=role),
                    "role": role,
                    "class_name": list(classes_set)[0] if classes_set else None,
                    "school": default_school
                })
                if target_email:
                    identifiers_set.add(target_email)
                else:
                    identifiers_set.add(name.lower().replace(" ", ""))

        return {
            "identifiers": sorted(list(identifiers_set)),
            "emails": sorted(list(emails_set)),
            "usernames": sorted(list(set(e.split("@")[0] for e in emails_set).union(identifiers_set - emails_set))),
            "repo_urls": sorted(list(repos_set)),
            "courses_detected": sorted(list(courses_set)),
            "classes_detected": sorted(list(classes_set)),
            "suggested_roles": sorted(list(suggested_roles)),
            "school_detected": default_school,
            "account_profiles": account_profiles,
            "invalid_profiles": [],
            "records": [],
            "summary": {
                "total_identifiers": len(identifiers_set),
                "total_emails": len(emails_set),
                "total_account_profiles": len(account_profiles)
            }
        }

    # =========================================================================
    # 4. TƯƠNG THÍCH NGƯỢC (BACKWARD COMPATIBILITY)
    # =========================================================================

    @classmethod
    def parse_generic_excel(cls, file_source: Union[str, bytes, io.BytesIO]) -> Dict[str, Any]:
        """Bóc tách ma trận tổng quát (Hỗ trợ code cũ)."""
        wb = None
        try:
            if isinstance(file_source, bytes):
                wb = openpyxl.load_workbook(io.BytesIO(file_source), data_only=True)
            elif isinstance(file_source, io.BytesIO):
                wb = openpyxl.load_workbook(file_source, data_only=True)
            else:
                wb = openpyxl.load_workbook(file_source, data_only=True)

            ws = wb.active
            rows = []
            if ws:
                for r in ws.iter_rows(values_only=True):
                    if any(r):
                        rows.append(list(r))
            return {"sheets": wb.sheetnames, "rows_count": len(rows), "data": rows}
        finally:
            if wb:
                wb.close()
                del wb
            gc.collect()

    @classmethod
    def extract_links_and_emails(cls, file_source: Union[str, bytes, io.BytesIO]) -> Dict[str, List[str]]:
        """Trích xuất hyperlinks và emails (Hỗ trợ code cũ)."""
        res = cls.extract_universal_data(file_source)
        return {
            "emails": res["emails"],
            "links": res["repo_urls"]
        }