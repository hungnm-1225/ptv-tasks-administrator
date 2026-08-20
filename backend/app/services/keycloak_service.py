import logging
from typing import List, Dict, Any, Optional
from keycloak import KeycloakAdmin
from app.core.config import settings

logger = logging.getLogger(__name__)

class KeycloakService:
    def __init__(self):
        # Chuẩn hóa server url
        base_url = settings.KEYCLOAK_SERVER_URL.rstrip('/')
        if not base_url.endswith('/auth'):
            base_url += '/auth'
        self.server_url = base_url

        self.target_realm = settings.KEYCLOAK_REALM or 'idp'
        self.admin_user = settings.KEYCLOAK_ADMIN_USER
        self.admin_pass = settings.KEYCLOAK_ADMIN_PASS
        self._admin_client: Optional[KeycloakAdmin] = None

    def _get_admin_client(self) -> KeycloakAdmin:
        """Lấy hoặc làm mới kết nối Keycloak REST API"""
        if not self._admin_client:
            self._admin_client = KeycloakAdmin(
                server_url=self.server_url,
                username=self.admin_user,
                password=self.admin_pass,
                realm_name="master",
                user_realm_name=self.target_realm,
                auto_refresh_token=['get', 'post', 'put', 'delete'],
                verify=True
            )
            self._admin_client.realm_name = self.target_realm
        return self._admin_client

    def find_user_exact(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Tìm user chính xác, loại bỏ nhầm lẫn giữa mail thường và mail có prefix 'st.'"""
        client = self._get_admin_client()
        clean_id = identifier.strip().lower()

        # 1. Tìm theo Email
        users = client.get_users(query={"email": clean_id, "exact": True})
        if users:
            for u in users:
                if (u.get('email') or '').strip().lower() == clean_id:
                    return u

        # 2. Tìm theo Username
        users_by_uname = client.get_users(query={"username": clean_id, "exact": True})
        if users_by_uname:
            for u in users_by_uname:
                if (u.get('username') or '').strip().lower() == clean_id:
                    return u

        # 3. Fallback tìm kiếm chung
        fallback = client.get_users(query={"search": clean_id})
        for u in fallback:
            if (u.get('email') or '').strip().lower() == clean_id or (u.get('username') or '').strip().lower() == clean_id:
                return u

        return None

    def execute_bulk_operations(
        self,
        identifiers: List[str],
        action_type: str,                   # 'bulk_reset_pass' | 'bulk_verify' | 'bulk_both' | 'bulk_set_status'
        target_status: Optional[str] = None, # 'enabled' | 'disabled' | None (Gán trạng thái tuyệt đối)
        password_option: str = "email_lowercase", # 'email_lowercase' | 'default_secure' | 'custom'
        custom_password: Optional[str] = None,
        temporary: bool = False
    ) -> Dict[str, Any]:
        """
        Xử lý Bulk chính xác 100%:
        - Không đảo toggle mà gán trực tiếp trạng thái mong muốn (Enabled hoặc Disabled).
        - Đổi mật khẩu về lowercase email hoặc Pythaverse@2026.
        """
        client = self._get_admin_client()
        results = []
        success_count = 0
        failed_count = 0

        # Xác định rõ trạng thái boolean mong muốn (Không phụ thuộc trạng thái cũ)
        desired_enabled: Optional[bool] = None
        if target_status == "enabled":
            desired_enabled = True
        elif target_status == "disabled":
            desired_enabled = False

        for raw_id in identifiers:
            ident = raw_id.strip()
            if not ident:
                continue

            user = self.find_user_exact(ident)
            if not user:
                failed_count += 1
                results.append({
                    "identifier": ident,
                    "status": "failed",
                    "message": "Không tìm thấy tài khoản chính xác trên Keycloak"
                })
                continue

            user_id = user["id"]
            user_email = (user.get("email") or ident).strip().lower()
            logs = []

            try:
                # 1. CẬP NHẬT TRẠNG THÁI (ENABLED/DISABLED & EMAIL VERIFIED)
                user_payload = {}
                
                # Gán thẳng giá trị tuyệt đối (Dù 8e - 2d thì tất cả đều về desired_enabled)
                if desired_enabled is not None:
                    user_payload["enabled"] = desired_enabled
                    logs.append(f"Gán trạng thái tuyệt đối: Enabled = {desired_enabled}")

                if action_type in ["bulk_verify", "bulk_both"]:
                    user_payload["emailVerified"] = True
                    logs.append("Xác thực EmailVerified = True")

                if user_payload:
                    client.update_user(user_id=user_id, payload=user_payload)

                # 2. ĐỔI MẬT KHẨU
                if action_type in ["bulk_reset_pass", "bulk_both"]:
                    if password_option == "email_lowercase":
                        pass_val = user_email  # Mật khẩu chính là email chữ thường
                    elif password_option == "default_secure":
                        pass_val = "Pythaverse@2026"
                    else:
                        pass_val = custom_password or user_email

                    client.set_user_password(
                        user_id=user_id,
                        password=pass_val,
                        temporary=temporary
                    )
                    logs.append(f"Đã đặt lại mật khẩu ({password_option}) - Temporary={temporary}")

                success_count += 1
                results.append({
                    "identifier": ident,
                    "user_id": user_id,
                    "status": "success",
                    "logs": " | ".join(logs)
                })

            except Exception as e:
                failed_count += 1
                logger.error(f"Lỗi Keycloak bulk cho {ident}: {str(e)}")
                results.append({
                    "identifier": ident,
                    "status": "failed",
                    "message": str(e)
                })

        return {
            "total": len(identifiers),
            "success_count": success_count,
            "failed_count": failed_count,
            "details": results
        }