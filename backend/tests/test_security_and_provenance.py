import asyncio

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core.config import settings
from app.core.security import get_current_user_email


def _set_test_jwt_config(monkeypatch):
    monkeypatch.setattr(settings, "JWT_ISSUER", "https://issuer.example.test")
    monkeypatch.setattr(settings, "JWT_AUDIENCE", "ptv-admin")
    monkeypatch.setattr(settings, "JWT_ALGORITHMS", ["HS256"])
    monkeypatch.setattr(settings, "JWT_PUBLIC_KEY", "")
    monkeypatch.setattr(settings, "JWT_SECRET_KEY", "test-signing-key")


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_approval_identity_rejects_forged_unsigned_token(monkeypatch):
    _set_test_jwt_config(monkeypatch)
    forged = jwt.encode(
        {
            "sub": "attacker",
            "email": "attacker@dtt.vn",
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
            "exp": 4_102_444_800,
        },
        key="wrong-key",
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user_email(_credentials(forged)))

    assert exc.value.status_code == 401


def test_approval_identity_accepts_only_signed_configured_issuer(monkeypatch):
    _set_test_jwt_config(monkeypatch)
    token = jwt.encode(
        {
            "sub": "hung",
            "email": "hung@dtt.vn",
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
            "exp": 4_102_444_800,
        },
        key=settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )

    assert asyncio.run(get_current_user_email(_credentials(token))) == "hung@dtt.vn"
