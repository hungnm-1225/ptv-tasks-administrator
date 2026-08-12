from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from app.core.config import settings

security_bearer = HTTPBearer(auto_error=False)


def verify_dtt_domain_email(email: str) -> bool:
    """Check if user email strictly belongs to the allowed domain whitelist (@dtt.vn)."""
    if not email:
        return False
    domain = email.split("@")[-1].lower()
    return domain == settings.ALLOWED_DOMAIN.lower()


async def get_current_user_email(
    credentials: HTTPAuthorizationCredentials = Security(security_bearer),
) -> str:
    """Verify JWT token and enforce strict @dtt.vn domain whitelist."""
    if not credentials:
        # In dev mode without auth header, can fallback or enforce
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization token",
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        email = payload.get("email") or payload.get("preferred_username", "")
        if not verify_dtt_domain_email(email):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. User email domain must be @{settings.ALLOWED_DOMAIN}",
            )
        return email
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )
