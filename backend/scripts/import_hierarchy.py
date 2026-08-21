# backend/scripts/import_hierarchy.py
import os
import sys
import pandas as pd
from typing import Dict, Any, List
import base64
from cryptography.fernet import Fernet

# Thêm path để import các module từ backend app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.supabase import get_supabase_client
from app.core.config import settings

# Key mã hóa bí mật (Nếu chưa có trong env thì sinh tạm)
# Trong production, anh nên set SECRET_ENCRYPTION_KEY vào .env
SECRET_KEY = getattr(settings, "VAULT_SECRET_KEY", Fernet.generate_key())
cipher_suite = Fernet(SECRET_KEY if isinstance(SECRET_KEY, bytes) else SECRET_KEY.encode())

def encrypt_password(plain_pass: str) -> str:
    """Mã hóa mật khẩu an toàn trước khi đẩy lên database."""
    if not plain_pass:
        return ""
    return cipher_suite.encrypt(plain_pass.encode("utf-8")).decode("utf-8")

def import_hierarchy_excel(excel_path: str):
    supabase = get_supabase_client()
    print(f"🚀 Bắt đầu đọc file: {excel_path}...")

    xls = pd.ExcelFile(excel_path)
    
    # -------------------------------------------------------------------------
    # BƯỚC 1: IMPORT DISTRIBUTORS (CẤP 1 - GỐC)
    # -------------------------------------------------------------------------
    if "Distributors" in xls.sheet_names:
        df_dist = pd.read_excel(xls, "Distributors").fillna("")
        print(f"📦 Đang import {len(df_dist)} Distributors...")
        
        for _, row in df_dist.iterrows():
            code = str(row["code"]).strip()
            name = str(row["name"]).strip()
            username = str(row.get("username", "")).strip()
            password = str(row.get("password", "")).strip()
            
            # Upsert vào workspace_organizations
            org_res = supabase.table("workspace_organizations").upsert({
                "code": code,
                "name": name,
                "role_type": "distributor",
                "parent_id": None
            }, on_conflict="code").execute()
            
            if org_res.data and username:
                org_id = org_res.data[0]["id"]
                # Lưu thông tin đăng nhập vào Két Sắt
                supabase.table("workspace_credentials_vault").upsert({
                    "org_id": org_id,
                    "account_role": "distributor_admin",
                    "username": username,
                    "encrypted_password": encrypt_password(password),
                    "is_active": True
                }, on_conflict="org_id").execute()

        print("✅ Đã import xong Distributors!")

    # -------------------------------------------------------------------------
    # BƯỚC 2: IMPORT PARTNERS (CẤP 2 - THUỘC DISTRIBUTOR)
    # -------------------------------------------------------------------------
    if "Partners" in xls.sheet_names:
        df_partner = pd.read_excel(xls, "Partners").fillna("")
        print(f"📦 Đang import {len(df_partner)} Partners...")
        
        # Tạo map mã code -> ID của Distributor
        dist_map = {}
        all_dists = supabase.table("workspace_organizations").select("id, code").eq("role_type", "distributor").execute()
        for d in (all_dists.data or []):
            dist_map[d["code"]] = d["id"]
            
        for _, row in df_partner.iterrows():
            code = str(row["code"]).strip()
            name = str(row["name"]).strip()
            parent_code = str(row["parent_distributor_code"]).strip()
            username = str(row.get("username", "")).strip()
            password = str(row.get("password", "")).strip()
            
            parent_id = dist_map.get(parent_code)
            
            org_res = supabase.table("workspace_organizations").upsert({
                "code": code,
                "name": name,
                "role_type": "partner",
                "parent_id": parent_id
            }, on_conflict="code").execute()
            
            if org_res.data and username:
                org_id = org_res.data[0]["id"]
                supabase.table("workspace_credentials_vault").upsert({
                    "org_id": org_id,
                    "account_role": "partner_admin",
                    "username": username,
                    "encrypted_password": encrypt_password(password),
                    "is_active": True
                }, on_conflict="org_id").execute()

        print("✅ Đã import xong Partners!")

    # -------------------------------------------------------------------------
    # BƯỚC 3: IMPORT SCHOOLS (CẤP 3 - 10.000+ TRƯỜNG THEO TỪNG BATCH 500)
    # -------------------------------------------------------------------------
    if "Schools" in xls.sheet_names:
        df_schools = pd.read_excel(xls, "Schools").fillna("")
        total_schools = len(df_schools)
        print(f"🏫 Đang xử lý {total_schools} Schools theo từng Batch 500 dòng...")
        
        # Lấy danh sách Partner code -> ID
        partner_map = {}
        all_partners = supabase.table("workspace_organizations").select("id, code").eq("role_type", "partner").execute()
        for p in (all_partners.data or []):
            partner_map[p["code"]] = p["id"]

        batch_size = 500
        for i in range(0, total_schools, batch_size):
            chunk = df_schools.iloc[i : i + batch_size]
            org_payloads = []
            
            for _, row in chunk.iterrows():
                code = str(row["code"]).strip()
                name = str(row["name"]).strip()
                parent_code = str(row.get("parent_partner_code", "")).strip()
                parent_id = partner_map.get(parent_code)
                
                org_payloads.append({
                    "code": code,
                    "name": name,
                    "role_type": "school",
                    "parent_id": parent_id
                })
            
            # Upsert cả mảng 500 trường cùng lúc
            res = supabase.table("workspace_organizations").upsert(org_payloads, on_conflict="code").execute()
            
            # Lưu tài khoản đăng nhập của batch trường này
            if res.data:
                vault_payloads = []
                for idx, saved_org in enumerate(res.data):
                    original_row = chunk.iloc[idx]
                    u = str(original_row.get("username", "")).strip()
                    p = str(original_row.get("password", "")).strip()
                    if u:
                        vault_payloads.append({
                            "org_id": saved_org["id"],
                            "account_role": "school_admin",
                            "username": u,
                            "encrypted_password": encrypt_password(p),
                            "is_active": True
                        })
                
                if vault_payloads:
                    supabase.table("workspace_credentials_vault").upsert(vault_payloads, on_conflict="org_id").execute()

            print(f"  ↳ Đã import thành công: {min(i + batch_size, total_schools)}/{total_schools} trường...")

        print("🎉 TẤT CẢ 10.000+ TRƯỜNG HỌC ĐÃ ĐƯỢC IMPORT THÀNH CÔNG VÀO PHẢ HỆ!")

if __name__ == "__main__":
    # Tự động trỏ tới file Excel nằm cùng thư mục với script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_path = os.path.join(script_dir, "pythaverse_hierarchy_data.xlsx")
    
    file_path = sys.argv[1] if len(sys.argv) > 1 else default_path
    import_hierarchy_excel(file_path)

#Lệnh chạy cập nhật phả hệ lên supabase
#cd backend
#.\venv\Scripts\activate
#python scripts/import_hierarchy.py
    