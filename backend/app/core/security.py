# backend/app/core/security.py
import jwt
from typing import Optional
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

security_bearer = HTTPBearer(auto_error=False)
_jwks_client: Optional[jwt.PyJWKClient] = None


def verify_dtt_domain_email(email: str) -> bool:
    """Kiểm tra email bắt buộc phải thuộc whitelist domain @dtt.vn."""
    if not email or "@" not in email:
        return False
    domain = email.split("@")[-1].lower()
    allowed = getattr(settings, "ALLOWED_DOMAIN", "dtt.vn").lower()
    return domain == allowed


def _resolved_issuer() -> str:
    """Use explicit IdP configuration, or the standard Supabase issuer."""
    if settings.JWT_ISSUER:
        return settings.JWT_ISSUER.rstrip("/")
    if settings.SUPABASE_URL:
        return f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1"
    return ""


def _resolved_audience() -> str:
    # Supabase access tokens for signed-in users use `authenticated` unless
    # the project is deliberately configured with a different audience.
    return settings.JWT_AUDIENCE or "authenticated"


async def get_current_user_email(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
) -> str:
    """
    Verifies a JWT issued by the configured identity provider before returning an
    approver identity.  This is deliberately fail-closed: an unconfigured
    verifier is not an invitation to accept an unsigned token.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yêu cầu cung cấp Authorization Bearer token hợp lệ.",
        )

    issuer = _resolved_issuer()
    audience = _resolved_audience()
    if not issuer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT verifier is not configured.",
        )

    algorithms = list(settings.JWT_ALGORITHMS or [])
    verification_key = settings.JWT_PUBLIC_KEY
    if not verification_key and any(algorithm.startswith("HS") for algorithm in algorithms):
        verification_key = settings.JWT_SECRET_KEY or settings.SUPABASE_JWT_SECRET
    global _jwks_client
    if not verification_key and settings.JWT_JWKS_URL:
        if _jwks_client is None:
            _jwks_client = jwt.PyJWKClient(settings.JWT_JWKS_URL)
        try:
            verification_key = _jwks_client.get_signing_key_from_jwt(credentials.credentials).key
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to resolve JWT signing key.",
            ) from exc
    if not verification_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT verification key is not configured. Set SUPABASE_JWT_SECRET or JWT_JWKS_URL on the backend.",
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            key=verification_key,
            algorithms=algorithms,
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
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
