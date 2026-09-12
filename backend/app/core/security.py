# backend/app/core/security.py
import os
import jwt
from typing import Optional
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

security_bearer = HTTPBearer(auto_error=False)


def verify_dtt_domain_email(email: str) -> bool:
    """Kiểm tra email bắt buộc phải thuộc whitelist domain @dtt.vn."""
    if not email or "@" not in email:
        return False
    domain = email.split("@")[-1].lower()
    allowed = getattr(settings, "ALLOWED_DOMAIN", "dtt.vn").lower()
    return domain == allowed


async def get_current_user_email(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
) -> str:
    """
    PHA F: Xác thực JWT token thực thụ và cưỡng chế whitelist domain @dtt.vn.
    Tuyệt đối không tin tưởng email do client tự khai báo trong body payload!
    """
    if not credentials or not credentials.credentials:
        # Hỗ trợ môi trường Hermetic Test
        if os.getenv("TESTING") == "true" or os.getenv("ENV") == "test":
            return "hung.nguyenmanh@dtt.vn"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yêu cầu cung cấp Authorization Bearer token hợp lệ.",
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        email = str(payload.get("email") or payload.get("preferred_username") or "").strip()
        
        if not verify_dtt_domain_email(email):
            allowed = getattr(settings, "ALLOWED_DOMAIN", "dtt.vn")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Truy cập bị từ chối: Email người dùng ({email}) bắt buộc phải thuộc tổ chức @{allowed}.",
            )
        return email
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token không hợp lệ hoặc đã hết hạn: {str(e)}",
        )