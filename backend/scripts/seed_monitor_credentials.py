# backend/seed_monitor_credentials.py
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from cryptography.fernet import Fernet
from supabase import create_client

# Tự động tìm và nạp file .env từ thư mục hiện tại hoặc thư mục cha
env_path = Path(__file__).resolve().parent / ".env"
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent / ".env"

load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", "")
VAULT_SECRET_KEY = os.getenv("VAULT_SECRET_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print(f"❌ Không tìm thấy SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong file: {env_path}")
    sys.exit(1)

if not VAULT_SECRET_KEY:
    print(f"❌ Không tìm thấy VAULT_SECRET_KEY trong file: {env_path}")
    sys.exit(1)

cipher = Fernet(VAULT_SECRET_KEY.encode() if isinstance(VAULT_SECRET_KEY, str) else VAULT_SECRET_KEY)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Mẫu 7 Roles cho pythaverse_main và Student cho các Satellite Sites
CREDENTIALS_DATA = [
    # 1. PYTHAVERSE MAIN — FULL 7 ROLES
    {"site_id": "pythaverse_main", "role_label": "Admin",        "username": "adminworkspace",       "raw_pass": "Dtt@123456!@#", "target_route": "/admin-workspace"},
    {"site_id": "pythaverse_main", "role_label": "Sales Admin",  "username": "adminworkspace",       "raw_pass": "Dtt@123456!@#", "target_route": "https://pythaverse.space/sales-admin-workspace/dashboard"},
    {"site_id": "pythaverse_main", "role_label": "Distributor",  "username": "testdistributor", "raw_pass": "PTV@2024", "target_route": "/distributor-workspace"},
    {"site_id": "pythaverse_main", "role_label": "Partner",      "username": "partnerdtte",     "raw_pass": "Leanbot@2024", "target_route": "/partner-workspace"},
    {"site_id": "pythaverse_main", "role_label": "School",       "username": "htdttemd",      "raw_pass": "Leanbot@2024", "target_route": "/school-workspace"},
    {"site_id": "pythaverse_main", "role_label": "Teacher",      "username": "gvdttemd",     "raw_pass": "Leanbot@2024", "target_route": "/teacher-workspace"},
    {"site_id": "pythaverse_main", "role_label": "Student",      "username": "hsdttemd",    "raw_pass": "Leanbot@2024", "target_route": "/student-workspace"},

    # 2. SATELLITE SITES — STUDENT CHECK
    {"site_id": "ide",         "role_label": "Student", "username": "hsdttemd", "raw_pass": "Leanbot@2024", "target_route": "/#/"},
    {"site_id": "avatar",      "role_label": "Student", "username": "hsdttemd", "raw_pass": "Leanbot@2024", "target_route": "/"},
    {"site_id": "note",        "role_label": "Student", "username": "hsdttemd", "raw_pass": "Leanbot@2024", "target_route": "/"},
    {"site_id": "git",         "role_label": "Student", "username": "hsdttemd", "raw_pass": "Leanbot@2024", "target_route": "/dashboard/repos"},
    {"site_id": "contest",     "role_label": "Student", "username": "hsdttemd", "raw_pass": "Leanbot@2024", "target_route": "/contest"},
    {"site_id": "digitaltwin", "role_label": "Student", "username": "hsdttemd", "raw_pass": "Leanbot@2024", "target_route": "/"},
    {"site_id": "learn",       "role_label": "Student", "username": "hsdttemd", "raw_pass": "Leanbot@2024", "target_route": "/my/"},
    {"site_id": "learn_s",     "role_label": "Student", "username": "hsdttemd", "raw_pass": "Leanbot@2024", "target_route": "/my/"},
    {"site_id": "iot",         "role_label": "Student", "username": "hsdttemd", "raw_pass": "Leanbot@2024", "target_route": "/"},
]

def seed():
    print("🌱 Đang mã hóa Fernet và nạp danh sách tài khoản test vào Supabase...")
    count = 0
    for item in CREDENTIALS_DATA:
        raw_pwd = item.get("raw_pass") or item.get("password") or "Ptv@2026"
        enc_pass = cipher.encrypt(raw_pwd.encode()).decode("utf-8")
        
        # Đọc an toàn chống KeyError
        target_path = item.get("expected_path") or item.get("target_route") or "/"
        site_id = item.get("site_id", "")
        role_label = item.get("role_label", "Student")
        username = item.get("username", "")

        # Kiểm tra xem bản ghi đã tồn tại chưa để update hoặc insert
        existing = supabase.table("site_monitor_credentials")\
            .select("id")\
            .eq("site_id", site_id)\
            .eq("role_label", role_label)\
            .execute()

        payload = {
            "site_id": site_id,
            "role_label": role_label,
            "username": username,
            "encrypted_password": enc_pass,
            "expected_path": target_path,
            "is_active": True,
            "details": "Chưa kiểm tra lần nào",
            "last_status": "UNKNOWN"
        }

        if existing.data and len(existing.data) > 0:
            rec_id = existing.data[0]["id"]
            supabase.table("site_monitor_credentials").update(payload).eq("id", rec_id).execute()
        else:
            supabase.table("site_monitor_credentials").insert(payload).execute()
        count += 1

    print(f"✨ THÀNH CÔNG RỰC RỠ RỒI ANH ƠI! Đã nạp và mã hóa an toàn {count} tài khoản vào bảng `site_monitor_credentials` trên Supabase! 🎉")

if __name__ == "__main__":
    seed()