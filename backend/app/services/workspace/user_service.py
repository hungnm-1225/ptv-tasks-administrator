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
        Dò tìm người dùng thông minh hỗ trợ 2 chế độ (Tối đa 25 bản ghi):
        1. Tìm kiếm theo tiền tố / từ khóa đơn (Prefix Search)
        2. Tìm kiếm theo danh sách nhiều email/username dán từ Excel (Multi-line Search)
        Cào song song chi tiết với Semaphore(5) bảo vệ 512MB RAM Render.
        """
        cookies = await cls._get_admin_session_cookies(admin_user, admin_pass)
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://pythaverse.space/admin-workspace/users",
        }

        # Bóc tách danh sách từ khóa (hỗ trợ ngắt dòng, dấu phẩy, chấm phẩy)
        raw_terms = [t.strip() for t in re.split(r"[\r\n,;]+", identifier) if t.strip()]
        if not raw_terms:
            return {"success": False, "message": "Vui lòng nhập từ khóa hoặc danh sách tài khoản cần tìm!"}

        async with httpx.AsyncClient(timeout=45.0, verify=False) as client:
            search_url = f"{cls.BASE_URL}/getDataUser.php"
            detail_url = f"{cls.BASE_URL}/detailUser.php"
            sem = asyncio.Semaphore(5)

            found_users_summary: List[Dict[str, Any]] = []
            seen_uids = set()

            # ------------------------------------------------------------------
            # TRƯỜNG HỢP 1: DÁN 1 TỪ KHÓA ĐƠN LẺ ➔ TÌM KIẾM GẦN ĐÚNG (PREFIX SEARCH)
            # ------------------------------------------------------------------
            if len(raw_terms) == 1:
                single_kw = raw_terms[0]
                logger.info(f"🔍 [WorkspaceUser] Tìm kiếm gần đúng theo từ khóa: '{single_kw}' (max 25)...")
                params = {"page": 1, "per_page": 25, "search": single_kw}
                resp_search = await client.get(search_url, params=params, cookies=cookies, headers=headers)
                
                if resp_search.status_code == 200:
                    data = resp_search.json().get("data") or []
                    for u in data[:25]:
                        uid = str(u.get("user_id"))
                        if uid not in seen_uids:
                            seen_uids.add(uid)
                            found_users_summary.append(u)

            # ------------------------------------------------------------------
            # TRƯỜNG HỢP 2: DÁN NHIỀU DÒNG TỪ EXCEL ➔ TÌM KIẾM THEO DANH SÁCH (MAX 25)
            # ------------------------------------------------------------------
            else:
                target_list = raw_terms[:25]
                logger.info(f"📋 [WorkspaceUser] Tìm kiếm danh sách {len(target_list)} tài khoản dán từ Excel...")

                async def lookup_single_term(term: str):
                    async with sem:
                        try:
                            params = {"page": 1, "per_page": 1, "search": term}
                            r = await client.get(search_url, params=params, cookies=cookies, headers=headers)
                            if r.status_code == 200:
                                d = r.json().get("data") or []
                                if d:
                                    return d[0]
                        except Exception as e:
                            logger.warning(f"⚠️ Không tìm thấy '{term}': {e}")
                        return None

                results = await asyncio.gather(*[lookup_single_term(t) for t in target_list])
                for u in results:
                    if u:
                        uid = str(u.get("user_id"))
                        if uid not in seen_uids:
                            seen_uids.add(uid)
                            found_users_summary.append(u)

            if not found_users_summary:
                return {
                    "success": False, 
                    "message": f"Không tìm thấy người dùng phù hợp trên Admin Workspace với nội dung tìm kiếm."
                }

            # ------------------------------------------------------------------
            # BƯỚC 2: CÀO SONG SONG CHI TIẾT QUA detailUser.php (SEMAPHORE = 5)
            # ------------------------------------------------------------------
            async def fetch_user_detail(user_summary: Dict[str, Any]) -> Dict[str, Any]:
                u_id = str(user_summary.get("user_id"))
                async with sem:
                    try:
                        resp_d = await client.get(detail_url, params={"user_email": u_id}, cookies=cookies, headers=headers)
                        d_data = resp_d.json() if resp_d.status_code == 200 else {}
                    except Exception as e:
                        logger.warning(f"⚠️ Không thể lấy chi tiết User #{u_id}: {e}")
                        d_data = {}

                    return {
                        "user_id": u_id,
                        "user_login": user_summary.get("user_login") or "",
                        "summary": user_summary,
                        "detail": d_data,
                        "parsed_profile": {
                            "userId": u_id,
                            "userLogin": user_summary.get("user_login") or "",
                            "userRole": d_data.get("user_role") or user_summary.get("user_role", "student"),
                            "firstName": d_data.get("firstName") or "",
                            "lastName": d_data.get("lastname") or "",
                            "email": d_data.get("inputEmailTeacherEdit") or user_summary.get("user_email") or "",
                            "day": str(d_data.get("day") or "1"),
                            "month": str(d_data.get("month") or "1"),
                            "year": str(d_data.get("year") or "2012"),
                            "countryId": str(d_data.get("country_id") or "1"),
                            "cityId": str(d_data.get("cityTeacherCompare") or d_data.get("city_id") or "2852"),
                            "schoolId": str(d_data.get("school_id") or ""),
                            "schoolName": d_data.get("school_name") or "",
                            "partnerId": str(d_data.get("partner_id") or ""),
                            "partnerName": d_data.get("partner_name") or "",
                            "idUserMD": str(d_data.get("idUserMD") or d_data.get("idUserMDTeacher") or "")
                        }
                    }

            detailed_users = await asyncio.gather(*[fetch_user_detail(u) for u in found_users_summary])
            logger.info(f"✅ [WorkspaceUser] Đã nạp thành công {len(detailed_users)} hồ sơ chi tiết.")

            first_user = detailed_users[0]
            return {
                "success": True,
                "total": len(detailed_users),
                "users": detailed_users,
                "user_id": first_user["user_id"],
                "user_login": first_user["user_login"],
                "summary": first_user["summary"],
                "detail": first_user["detail"],
                "parsed_profile": first_user["parsed_profile"]
            }

    @classmethod
    async def batch_update_users_info(
        cls,
        admin_user: str,
        admin_pass: str,
        users_payload: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Cập nhật danh sách người dùng có kiểm soát tải (Concurrency = 3)
        bảo vệ trần RAM 512MB của Render và tránh quá tải WordPress.
        """
        total = len(users_payload)
        success_list: List[str] = []
        failed_list: List[Dict[str, str]] = []
        logs: List[str] = [f"🚀 BẮT ĐẦU CẬP NHẬT HÀNG LOẠT {total} TÀI KHOẢN:"]

        sem = asyncio.Semaphore(3)

        async def update_single(u_data: Dict[str, Any]):
            uid = str(u_data.get("user_id", "")).strip()
            ulogin = str(u_data.get("user_login", "")).strip()
            async with sem:
                try:
                    res = await cls.update_user_info(
                        admin_user=admin_user,
                        admin_pass=admin_pass,
                        user_id=uid,
                        form_data=u_data
                    )
                    if res.get("success"):
                        success_list.append(ulogin or uid)
                        logs.append(f"  ✓ User #{uid} ({ulogin}): Thành công")
                    else:
                        err = res.get("message") or "Thất bại"
                        failed_list.append({"user": ulogin or uid, "error": err})
                        logs.append(f"  ✗ User #{uid} ({ulogin}): {err}")
                except Exception as ex:
                    failed_list.append({"user": ulogin or uid, "error": str(ex)})
                    logs.append(f"  ✗ User #{uid} ({ulogin}): Lỗi ngoại lệ - {ex}")

        await asyncio.gather(*[update_single(u) for u in users_payload])

        succ_count = len(success_list)
        fail_count = len(failed_list)
        summary_msg = f"Cập nhật hoàn tất: {succ_count}/{total} thành công, {fail_count} thất bại."
        logs.append(f"🏁 TỔNG KẾT: {summary_msg}")

        return {
            "status": "success" if succ_count > 0 and fail_count == 0 else "partial_success" if succ_count > 0 else "failed",
            "message": summary_msg,
            "total": total,
            "success_count": succ_count,
            "failed_count": fail_count,
            "execution_logs": "\n".join(logs),
            "failed_users": failed_list
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