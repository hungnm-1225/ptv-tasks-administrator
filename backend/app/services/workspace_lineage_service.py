# backend/app/services/workspace_lineage_service.py
from typing import Dict, Any, Optional
from app.core.supabase import get_supabase_client

class WorkspaceLineageResolver:
    """Tự động lần mò phả hệ: School -> Partner -> Distributor và giải mã thông tin tài khoản."""

    @staticmethod
    def resolve_hierarchy_by_school_name(school_name: str) -> Optional[Dict[str, Any]]:
        supabase = get_supabase_client()
        
        # 1. Tìm School theo tên (hỗ trợ tìm kiếm gần đúng ilike)
        school_res = supabase.table("workspace_organizations")\
            .select("*, workspace_credentials_vault(*)")\
            .eq("role_type", "school")\
            .ilike("name", f"%{school_name.strip()}%")\
            .execute()

        if not school_res.data:
            return None

        school = school_res.data[0]
        partner_id = school.get("parent_id")
        
        partner = None
        distributor = None

        # 2. Tìm Partner cấp trên
        if partner_id:
            partner_res = supabase.table("workspace_organizations")\
                .select("*, workspace_credentials_vault(*)")\
                .eq("id", partner_id)\
                .execute()
            if partner_res.data:
                partner = partner_res.data[0]
                distributor_id = partner.get("parent_id")
                
                # 3. Tìm Distributor cấp cao nhất
                if distributor_id:
                    dist_res = supabase.table("workspace_organizations")\
                        .select("*, workspace_credentials_vault(*)")\
                        .eq("id", distributor_id)\
                        .execute()
                    if dist_res.data:
                        distributor = dist_res.data[0]

        return {
            "school": {
                "id": school["id"],
                "name": school["name"],
                "credentials": school.get("workspace_credentials_vault", [{}])[0]
            },
            "partner": {
                "id": partner["id"] if partner else None,
                "name": partner["name"] if partner else "Direct Admin Partner",
                "credentials": partner.get("workspace_credentials_vault", [{}])[0] if partner else {}
            },
            "distributor": {
                "id": distributor["id"] if distributor else None,
                "name": distributor["name"] if distributor else "Company Master Distributor",
                "credentials": distributor.get("workspace_credentials_vault", [{}])[0] if distributor else {}
            }
        }