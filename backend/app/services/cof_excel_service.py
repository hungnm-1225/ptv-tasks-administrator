"""
COF Excel Service - Facade Proxy
Chuyển tiếp toàn bộ phương thức sang gói mới `app.services.excel`.
Đảm bảo tính tương thích ngược 100% cho main.py, workspace/, workers/.
"""
from app.services.excel.cof_service import COFService
from app.services.excel.bulk_template_service import BulkTemplateService


class COFExcelService:
    """Facade class gom các method từ COFService và BulkTemplateService."""
    _clean_str = staticmethod(COFService.clean_str)
    _format_date_dob = staticmethod(COFService.format_date_dob)
    
    is_cof_file = classmethod(lambda cls, f: COFService.is_cof_file(f))
    parse_cof_file = classmethod(lambda cls, f: COFService.parse_cof_file(f))
    write_results_back_to_cof = classmethod(lambda cls, *args, **kwargs: COFService.write_results_back_to_cof(*args, **kwargs))
    
    normalize_input_accounts_excel = classmethod(lambda cls, *args, **kwargs: BulkTemplateService.normalize_input_accounts_excel(*args, **kwargs))
    detect_and_process_excel = classmethod(lambda cls, *args, **kwargs: BulkTemplateService.detect_and_process_excel(*args, **kwargs))
    write_results_back_to_standard_accounts = classmethod(lambda cls, *args, **kwargs: BulkTemplateService.write_results_back_to_standard_accounts(*args, **kwargs))
    extract_users_from_raw_text = classmethod(lambda cls, *args, **kwargs: BulkTemplateService.extract_users_from_raw_text(*args, **kwargs))
    generate_accounts_excel_from_users = classmethod(lambda cls, *args, **kwargs: BulkTemplateService.generate_accounts_excel_from_users(*args, **kwargs))