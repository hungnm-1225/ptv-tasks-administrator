# backend/app/services/workspace_lineage_service.py
import logging
from typing import Dict, Any, Optional
from app.core.supabase import get_supabase_client
from app.core.config import settings

logger = logging.getLogger(__name__)

class WorkspaceLineageResolver:
    """Tự động truy vết phả hệ: School -> Partner -> Distributor -> Sales Admin và trích xuất credentials."""

    @staticmethod
    def resolve_hierarchy_by_school_name(school_name: str) -> Optional[Dict[str, Any]]:
        supabase = get_supabase_client()
        clean_name = school_name.strip()
        logger.info(f"🔍 Đang truy vết phả hệ cho trường: '{clean_name}'...")

        # 1. Tìm School trong database (ưu tiên khớp gần đúng ilike)
        school_res = supabase.table("workspace_organizations")\
            .select("id, name, code, role_type, parent_id, workspace_credentials(*)")\
            .eq("role_type", "school")\
            .ilike("name", f"%{clean_name}%")\
            .execute()

        if not school_res.data:
            logger.warning(f"⚠️ Không tìm thấy trường '{clean_name}' trong database.")
            return None

        school = school_res.data[0]
        school_creds = (school.get("workspace_credentials") or [{}])[0]

        partner = None
        partner_creds = {}
        distributor = None
        distributor_creds = {}

        # 2. Truy vết Partner (Cấp cha của School)
        partner_id = school.get("parent_id")
        if partner_id:
            partner_res = supabase.table("workspace_organizations")\
                .select("id, name, code, role_type, parent_id, workspace_credentials(*)")\
                .eq("id", partner_id)\
                .execute()
            if partner_res.data:
                partner = partner_res.data[0]
                partner_creds = (partner.get("workspace_credentials") or [{}])[0]
                
                # 3. Truy vết Distributor (Cấp cha của Partner)
                distributor_id = partner.get("parent_id")
                if distributor_id:
                    dist_res = supabase.table("workspace_organizations")\
                        .select("id, name, code, role_type, parent_id, workspace_credentials(*)")\
                        .eq("id", distributor_id)\
                        .execute()
                    if dist_res.data:
                        distributor = dist_res.data[0]
                        distributor_creds = (distributor.get("workspace_credentials") or [{}])[0]

        # 4. Sales Admin (Lấy từ biến môi trường hoặc Vault cấp cao nhất)
        admin_creds = {
            "username": settings.KEYCLOAK_ADMIN_USER,
            "password": settings.KEYCLOAK_ADMIN_PASS
        }

        hierarchy_data = {
            "school": {
                "id": school.get("id"),
                "name": school.get("name"),
                "code": school.get("code"),
                "credentials": {
                    "username": school_creds.get("username", ""),
                    "password": school_creds.get("encrypted_password", school_creds.get("password", ""))
                }
            },
            "partner": {
                "id": partner.get("id") if partner else None,
                "name": partner.get("name") if partner else "Direct Partner",
                "code": partner.get("code") if partner else "PRT-DIRECT",
                "credentials": {
                    "username": partner_creds.get("username", ""),
                    "password": partner_creds.get("encrypted_password", partner_creds.get("password", ""))
                }
            },
            "distributor": {
                "id": distributor.get("id") if distributor else None,
                "name": distributor.get("name") if distributor else "Master Distributor",
                "code": distributor.get("code") if distributor else "DST-MASTER",
                "credentials": {
                    "username": distributor_creds.get("username", ""),
                    "password": distributor_creds.get("encrypted_password", distributor_creds.get("password", ""))
                }
            },
            "sales_admin": {
                "name": "Pythaverse Sales Admin",
                "credentials": admin_creds
            }
        }
        
        logger.info(f"✅ Đã giải mã phả hệ thành công: School [{school['name']}] ➔ Partner [{hierarchy_data['partner']['name']}] ➔ Dist [{hierarchy_data['distributor']['name']}]")
        return hierarchy_data