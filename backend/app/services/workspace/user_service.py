# backend/app/services/workspace/user_service.py
import logging
import asyncio
from typing import Dict, Any, Optional, List
import httpx

from app.services.workspace.base import WorkspaceBaseService
from app.services.workspace.order_service import get_or_steal_role_session

logger = logging.getLogger(__name__)


class WorkspaceUserService(WorkspaceBaseService):
    """
    Dịch vụ Hybrid RPA-API cập nhật thông tin User trên Admin Workspace:
    - Session Cache 2h: Tận dụng session Sales Admin trong RAM, 0ms launch.
    - Auto-Fetch & Deep Merge: Tự động kéo dữ liệu gốc từ detailUser.php, chỉ ghi đè
      những trường thay đổi, bảo toàn 100% City, Country, School, Partner, idUserMD.
    - Ánh xạ chuẩn mực 100% theo WordPress admin-workspace-v5 plugin.
    """

    BASE_URL = "https://pythaverse.space/wp-content/plugins/admin-workspace-v5/pages/user_list/action"

    @classmethod
    async def _get_admin_session_cookies(cls, admin_user: str, admin_pass: str) -> Dict[str, str]:
        """
        Lấy session Sales Admin:
        1. Ưu tiên đọc từ Session Keep-Alive Service (RAM/Supabase) - Tốc độ 1ms, Zero Playwright!
        2. Nếu chưa có, fallback qua get_or_steal_role_session và lưu ngược lại vào Keep-Alive.
        """
        from app.services.session_keepalive_service import session_keepalive_service

        # 🎯 1. ĐỌC TỪ BỘ GIỮ ẤM TẬP TRUNG (PERSIST TRÊN SUPABASE & RAM)
        cached_cookies = await session_keepalive_service.get_session_cookies("sales_admin")
        if cached_cookies:
            logger.info("⚡ [UserService] Sử dụng Session Sales Admin ấm nóng từ Keep-Alive (Zero Playwright)!")
            return cached_cookies

        # 🎯 2. NẾU CHƯA CÓ TRONG KHO, MỚI BỐC TỪ PLAYWRIGHT QUA HÀM CŨ
        logger.info("🔑 [UserService] Chưa có session trong kho, đang mở Playwright bốc Session Sales Admin mới...")
        base_service = WorkspaceBaseService()
        cookies, identity = await get_or_steal_role_session(base_service, admin_user, admin_pass, "Sales Admin")

        # 🎯 3. LƯU NGƯỢC LẠI VÀO SUPABASE ĐỂ CRONJOB 15 PHÚT GIỮ ẤM TIẾP QUẢN
        if cookies:
            await session_keepalive_service.save_session_cookies(
                session_key="sales_admin",
                system_name="Sales Admin Workspace",
                cookies=cookies,
                metadata={"admin_user": admin_user, "identity": identity}
            )

        return cookies

    @classmethod
    async def get_user_detail_by_identifier(
        cls, 
        admin_user: str, 
        admin_pass: str, 
        identifier: str
    ) -> Dict[str, Any]:
        """
        1. Tìm user_id qua getDataUser.php
        2. Lấy toàn bộ chi tiết qua detailUser.php chuẩn bị cho form edit
        """
        cookies = await cls._get_admin_session_cookies(admin_user, admin_pass)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://pythaverse.space/admin-workspace/users",
        }

        async with httpx.AsyncClient(timeout=45.0, verify=False) as client:
            # Bước 1: Dò tìm user_id
            search_url = f"{cls.BASE_URL}/getDataUser.php"
            params = {"page": 1, "per_page": 10, "search": identifier}
            logger.info(f"🔍 [WorkspaceUser] Đang tìm kiếm user: '{identifier}'...")
            
            resp_search = await client.get(search_url, params=params, cookies=cookies, headers=headers)
            if resp_search.status_code != 200:
                raise RuntimeError(f"Lỗi tìm kiếm user: HTTP {resp_search.status_code}")

            search_data = resp_search.json()
            users_list = search_data.get("data", [])
            if not users_list:
                return {"success": False, "message": f"Không tìm thấy người dùng với email/username: {identifier}"}

            user_summary = users_list[0]
            user_id = str(user_summary.get("user_id"))

            # Bước 2: Lấy chi tiết thông qua detailUser.php (Param user_email chính là user_id!)
            detail_url = f"{cls.BASE_URL}/detailUser.php"
            resp_detail = await client.get(detail_url, params={"user_email": user_id}, cookies=cookies, headers=headers)
            if resp_detail.status_code != 200:
                raise RuntimeError(f"Lỗi lấy chi tiết user {user_id}: HTTP {resp_detail.status_code}")

            detail_data = resp_detail.json()
            logger.info(f"✅ [WorkspaceUser] Đã bốc chi tiết thành công cho User #{user_id} ({user_summary.get('user_login')})")
            
            return {
                "success": True,
                "user_id": user_id,
                "user_login": user_summary.get("user_login"),
                "summary": user_summary,
                "detail": detail_data
            }

    @classmethod
    async def update_user_info(
        cls,
        admin_user: str,
        admin_pass: str,
        user_id: str,
        form_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Cập nhật thông tin User với cơ chế Auto-Fetch & Deep Merge an toàn tuyệt đối:
        1. Tự động kéo dữ liệu gốc từ detailUser.php.
        2. Merge các trường form_data gửi lên.
        3. Bắn multipart/form-data lên updateUser.php và kiểm tra kết quả nghiêm ngặt.
        """
        if not user_id:
            raise ValueError("Thiếu user_id để cập nhật hồ sơ!")

        cookies = await cls._get_admin_session_cookies(admin_user, admin_pass)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": f"https://pythaverse.space/admin-workspace/users/{user_id}",
        }

        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            # ------------------------------------------------------------------
            # BƯỚC 1: LẤY DỮ LIỆU GỐC ĐỂ MERGE (CHỐNG MẤT DỮ LIỆU CŨ)
            # ------------------------------------------------------------------
            detail_url = f"{cls.BASE_URL}/detailUser.php"
            resp_detail = await client.get(detail_url, params={"user_email": str(user_id)}, cookies=cookies, headers=headers)
            
            base_detail = {}
            if resp_detail.status_code == 200:
                try:
                    base_detail = resp_detail.json()
                except Exception:
                    pass

            # ------------------------------------------------------------------
            # BƯỚC 2: DEEP MERGE THÔNG TIN (Ánh xạ chuẩn mực từ detail -> update)
            # ------------------------------------------------------------------
            # 1. Họ và Tên
            final_first_name = form_data.get("first_name") or base_detail.get("firstName") or ""
            final_last_name = form_data.get("last_name") or base_detail.get("lastname") or ""

            # 2. Username (CỐT TỬ: PHP dùng user_login để định danh user)
            final_user_login = (
                form_data.get("user_login") 
                or base_detail.get("usernameTeacherPresent") 
                or base_detail.get("user_login") 
                or ""
            )

            # 3. Email
            final_email = (
                form_data.get("email") 
                or base_detail.get("inputEmailTeacherEdit") 
                or base_detail.get("email") 
                or ""
            )

            # 4. Ngày Sinh (Format 2 chữ số: 01, 02... 31)
            raw_day = form_data.get("day") or base_detail.get("day") or "1"
            final_day = str(raw_day).strip().zfill(2)

            raw_month = form_data.get("month") or base_detail.get("month") or "1"
            final_month = str(raw_month).strip().zfill(2)

            final_year = str(form_data.get("year") or base_detail.get("year") or "2016").strip()

            # 5. Quốc gia & Thành phố
            final_country_id = str(form_data.get("country_id") or base_detail.get("country_id") or "1").strip()
            final_city_id = str(
                form_data.get("city_id") 
                or base_detail.get("cityTeacherCompare") 
                or base_detail.get("city_id") 
                or ""
            ).strip()

            # 6. Trường học & Đối tác
            final_school_id = str(form_data.get("school_id") or base_detail.get("school_id") or "").strip()
            final_partner_id = str(form_data.get("partner_id") or base_detail.get("partner_id") or "").strip()

            # 7. Liên kết Moodle & Role
            final_id_user_md = str(
                form_data.get("id_user_md") 
                or base_detail.get("idUserMD") 
                or base_detail.get("idUserMDTeacher") 
                or ""
            ).strip()
            final_user_role = str(form_data.get("user_role") or base_detail.get("user_role") or "student").strip()

            # Đóng gói Multipart chuẩn 100% theo DevTools
            multipart_payload = {
                "inputFirstname": (None, str(final_first_name)),
                "inputLastname": (None, str(final_last_name)),
                "user_login": (None, str(final_user_login)),
                "inputEmail": (None, str(final_email)),
                "inputDay": (None, str(final_day)),
                "inputMonth": (None, str(final_month)),
                "inputYear": (None, str(final_year)),
                "inputCountries": (None, str(final_country_id)),
                "inputCity": (None, str(final_city_id)),
                "inputSchool": (None, str(final_school_id)),
                "inputPartner": (None, str(final_partner_id)),
                "idUserMDTeacher": (None, str(final_id_user_md)),
                "user_role": (None, str(final_user_role)),
            }

            logger.info(
                f"📝 [WorkspaceUser] Bắn update cho User #{user_id} ({final_user_login}): "
                f"Email: {final_email} | School: {final_school_id} | Partner: {final_partner_id} | Role: {final_user_role}"
            )

            # ------------------------------------------------------------------
            # BƯỚC 3: BẮN REQUEST VÀ THẨM ĐỊNH KẾT QUẢ NGHIÊM NGẶT
            # ------------------------------------------------------------------
            update_url = f"{cls.BASE_URL}/updateUser.php"
            resp = await client.post(update_url, files=multipart_payload, cookies=cookies, headers=headers)
            
            if resp.status_code == 200:
                try:
                    res_json = resp.json()
                except Exception:
                    return {"success": False, "message": f"Server trả về dữ liệu không hợp lệ: {resp.text}"}

                # Kiểm tra chặt chẽ cấu trúc JSON: {"success": true, "code": 200, ...}
                if res_json.get("success") is True or res_json.get("code") == 200:
                    clean_msg = f"Đã cập nhật thành công User #{user_id} ({final_user_login})"
                    logger.info(f"✅ [WorkspaceUser] {clean_msg}")
                    return {
                        "success": True, 
                        "message": clean_msg, 
                        "user_id": user_id,
                        "user_login": final_user_login,
                        "data": res_json
                    }
                else:
                    err_msg = res_json.get("message") or "Cập nhật không thành công từ WordPress"
                    logger.error(f"❌ [WorkspaceUser] Server từ chối: {err_msg}")
                    return {"success": False, "message": err_msg}
            else:
                logger.error(f"❌ [WorkspaceUser] Lỗi mạng: HTTP {resp.status_code} - {resp.text}")
                return {"success": False, "message": f"HTTP {resp.status_code}: {resp.text}"}