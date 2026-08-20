import logging
from typing import List, Dict, Any, Optional
from keycloak import KeycloakAdmin
from app.core.config import settings

logger = logging.getLogger(__name__)

class KeycloakService:
    def __init__(self):
        # Chuẩn hóa server url đảm bảo có đuôi /auth
        base_url = settings.KEYCLOAK_SERVER_URL.rstrip('/')
        if not base_url.endswith('/auth'):
            base_url += '/auth'
        self.server_url = base_url

        self.target_realm = settings.KEYCLOAK_REALM or 'idp'
        self.admin_user = settings.KEYCLOAK_ADMIN_USER
        self.admin_pass = settings.KEYCLOAK_ADMIN_PASS
        self.client_id = settings.KEYCLOAK_CLIENT_ID or 'admin-cli'
        self._admin_client: Optional[KeycloakAdmin] = None

    def _get_admin_client(self) -> KeycloakAdmin:
        """Lấy hoặc làm mới kết nối Keycloak REST API qua OpenID Connect"""
        if not self._admin_client:
            # Đã loại bỏ tham số auto_refresh_token thừa
            self._admin_client = KeycloakAdmin(
                server_url=self.server_url,
                username=self.admin_user,
                password=self.admin_pass,
                realm_name="master",
                user_realm_name=self.target_realm,
                client_id=self.client_id,
                verify=True
            )
            # Chuyển ngữ cảnh sang realm idp
            self._admin_client.realm_name = self.target_realm
        return self._admin_client

    def find_user_exact(self, identifier: str) -> Optional[Dict[str, Any]]:
        """
        Tìm kiếm người dùng chính xác (Exact Match):
        Phân biệt tuyệt đối giữa email thật và email học sinh tập huấn có tiền tố 'st.'
        """
        client = self._get_admin_client()
        clean_id = identifier.strip().lower()

        # 1. Tìm theo Email chính xác
        users = client.get_users(query={"email": clean_id, "exact": True})
        if users:
            for u in users:
                if (u.get('email') or '').strip().lower() == clean_id:
                    return u

        # 2. Tìm theo Username chính xác
        users_by_uname = client.get_users(query={"username": clean_id, "exact": True})
        if users_by_uname:
            for u in users_by_uname:
                if (u.get('username') or '').strip().lower() == clean_id:
                    return u

        # 3. Fallback tìm kiếm chung nhưng duyệt lọc chính xác
        fallback = client.get_users(query={"search": clean_id})
        for u in fallback:
            u_email = (u.get('email') or '').strip().lower()
            u_name = (u.get('username') or '').strip().lower()
            if u_email == clean_id or u_name == clean_id:
                return u

        return None

    def execute_bulk_operations(
        self,
        identifiers: List[str],
        action_type: str,                          # 'bulk_reset_pass' | 'bulk_verify' | 'bulk_both' | 'bulk_set_status'
        target_status: Optional[str] = None,        # 'enabled' | 'disabled' | None
        password_option: str = "email_lowercase",   # 'email_lowercase' | 'default_secure' | 'custom'
        custom_password: Optional[str] = None,
        temporary: bool = False
    ) -> Dict[str, Any]:
        """
        Xử lý Bulk chính xác 100%:
        - Gán trạng thái tuyệt đối (Enabled hoặc Disabled)
        - Đổi mật khẩu về lowercase email hoặc Pythaverse@2026
        """
        client = self._get_admin_client()
        results = []
        success_count = 0
        failed_count = 0

        # Gán giá trị boolean tuyệt đối
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
                    "message": f"Không tìm thấy tài khoản chính xác: {ident}"
                })
                continue

            user_id = user["id"]
            user_email = (user.get("email") or ident).strip().lower()
            logs = []

            try:
                # 1. CẬP NHẬT TRẠNG THÁI (ENABLED / DISABLED & VERIFIED)
                user_payload = {}
                if desired_enabled is not None:
                    user_payload["enabled"] = desired_enabled
                    logs.append(f"Set enabled={desired_enabled}")

                if action_type in ["bulk_verify", "bulk_both"]:
                    user_payload["emailVerified"] = True
                    logs.append("Set emailVerified=True")

                if user_payload:
                    client.update_user(user_id=user_id, payload=user_payload)

                # 2. ĐẶT LẠI MẬT KHẨU
                if action_type in ["bulk_reset_pass", "bulk_both"]:
                    if password_option == "email_lowercase":
                        pass_val = user_email
                    elif password_option == "default_secure":
                        pass_val = "Pythaverse@2026"
                    else:
                        pass_val = custom_password or user_email

                    client.set_user_password(
                        user_id=user_id,
                        password=pass_val,
                        temporary=temporary
                    )
                    logs.append(f"Reset pass ({password_option}) - Temporary={temporary}")

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

    def execute_account_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Hàm tương thích ngược để tasks.py và bot_executor.py gọi trực tiếp
        """
        # Nếu là payload bulk
        if "identifiers" in payload or payload.get("action_type", "").startswith("bulk_"):
            return self.execute_bulk_operations(
                identifiers=payload.get("identifiers", []),
                action_type=payload.get("action_type", "bulk_both"),
                target_status=payload.get("target_status"),
                password_option=payload.get("password_option", "email_lowercase"),
                custom_password=payload.get("new_password"),
                temporary=payload.get("temporary", False)
            )

        # Nếu là payload đơn lẻ
        ident = payload.get("identifier") or payload.get("email") or payload.get("username")
        action = payload.get("action", "reset_password")
        new_pass = payload.get("new_password")
        temporary = payload.get("temporary", False)
        
        user = self.find_user_exact(ident)
        if not user:
            return {"status": "failed", "message": f"Không tìm thấy tài khoản: {ident}"}

        user_id = user["id"]
        client = self._get_admin_client()

        try:
            if action in ["reset_password", "change_password"]:
                pass_to_set = new_pass or (user.get("email") or ident).strip().lower()
                client.set_user_password(user_id=user_id, password=pass_to_set, temporary=temporary)
                return {"status": "success", "message": f"Đã reset mật khẩu cho {ident} thành công"}

            elif action == "disable_user":
                client.update_user(user_id=user_id, payload={"enabled": False})
                return {"status": "success", "message": f"Đã vô hiệu hóa tài khoản {ident}"}

            elif action == "enable_user":
                client.update_user(user_id=user_id, payload={"enabled": True})
                return {"status": "success", "message": f"Đã kích hoạt tài khoản {ident}"}

            elif action == "verify_email":
                client.update_user(user_id=user_id, payload={"emailVerified": True})
                return {"status": "success", "message": f"Đã xác thực email cho {ident}"}

            return {"status": "failed", "message": f"Action không hợp lệ: {action}"}
        except Exception as e:
            return {"status": "failed", "message": str(e)}


# 📌 Khởi tạo Singleton instance
keycloak_service = KeycloakService()