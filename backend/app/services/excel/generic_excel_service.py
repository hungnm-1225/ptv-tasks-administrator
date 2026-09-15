"""
Generic Excel Service
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách: Bóc tách mọi file Excel tự do (Hyperlinks Repositories, Emails, Khóa học).
"""
import os
import gc
import logging
from typing import Dict, Any, List, Optional
import openpyxl

logger = logging.getLogger(__name__)


class GenericExcelService:
    """Service bóc tách mọi file Excel tự do (Hyperlinks, Emails, Repositories)."""

    @classmethod
    def parse_generic_excel(cls, file_path: str) -> Dict[str, Any]:
        """Bóc tách dữ liệu tổng quát từ file Excel bất kỳ."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Không tìm thấy file: {file_path}")

        wb = openpyxl.load_workbook(file_path, data_only=True)
        try:
            results = {
                "sheets": wb.sheetnames,
                "rows_count": 0,
                "data": []
            }
            ws = wb.active
            if ws:
                for row in ws.iter_rows(values_only=True):
                    if any(row):
                        results["data"].append(list(row))
            results["rows_count"] = len(results["data"])
            return results
        finally:
            wb.close()
            del wb
            gc.collect()

    @classmethod
    def extract_links_and_emails(cls, file_path: str) -> Dict[str, List[str]]:
        """Trích xuất liên kết hyperlink và email từ các ô trong file Excel."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Không tìm thấy file: {file_path}")

        wb = openpyxl.load_workbook(file_path, data_only=False)
        emails = []
        links = []
        try:
            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                for row in ws.iter_rows():
                    for cell in row:
                        if cell.hyperlink and cell.hyperlink.target:
                            links.append(str(cell.hyperlink.target).strip())
                        val = str(cell.value or "").strip()
                        if "@" in val and "." in val:
                            emails.append(val)
            return {
                "emails": list(set(emails)),
                "links": list(set(links)),
            }
        finally:
            wb.close()
            del wb
            gc.collect()
