# backend/app/services/keycloak_service.py
import logging
from typing import Dict, Any, List, Optional
from keycloak import KeycloakAdmin
from app.core.config import settings

logger = logging.getLogger(__name__)


class KeycloakService:
    """Wrapper tương tác Keycloak Admin REST API quản trị tài khoản người dùng."""

    def __init__(self):
        self.server_url = settings.KEYCLOAK_SERVER_URL
        self.realm_name = getattr(settings, "KEYCLOAK_REALM", "idp")
        self.admin_user = settings.KEYCLOAK_ADMIN_USER
        self.admin_pass = settings.KEYCLOAK_ADMIN_PASS
        self.client_id = getattr(settings, "KEYCLOAK_CLIENT_ID", "admin-cli")

    def _get_admin_client(self) -> KeycloakAdmin:
        """Khởi tạo đối tượng KeycloakAdmin kết nối tới server."""
        # Chuẩn hóa server_url (đảm bảo có /auth nếu cần)
        url = self.server_url.rstrip("/")
        if not url.endswith("/auth") and "pythaverse" in url:
            url += "/auth/"
        else:
            url += "/"

        return KeycloakAdmin(
            server_url=url,
            username=self.admin_user,
            password=self.admin_pass,
            realm_name=self.realm_name,
            user_realm_name="master",
            client_id=self.client_id,
            verify=True,
            auto_refresh_token_seconds=60
        )

    def _find_user_id(self, keycloak_admin: KeycloakAdmin, identifier: str) -> Optional[str]:
        """Tìm user_id trong Keycloak dựa theo email hoặc username."""
        # Thử tìm theo email trước
        users = keycloak_admin.get_users(query={"email": identifier, "exact": True})
        if users:
            return users[0]["id"]
        
        # Thử tìm theo username
        users = keycloak_admin.get_users(query={"username": identifier, "exact": True})
        if users:
            return users[0]["id"]
            
        return None

    async def execute_account_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Thực thi hành động quản trị tài khoản Keycloak sau khi Admin bấm Approve."""
        action = payload.get("action", "reset_password")
        target_email = payload.get("target_email") or payload.get("email") or payload.get("username")
        temp_pass = payload.get("temp_pass", "Ptv@2026")
        
        if not target_email:
            return {
                "status": "failed",
                "error": "Thiếu thông tin email hoặc username mục tiêu trong payload."
            }

        # Nếu chưa cấu hình mật khẩu Admin Keycloak trong .env -> Chạy chế độ mô phỏng an toàn
        if not self.admin_pass or self.admin_pass == "your-keycloak-admin-password":
            logger.warning("Keycloak credentials chưa được cấu hình, chạy ở chế độ Safe Simulation.")
            return {
                "status": "simulated",
                "message": f"[Mô phỏng] Đã thực hiện '{action}' cho tài khoản '{target_email}' với mật khẩu tạm '{temp_pass}' (Realm: {self.realm_name})",
                "target": target_email
            }

        try:
            admin_client = self._get_admin_client()
            user_id = self._find_user_id(admin_client, target_email)

            if not user_id:
                return {
                    "status": "failed",
                    "error": f"Không tìm thấy người dùng với email/username '{target_email}' trong Realm '{self.realm_name}'"
                }

            # 1. Đặt lại mật khẩu (Reset Password)
            if action in ["reset_password", "change_password"]:
                is_temporary = payload.get("temporary", False)
                admin_client.set_user_password(
                    user_id=user_id,
                    password=temp_pass,
                    temporary=is_temporary
                )
                logger.info(f"✅ Đã reset mật khẩu cho {target_email} thành công.")
                return {
                    "status": "success",
                    "message": f"Đã đặt lại mật khẩu mới cho '{target_email}' thành công!",
                    "action": action,
                    "target_email": target_email
                }

            # 2. Khóa tài khoản (Disable User)
            elif action == "disable_user":
                admin_client.update_user(user_id=user_id, payload={"enabled": False})
                return {
                    "status": "success",
                    "message": f"Đã vô hiệu hóa (disable) tài khoản '{target_email}' thành công.",
                    "action": action
                }

            # 3. Mở khóa tài khoản (Enable User)
            elif action == "enable_user":
                admin_client.update_user(user_id=user_id, payload={"enabled": True})
                return {
                    "status": "success",
                    "message": f"Đã kích hoạt lại (enable) tài khoản '{target_email}' thành công.",
                    "action": action
                }

            # 4. Xác thực email (Verify Email)
            elif action == "verify_email":
                admin_client.update_user(user_id=user_id, payload={"emailVerified": True})
                return {
                    "status": "success",
                    "message": f"Đã đánh dấu đã xác thực email (emailVerified=True) cho '{target_email}'.",
                    "action": action
                }

            # 5. Đổi tên hiển thị (Change Name)
            elif action == "change_display_name":
                first_name = payload.get("first_name", "")
                last_name = payload.get("last_name", "")
                admin_client.update_user(user_id=user_id, payload={
                    "firstName": first_name,
                    "lastName": last_name
                })
                return {
                    "status": "success",
                    "message": f"Đã cập nhật họ tên thành '{last_name} {first_name}' cho '{target_email}'.",
                    "action": action
                }

            else:
                return {
                    "status": "failed",
                    "error": f"Hành động '{action}' chưa được hỗ trợ trên Keycloak Service."
                }

        except Exception as e:
            logger.error(f"❌ Lỗi Keycloak Admin API: {str(e)}")
            return {
                "status": "failed",
                "error": f"Lỗi Keycloak REST API: {str(e)}"
            }


keycloak_service = KeycloakService()