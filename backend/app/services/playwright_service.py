# backend/app/services/playwright_service.py
import re
import time
import logging
import asyncio
import gc
import difflib
import urllib.parse
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import httpx
from playwright.async_api import async_playwright, Browser

from app.core.config import settings
from app.core.playwright_manager import (
    acquire_playwright_slot,
    LOW_RAM_CHROMIUM_ARGS,
    setup_low_ram_routes,
    heavy_operation_guard
)

logger = logging.getLogger(__name__)

MOODLE_BASE_URL = "https://learn.pythaverse.space"


class PlaywrightLMSService:
    """
    Cỗ máy Hybrid Moodle PLearn High-Speed Production Engine:
    - Pha 1: Playwright SSO Keycloak trích xuất Cookies & sesskey trong ~4s rồi đóng ngay Chromium (RAM < 25MB).
    - Pha 2: Thực thi 100% bằng Direct HTTPX Async WebService:
      + Quét tự động Metadata (contextid, enrolid) & bảng Participants hiện tại.
      + Ghi danh theo lô Multi-Role (Học sinh 9, Giáo viên 7, Quản lý 1) trong 1 request duy nhất.
      + Smart Fallback tự chữa lành: Ép Mono-Role duy nhất & Cập nhật ngày bắt đầu/kết thúc nếu tài khoản đã tồn tại.
      + Phân nhóm thông minh: Hỗ trợ tìm Group gần đúng (Fuzzy match) & Tự động tạo Group mới nếu chưa có.
      + Hủy ghi danh (Unenrol) siêu tốc qua core_enrol_unenrol_user_enrolment.
    - Hoãn toàn bộ background cronjobs thông qua heavy_operation_guard để bảo vệ 512MB RAM Render!
    """

    def __init__(self):
        self.headless = True

    def _sanitize_emails(self, email_list: Any) -> List[str]:
        """Làm sạch và khử trùng danh sách email."""
        if not email_list:
            return []
        if isinstance(email_list, str):
            raw_items = email_list.replace(",", "\n").replace(";", "\n").split("\n")
        elif isinstance(email_list, list):
            raw_items = [str(x) for x in email_list]
        else:
            return []

        cleaned = []
        for item in raw_items:
            clean = item.strip().lower()
            if clean and "@" in clean and clean not in cleaned:
                cleaned.append(clean)
        return cleaned

    def _parse_date_components(self, date_str: str) -> Dict[str, str]:
        """Chuyển chuỗi ngày sang dict day/month/year."""
        try:
            if "-" in date_str:
                parts = date_str.split("-")
                if len(parts[0]) == 4:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                else:
                    dt = datetime.strptime(date_str, "%d-%m-%Y")
            elif "/" in date_str:
                dt = datetime.strptime(date_str, "%d/%m/%Y")
            else:
                dt = datetime.now()
        except Exception:
            dt = datetime.now()

        return {
            "day": str(dt.day),
            "month": str(dt.month),
            "year": str(dt.year)
        }

    async def _steal_moodle_session(self) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
        """Đăng nhập Keycloak SSO, bốc Cookies & sesskey, có mỏ neo chống lỗi navigation context."""
        async with acquire_playwright_slot("Moodle SSO Session Stealer", timeout=60.0):
            async with async_playwright() as p:
                browser: Browser = await p.chromium.launch(
                    headless=self.headless,
                    args=LOW_RAM_CHROMIUM_ARGS
                )
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                )
                await setup_low_ram_routes(context)
                page = await context.new_page()

                try:
                    admin_user = str(getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"")
                    admin_pass = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"")

                    if not admin_pass:
                        logger.error("❌ Không tìm thấy mật khẩu quản trị Keycloak trong cấu hình!")
                        return None, None

                    logger.info("🔑 [Playwright] Mở cổng đăng nhập Keycloak SSO...")
                    await page.goto(f"{MOODLE_BASE_URL}/login/index.php", wait_until="domcontentloaded", timeout=40000)

                    username_input = page.locator("input#username, input[name='username'], #username").first
                    if await username_input.count() > 0 and await username_input.is_visible():
                        logger.info(f"🔐 Điền thông tin quản trị viên: {admin_user}")
                        await username_input.fill(admin_user)
                        await page.fill("input#password, input[name='password'], #password", admin_pass)
                        login_btn = page.locator("input#kc-login, button[type='submit']").first
                        try:
                            async with page.expect_navigation(wait_until="domcontentloaded", timeout=25000):
                                await login_btn.click()
                        except Exception:
                            pass

                    # ⚓ MỎ NEO CHỜ MOODLE REDIRECT HOÀN TẤT
                    user_menu = page.locator(".usermenu, a[title='User menu'], .userinitials, a[href*='/login/logout.php']").first
                    try:
                        await user_menu.wait_for(state="visible", timeout=20000)
                        logger.info("✅ Xác nhận phiên đăng nhập Moodle thành công!")
                    except Exception:
                        if "login" not in page.url:
                            logger.info(f"✅ Đã vào Moodle an toàn (URL: {page.url})")
                        await page.wait_for_timeout(1500)

                    # Rút sesskey an toàn có retry
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
                        logger.info(f"🎯 [Session Stealer] Bốc sesskey: {sesskey} & MoodleSession thành công. Đóng Chromium ngay!")
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

            # 3. Quét danh sách thành viên hiện tại để lấy UEID (phục vụ Sửa ngày, Đổi Role, Unenrol)
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
                    email_m = re.search(r'<td[^>]*class="cell c2"[^>]*>(.*?)</td>', r_html, re.DOTALL)
                    ue_m = re.search(r'rel="(\d+)"[^>]*data-action="editenrolment"', r_html) or re.search(r'ue=(\d+)', r_html)
                    role_m = re.search(r'data-itemid="(\d+):(\d+)"[^>]*data-value="([^"]*)"', r_html)

                    if email_m and ue_m and role_m:
                        email_clean = re.sub(r'<[^>]+>', '', email_m.group(1)).strip().lower()
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

    async def _ensure_group_and_add_members(
        self, client: httpx.AsyncClient, course_id: str, group_query: str, user_ids: List[int], sesskey: str
    ) -> Tuple[Optional[str], int]:
        """Tìm Group theo tên gần đúng (Fuzzy), tự tạo Group nếu chưa có, và add thành viên trong 1 request."""
        if not group_query or not user_ids:
            return None, 0

        try:
            # 1. Quét danh sách group hiện có
            res = await client.get(f"/group/index.php?id={course_id}")
            groups_map: Dict[str, str] = {}
            if res.status_code == 200:
                options = re.findall(r'<option\s+value="(\d+)"[^>]*title="([^"]*)"[^>]*>', res.text)
                for g_val, g_title in options:
                    clean_title = re.sub(r'\s*\(\d+\)$', '', g_title).strip()
                    groups_map[clean_title] = g_val

            # 2. Tìm kiếm gần đúng (Fuzzy matching)
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

            # 3. Nếu chưa có -> Tự động tạo Group mới
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

                # Quét lại để lấy ID của nhóm vừa sinh
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

            # 4. Add toàn bộ danh sách User IDs vào Group trong 1 request
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

        students = self._sanitize_emails(payload.get("student_emails", payload.get("students", [])))
        teachers = self._sanitize_emails(payload.get("teacher_emails", payload.get("non_editing_teachers", [])))
        managers = self._sanitize_emails(payload.get("manager_emails", payload.get("managers", [])))

        if payload.get("bulk_emails"):
            role_type = payload.get("single_role", "student")
            bulk_list = self._sanitize_emails(payload.get("bulk_emails"))
            if role_type == "student" and not students:
                students = bulk_list
            elif role_type == "non_editing_teacher" and not teachers:
                teachers = bulk_list
            elif role_type == "manager" and not managers:
                managers = bulk_list

        total_requested = len(students) + len(teachers) + len(managers)
        logger.info(f"⚡ [HTTPX DIRECT ENGINE] Xử lý {len(raw_courses)} khóa học | Tổng {total_requested} người dùng!")

        if total_requested == 0:
            return {"status": "failed", "error": "Không có email nào được cung cấp."}

        # BẬT CỜ ƯU TIÊN HOÃN CRONJOB NGẦM
        async with heavy_operation_guard(f"LMS Enroll {total_requested} Users"):
            # BƯỚC 1: BỐC SESSION COOKIE VÀ SESSKEY (CHỈ 4S PLAYWRIGHT)
            cookies_dict, sesskey = await self._steal_moodle_session()
            if not cookies_dict or not sesskey:
                return {"status": "failed", "error": "Không thể lấy phiên đăng nhập Moodle qua Keycloak SSO."}

            batch_course_results = []

            # BƯỚC 2: KHỞI TẠO HTTPX ASYNC CLIENT
            async with httpx.AsyncClient(
                base_url=MOODLE_BASE_URL,
                cookies=cookies_dict,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"},
                timeout=30.0,
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

                        new_user_ids_to_enrol: List[int] = []
                        emails_enrolled_new: List[str] = []

                        # Phân loại: Đã tồn tại (Fallback) vs Chưa tồn tại (Enrol mới)
                        for email in emails:
                            clean_email = email.lower()

                            # 1. Đã tồn tại -> Smart Fallback: Ép Mono-Role & Sửa ngày
                            if clean_email in existing_participants:
                                p_info = existing_participants[clean_email]
                                uid = p_info["user_id"]
                                ue_id = p_info["ue_id"]
                                all_enrolled_user_ids_for_group.append(uid)

                                # Ép Mono-Role nếu vai trò hiện tại khác mong muốn
                                if role_value not in p_info.get("roles", ""):
                                    role_payload = [{
                                        "index": 0,
                                        "methodname": "core_update_inplace_editable",
                                        "args": {
                                            "component": "core_user",
                                            "itemtype": "user_roles",
                                            "itemid": p_info["itemid"],
                                            "value": f'["{role_value}"]'
                                        }
                                    }]
                                    await client.post(f"/lib/ajax/service.php?sesskey={sesskey}&info=core_update_inplace_editable", json=role_payload)

                                # Gia hạn ngày nếu có end_date_str
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

                            # 2. Chưa tồn tại -> Tìm kiếm qua core_enrol_get_potential_users
                            else:
                                search_p = [{
                                    "index": 0, "methodname": "core_enrol_get_potential_users",
                                    "args": {"courseid": course_id, "enrolid": enrol_id, "search": clean_email, "searchanywhere": True, "page": 0, "perpage": 5}
                                }]
                                s_res = await client.post(f"/lib/ajax/service.php?sesskey={sesskey}&info=core_enrol_get_potential_users", json=search_p)
                                if s_res.status_code == 200:
                                    s_data = s_res.json()[0].get("data", [])
                                    if s_data:
                                        uid = int(s_data[0]["id"])
                                        new_user_ids_to_enrol.append(uid)
                                        emails_enrolled_new.append(clean_email)
                                        all_enrolled_user_ids_for_group.append(uid)
                                        course_results["enrolled_new"].append({"email": clean_email, "role": role_label, "valid_until": end_date_str or "Unlimited"})
                                    else:
                                        course_results["not_found"].append({"email": clean_email, "role_intended": role_label, "reason": "Không tìm thấy trên Moodle"})

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

                    # Phân nhóm Group thông minh (Fuzzy + Auto-Create)
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

            return {
                "status": overall_status,
                "courses_count": total_courses,
                "message": f"⚡ [HTTPX DIRECT] Hoàn tất {total_courses} khóa học cho {total_requested} người dùng (Mới: {all_enrolled}, Gia hạn/Đổi Role: {all_extended}, Thất bại: {all_failed})!",
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
        """Entrypoint chính ghi danh người dùng."""
        return await self._internal_enroll_pipeline(payload)

    async def unenrol_users_pipeline(self, payload_or_course_id: Any, emails: Optional[List[str]] = None) -> Dict[str, Any]:
        """Hủy ghi danh người dùng qua API core_enrol_unenrol_user_enrolment (chỉ mất ~5 giây)."""
        if isinstance(payload_or_course_id, dict):
            raw_courses = payload_or_course_id.get("courses", [])
            if not raw_courses and payload_or_course_id.get("course_id"):
                raw_courses = [{"course_id": str(payload_or_course_id.get("course_id"))}]
            clean_emails = self._sanitize_emails(payload_or_course_id.get("emails", payload_or_course_id.get("student_emails", [])))
        else:
            raw_courses = [{"course_id": str(payload_or_course_id)}]
            clean_emails = self._sanitize_emails(emails or [])

        if not clean_emails:
            return {"status": "failed", "error": "Danh sách email cần hủy ghi danh rỗng."}

        cookies_dict, sesskey = await self._steal_moodle_session()
        if not cookies_dict or not sesskey:
            return {"status": "failed", "error": "Không thể lấy session đăng nhập Moodle."}

        all_courses_results = []
        async with httpx.AsyncClient(base_url=MOODLE_BASE_URL, cookies=cookies_dict, timeout=30.0) as client:
            for c_info in raw_courses:
                c_id = str(c_info.get("course_id", "")).strip()
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
                    else:
                        c_res["not_found"].append(em)

                all_courses_results.append(c_res)

        total_unenrolled = sum(len(r["unenrolled"]) for r in all_courses_results)
        return {
            "status": "success" if total_unenrolled > 0 else "failed",
            "message": f"Đã xử lý hủy ghi danh cho {total_unenrolled} lượt người dùng.",
            "details": all_courses_results
        }

    async def modify_user_role(self, course_id: str, email: str, new_role_label: str, mode: str = "mono") -> Dict[str, Any]:
        """Cập nhật Mono-Role độc lập tức thì."""
        role_map = {"student": "9", "non-editing teacher": "7", "teacher": "5", "manager": "1"}
        r_val = role_map.get(new_role_label.lower().strip(), "9")

        cookies_dict, sesskey = await self._steal_moodle_session()
        if not cookies_dict or not sesskey:
            return {"status": "failed", "error": "Không thể lấy session đăng nhập Moodle."}

        async with httpx.AsyncClient(base_url=MOODLE_BASE_URL, cookies=cookies_dict, timeout=20.0) as client:
            _, _, existing_participants = await self._fetch_course_metadata_and_participants(client, course_id, sesskey)
            em = email.strip().lower()
            if em not in existing_participants:
                return {"status": "failed", "error": f"Không tìm thấy học viên {email} trong khóa."}

            itemid = existing_participants[em]["itemid"]
            p = [{"index": 0, "methodname": "core_update_inplace_editable", "args": {"component": "core_user", "itemtype": "user_roles", "itemid": itemid, "value": f'["{r_val}"]'}}]
            res = await client.post(f"/lib/ajax/service.php?sesskey={sesskey}&info=core_update_inplace_editable", json=p)
            ok = (res.status_code == 200 and not res.json()[0].get("error"))
            return {"status": "success" if ok else "failed", "message": f"Cập nhật role [{new_role_label}] cho {email}"}


playwright_lms_service = PlaywrightLMSService()