# backend/app/core/config.py
from typing import Optional, List, Any
import pytz
from datetime import datetime
from pydantic_settings import BaseSettings

# Đặt biến Múi giờ Việt Nam và hàm tiện ích chuẩn hóa thời gian duy nhất toàn hệ thống
VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")

def get_utc_now() -> datetime:
    """Trả về đối tượng datetime UTC chuẩn."""
    return datetime.now(pytz.utc)

def get_utc_iso() -> str:
    """Trả về chuỗi thời gian ISO UTC (Source of Truth trong Database)."""
    return datetime.now(pytz.utc).isoformat()

def get_vn_time_str(fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """Trả về chuỗi thời gian định dạng YYYY-MM-DD HH:MM:SS theo giờ Việt Nam."""
    return datetime.now(VN_TZ).strftime(fmt)

def get_vn_iso() -> str:
    """Trả về chuỗi thời gian ISO theo giờ Việt Nam."""
    return datetime.now(VN_TZ).isoformat()

def to_vn_time_str(val: Any, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """Chuyển đổi mọi đối tượng datetime / chuỗi ISO UTC sang chuỗi giờ Việt Nam (GMT+7)."""
    if not val:
        return datetime.now(VN_TZ).strftime(fmt)
    if isinstance(val, str):
        clean_str = val.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(clean_str)
            if dt.tzinfo is None:
                dt = pytz.utc.localize(dt)
            return dt.astimezone(VN_TZ).strftime(fmt)
        except Exception:
            return str(val)[:19].replace("T", " ")
    elif isinstance(val, datetime):
        if val.tzinfo is None:
            val = pytz.utc.localize(val)
        return val.astimezone(VN_TZ).strftime(fmt)
    return str(val)


class Settings(BaseSettings):
    # --- CẤU HÌNH HỆ THỐNG ---
    PROJECT_NAME: str = "Pythaverse Central Admin & Automation Hub"
    API_V1_STR: str = "/api/v1"
    ENV: str = "development"
    ALLOWED_DOMAIN: str = "dtt.vn"
    VAULT_SECRET_KEY: str = ""

    # --- SUPABASE POSTGRESQL & STORAGE ---
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # --- GOOGLE GEMINI AI (THẾ HỆ MỚI NHẤT) ---
    GEMINI_API_KEY: str = ""
    GEMINI_PRIMARY_MODEL: str = "gemini-3.8-flash"
    GEMINI_FALLBACK_MODEL: str = "gemini-3.7-flash"
    GEMINI_MODELS: List[str] = [
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-pro-preview",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ]

    # --- KEYCLOAK IDENTITY IDP ---
    KEYCLOAK_SERVER_URL: str = ""
    KEYCLOAK_REALM: str = "master"
    KEYCLOAK_CLIENT_ID: str = "admin-cli"
    KEYCLOAK_ADMIN_USER: str = "admin"
    KEYCLOAK_ADMIN_PASS: str = ""

    # --- PYTHAVERSE GIT (GITBUCKET ENGINE) ---
    GIT_SERVER_URL: str = "https://git.pythaverse.space"
    GIT_ADMIN_USER: str = "ptvadmin"
    GIT_ADMIN_PASS: str = ""

    # --- OS TICKET HELPDESK ENGINE ---
    OSTICKET_URL: str = "https://support.pythaverse.space"
    OSTICKET_ADMIN_USER: str = ""
    OSTICKET_ADMIN_PASS: str = ""

    # --- GITHUB ISSUE DISPATCHER ---
    GITHUB_PAT: str = ""
    GITHUB_DEFAULT_OWNER: str = ""
    GITHUB_DEFAULT_REPO: str = ""

    # --- GOOGLE WORKSPACE, SHEETS & DOCS & DRIVE ---
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GMAIL_REFRESH_TOKEN: str = ""
    GOOGLE_CREDENTIALS_JSON: str = ""
    SPREADSHEET_ID: str = "1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go"
    COF_ROOT_FOLDER_ID: str = "1SEh4I9yJRM8JNi_SC9CltpkyDYeG-I--"

    # --- LIVE SITE MONITOR & WORKSPACE RPA ---
    KEYCLOAK_URL: str = "https://eid.pythaverse.space/auth"
    TEST_ADMIN_USER: str = "admin_test_user"
    TEST_ADMIN_PASS: str = "admin_test_password"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()