# backend/app/services/workspace_lineage_service.py
# backend/app/services/workspace_lineage_service.py
import logging
from typing import Dict, Any, Optional
from cryptography.fernet import Fernet
from app.core.supabase import get_supabase_client
from app.core.config import settings

logger = logging.getLogger(__name__)

# Cấu hình ánh xạ Quốc gia <-> Master Distributor
COUNTRY_DISTRIBUTOR_MAP = {
    "Vietnam": {"code": "2", "name": "Vì Người Việt", "folder": "4. Vietnam"},
    "Malaysia": {"code": "42", "name": "Matlamat Wawasan Sdn Bhd", "folder": "1. Malaysia"},
    "Indonesia": {"code": "10", "name": "PT Asaba", "folder": "2. Indonesia"},
    "Philippines": {"code": "6", "name": "Digital Hub Ph Corp", "folder": "3. Philippines"}
}

def init_cipher_suite() -> Fernet:
    """Khởi tạo Fernet Cipher an toàn, tự fallback nếu chưa cấu hình VAULT_SECRET_KEY."""
    raw_key = getattr(settings, "VAULT_SECRET_KEY", None)
    if raw_key and len(str(raw_key).strip()) > 0:
        try:
            key_bytes = raw_key.encode("utf-8") if isinstance(raw_key, str) else raw_key
            return Fernet(key_bytes)
        except Exception as e:
            logger.warning(f"⚠️ VAULT_SECRET_KEY không hợp lệ Fernet, sinh key tạm: {e}")
    
    # Tự động sinh key ngẫu nhiên nếu chưa có key trong .env để không bao giờ làm sập app
    return Fernet(Fernet.generate_key())

cipher_suite = init_cipher_suite()


def decrypt_password(encrypted_pass: str) -> str:
    """Giải mã mật khẩu an toàn khi Playwright cần đăng nhập."""
    if not encrypted_pass:
        return ""
    try:
        # Nếu là mật khẩu chưa mã hóa (plain text) thì trả về nguyên bản
        if not str(encrypted_pass).startswith("gAAAAA"):
            return encrypted_pass
        return cipher_suite.decrypt(encrypted_pass.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.warning(f"Không giải mã được mật khẩu (dùng dạng thô): {e}")
        return encrypted_pass

class WorkspaceLineageService:
    """Service tự động truy vết phả hệ Distributor -> Partner -> School."""

    @staticmethod
    def resolve_by_school(school_identifier: str, country_hint: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Nhập tên trường hoặc mã trường (VD: '10266', 'SCH_10266' hoặc 'Pythaverse School Demo') 
        -> Trả về đầy đủ thông tin tài khoản của Trường, Partner, Distributor và Thư mục Quốc gia.
        """
        if not school_identifier or school_identifier in ["Tự động truy vết", ""]:
            return None

        supabase = get_supabase_client()
        clean_id = str(school_identifier).strip()
        
        # 1. Tìm School theo Code (10266 hoặc SCH_10266) hoặc Name
        query = supabase.table("workspace_organizations").select("*, workspace_credentials_vault(*)")
            
        if clean_id.isdigit():
            school_res = query.or_(f"code.eq.{clean_id},code.eq.SCH_{clean_id},name.ilike.%{clean_id}%").execute()
        elif clean_id.startswith("SCH_"):
            num_part = clean_id.replace("SCH_", "")
            school_res = query.or_(f"code.eq.{clean_id},code.eq.{num_part}").execute()
        else:
            school_res = query.or_(f"code.eq.{clean_id},name.ilike.%{clean_id}%").execute()

        if not school_res.data:
            logger.warning(f"Không tìm thấy trường học phù hợp với: '{school_identifier}'")
            return None

        # Lấy bản ghi có credentials hợp lệ
        school = None
        school_creds = {}
        for s in school_res.data:
            raw_v = s.get("workspace_credentials_vault")
            s_c = raw_v[0] if (isinstance(raw_v, list) and len(raw_v) > 0) else (raw_v or {})
            if s_c.get("username"):
                school = s
                school_creds = s_c
                break

        if not school:
            school = school_res.data[0]
            raw_school_vault = school.get("workspace_credentials_vault")
            school_creds = raw_school_vault[0] if (isinstance(raw_school_vault, list) and len(raw_school_vault) > 0) else (raw_school_vault or {})

        partner_id = school.get("parent_id")
        partner_data = None
        distributor_data = None

        # 2. Tìm Partner cấp trên
        if partner_id:
            partner_res = supabase.table("workspace_organizations")\
                .select("*, workspace_credentials_vault(*)")\
                .eq("id", partner_id)\
                .execute()
            if partner_res.data and len(partner_res.data) > 0:
                partner = partner_res.data[0]
                raw_p_vault = partner.get("workspace_credentials_vault")
                p_creds = raw_p_vault[0] if (isinstance(raw_p_vault, list) and len(raw_p_vault) > 0) else (raw_p_vault or {})
                
                partner_data = {
                    "id": partner.get("id"),
                    "code": partner.get("code"),
                    "name": partner.get("name"),
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
                    if dist_res.data and len(dist_res.data) > 0:
                        dist = dist_res.data[0]
                        raw_d_vault = dist.get("workspace_credentials_vault")
                        d_creds = raw_d_vault[0] if (isinstance(raw_d_vault, list) and len(raw_d_vault) > 0) else (raw_d_vault or {})
                        
                        distributor_data = {
                            "id": dist.get("id"),
                            "code": dist.get("code"),
                            "name": dist.get("name"),
                            "username": d_creds.get("username", ""),
                            "password": decrypt_password(d_creds.get("encrypted_password", ""))
                        }

        country_info = {"name": "Vietnam", "folder": "4. Vietnam", "code": "2"}
        if country_hint and country_hint in COUNTRY_DISTRIBUTOR_MAP:
            country_info = {"name": country_hint, **COUNTRY_DISTRIBUTOR_MAP[country_hint]}
        elif distributor_data:
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
                "username": school_creds.get("username", "htdttemd"),
                "password": decrypt_password(school_creds.get("encrypted_password", ""))
            },
            "partner": partner_data or {
                "name": "Partner DTTE test (Demo)", "username": "", "password": ""
            },
            "distributor": distributor_data or {
                "name": "PTV Distributor Demo", "username": "testdistributor", "password": ""
            }
        }
    
    @staticmethod
    def resolve_by_partner(partner_identifier: str) -> Optional[Dict[str, Any]]:
        """
        Nhập tên hoặc mã Partner -> Trả về tài khoản của Partner và Distributor cấp cha.
        """
        supabase = get_supabase_client()
        query = supabase.table("workspace_organizations")\
            .select("*, workspace_credentials_vault(*)")\
            .eq("role_type", "partner")

        if str(partner_identifier).startswith("PAR_") or str(partner_identifier).isdigit():
            partner_res = query.eq("code", str(partner_identifier)).execute()
        else:
            partner_res = query.ilike("name", f"%{partner_identifier.strip()}%").execute()

        if not partner_res.data:
            logger.warning(f"Không tìm thấy Partner phù hợp: '{partner_identifier}'")
            return None

        partner = partner_res.data[0]
        raw_p_vault = partner.get("workspace_credentials_vault")
        p_creds = raw_p_vault[0] if (isinstance(raw_p_vault, list) and len(raw_p_vault) > 0) else (raw_p_vault or {})

        partner_data = {
            "id": partner.get("id"),
            "code": partner.get("code"),
            "name": partner.get("name"),
            "username": p_creds.get("username", ""),
            "password": decrypt_password(p_creds.get("encrypted_password", ""))
        }

        distributor_data = None
        dist_id = partner.get("parent_id")
        if dist_id:
            dist_res = supabase.table("workspace_organizations")\
                .select("*, workspace_credentials_vault(*)")\
                .eq("id", dist_id)\
                .execute()
            if dist_res.data and len(dist_res.data) > 0:
                dist = dist_res.data[0]
                raw_d_vault = dist.get("workspace_credentials_vault")
                d_creds = raw_d_vault[0] if (isinstance(raw_d_vault, list) and len(raw_d_vault) > 0) else (raw_d_vault or {})
                distributor_data = {
                    "id": dist.get("id"),
                    "code": dist.get("code"),
                    "name": dist.get("name"),
                    "username": d_creds.get("username", ""),
                    "password": decrypt_password(d_creds.get("encrypted_password", ""))
                }

        return {
            "partner": partner_data,
            "distributor": distributor_data or {"name": "PTV Master Distributor", "username": "", "password": ""}
        }

    @staticmethod
    def resolve_by_distributor(distributor_identifier: str) -> Optional[Dict[str, Any]]:
        """Nhập tên hoặc mã Distributor (VD: '36' hoặc 'PTV Distributor Demo') -> Trả về tài khoản chuẩn."""
        if not distributor_identifier or distributor_identifier in ["Tự động truy vết", ""]:
            return None

        supabase = get_supabase_client()
        clean_id = str(distributor_identifier).strip()

        # Tìm theo code (VD: '36') hoặc tên
        query = supabase.table("workspace_organizations").select("*, workspace_credentials_vault(*)")
        
        if clean_id.isdigit() or clean_id.startswith("DST_"):
            dist_res = query.or_(f"code.eq.{clean_id},code.eq.DST_{clean_id}").execute()
        else:
            dist_res = query.ilike("name", f"%{clean_id}%").execute()

        if not dist_res.data:
            logger.warning(f"Không tìm thấy Distributor phù hợp: '{distributor_identifier}'")
            return None

        # Lấy đúng bản ghi có credentials
        for dist in dist_res.data:
            raw_d_vault = dist.get("workspace_credentials_vault")
            d_creds = raw_d_vault[0] if (isinstance(raw_d_vault, list) and len(raw_d_vault) > 0) else (raw_d_vault or {})
            if d_creds.get("username"):
                return {
                    "distributor": {
                        "id": dist.get("id"),
                        "code": dist.get("code"),
                        "name": dist.get("name"),
                        "username": d_creds.get("username", ""),
                        "password": decrypt_password(d_creds.get("encrypted_password", ""))
                    }
                }

        dist = dist_res.data[0]
        raw_d_vault = dist.get("workspace_credentials_vault")
        d_creds = raw_d_vault[0] if (isinstance(raw_d_vault, list) and len(raw_d_vault) > 0) else (raw_d_vault or {})

        return {
            "distributor": {
                "id": dist.get("id"),
                "code": dist.get("code"),
                "name": dist.get("name"),
                "username": d_creds.get("username", ""),
                "password": decrypt_password(d_creds.get("encrypted_password", ""))
            }
        }
    @staticmethod
    def resolve_by_contract(contract_code: str) -> Optional[Dict[str, Any]]:
        """Tự động truy vết Distributor & Partner từ mã Hợp đồng (PRT-... hoặc DST-...)."""
        if not contract_code or contract_code in ["Tự động truy vết", ""]:
            return None
        
        supabase = get_supabase_client()
        clean_code = contract_code.strip()
        
        try:
            cache_res = supabase.table("workspace_contracts_cache")\
                .select("*")\
                .eq("contract_code", clean_code)\
                .limit(1)\
                .execute()
            
            if cache_res.data and len(cache_res.data) > 0:
                item = cache_res.data[0]
                contract_type = str(item.get("contract_type", "")).upper()
                dist_name = item.get("distributor_name") or item.get("receiver_name")
                sender_name = item.get("sender_name")
                partner_name = item.get("partner_name")
                
                dist_creds = None
                partner_creds = None
                
                is_sales_admin_receiver = dist_name and dist_name.strip().lower() in (
                    "sales admin", "salesadmin", "admin"
                )
                
                # 👉 XỬ LÝ PHÂN NHÁNH THÔNG MINH THEO LOẠI HỢP ĐỒNG
                if contract_type == "DST" or clean_code.startswith("DST"):
                    # Hợp đồng DST: Distributor (sender_name) gửi lên Sales Admin
                    target_dist = sender_name or dist_name
                    if target_dist:
                        d_res = WorkspaceLineageService.resolve_by_distributor(target_dist)
                        if d_res:
                            dist_creds = d_res.get("distributor")
                else:
                    # Hợp đồng PRT hoặc mặc định: Partner gửi Distributor
                    if dist_name and not is_sales_admin_receiver:
                        d_res = WorkspaceLineageService.resolve_by_distributor(dist_name)
                        if d_res:
                            dist_creds = d_res.get("distributor")
                            
                    target_partner = partner_name or sender_name
                    if target_partner:
                        p_res = WorkspaceLineageService.resolve_by_partner(target_partner)
                        if p_res:
                            partner_creds = p_res.get("partner")
                            if not dist_creds:
                                dist_creds = p_res.get("distributor")
                            
                if dist_creds or partner_creds:
                    return {"distributor": dist_creds, "partner": partner_creds}
        except Exception as e:
            logger.warning(f"Lỗi truy vết contract từ cache: {e}")
            
        return None

workspace_lineage_service = WorkspaceLineageService()