"""
Excel Services Package
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Bao gồm 4 dịch vụ chuyên biệt hóa:
1. COFService: Bóc tách file COF 3 Tabs & ghi kết quả.
2. BulkTemplateService: Phôi chuẩn hóa tạo tài khoản trường học & xử lý text trần.
3. GenericExcelService: Bóc tách mọi file Excel tự do (Hyperlinks Repositories, Emails, Khóa học).
4. TOFExcelService: Khung xử lý file TOF (Training Order Form).
"""
from app.services.excel.cof_service import COFService
from app.services.excel.bulk_template_service import BulkTemplateService
from app.services.excel.generic_excel_service import GenericExcelService
from app.services.excel.tof_service import TOFExcelService

__all__ = [
    "COFService",
    "BulkTemplateService",
    "GenericExcelService",
    "TOFExcelService",
]