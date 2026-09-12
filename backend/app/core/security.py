# backend/app/core/security.py
import jwt
from typing import Dict, Optional
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

security_bearer = HTTPBearer(auto_error=False)
_jwks_clients: Dict[str, jwt.PyJWKClient] = {}


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


def _resolved_jwks_url() -> str:
    """Use an explicit key-set URL or the standard Supabase Auth endpoint."""
    if settings.JWT_JWKS_URL:
        return settings.JWT_JWKS_URL
    if settings.SUPABASE_URL:
        return f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return ""


def _verification_key_for_token(token: str, algorithms: list[str]):
    """Select a verifier from the token's permitted algorithm, never its claims.

    HS tokens can only be checked with the secret held by the backend.  RS/ES
    tokens use the issuer's JWKS, whose `kid` is selected by PyJWT.
    """
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="JWT header is invalid.") from exc

    if algorithm not in algorithms:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"JWT algorithm '{algorithm}' is not allowed by backend configuration.",
        )
    if algorithm.startswith("HS"):
        key = settings.JWT_SECRET_KEY or settings.SUPABASE_JWT_SECRET
        if not key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="JWT verification key is not configured. Set SUPABASE_JWT_SECRET for HS256 tokens.",
            )
        return key

    if settings.JWT_PUBLIC_KEY:
        return settings.JWT_PUBLIC_KEY

    jwks_url = _resolved_jwks_url()
    if not jwks_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT verification key is not configured. Set JWT_PUBLIC_KEY or JWT_JWKS_URL.",
        )
    try:
        client = _jwks_clients.setdefault(jwks_url, jwt.PyJWKClient(jwks_url))
        return client.get_signing_key_from_jwt(token).key
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to resolve the JWT signing key from Supabase JWKS.",
        ) from exc


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

    token = credentials.credentials
    algorithms = list(settings.JWT_ALGORITHMS or [])
    verification_key = _verification_key_for_token(token, algorithms)
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
