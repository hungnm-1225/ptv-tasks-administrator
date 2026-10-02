# backend/app/services/workspace_lineage_service.py
import re
import logging
from typing import Dict, Any, Optional, Union
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
    
    return Fernet(Fernet.generate_key())

cipher_suite = init_cipher_suite()


def decrypt_password(encrypted_pass: str) -> str:
    """Giải mã mật khẩu an toàn khi Playwright cần đăng nhập."""
    if not encrypted_pass:
        return ""
    try:
        if not str(encrypted_pass).startswith("gAAAAA"):
            return encrypted_pass
        return cipher_suite.decrypt(encrypted_pass.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.warning(f"Không giải mã được mật khẩu (dùng dạng thô): {e}")
        return encrypted_pass

class WorkspaceLineageService:
    """Service tự động truy vết phả hệ Distributor -> Partner -> School."""

    @classmethod
    def resolve_by_school(
        cls, 
        school_identifier: Optional[Union[str, Dict[str, Any]]] = None, 
        country_hint: Optional[str] = None,
        school_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Chiến lược Waterfall Search giải quyết triệt để vấn đề tìm trường (Zero-Mock):
        1. Ưu tiên UUID / ID số / Mã SCH- hoặc SCH_ (kể cả bóc từ order_code).
        2. Nếu đầu vào là Email/Username Vault -> Tìm ngược qua workspace_credentials_vault.
        3. Tìm theo Tên (ilike name).
        4. Tuyệt đối không fallback vào credential ma có password rỗng.
        """
        target_id: Optional[str] = school_id
        target_name: Optional[str] = None

        if isinstance(school_identifier, dict):
            target_id = target_id or school_identifier.get("school_id") or school_identifier.get("id")
            target_name = school_identifier.get("school_name") or school_identifier.get("school") or school_identifier.get("name") or school_identifier.get("order_code")
        elif isinstance(school_identifier, str):
            clean_str = school_identifier.strip()
            if clean_str not in ["Tự động truy vết", ""]:
                if len(clean_str) == 36 and clean_str.count("-") == 4:
                    target_id = target_id or clean_str
                else:
                    target_name = clean_str

        if not target_id and not target_name:
            return None

        supabase = get_supabase_client()
        query = supabase.table("workspace_organizations")\
            .select("*, workspace_credentials_vault(*)")\
            .eq("role_type", "school")

        school_res = None

        # =========================================================================
        # BƯỚC 1: TÌM THEO UUID HOẶC ID SỐ
        # =========================================================================
        if target_id:
            clean_target_id = str(target_id).strip()
            if len(clean_target_id) == 36 and clean_target_id.count("-") == 4:
                school_res = query.eq("id", clean_target_id).execute()
            elif clean_target_id.isdigit():
                school_res = query.or_(f'code.eq."{clean_target_id}",code.eq."SCH-{clean_target_id}",code.eq."SCH_{clean_target_id}"').execute()

        # =========================================================================
        # BƯỚC 2: TÌM THEO CODE / EMAIL VAULT / TÊN TRƯỜNG
        # =========================================================================
        if (not school_res or not school_res.data) and target_name:
            clean_name = target_name.strip()

            # 2.1 Bóc tách mã trường từ SCH- hoặc SCH_ (Kể cả trong order code SCH-15295-20261002-1483)
            sch_match = re.search(r"(SCH[-_]\d+)", clean_name, re.IGNORECASE)
            if sch_match:
                extracted_code = sch_match.group(1).upper().replace("_", "-")
                num_only = re.search(r"\d+", extracted_code).group(0)
                school_res = query.or_(f'code.eq."{extracted_code}",code.eq."SCH_{num_only}",code.eq."{num_only}"').execute()

            # 2.2 Nếu đầu vào là số nguyên thuần
            elif clean_name.isdigit():
                school_res = query.or_(f'code.eq."{clean_name}",code.eq."SCH-{clean_name}",code.eq."SCH_{clean_name}"').execute()

            # 2.3 Nếu đầu vào là Email hoặc Username trong Két Sắt Vault (VD: airoc2026.scvn@school.edu)
            elif "@" in clean_name or "." in clean_name:
                try:
                    v_res = supabase.table("workspace_credentials_vault")\
                        .select("org_id")\
                        .ilike("username", clean_name)\
                        .execute()
                    if v_res.data and v_res.data[0].get("org_id"):
                        school_res = query.eq("id", v_res.data[0]["org_id"]).execute()
                except Exception as v_err:
                    logger.warning(f"⚠️ Tra cứu Vault username thất bại: {v_err}")

            # 2.4 Tìm kiếm theo tên trường học
            if not school_res or not school_res.data:
                school_res = query.ilike("name", f"%{clean_name}%").execute()

        if not school_res or not school_res.data:
            logger.warning(f"❌ Không tìm thấy trường học (role_type='school') phù hợp với ID='{target_id}', Name='{target_name}'")
            return None

        # =========================================================================
        # BƯỚC 3: TRÍCH XUẤT CREDENTIALS TỪ VAULT & PHẢ HỆ PARTNER / DISTRIBUTOR
        # =========================================================================
        school = school_res.data[0]
        raw_school_vault = school.get("workspace_credentials_vault")
        school_creds = raw_school_vault[0] if (isinstance(raw_school_vault, list) and len(raw_school_vault) > 0) else (raw_school_vault or {})

        partner_id = school.get("parent_id")
        partner_data = None
        distributor_data = None

        if partner_id:
            partner_res = supabase.table("workspace_organizations")\
                .select("*, workspace_credentials_vault(*)")\
                .eq("id", partner_id)\
                .execute()
            if partner_res.data and len(partner_res.data) > 0:
                partner = partner_res.data[0]
                raw_p_vault = partner.get("workspace_credentials_vault")
                p_creds = raw_p_vault[0] if (isinstance(raw_p_vault, list) and len(raw_p_vault) > 0) else (raw_p_vault or {})
                
                p_pass = decrypt_password(p_creds.get("encrypted_password", ""))
                partner_data = {
                    "id": partner.get("id"),
                    "code": partner.get("code"),
                    "name": partner.get("name"),
                    "partner_id": str(partner.get("partner_id") or partner.get("code") or "").replace("PAR-", "").replace("PAR_", ""),
                    "username": p_creds.get("username", ""),
                    "password": p_pass
                }

                # Tìm Distributor cấp cao nhất
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
                            "distributor_id": str(dist.get("distributor_id") or dist.get("code") or "").replace("DST-", "").replace("DST_", ""),
                            "username": d_creds.get("username", ""),
                            "password": decrypt_password(d_creds.get("encrypted_password", ""))
                        }

        # 🎯 CHỐT CHẶN AN TOÀN: NẾU KHÔNG CÓ PARTNER THẬT -> BÁO RỖNG, TUYỆT ĐỐI KHÔNG TRẢ DICTIONARY PASSWORD RỖNG!
        if not partner_data or not partner_data.get("password"):
            logger.error(f"❌ Trường '{school.get('name')}' không có Partner hợp lệ hoặc thiếu password trong Vault!")
            return None

        country_info = {"name": "Vietnam", "folder": "4. Vietnam", "code": "2"}
        if country_hint and country_hint in COUNTRY_DISTRIBUTOR_MAP:
            country_info = {"name": country_hint, **COUNTRY_DISTRIBUTOR_MAP[country_hint]}
        elif distributor_data:
            for c_name, c_meta in COUNTRY_DISTRIBUTOR_MAP.items():
                if (c_meta["name"].lower() in str(distributor_data["name"]).lower() or 
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
            "partner": partner_data,
            "distributor": distributor_data
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