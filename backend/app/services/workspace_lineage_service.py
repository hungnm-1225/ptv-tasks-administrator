# backend/app/services/workspace_lineage_service.py
import logging
from typing import Dict, Any, Optional
from cryptography.fernet import Fernet
from app.core.supabase import get_supabase_client
from app.core.config import settings

logger = logging.getLogger(__name__)

# Key giải mã mật khẩu két sắt
SECRET_KEY = getattr(settings, "VAULT_SECRET_KEY", Fernet.generate_key())
cipher_suite = Fernet(SECRET_KEY if isinstance(SECRET_KEY, bytes) else SECRET_KEY.encode())

# Cấu hình ánh xạ Quốc gia <-> Master Distributor
COUNTRY_DISTRIBUTOR_MAP = {
    "Vietnam": {"code": "2", "name": "Vì Người Việt", "folder": "4. Vietnam"},
    "Malaysia": {"code": "42", "name": "Matlamat Wawasan Sdn Bhd", "folder": "1. Malaysia"},
    "Indonesia": {"code": "10", "name": "PT Asaba", "folder": "2. Indonesia"},
    "Philippines": {"code": "6", "name": "Digital Hub Ph Corp", "folder": "3. Philippines"}
}

def decrypt_password(encrypted_pass: str) -> str:
    """Giải mã mật khẩu an toàn khi Playwright cần đăng nhập."""
    if not encrypted_pass:
        return ""
    try:
        return cipher_suite.decrypt(encrypted_pass.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.error(f"Lỗi giải mã mật khẩu: {e}")
        return encrypted_pass

class WorkspaceLineageService:
    """Service tự động truy vết phả hệ Distributor -> Partner -> School."""

    @staticmethod
    def resolve_by_school(school_identifier: str, country_hint: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Nhập tên trường hoặc mã trường (VD: 'SCH_10266' hoặc 'Amsterdam') 
        -> Trả về đầy đủ thông tin tài khoản của Trường, Partner, Distributor và Thư mục Quốc gia.
        """
        supabase = get_supabase_client()
        
        # 1. Tìm School theo Code hoặc Name
        school_query = supabase.table("workspace_organizations")\
            .select("*, workspace_credentials_vault(*)")\
            .eq("role_type", "school")
            
        if school_identifier.startswith("SCH_"):
            school_res = school_query.eq("code", school_identifier).execute()
        else:
            school_res = school_query.ilike("name", f"%{school_identifier.strip()}%").execute()

        if not school_res.data:
            logger.warning(f"Không tìm thấy trường học phù hợp với: '{school_identifier}'")
            return None

        school = school_res.data[0]
        school_vault = school.get("workspace_credentials_vault", [{}])
        school_creds = school_vault[0] if school_vault else {}

        partner_id = school.get("parent_id")
        partner_data = None
        distributor_data = None

        # 2. Tìm Partner cấp trên
        if partner_id:
            partner_res = supabase.table("workspace_organizations")\
                .select("*, workspace_credentials_vault(*)")\
                .eq("id", partner_id)\
                .execute()
            if partner_res.data:
                partner = partner_res.data[0]
                p_vault = partner.get("workspace_credentials_vault", [{}])
                p_creds = p_vault[0] if p_vault else {}
                
                partner_data = {
                    "id": partner["id"],
                    "code": partner["code"],
                    "name": partner["name"],
                    "username": p_creds.get("username", ""),
                    "password": decrypt_password(p_creds.get("encrypted_password", ""))
                }

                # 3. Tìm Distributor cấp cao nhất
                dist_id = partner.get("parent_id")
                if dist_id:
                    dist_res = supabase.table("workspace_organizations")\
                        .select("*, workspace_credentials_vault(*)")\
                        .eq("id", dist_id)\
                        .execute()
                    if dist_res.data:
                        dist = dist_res.data[0]
                        d_vault = dist.get("workspace_credentials_vault", [{}])
                        d_creds = d_vault[0] if d_vault else {}
                        
                        distributor_data = {
                            "id": dist["id"],
                            "code": dist["code"],
                            "name": dist["name"],
                            "username": d_creds.get("username", ""),
                            "password": decrypt_password(d_creds.get("encrypted_password", ""))
                        }

        # 4. Tự động suy luận Quốc gia & Thư mục Drive tương ứng từ Distributor
        country_info = {"name": "Vietnam", "folder": "4. Vietnam", "code": "2"} # Mặc định
        
        # Nếu có hint từ ticket (VD: country='Malaysia')
        if country_hint and country_hint in COUNTRY_DISTRIBUTOR_MAP:
            country_info = {
                "name": country_hint,
                **COUNTRY_DISTRIBUTOR_MAP[country_hint]
            }
        elif distributor_data:
            # Tra cứu ngược từ Distributor Name hoặc Code
            for c_name, c_meta in COUNTRY_DISTRIBUTOR_MAP.items():
                if (c_meta["name"].lower() in distributor_data["name"].lower() or 
                    str(c_meta["code"]) == str(distributor_data["code"])):
                    country_info = {"name": c_name, **c_meta}
                    break

        return {
            "country": country_info,
            "school": {
                "id": school["id"],
                "code": school["code"],
                "name": school["name"],
                "username": school_creds.get("username", ""),
                "password": decrypt_password(school_creds.get("encrypted_password", ""))
            },
            "partner": partner_data or {
                "name": "Direct Partner (Chưa gán)", "username": "", "password": ""
            },
            "distributor": distributor_data or {
                "name": "PTV Master Distributor", "username": "", "password": ""
            }
        }

workspace_lineage_service = WorkspaceLineageService()