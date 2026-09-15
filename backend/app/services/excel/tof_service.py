"""
TOF (Training Order Form) Excel Service - Stub/Template
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Ghi chú: Khung dịch vụ bóc tách định dạng TOF phục vụ các lớp Training / Demo.
"""
import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class TOFExcelService:
    """Service xử lý file TOF (Training Order Form)."""

    @classmethod
    def is_tof_file(cls, file_path: str) -> bool:
        """Nhận diện sơ bộ file TOF qua tên file hoặc tên sheet."""
        fname = os.path.basename(file_path).lower()
        if "tof" in fname or "training" in fname:
            return True
        return False

    @classmethod
    def parse_tof_file(cls, file_path: str) -> Dict[str, Any]:
        """Tạm thời trả về khung dữ liệu chuẩn của TOF (Anh sẽ hướng dẫn chi tiết sau)."""
        logger.info(f"📄 [TOF SERVICE] Đang bóc tách file TOF: {file_path}")
        return {
            "file_type": "tof",
            "filename": os.path.basename(file_path),
            "status": "ready_for_specification",
            "message": "Đang chờ cập nhật quy chuẩn bóc tách TOF từ Kiến trúc sư Nguyễn Mạnh Hùng."
        }