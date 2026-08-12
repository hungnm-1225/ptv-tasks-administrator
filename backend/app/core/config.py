from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "Pythaverse Central Admin & Automation Hub"
    API_V1_STR: str = "/api/v1"
    ENV: str = "development"
    ALLOWED_DOMAIN: str = "dtt.vn"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Gemini AI
    GEMINI_API_KEY: str = ""
    GEMINI_PRIMARY_MODEL: str = "gemini-2.5-flash"
    GEMINI_FALLBACK_MODEL: str = "gemini-1.5-flash"

    # Telegram Bot
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_ADMIN_CHAT_ID: Optional[str] = None

    # Keycloak
    KEYCLOAK_SERVER_URL: str = ""
    KEYCLOAK_REALM: str = "master"
    KEYCLOAK_CLIENT_ID: str = "admin-cli"
    KEYCLOAK_ADMIN_USER: str = "admin"
    KEYCLOAK_ADMIN_PASS: str = ""

    # GitHub
    GITHUB_PAT: str = ""
    GITHUB_DEFAULT_OWNER: str = ""
    GITHUB_DEFAULT_REPO: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
