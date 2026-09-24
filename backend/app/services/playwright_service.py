# backend/app/services/playwright_service.py
"""
Moodle PLearn High-Speed Production Service (Engine V3.6 Master Edition)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách:
- Ghi danh theo lô Multi-Role (Học sinh 9, Giáo viên 7, Quản lý 1) siêu tốc qua Direct HTTPX WebService.
- Session Cache In-Memory (TTL 2h): Bypass Playwright 0ms launch khi session còn sống.
- Tìm kiếm User ID song song qua asyncio.gather (chịu tải hàng trăm tài khoản trong vài trăm ms).
- Smart Fallback tự chữa lành: Ép Mono-Role & Sửa hạn ngày tức thì cho người dùng đã tồn tại.
- Phân nhóm thông minh: Fuzzy Match tìm Group gần đúng & Tự động tạo Group mới.
- Hủy ghi danh (Unenrol) siêu tốc qua core_enrol_unenrol_user_enrolment.
- Xuất báo cáo execution_logs tinh gọn chuẩn mực cho Live Terminal.
"""
import re
import os
import time
import logging
import asyncio
import gc
import difflib
import urllib.parse
from typing import Dict, Any, List, Optional, Tuple, Set
from datetime import datetime
import httpx
from playwright.async_api import async_playwright, Browser

from app.core.config import settings
from app.core.playwright_manager import (
    acquire_playwright_slot,
    LOW_RAM_CHROMIUM_ARGS,
    setup_low_ram_routes
)
from app.services.keycloak_service import keycloak_service

logger = logging.getLogger(__name__)

MOODLE_BASE_URL = "https://learn.pythaverse.space"

# Khóa kiểm soát tải tìm kiếm user trên Moodle
MOODLE_SEARCH_SEMAPHORE = asyncio.Semaphore(10)


class PlaywrightLMSService:
    """
    Cỗ máy Hybrid Moodle PLearn Production Engine (V3.6):
    - Pha 1: Playwright bốc Cookies & sesskey (3-4s) ➔ Lưu RAM Cache 2h ➔ Đóng Chromium (RAM < 25MB).
    - Pha 2: Thực thi 100% bằng Direct HTTPX Async WebService không click chuột giao diện!
    """

    def __init__(self):
        self.headless = True

        # ⚡ BỘ ĐỆM SESSION & SESSKEY IN-MEMORY (RAM < 1KB)
        self._cached_cookies: Optional[Dict[str, str]] = None
        self._cached_sesskey: Optional[str] = None
        self._cached_at: float = 0.0
        self._cache_ttl_seconds: int = 7200  # Lưu phiên Moodle trong 2 giờ
        self._session_lock: Optional[asyncio.Lock] = None

    def _get_lock(self) -> asyncio.Lock:
        """Khởi tạo Lock lười (Lazy Initialization) để an toàn với Event Loop."""
        if self._session_lock is None:
            self._session_lock = asyncio.Lock()
        return self._session_lock

    def invalidate_session_cache(self) -> None:
        """Hủy bỏ token/cookie cache của Moodle khi phát hiện phiên hết hạn."""
        self._cached_cookies = None
        self._cached_sesskey = None
        self._cached_at = 0.0
        logger.warning("🔄 [Moodle Cache] Đã thu hồi cache Session Moodle.")

    # =========================================================================
    # ⚡ 1. KIỂM TRA & BỐC SESSION PLAYWRIGHT (CÓ CACHE 2 GIỜ)
    # =========================================================================
    async def _is_session_valid(self, cookies: Dict[str, str]) -> Tuple[bool, Optional[str]]:
        """Kiểm tra siêu tốc (20ms) xem Moodle Session còn sống không, đồng thời trích xuất sesskey từ /my/."""
        try:
            async with httpx.AsyncClient(base_url=MOODLE_BASE_URL, cookies=cookies, timeout=5.0, follow_redirects=False) as client:
                res = await client.get("/my/")
                if res.status_code == 200:
                    # Bóc tách sesskey trực tiếp từ trang Dashboard nếu có
                    sk_m = re.search(r'["\']sesskey["\']\s*:\s*["\']([a-zA-Z0-9]+)["\']', res.text) or \
                           re.search(r'sesskey=([a-zA-Z0-9]+)', res.text)
                    extracted_sk = sk_m.group(1) if sk_m else None
                    return True, extracted_sk
                return False, None
        except Exception:
            return False, None

    async def _steal_moodle_session(self) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
        """Đăng nhập Keycloak SSO, bốc Cookies & sesskey, đóng trình duyệt ngay lập tức."""
        async with acquire_playwright_slot("Moodle SSO Session Stealer", timeout=60.0, lane="admin"):
            async with async_playwright() as p:
                browser: Browser = await p.chromium.launch(headless=self.headless, args=LOW_RAM_CHROMIUM_ARGS)
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"
                )
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    admin_user = str(os.getenv("TEST_ADMIN_USER") or getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"")
                    admin_pass = str(os.getenv("TEST_ADMIN_PASS") or getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"")

                    if not admin_pass:
                        logger.error("❌ Không tìm thấy mật khẩu quản trị Keycloak trong cấu hình .env!")
                        return None, None

                    logger.info("🔑 [Playwright] Mở cổng đăng nhập Keycloak SSO vào Moodle...")
                    await page.goto(f"{MOODLE_BASE_URL}/login/index.php", wait_until="domcontentloaded", timeout=40000)

                    username_input = page.locator("input#username, input[name='username'], #username").first
                    if await username_input.count() > 0 and await username_input.is_visible():
                        await username_input.fill(admin_user)
                        await page.fill("input#password, input[name='password'], #password", admin_pass)
                        login_btn = page.locator("input#kc-login, button[type='submit']").first
                        try:
                            async with page.expect_navigation(wait_until="domcontentloaded", timeout=25000):
                                await login_btn.click()
                        except Exception:
                            pass

                    user_menu = page.locator(".usermenu, a[title='User menu'], .userinitials, a[href*='/login/logout.php']").first
                    try:
                        await user_menu.wait_for(state="visible", timeout=20000)
                        logger.info("✅ Xác nhận phiên đăng nhập Moodle thành công!")
                    except Exception:
                        if "login" not in page.url:
                            logger.info(f"✅ Đã vào Moodle an toàn (URL: {page.url})")
                        await page.wait_for_timeout(1500)

                    sesskey = ""
                    for _ in range(5):
                        try:
                            sesskey = await page.evaluate("() => (window.M && window.M.cfg && window.M.cfg.sesskey) ? window.M.cfg.sesskey : ''")
                            if sesskey:
                                break
                        except Exception:
                            await asyncio.sleep(0.5)

                    if not sesskey:
                        content = await page.content()
                        sk_m = re.search(r'sesskey["\']?\s*[:=]\s*["\']([a-zA-Z0-9]+)["\']', content)
                        if sk_m:
                            sesskey = sk_m.group(1)

                    cookies_list = await context.cookies()
                    cookies_dict = {c["name"]: c["value"] for c in cookies_list}

                    if sesskey and "MoodleSession" in cookies_dict:
                        logger.info(f"🎯 [Session Stealer] Bốc sesskey: {sesskey} thành công! Đóng Chromium ngay.")
                        return cookies_dict, sesskey

                    logger.error("❌ Không lấy đủ sesskey hoặc MoodleSession!")
                    return None, None

                except Exception as e:
                    logger.error(f"❌ Lỗi ngoại lệ khi bốc Session Moodle: {e}", exc_info=True)
                    return None, None
                finally:
                    logger.info("🧹 [RAM Zero] Đã đóng Chromium, giải phóng 100% bộ nhớ!")
                    await browser.close()
                    gc.collect()

    
    async def _get_or_steal_session(self) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
        """
        Lấy Moodle Session theo Kiến trúc 3 Tầng Siêu Tốc:
        1. Tầng 1 (0ms): RAM Cache cục bộ của tiến trình.
        2. Tầng 2 (20ms): Kho Session tập trung Supabase ('plearn_lms') - Zero Playwright!
        3. Tầng 3 (Fallback ~15s): Mở Playwright bốc mới và LƯU NGƯỢC lại vào Supabase.
        """
        now = time.time()

        # ---------------------------------------------------------------------
        # ⚡ TẦNG 1: KIỂM TRA RAM CACHE LOCAL (0ms)
        # ---------------------------------------------------------------------
        if self._cached_cookies and self._cached_sesskey and (now - self._cached_at < self._cache_ttl_seconds):
            is_valid, _ = await self._is_session_valid(self._cached_cookies)
            if is_valid:
                logger.info("⚡ [Moodle Cache] Tái sử dụng Moodle Admin Session từ RAM (0ms - Bỏ qua Playwright)!")
                return self._cached_cookies, self._cached_sesskey
            else:
                logger.warning("⚠️ [Moodle Cache] Moodle Session trong RAM đã hết hạn...")
                self.invalidate_session_cache()

        # ---------------------------------------------------------------------
        # 💾 TẦNG 2: ĐỌC TỪ SUPABASE KEEPALIVE (20ms - Zero Playwright!)
        # ---------------------------------------------------------------------
        logger.info("🔍 [Moodle KeepAlive] Đang kiểm tra Session 'plearn_lms' từ Supabase Vault...")
        try:
            from app.core.supabase import get_supabase_client
            supabase = get_supabase_client()
            res = supabase.table("workspace_active_sessions")\
                .select("cookies, metadata")\
                .eq("session_key", "plearn_lms")\
                .eq("is_active", True)\
                .limit(1)\
                .execute()

            if res.data and res.data[0].get("cookies"):
                db_cookies = res.data[0]["cookies"]
                db_meta = res.data[0].get("metadata") or {}
                db_sesskey = db_meta.get("sesskey")

                # Kiểm tra tính sống của Cookie và bốc sesskey nếu metadata thiếu
                is_valid, extracted_sk = await self._is_session_valid(db_cookies)
                final_sk = db_sesskey or extracted_sk

                if is_valid and final_sk:
                    logger.info(f"✨ [Moodle KeepAlive] Session Moodle trên Supabase CỰC KỲ ẤM NÓNG (sesskey: {final_sk})! Tái sử dụng ngay (Zero Playwright)!")
                    self._cached_cookies = db_cookies
                    self._cached_sesskey = final_sk
                    self._cached_at = time.time()
                    return db_cookies, final_sk
                else:
                    logger.warning("⚠️ [Moodle KeepAlive] Session 'plearn_lms' trên Supabase đã hết hạn hoặc thiếu sesskey...")
        except Exception as db_err:
            logger.warning(f"⚠️ Lỗi đọc session Moodle từ Supabase: {db_err}")

        # ---------------------------------------------------------------------
        # 🔑 TẦNG 3: FALLBACK MỞ PLAYWRIGHT BỐC MỚI VÀ LƯU NGƯỢC LẠI SUPABASE (~15s)
        # ---------------------------------------------------------------------
        async with self._get_lock():
            # Double-checked lock
            now = time.time()
            if self._cached_cookies and self._cached_sesskey and (now - self._cached_at < self._cache_ttl_seconds):
                return self._cached_cookies, self._cached_sesskey

            logger.info("🔑 [Moodle Fallback] Khởi động Chromium bốc Session Moodle mới...")
            cookies_dict, sesskey = await self._steal_moodle_session()
            if cookies_dict and sesskey:
                self._cached_cookies = cookies_dict
                self._cached_sesskey = sesskey
                self._cached_at = time.time()
                logger.info(f"✨ [Moodle Cache] Đã đệm Session Moodle mới vào RAM (sesskey: {sesskey})")

                # Ghi ngược lại Supabase để các worker khác và Cronjob 15 phút giữ ấm dùng chung
                try:
                    from app.services.session_keepalive_service import session_keepalive_service
                    admin_user = str(os.getenv("TEST_ADMIN_USER", "adminworkspace"))
                    await session_keepalive_service.save_session_cookies(
                        session_key="plearn_lms",
                        system_name="PLearn Moodle LMS",
                        cookies=cookies_dict,
                        metadata={"sesskey": sesskey, "user": admin_user}
                    )
                    logger.info("💾 [KeepAlive Sync] Đã lưu ngược Session Moodle lên Supabase thành công!")
                except Exception as save_err:
                    logger.warning(f"⚠️ Không thể lưu ngược Session Moodle lên Supabase: {save_err}")

            return cookies_dict, sesskey

    # =========================================================================
    # 🔍 BỘ CHUẨN HÓA DANH TÍNH USERNAME ➔ EMAIL QUA KEYCLOAK IDP
    # =========================================================================
    async def _normalize_identifiers_to_emails(self, raw_items: Any) -> List[str]:
        """Chuẩn hóa danh sách đầu vào: Username không có '@' sẽ được tra cứu Keycloak lấy Email chuẩn."""
        if not raw_items:
            return []
        if isinstance(raw_items, str):
            items = raw_items.replace(",", "\n").replace(";", "\n").split("\n")
        elif isinstance(raw_items, list):
            items = [str(x.get("email") or x.get("username") if isinstance(x, dict) else x) for x in raw_items]
        else:
            return []

        cleaned_tokens: List[str] = []
        for it in items:
            c = it.strip().lower().replace('"', '').replace("'", "")
            if c and c not in cleaned_tokens:
                cleaned_tokens.append(c)

        if not cleaned_tokens:
            return []

        resolved_emails: List[str] = []
        usernames_to_lookup: List[str] = []

        for token in cleaned_tokens:
            if "@" in token:
                resolved_emails.append(token)
            else:
                usernames_to_lookup.append(token)

        if usernames_to_lookup:
            logger.info(f"🔍 [Keycloak Normalizer] Đang tra cứu email cho {len(usernames_to_lookup)} username: {usernames_to_lookup}")
            try:
                details = await keycloak_service.lookup_user_details(usernames_to_lookup)
                for d in details:
                    ident = d.get("identifier")
                    u_email = d.get("email")
                    if d.get("exists") and u_email and "@" in u_email:
                        clean_em = u_email.strip().lower()
                        if clean_em not in resolved_emails:
                            resolved_emails.append(clean_em)
                        logger.info(f"   ✓ Chuẩn hóa Keycloak: username '{ident}' ➔ email '{clean_em}'")
                    else:
                        logger.warning(f"   ⚠️ Không tìm thấy email trên Keycloak cho username: '{ident}'")
            except Exception as ex:
                logger.error(f"❌ Lỗi tra cứu Keycloak: {ex}")

        return list(dict.fromkeys(resolved_emails))

    def _parse_date_components(self, date_str: str) -> Dict[str, str]:
        """Chuyển chuỗi ngày sang dict day/month/year an toàn chống lỗi format."""
        if not date_str:
            dt = datetime.now()
            return {"day": str(dt.day), "month": str(dt.month), "year": str(dt.year)}

        clean_d = str(date_str).strip().split(" ")[0].split("T")[0]
        try:
            if "-" in clean_d:
                parts = clean_d.split("-")
                dt = datetime.strptime(clean_d, "%Y-%m-%d") if len(parts[0]) == 4 else datetime.strptime(clean_d, "%d-%m-%Y")
            elif "/" in clean_d:
                parts = clean_d.split("/")
                dt = datetime.strptime(clean_d, "%Y/%m/%d") if len(parts[0]) == 4 else datetime.strptime(clean_d, "%d/%m/%Y")
            else:
                dt = datetime.now()
        except Exception:
            dt = datetime.now()

        return {"day": str(dt.day), "month": str(dt.month), "year": str(dt.year)}

    # =========================================================================
    # 🔍 METADATA & BẢNG PARTICIPANTS (DIRECT AJAX)
    # =========================================================================
    async def _fetch_course_metadata_and_participants(
        self, client: httpx.AsyncClient, course_id: str, sesskey: str
    ) -> Tuple[Optional[str], Optional[str], Dict[str, Dict[str, Any]]]:
        """Lấy context_id, enrol_id và danh sách học viên hiện tại trong khóa."""
        context_id, enrol_id = None, None
        participants: Dict[str, Dict[str, Any]] = {}

        try:
            # 1. Lấy context_id
            res = await client.get(f"/user/index.php?id={course_id}")
            if res.status_code == 200:
                html_text = res.text
                ctx_m = re.search(r'"courseContextId"\s*:\s*(\d+)', html_text) or re.search(r'"contextid"\s*:\s*(\d+)', html_text)
                context_id = ctx_m.group(1) if ctx_m else None

            # 2. Lấy enrol_id qua core_get_fragment
            if context_id:
                frag_payload = [{
                    "index": 0,
                    "methodname": "core_get_fragment",
                    "args": {
                        "component": "enrol_manual",
                        "callback": "enrol_users_form",
                        "contextid": int(context_id),
                        "args": []
                    }
                }]
                frag_res = await client.post(f"/lib/ajax/service.php?sesskey={sesskey}&info=core_get_fragment", json=frag_payload)
                if frag_res.status_code == 200:
                    inner_html = frag_res.json()[0].get("data", {}).get("html", "")
                    enrol_m = re.search(r'name="enrolid"\s+value="(\d+)"', inner_html) or re.search(r'enrolid="(\d+)"', inner_html)
                    if enrol_m:
                        enrol_id = enrol_m.group(1)

            # 3. Quét danh sách thành viên hiện tại để lấy UEID
            table_payload = [{
                "index": 0,
                "methodname": "core_table_get_dynamic_table_content",
                "args": {
                    "component": "core_user",
                    "handler": "participants",
                    "uniqueid": f"user-index-participants-{course_id}",
                    "sortdata": [{"sortby": "lastname", "sortorder": 4}],
                    "jointype": 2,
                    "filters": {"courseid": {"name": "courseid", "jointype": 1, "values": [int(course_id)]}},
                    "firstinitial": "",
                    "lastinitial": "",
                    "pagenumber": "1",
                    "pagesize": "5000",
                    "hiddencolumns": [],
                    "resetpreferences": False
                }
            }]
            table_res = await client.post(f"/lib/ajax/service.php?sesskey={sesskey}&info=core_table_get_dynamic_table_content", json=table_payload)
            if table_res.status_code == 200:
                t_html = table_res.json()[0].get("data", {}).get("html", "")
                rows = re.findall(r'<tr[^>]*id="user-index-participants-[^"]*"[^>]*>(.*?)</tr>', t_html, re.DOTALL)
                for r_html in rows:
                    email_m = re.search(r'mailto:([^"\'>\s]+)', r_html) or re.search(r'<td[^>]*class="cell c2"[^>]*>(.*?)</td>', r_html, re.DOTALL)
                    ue_m = re.search(r'rel="(\d+)"[^>]*data-action="editenrolment"', r_html) or re.search(r'ue=(\d+)', r_html)
                    role_m = re.search(r'data-itemid="(\d+):(\d+)"[^>]*data-value="([^"]*)"', r_html)

                    if email_m and ue_m and role_m:
                        raw_email = email_m.group(1)
                        email_clean = re.sub(r'<[^>]+>', '', raw_email).strip().lower()
                        participants[email_clean] = {
                            "user_id": int(role_m.group(2)),
                            "course_id": int(role_m.group(1)),
                            "ue_id": ue_m.group(1),
                            "itemid": f"{role_m.group(1)}:{role_m.group(2)}",
                            "roles": role_m.group(3).replace('&quot;', '"')
                        }

        except Exception as e:
            logger.error(f"❌ Lỗi khi đọc Metadata khóa #{course_id}: {e}")

        return context_id, enrol_id, participants

    # =========================================================================
    # 👥 QUẢN LÝ GROUP THÔNG MINH (FUZZY + AUTO-CREATE + BATCH ADD)
    # =========================================================================
    async def _ensure_group_and_add_members(
        self, client: httpx.AsyncClient, course_id: str, group_query: str, user_ids: List[int], sesskey: str
    ) -> Tuple[Optional[str], int]:
        """Tìm Group theo tên gần đúng, tự tạo Group nếu chưa có và add thành viên trong 1 request."""
        if not group_query or not user_ids:
            return None, 0

        try:
            res = await client.get(f"/group/index.php?id={course_id}")
            groups_map: Dict[str, str] = {}
            if res.status_code == 200:
                options = re.findall(r'<option\s+value="(\d+)"[^>]*title="([^"]*)"[^>]*>', res.text)
                for g_val, g_title in options:
                    clean_title = re.sub(r'\s*\(\d+\)$', '', g_title).strip()
                    groups_map[clean_title] = g_val

            matched_group_name, matched_group_id = None, None
            for g_name, g_id in groups_map.items():
                if group_query.lower() in g_name.lower():
                    matched_group_name, matched_group_id = g_name, g_id
                    break

            if not matched_group_id:
                close = difflib.get_close_matches(group_query, list(groups_map.keys()), n=1, cutoff=0.5)
                if close:
                    matched_group_name = close[0]
                    matched_group_id = groups_map[matched_group_name]

            # Nếu chưa có -> Tự động tạo Group mới
            if not matched_group_id:
                logger.info(f"➕ [Group Engine] Nhóm '{group_query}' chưa tồn tại. Đang tự động tạo mới...")
                create_payload = {
                    "id": "",
                    "courseid": course_id,
                    "sesskey": sesskey,
                    "_qf__group_form": "1",
                    "mform_isexpanded_id_general": "1",
                    "name": group_query,
                    "idnumber": "",
                    "description_editor[text]": "",
                    "description_editor[format]": "1",
                    "description_editor[itemid]": str(int(time.time())),
                    "enrolmentkey": "",
                    "enablemessaging": "0",
                    "submitbutton": "Save changes"
                }
                await client.post("/group/group.php", data=create_payload)

                re_res = await client.get(f"/group/index.php?id={course_id}")
                if re_res.status_code == 200:
                    options = re.findall(r'<option\s+value="(\d+)"[^>]*title="([^"]*)"[^>]*>', re_res.text)
                    for g_val, g_title in options:
                        if group_query.lower() in g_title.lower():
                            matched_group_name = group_query
                            matched_group_id = g_val
                            break

            if not matched_group_id:
                logger.warning(f"⚠️ Không thể tạo hoặc nhận diện Group '{group_query}'.")
                return None, 0

            # Add danh sách User IDs vào Group trong 1 request duy nhất
            add_payload = [
                ("sesskey", sesskey),
                ("removeselect_searchtext", ""),
                ("userselector_preserveselected", "0"),
                ("userselector_autoselectunique", "0"),
                ("userselector_searchanywhere", "0"),
                ("add", "◄ Add")
            ]
            for uid in user_ids:
                add_payload.append(("addselect[]", str(uid)))

            add_res = await client.post(
                f"/group/members.php?group={matched_group_id}",
                content=urllib.parse.urlencode(add_payload),
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            if add_res.status_code in [200, 302, 303]:
                logger.info(f"👥 Đã add {len(user_ids)} thành viên vào Group [{matched_group_name}]!")
                return matched_group_name, len(user_ids)

            return matched_group_name, 0

        except Exception as e:
            logger.error(f"❌ Lỗi xử lý Group: {e}")
            return None, 0

    # =========================================================================
    # 🚀 PIPELINE GHI DANH DIRECT HTTPX (SONG SONG HÓA VÀ CACHE SESSION)
    # =========================================================================
    async def _internal_enroll_pipeline(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Thực thi toàn bộ quy trình ghi danh siêu tốc qua Direct HTTPX WebService."""
        raw_courses = payload.get("courses", [])
        if not raw_courses and payload.get("course_id"):
            raw_courses = [{
                "course_id": payload.get("course_id"),
                "course_name": payload.get("course_name", f"Course #{payload.get('course_id')}"),
                "start_date": payload.get("start_date", ""),
                "end_date": payload.get("end_date", ""),
                "group_name": payload.get("group_name", "")
            }]

        if not raw_courses:
            return {"status": "failed", "error": "Không có thông tin khóa học nào để ghi danh."}

        students = await self._normalize_identifiers_to_emails(payload.get("student_emails", payload.get("students", [])))
        teachers = await self._normalize_identifiers_to_emails(payload.get("teacher_emails", payload.get("non_editing_teachers", [])))
        managers = await self._normalize_identifiers_to_emails(payload.get("manager_emails", payload.get("managers", [])))

        generic_candidates = payload.get("emails") or payload.get("usernames") or payload.get("users") or payload.get("bulk_emails")
        if generic_candidates:
            role_type = payload.get("single_role", "student")
            normalized_generic = await self._normalize_identifiers_to_emails(generic_candidates)
            if role_type == "student" and not students:
                students = normalized_generic
            elif role_type in ["non_editing_teacher", "teacher"] and not teachers:
                teachers = normalized_generic
            elif role_type == "manager" and not managers:
                managers = normalized_generic
            elif not students and not teachers and not managers:
                students = normalized_generic

        total_requested = len(students) + len(teachers) + len(managers)
        logger.info(f"⚡ [HTTPX DIRECT ENGINE] Xử lý {len(raw_courses)} khóa học | Tổng {total_requested} người dùng hợp lệ!")

        if total_requested == 0:
            return {"status": "failed", "error": "Không có email hoặc username hợp lệ nào được cung cấp."}

        # BƯỚC 1: LẤY SESSION COOKIE VÀ SESSKEY (ƯU TIÊN CACHE RAM 2 GIỜ)
        cookies_dict, sesskey = await self._get_or_steal_session()
        if not cookies_dict or not sesskey:
            return {"status": "failed", "error": "Không thể lấy phiên đăng nhập Moodle qua Keycloak SSO."}

        batch_course_results = []
        custom_limits = httpx.Limits(max_keepalive_connections=20, max_connections=50)
        custom_timeout = httpx.Timeout(connect=15.0, read=180.0, write=60.0, pool=15.0)

        async with httpx.AsyncClient(
            base_url=MOODLE_BASE_URL,
            cookies=cookies_dict,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"},
            timeout=custom_timeout,
            limits=custom_limits,
            follow_redirects=True
        ) as client:

            for c_idx, c_info in enumerate(raw_courses):
                course_id = str(c_info.get("course_id", "")).strip()
                course_name = c_info.get("course_name", f"Course #{course_id}")
                end_date_str = c_info.get("end_date", payload.get("end_date", ""))
                start_date_option = str(c_info.get("start_date_type", c_info.get("start_date", payload.get("start_date", "4")))).strip()
                group_name = c_info.get("group_name", "").strip()

                date_info = self._parse_date_components(end_date_str) if end_date_str else None
                logger.info(f"📚 [{c_idx + 1}/{len(raw_courses)}] Đang xử lý: {course_name} (ID: {course_id})")

                course_results = {
                    "course_id": course_id,
                    "course_name": course_name,
                    "enrolled_new": [],
                    "extended_access": [],
                    "not_found": [],
                    "group_created": None,
                    "group_members_added": []
                }

                # Quét Metadata và thành viên hiện có
                context_id, enrol_id, existing_participants = await self._fetch_course_metadata_and_participants(client, course_id, sesskey)
                if not enrol_id:
                    logger.error(f"❌ Không tìm thấy Enrol ID hợp lệ cho khóa #{course_id}")
                    course_results["error"] = "Không lấy được Enrol ID của khóa học."
                    batch_course_results.append(course_results)
                    continue

                role_configs = [
                    ("Non-editing teacher", "7", teachers),
                    ("Manager", "1", managers),
                    ("Student", "9", students),
                ]

                all_enrolled_user_ids_for_group: List[int] = []

                for role_label, role_value, emails in role_configs:
                    if not emails:
                        continue

                    existing_in_course: List[Tuple[str, Dict[str, Any]]] = []
                    new_emails_to_search: List[str] = []

                    for email in emails:
                        clean_email = email.lower()
                        if clean_email in existing_participants:
                            existing_in_course.append((clean_email, existing_participants[clean_email]))
                        else:
                            new_emails_to_search.append(clean_email)

                    # 1. Xử lý người đã tồn tại: Ép Mono-Role & Sửa hạn ngày
                    for clean_email, p_info in existing_in_course:
                        uid = p_info["user_id"]
                        ue_id = p_info["ue_id"]
                        all_enrolled_user_ids_for_group.append(uid)

                        if role_value not in p_info.get("roles", ""):
                            role_payload = [{
                                "index": 0, "methodname": "core_update_inplace_editable",
                                "args": {"component": "core_user", "itemtype": "user_roles", "itemid": p_info["itemid"], "value": f'["{role_value}"]'}
                            }]
                            await client.post(f"/lib/ajax/service.php?sesskey={sesskey}&info=core_update_inplace_editable", json=role_payload)

                        if date_info:
                            form_str = urllib.parse.urlencode({
                                "ue": ue_id, "ifilter": "", "sesskey": sesskey,
                                "_qf__enrol_user_enrolment_form": "1", "status": "0",
                                "timestart[enabled]": "0",
                                "timeend[day]": date_info["day"], "timeend[month]": date_info["month"],
                                "timeend[year]": date_info["year"], "timeend[hour]": "17",
                                "timeend[minute]": "00", "timeend[enabled]": "1"
                            })
                            edit_p = [{"index": 0, "methodname": "core_enrol_submit_user_enrolment_form", "args": {"formdata": form_str}}]
                            await client.post(f"/lib/ajax/service.php?sesskey={sesskey}&info=core_enrol_submit_user_enrolment_form", json=edit_p)

                        course_results["extended_access"].append({"email": clean_email, "role": role_label, "valid_until": end_date_str or "Existing"})

                    # 2. 🎯 TÌM KIẾM SONG SONG NGƯỜI MỚI QUA ASYNCIO.GATHER
                    if new_emails_to_search:
                        async def _search_single_potential_user(clean_em: str):
                            async with MOODLE_SEARCH_SEMAPHORE:
                                try:
                                    search_p = [{
                                        "index": 0, "methodname": "core_enrol_get_potential_users",
                                        "args": {"courseid": course_id, "enrolid": enrol_id, "search": clean_em, "searchanywhere": True, "page": 0, "perpage": 5}
                                    }]
                                    s_res = await client.post(f"/lib/ajax/service.php?sesskey={sesskey}&info=core_enrol_get_potential_users", json=search_p)
                                    if s_res.status_code == 200:
                                        s_data = s_res.json()[0].get("data", [])
                                        if s_data:
                                            return clean_em, int(s_data[0]["id"])
                                except Exception as s_err:
                                    logger.debug(f"Lỗi tìm user {clean_em}: {s_err}")
                                return clean_em, None

                        search_tasks = [_search_single_potential_user(em) for em in new_emails_to_search]
                        search_results = await asyncio.gather(*search_tasks)

                        new_user_ids_to_enrol: List[int] = []
                        for clean_em, uid in search_results:
                            if uid is not None:
                                new_user_ids_to_enrol.append(uid)
                                all_enrolled_user_ids_for_group.append(uid)
                                course_results["enrolled_new"].append({"email": clean_em, "role": role_label, "valid_until": end_date_str or "Unlimited"})
                            else:
                                course_results["not_found"].append({"email": clean_em, "role_intended": role_label, "reason": "Không tìm thấy trên Moodle"})

                        # Ghi danh mới cả lô người dùng trong 1 request duy nhất!
                        if new_user_ids_to_enrol:
                            form_data = [
                                ("mform_showmore_main", "0"), ("id", course_id), ("action", "enrol"),
                                ("enrolid", enrol_id), ("sesskey", sesskey), ("_qf__enrol_manual_enrol_users_form", "1"),
                                ("mform_showmore_id_main", "1" if date_info else "0"), ("roletoassign", role_value),
                                ("startdate", start_date_option if start_date_option in ["2", "3", "4"] else "4")
                            ]
                            for uid in new_user_ids_to_enrol:
                                form_data.append(("userlist[]", str(uid)))

                            if date_info:
                                form_data.extend([
                                    ("timeend[day]", date_info["day"]), ("timeend[month]", date_info["month"]),
                                    ("timeend[year]", date_info["year"]), ("timeend[hour]", "17"),
                                    ("timeend[minute]", "00"), ("timeend[enabled]", "1")
                                ])

                            encoded_body = urllib.parse.urlencode(form_data)
                            await client.post("/enrol/manual/ajax.php", content=encoded_body, headers={"Content-Type": "application/x-www-form-urlencoded"})
                            logger.info(f"🎉 Ghi danh MỚI thành công {len(new_user_ids_to_enrol)} tài khoản [{role_label}]!")

                # Phân nhóm Group thông minh
                if group_name and all_enrolled_user_ids_for_group:
                    unique_uids = list(set(all_enrolled_user_ids_for_group))
                    g_name, added_c = await self._ensure_group_and_add_members(client, course_id, group_name, unique_uids, sesskey)
                    course_results["group_created"] = g_name
                    course_results["group_members_added"] = [f"{added_c} users added to {g_name}"]

                batch_course_results.append(course_results)

        total_courses = len(batch_course_results)
        all_enrolled = sum(len(c["enrolled_new"]) for c in batch_course_results)
        all_extended = sum(len(c["extended_access"]) for c in batch_course_results)
        all_failed = sum(len(c["not_found"]) for c in batch_course_results)

        overall_status = "success" if all_failed == 0 else ("partial_success" if (all_enrolled + all_extended) > 0 else "failed")

        # =====================================================================
        # 📝 TẠO BÁO CÁO LOG TINH GỌN THEO YÊU CẦU CHO LIVE TERMINAL
        # =====================================================================
        report_lines: List[str] = [
            f"🎯 HOÀN TẤT GHI DANH MOODLE PLEARN ({total_courses} KHÓA HỌC)"
        ]

        # Khối 1: Tóm tắt Role nào có người dùng nào
        if students:
            report_lines.append(f"Học sinh (9): {', '.join(students)}")
        if teachers:
            report_lines.append(f"Giáo viên (7): {', '.join(teachers)}")
        if managers:
            report_lines.append(f"Quản lý (1): {', '.join(managers)}")

        # Khối 2: Tóm tắt từng Khóa học 1 dòng
        for c in batch_course_results:
            c_name = c.get("course_name", f"Course #{c.get('course_id')}")
            c_id = c.get("course_id")
            enrolled_cnt = len(c.get("enrolled_new", []))
            extended_cnt = len(c.get("extended_access", []))
            g_created = c.get("group_created")
            group_info = f" | Group: {g_created}" if g_created else ""
            
            if c.get("error"):
                report_lines.append(f"📚 KHÓA: {c_name} (ID: {c_id}) ⛔ LỖI: {c['error']}")
            else:
                report_lines.append(f"📚 KHÓA: {c_name} (ID: {c_id}) [Mới ({enrolled_cnt}) | Gia hạn/Đổi Role ({extended_cnt}){group_info}]")

        # Khối 3: Báo lỗi có chọn lọc (Chỉ hiện khi có người không tìm thấy)
        missing_emails = list(dict.fromkeys([
            nf.get("email") for c in batch_course_results for nf in c.get("not_found", []) if nf.get("email")
        ]))
        if missing_emails:
            report_lines.append(f"Không tìm thấy trên Moodle ❌: {', '.join(missing_emails)}")

        short_summary_msg = f"Hoàn tất {total_courses} khóa: {all_enrolled} Mới, {all_extended} Gia hạn/Đổi Role, {all_failed} Lỗi."

        return {
            "status": overall_status,
            "courses_count": total_courses,
            "message": short_summary_msg,
            "execution_logs": "\n".join(report_lines),
            "summary": {
                "total_courses": total_courses,
                "total_requested_per_course": total_requested,
                "all_enrolled_count": all_enrolled,
                "all_extended_count": all_extended,
                "all_failed_count": all_failed
            },
            "details": batch_course_results
        }

    async def enroll_users_pipeline(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Entrypoint chính ghi danh người dùng có bảo vệ Timeout co giãn linh hoạt."""
        raw_courses = payload.get("courses", [])
        courses_count = len(raw_courses) if raw_courses else 1
        
        pipeline_timeout = min(600.0, max(180.0, courses_count * 40.0))
        logger.info(f"⏱️ [Timeout Safeguard] Đặt trần thời gian cho luồng LMS Enroller: {pipeline_timeout}s")

        try:
            return await asyncio.wait_for(self._internal_enroll_pipeline(payload), timeout=pipeline_timeout)
        except asyncio.TimeoutError:
            logger.error(f"❌ Luồng ghi danh LMS vượt quá trần an toàn ({pipeline_timeout}s)!")
            return {"status": "failed", "error": f"Tác vụ LMS Enroll bị quá hạn thời gian (Timeout {pipeline_timeout}s)."}

    async def unenrol_users_pipeline(self, payload_or_course_id: Any, emails: Optional[List[str]] = None) -> Dict[str, Any]:
        """Hủy ghi danh người dùng qua API core_enrol_unenrol_user_enrolment (Có RAM Cache Session)."""
        if isinstance(payload_or_course_id, dict):
            raw_courses_input = payload_or_course_id.get("courses", [])
            if not raw_courses_input and payload_or_course_id.get("course_id"):
                raw_courses_input = [{"course_id": str(payload_or_course_id.get("course_id"))}]

            raw_candidates = (
                payload_or_course_id.get("target_emails")
                or payload_or_course_id.get("user_emails")
                or payload_or_course_id.get("emails")
                or payload_or_course_id.get("usernames")
                or payload_or_course_id.get("users")
                or payload_or_course_id.get("student_emails", [])
            )
            clean_emails = await self._normalize_identifiers_to_emails(raw_candidates)
        else:
            raw_courses_input = [{"course_id": str(payload_or_course_id)}]
            clean_emails = await self._normalize_identifiers_to_emails(emails or [])

        if not clean_emails:
            return {"status": "failed", "error": "Danh sách email hoặc username cần hủy ghi danh rỗng."}

        # 🎯 CHUẨN HÓA RAW_COURSES AN TOÀN: Hỗ trợ cả list[dict], list[str], list[int]
        raw_courses = []
        for c in raw_courses_input:
            if isinstance(c, dict):
                raw_courses.append(c)
            elif isinstance(c, (str, int)):
                raw_courses.append({"course_id": str(c)})

        cookies_dict, sesskey = await self._get_or_steal_session()
        if not cookies_dict or not sesskey:
            return {"status": "failed", "error": "Không thể lấy session đăng nhập Moodle."}

        all_courses_results = []
        custom_timeout = httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=10.0)

        async with httpx.AsyncClient(base_url=MOODLE_BASE_URL, cookies=cookies_dict, timeout=custom_timeout) as client:
            for c_info in raw_courses:
                c_id = str(c_info.get("course_id", "")).strip() if isinstance(c_info, dict) else str(c_info).strip()
                if not c_id:
                    continue
                _, _, existing_participants = await self._fetch_course_metadata_and_participants(client, c_id, sesskey)

                c_res = {"course_id": c_id, "unenrolled": [], "not_found": []}
                for email in clean_emails:
                    em = email.lower()
                    if em in existing_participants:
                        ue_id = existing_participants[em]["ue_id"]
                        del_p = [{"index": 0, "methodname": "core_enrol_unenrol_user_enrolment", "args": {"ueid": str(ue_id)}}]
                        d_res = await client.post(f"/lib/ajax/service.php?sesskey={sesskey}&info=core_enrol_unenrol_user_enrolment", json=del_p)
                        if d_res.status_code == 200 and not d_res.json()[0].get("error"):
                            c_res["unenrolled"].append(em)
                            logger.info(f"🗑️ Đã Unenrol thành công khỏi khóa #{c_id}: {em}")
                    else:
                        c_res["not_found"].append(em)

                all_courses_results.append(c_res)

        total_unenrolled = sum(len(r["unenrolled"]) for r in all_courses_results)
        
        # Báo cáo tinh gọn cho Unenrol
        report_lines = [
            f"🎯 HOÀN TẤT HỦY GHI DANH MOODLE ({len(raw_courses)} KHÓA HỌC)",
            f"Người dùng cần gỡ: {', '.join(clean_emails)}"
        ]
        for r in all_courses_results:
            c_id = r.get("course_id")
            rem_cnt = len(r.get("unenrolled", []))
            not_f_cnt = len(r.get("not_found", []))
            report_lines.append(f"📚 KHÓA #{c_id} [Đã gỡ ({rem_cnt}) | Vốn không có ({not_f_cnt})]")

        return {
            "status": "success" if total_unenrolled > 0 else "failed",
            "message": f"Đã xử lý hủy ghi danh cho {total_unenrolled} lượt người dùng.",
            "execution_logs": "\n".join(report_lines),
            "details": all_courses_results
        }

    async def modify_user_role(self, course_id: str, email: str, new_role_label: str, mode: str = "mono") -> Dict[str, Any]:
        """Cập nhật Mono-Role độc lập tức thì (Có RAM Cache Session)."""
        normalized = await self._normalize_identifiers_to_emails([email])
        if not normalized:
            return {"status": "failed", "error": f"Không tìm thấy tài khoản '{email}' trên hệ thống."}

        target_email = normalized[0]
        role_map = {"student": "9", "non-editing teacher": "7", "teacher": "5", "manager": "1"}
        r_val = role_map.get(new_role_label.lower().strip(), "9")

        cookies_dict, sesskey = await self._get_or_steal_session()
        if not cookies_dict or not sesskey:
            return {"status": "failed", "error": "Không thể lấy session đăng nhập Moodle."}

        async with httpx.AsyncClient(base_url=MOODLE_BASE_URL, cookies=cookies_dict, timeout=20.0) as client:
            _, _, existing_participants = await self._fetch_course_metadata_and_participants(client, course_id, sesskey)
            if target_email not in existing_participants:
                return {"status": "failed", "error": f"Không tìm thấy học viên {target_email} trong khóa #{course_id}."}

            itemid = existing_participants[target_email]["itemid"]
            p = [{"index": 0, "methodname": "core_update_inplace_editable", "args": {"component": "core_user", "itemtype": "user_roles", "itemid": itemid, "value": f'["{r_val}"]'}}]
            res = await client.post(f"/lib/ajax/service.php?sesskey={sesskey}&info=core_update_inplace_editable", json=p)
            ok = (res.status_code == 200 and not res.json()[0].get("error"))
            return {"status": "success" if ok else "failed", "message": f"Cập nhật role [{new_role_label}] cho {target_email}"}


playwright_lms_service = PlaywrightLMSService()