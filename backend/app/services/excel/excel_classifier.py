# backend/app/services/excel/excel_classifier.py
"""
Pythaverse Excel Template Classifier Engine (V4.2 Low-RAM Edition)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Quét các ô Merge trong 1-5 hàng đầu, cột A-Z của Sheet đầu tiên.
- Nhận diện 4 loại phôi: COF, TOF, BULK_ACCOUNTS, GENERIC.
- Sử dụng openpyxl read_only=True siêu nhẹ, bảo vệ trần 512MB RAM Render.
"""

import re
import logging
import openpyxl
from typing import Tuple, Dict, Any, Optional

logger = logging.getLogger(__name__)


def detect_excel_file_type(file_path: str) -> Tuple[str, Dict[str, Any]]:
    """
    Quét nội dung Sheet đầu tiên (Hàng 1-5, Cột A-Z) để xác định phôi biểu mẫu:
    Trả về Tuple: (file_type, metadata_preview)
    - "COF": Pythaverse Curriculum Order Form
    - "TOF": Pythaverse Training Order Form
    - "BULK_ACCOUNTS": Account Creation Request Form
    - "GENERIC": File Excel tự do
    """
    wb = None
    try:
        # read_only=True giúp đọc file hàng trăm MB chỉ với vài MB RAM
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        sheet_names = wb.sheetnames
        if not sheet_names:
            return "GENERIC", {"reason": "empty_workbook"}

        first_sheet = wb[sheet_names[0]]
        
        # Gom toàn bộ chữ từ Hàng 1-5, Cột 1-26 (A-Z)
        header_text_parts = []
        row_limit = 5
        col_limit = 26

        for r_idx, row in enumerate(first_sheet.iter_rows(min_row=1, max_row=row_limit, min_col=1, max_col=col_limit, values_only=True)):
            for cell_val in row:
                if cell_val is not None:
                    txt = str(cell_val).strip()
                    if txt:
                        header_text_parts.append(txt)

        combined_text = " ".join(header_text_parts)
        # Chuẩn hóa khoảng trắng và chuyển chữ hoa để so khớp bất biến
        normalized_header = re.sub(r"\s+", " ", combined_text).upper()
        sheet_names_upper = [s.upper() for s in sheet_names]

        logger.info(f"🔎 [Excel Classifier] Quét 5 hàng đầu Sheet '{sheet_names[0]}': {normalized_header[:120]}...")

        # 1. NHẬN DIỆN PHÔI COF (CURRICULUM ORDER FORM)
        if (
            "CURRICULUM ORDER FORM" in normalized_header
            or "(COF)" in normalized_header
            or "PYTHAVERSE CURRICULUM ORDER FORM" in normalized_header
            or any("ORDER FORM" in s and "STUDENT" in str(sheet_names_upper) for s in sheet_names_upper)
        ):
            logger.info("🎯 [Excel Classifier] Xác định: Phôi COF (Curriculum Order Form)")
            return "COF", {"matched_header": "COF", "sheet_count": len(sheet_names)}

        # 2. NHẬN DIỆN PHÔI TOF (TRAINING ORDER FORM)
        if (
            "TRAINING ORDER FORM" in normalized_header
            or "(TOF)" in normalized_header
            or "PYTHAVERSE TRAINING ORDER FORM" in normalized_header
            or any("TRAINING ORDER FORM" in s for s in sheet_names_upper)
        ):
            logger.info("🎯 [Excel Classifier] Xác định: Phôi TOF (Training Order Form)")
            return "TOF", {"matched_header": "TOF", "sheet_count": len(sheet_names)}

        # 3. NHẬN DIỆN PHÔI TẠO TÀI KHOẢN (ACCOUNT CREATION REQUEST FORM)
        if (
            "ACCOUNT CREATION REQUEST FORM" in normalized_header
            or "ACCOUNT CREATION" in normalized_header
            or "BULK ACCOUNT CREATION" in normalized_header
            or any("ACCOUNT" in s for s in sheet_names_upper)
        ):
            logger.info("🎯 [Excel Classifier] Xác định: Phôi BULK_ACCOUNTS (Account Creation Request Form)")
            return "BULK_ACCOUNTS", {"matched_header": "BULK_ACCOUNTS", "sheet_count": len(sheet_names)}

        # 4. FALLBACK VỀ PHÔI TỰ DO (GENERIC)
        logger.info("ℹ️ [Excel Classifier] Không khớp phôi chuẩn -> Phân loại GENERIC")
        return "GENERIC", {"matched_header": "GENERIC", "sheet_count": len(sheet_names)}

    except Exception as e:
        logger.warning(f"⚠️ Lỗi khi phân loại file Excel: {e}")
        return "GENERIC", {"error": str(e)}
    finally:
        if wb:
            try:
                wb.close()
            except Exception:
                pass