import logging
import re
from typing import List, Dict, Any, Optional
from keycloak import KeycloakAdmin
from app.core.config import settings

logger = logging.getLogger(__name__)

class KeycloakService:
    def __init__(self):
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
            self._admin_client = KeycloakAdmin(
                server_url=self.server_url,
                username=self.admin_user,
                password=self.admin_pass,
                realm_name="master",
                user_realm_name=self.target_realm,
                client_id=self.client_id,
                verify=True
            )
            self._admin_client.realm_name = self.target_realm
        return self._admin_client

    @staticmethod
    def extract_clean_email(raw_input: Optional[str]) -> str:
        """
        Bóc tách email sạch từ chuỗi phức tạp
        Ví dụ: '"Hùng Nguyễn Mạnh" <htdttemd@pythaverse.net>' -> 'htdttemd@pythaverse.net'
        """
        if not raw_input:
            return ""
        
        raw_str = str(raw_input).strip()
        # Tìm email bên trong dấu <...>
        match = re.search(r'<([^>]+)>', raw_str)
        if match:
            return match.group(1).strip().lower()
        
        # Nếu là chuỗi thông thường
        return raw_str.strip().lower()

    def find_user_exact(self, identifier: Optional[str]) -> Optional[Dict[str, Any]]:
        """
        Tìm kiếm người dùng chính xác (Exact Match)
        """
        clean_id = self.extract_clean_email(identifier)
        if not clean_id:
            return None

        client = self._get_admin_client()

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

        # 3. Fallback tìm kiếm chung và duyệt lọc chính xác
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
        action_type: str,
        target_status: Optional[str] = None,
        password_option: str = "email_lowercase",
        custom_password: Optional[str] = None,
        temporary: bool = False
    ) -> Dict[str, Any]:
        """Xử lý Bulk chính xác tuyệt đối"""
        client = self._get_admin_client()
        results = []
        success_count = 0
        failed_count = 0

        desired_enabled: Optional[bool] = None
        if target_status == "enabled":
            desired_enabled = True
        elif target_status == "disabled":
            desired_enabled = False

        for raw_id in identifiers:
            clean_id = self.extract_clean_email(raw_id)
            if not clean_id:
                continue

            user = self.find_user_exact(clean_id)
            if not user:
                failed_count += 1
                results.append({
                    "identifier": clean_id,
                    "status": "failed",
                    "message": f"Không tìm thấy tài khoản: {clean_id}"
                })
                continue

            user_id = user["id"]
            user_email = (user.get("email") or clean_id).strip().lower()
            logs = []

            try:
                user_payload = {}
                if desired_enabled is not None:
                    user_payload["enabled"] = desired_enabled
                    logs.append(f"Set enabled={desired_enabled}")

                if action_type in ["bulk_verify", "bulk_both"]:
                    user_payload["emailVerified"] = True
                    logs.append("Set emailVerified=True")

                if user_payload:
                    client.update_user(user_id=user_id, payload=user_payload)

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
                    "identifier": clean_id,
                    "user_id": user_id,
                    "status": "success",
                    "logs": " | ".join(logs)
                })

            except Exception as e:
                failed_count += 1
                logger.error(f"Lỗi Keycloak bulk cho {clean_id}: {str(e)}")
                results.append({
                    "identifier": clean_id,
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
        Tiếp nhận linh hoạt mọi biến thể Payload từ AI / UI / Manual Edit
        """
        # 1. Nhận diện danh sách Bulk nếu có
        identifiers = payload.get("identifiers") or payload.get("emails") or payload.get("users")
        if identifiers and isinstance(identifiers, list):
            return self.execute_bulk_operations(
                identifiers=identifiers,
                action_type=payload.get("action_type", "bulk_both"),
                target_status=payload.get("target_status"),
                password_option=payload.get("password_option", "email_lowercase"),
                custom_password=payload.get("new_password") or payload.get("temp_pass"),
                temporary=payload.get("temporary", False)
            )

        # 2. Bóc tách thông tin cho tác vụ đơn lẻ (Đón đầu tất cả các key AI có thể sinh)
        raw_ident = (
            payload.get("target_email") or 
            payload.get("identifier") or 
            payload.get("email") or 
            payload.get("username") or
            payload.get("user")
        )
        
        clean_ident = self.extract_clean_email(raw_ident)
        if not clean_ident:
            return {
                "status": "failed", 
                "message": "Không tìm thấy trường email/username hợp lệ trong Payload (target_email, email, identifier...)"
            }

        action = payload.get("action", "reset_password")
        # Đón đầu cả new_password và temp_pass
        new_pass = payload.get("new_password") or payload.get("temp_pass") or payload.get("password")
        temporary = payload.get("temporary", False) or bool(payload.get("temp_pass"))
        
        user = self.find_user_exact(clean_ident)
        if not user:
            return {"status": "failed", "message": f"Không tìm thấy tài khoản trên Keycloak: {clean_ident}"}

        user_id = user["id"]
        client = self._get_admin_client()

        try:
            if action in ["reset_password", "change_password"]:
                pass_to_set = new_pass or (user.get("email") or clean_ident).strip().lower()
                client.set_user_password(user_id=user_id, password=pass_to_set, temporary=temporary)
                return {
                    "status": "success", 
                    "message": f"Đã reset mật khẩu cho {clean_ident} thành công (Pass: {pass_to_set}, Temporary={temporary})"
                }

            elif action == "disable_user":
                client.update_user(user_id=user_id, payload={"enabled": False})
                return {"status": "success", "message": f"Đã vô hiệu hóa tài khoản {clean_ident}"}

            elif action == "enable_user":
                client.update_user(user_id=user_id, payload={"enabled": True})
                return {"status": "success", "message": f"Đã kích hoạt tài khoản {clean_ident}"}

            elif action == "verify_email":
                client.update_user(user_id=user_id, payload={"emailVerified": True})
                return {"status": "success", "message": f"Đã xác thực email cho {clean_ident}"}

            return {"status": "failed", "message": f"Action không hợp lệ: {action}"}
        except Exception as e:
            return {"status": "failed", "message": str(e)}


# 📌 Khởi tạo Singleton Instance
keycloak_service = KeycloakService()