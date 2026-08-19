# backend/app/core/config.py
from typing import Optional, List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- CẤU HÌNH HỆ THỐNG ---
    PROJECT_NAME: str = "Pythaverse Central Admin & Automation Hub"
    API_V1_STR: str = "/api/v1"
    ENV: str = "development"
    ALLOWED_DOMAIN: str = "dtt.vn"

    # --- SUPABASE POSTGRESQL & STORAGE ---
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # --- GOOGLE GEMINI AI (THẾ HỆ MỚI NHẤT) ---
    GEMINI_API_KEY: str = ""
    GEMINI_PRIMARY_MODEL: str = "gemini-3.7-flash"
    GEMINI_FALLBACK_MODEL: str = "gemini-3.5-flash"
    GEMINI_MODELS: List[str] = [
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-3.1-pro-preview",
        "gemini-3-flash-preview",
        "gemini-pro-latest",
        "gemini-flash-latest",
        "gemini-flash-lite-latest"
    ]

    # --- TELEGRAM BOT & NOTIFICATION ---
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_ADMIN_CHAT_ID: Optional[str] = None

    # --- KEYCLOAK IDENTITY IDP ---
    KEYCLOAK_SERVER_URL: str = ""
    KEYCLOAK_REALM: str = "master"
    KEYCLOAK_CLIENT_ID: str = "admin-cli"
    KEYCLOAK_ADMIN_USER: str = "admin"
    KEYCLOAK_ADMIN_PASS: str = ""

    # --- OS TICKET HELPDESK ENGINE ---
    OSTICKET_URL: str = "https://support.pythaverse.space"
    OSTICKET_ADMIN_USER: str = ""
    OSTICKET_ADMIN_PASS: str = ""

    # --- GITHUB ISSUE DISPATCHER ---
    GITHUB_PAT: str = ""
    GITHUB_DEFAULT_OWNER: str = ""
    GITHUB_DEFAULT_REPO: str = ""

    # --- GOOGLE WORKSPACE, SHEETS & DOCS ---
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GMAIL_REFRESH_TOKEN: str = ""
    GOOGLE_CREDENTIALS_JSON: str = ""
    SPREADSHEET_ID: str = "1rZgFBD2PuZWL1jvQefcYZztCQvo99Lhx0GATTKvj1Go"

    # --- LIVE SITE MONITOR & WORKSPACE RPA ---
    KEYCLOAK_URL: str = "https://eid.pythaverse.space/auth"
    TEST_ADMIN_USER: str = "admin_test_user"
    TEST_ADMIN_PASS: str = "admin_test_password"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()