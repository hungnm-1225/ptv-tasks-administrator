import logging
import re
from email.utils import parseaddr
from typing import List, Dict, Any, Optional
from keycloak import KeycloakAdmin
from app.core.config import settings

logger = logging.getLogger(__name__)

def clean_email_identifier(raw: Any) -> str:
    """Tự động bóc tách email sạch từ chuỗi 'Họ Tên <email@dtt.vn>' hoặc 'email@dtt.vn'"""
    if not raw or not isinstance(raw, str):
        return ""
    
    # 1. Dùng parseaddr bóc tách nếu có dạng "Name" <email>
    _, parsed_email = parseaddr(raw)
    if parsed_email and "@" in parsed_email:
        return parsed_email.strip().lower()
    
    # 2. Dùng regex tìm kiếm email
    match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', raw)
    if match:
        return match.group(0).strip().lower()
        
    return raw.strip().lower()


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

    def find_user_exact(self, raw_identifier: str) -> Optional[Dict[str, Any]]:
        clean_id = clean_email_identifier(raw_identifier)
        if not clean_id:
            return None

        client = self._get_admin_client()

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
            u_email = (u.get('email') or '').strip().lower()
            u_name = (u.get('username') or '').strip().lower()
            if u_email == clean_id or u_name == clean_id:
                return u

        return None

    def execute_bulk_operations(
        self,
        identifiers: List[str],
        action_type: str = "bulk_both",
        target_status: Optional[str] = None,
        password_option: str = "email_lowercase",
        custom_password: Optional[str] = None,
        temporary: bool = False
    ) -> Dict[str, Any]:
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
            clean_id = clean_email_identifier(raw_id)
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
                # Cập nhật Enabled & Verified
                user_payload = {}
                if desired_enabled is not None:
                    user_payload["enabled"] = desired_enabled
                    logs.append(f"Set enabled={desired_enabled}")

                if action_type in ["bulk_verify", "bulk_both"]:
                    user_payload["emailVerified"] = True
                    logs.append("Set emailVerified=True")

                if user_payload:
                    client.update_user(user_id=user_id, payload=user_payload)

                # Đặt lại mật khẩu
                if action_type in ["bulk_reset_pass", "bulk_both", "reset_password"]:
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
        """Tự động gom mọi định dạng payload (Single hoặc Bulk) về hàm xử lý an toàn"""
        # 1. Trích xuất danh sách identifiers
        raw_list = payload.get("identifiers") or payload.get("emails") or payload.get("users") or []
        if isinstance(raw_list, str):
            raw_list = [raw_list]

        # Nếu không có mảng, tìm trong các key đơn lẻ
        if not raw_list:
            single = payload.get("identifier") or payload.get("target_email") or payload.get("email") or payload.get("username")
            if single:
                raw_list = [single]

        if not raw_list:
            return {"status": "failed", "message": "Không tìm thấy thông tin email/username trong payload"}

        # 2. Bóc tách các tham số cấu hình
        action = payload.get("action") or payload.get("action_type") or "bulk_both"
        target_status = payload.get("target_status")
        if not target_status:
            if action == "enable_user":
                target_status = "enabled"
            elif action == "disable_user":
                target_status = "disabled"

        password_option = payload.get("password_option") or "email_lowercase"
        custom_pass = payload.get("new_password") or payload.get("temp_pass")
        if custom_pass and password_option == "email_lowercase" and custom_pass != "email_lowercase":
            # Nếu truyền pass cụ thể (như Ptv@2026) thì nhận custom
            password_option = "custom"

        temporary = payload.get("temporary", False)

        return self.execute_bulk_operations(
            identifiers=raw_list,
            action_type=action,
            target_status=target_status,
            password_option=password_option,
            custom_password=custom_pass,
            temporary=temporary
        )


keycloak_service = KeycloakService()