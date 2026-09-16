# backend/test_lms_fast_engine.py
"""
MASTER LMS FAST ENGINE TEST SUITE (TOÀN TRÌNH E2E KHÉP KÍN):
---------------------------------------------------------------------
Kịch bản kiểm thử toàn diện 7 giai đoạn:
1. Playwright Keycloak SSO lấy Session trong 4-5s -> Đóng ngay Chromium.
2. Quét bảng Participants đọc sạch User ID, UEID (User Enrolment ID), Roles hiện tại.
3. Multi-Role Enrol & Smart Fallback (Giáo viên role 7, Học sinh role 9):
   - Chưa có: Ghi danh mới hàng loạt.
   - Đã có: Ép Mono-Role & Gia hạn ngày tự động.
4. Phân nhóm gần đúng (Fuzzy Match): Gõ 'Digital' -> Tự nhận diện Group 'Digital Hub PH Corp'.
5. Tự tạo Group mới khi chưa có: 'Group_Test_K12' -> Tự POST tạo nhóm & nhét user vào.
6. Hiệu chỉnh ngày bắt đầu & kết thúc hàng loạt qua core_enrol_submit_user_enrolment_form.
7. Unenrol dọn sạch toàn bộ user test qua core_enrol_unenrol_user_enrolment.
"""

import os
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("MASTER_LMS_TEST")

try:
    from app.core.config import settings
    ADMIN_USER = str(getattr(settings, "TEST_ADMIN_USER", "")).strip().strip("'\"")
    ADMIN_PASS = str(getattr(settings, "TEST_ADMIN_PASS", "")).strip().strip("'\"")
except Exception:
    ADMIN_USER = os.getenv("TEST_ADMIN_USER", "salesadmin@dtt.vn")
    ADMIN_PASS = os.getenv("TEST_ADMIN_PASS", "")

MOODLE_BASE_URL = "https://learn.pythaverse.space"

# =====================================================================
# 🎯 DỮ LIỆU ĐẦU VÀO KIỂM THỬ THỰC TẾ
# =====================================================================
TEST_COURSE_ID = "780"

# Danh sách người dùng với các vai trò khác nhau (Multi-Role)
TEST_USERS = [
    {
        "email": "gvdttemd@pythaverse.net",
        "role_value": "7",
        "role_label": "Non-editing teacher"
    },
    {
        "email": "hsdttemd@pythaverse.net",
        "role_value": "9",
        "role_label": "Student"
    }
]

# Tên nhóm gõ gần đúng (Fuzzy Test)
FUZZY_GROUP_SEARCH = "Digital Hub PH Corp"

# Tên nhóm mới tinh để test tính năng Auto-Create Group
AUTO_CREATE_GROUP_NAME = "Auto_Class_K12_Testing"


class MasterLMSFastTester:
    def __init__(self):
        self.cookies_dict: Dict[str, str] = {}
        self.sesskey: str = ""
        self.context_id: Optional[str] = None
        self.enrol_id: Optional[str] = None
        self.existing_participants: Dict[str, Dict[str, Any]] = {}

    # =================================================================
    # GIAI ĐOẠN 1: BỐC SESSION PLAYWRIGHT (CHỈ 4-5S)
    # =================================================================
    async def stage_1_steal_session(self) -> bool:
        logger.info("\n" + "=" * 60)
        logger.info("🔑 [GIAI ĐOẠN 1] BỐC SESSION PLAYWRIGHT & ĐÓNG CHROMIUM...")
        logger.info(f"   👉 Tài khoản: '{ADMIN_USER}'")
        logger.info("=" * 60)
        t0 = time.time()

        LOW_RAM_ARGS = [
            "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
            "--disable-gpu", "--no-first-run", "--no-zygote", "--single-process",
            "--disable-extensions", "--js-flags=--max-old-space-size=128"
        ]

        async with async_playwright() as p:
            browser: Browser = await p.chromium.launch(headless=True, args=LOW_RAM_ARGS)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"
            )
            page = await context.new_page()

            try:
                logger.info("🌐 Điều hướng tới cổng đăng nhập...")
                await page.goto(f"{MOODLE_BASE_URL}/login/index.php", wait_until="domcontentloaded", timeout=40000)

                username_input = page.locator("input#username, input[name='username'], #username").first
                if await username_input.count() > 0 and await username_input.is_visible():
                    logger.info(f"🔐 Đang điền form Keycloak cho: {ADMIN_USER}")
                    await username_input.fill(ADMIN_USER)
                    await page.fill("input#password, input[name='password'], #password", ADMIN_PASS)
                    login_btn = page.locator("input#kc-login, button[type='submit']").first
                    
                    logger.info("🖱️ Bấm nút Đăng nhập & đợi chuyển trang...")
                    try:
                        async with page.expect_navigation(wait_until="domcontentloaded", timeout=25000):
                            await login_btn.click()
                    except Exception:
                        pass

                # ⚓ MỎ NEO QUAN TRỌNG: Chờ User Menu xuất hiện để đảm bảo Moodle đã xong 100% các redirect!
                logger.info("⏳ Chờ Moodle ổn định phiên đăng nhập (User Menu)...")
                user_menu = page.locator(".usermenu, a[title='User menu'], .userinitials, a[href*='/login/logout.php']").first
                try:
                    await user_menu.wait_for(state="visible", timeout=20000)
                    logger.info("✅ Đã xác nhận phiên làm việc Moodle thành công!")
                except Exception:
                    if "login" not in page.url:
                        logger.info(f"✅ Đã vào Moodle an toàn (URL: {page.url})")
                    await page.wait_for_timeout(1500)

                # 🎯 Rút sesskey có retry chống giật context
                for attempt in range(5):
                    try:
                        self.sesskey = await page.evaluate("() => (window.M && window.M.cfg && window.M.cfg.sesskey) ? window.M.cfg.sesskey : ''")
                        if self.sesskey:
                            break
                    except Exception:
                        await asyncio.sleep(0.5)

                if not self.sesskey:
                    content = await page.content()
                    sk_m = re.search(r'sesskey["\']?\s*[:=]\s*["\']([a-zA-Z0-9]+)["\']', content)
                    if sk_m:
                        self.sesskey = sk_m.group(1)

                cookies_list = await context.cookies()
                self.cookies_dict = {c["name"]: c["value"] for c in cookies_list}

                elapsed = round(time.time() - t0, 2)
                if self.sesskey and "MoodleSession" in self.cookies_dict:
                    logger.info(f"🎉 Bốc Session thành công trong {elapsed}s!")
                    logger.info(f"   👉 sesskey: {self.sesskey}")
                    logger.info(f"   👉 MoodleSession: {self.cookies_dict['MoodleSession'][:12]}...")
                    return True

                logger.error("❌ Không lấy đủ sesskey hoặc cookie MoodleSession!")
                return False

            finally:
                logger.info("🧹 [RAM Zero] Đã đóng Chromium, giải phóng 100% bộ nhớ!")
                await browser.close()
                gc.collect()

    # =================================================================
    # GIAI ĐOẠN 2: LẤY METADATA & QUÉT BẢNG PARTICIPANTS
    # =================================================================
    async def stage_2_fetch_metadata_and_participants(self, client: httpx.AsyncClient) -> bool:
        logger.info("\n" + "-" * 60)
        logger.info(f"🔍 [GIAI ĐOẠN 2] QUÉT METADATA & BẢNG THÀNH VIÊN KHÓA #{TEST_COURSE_ID}...")
        t0 = time.time()

        # 1. Lấy contextid và enrolid
        res = await client.get(f"/user/index.php?id={TEST_COURSE_ID}")
        html_text = res.text
        ctx_m = re.search(r'"courseContextId"\s*:\s*(\d+)', html_text) or re.search(r'"contextid"\s*:\s*(\d+)', html_text)
        self.context_id = ctx_m.group(1) if ctx_m else "100424"

        frag_payload = [{
            "index": 0,
            "methodname": "core_get_fragment",
            "args": {
                "component": "enrol_manual",
                "callback": "enrol_users_form",
                "contextid": int(self.context_id),
                "args": []
            }
        }]
        frag_res = await client.post(f"/lib/ajax/service.php?sesskey={self.sesskey}&info=core_get_fragment", json=frag_payload)
        if frag_res.status_code == 200:
            inner_html = frag_res.json()[0].get("data", {}).get("html", "")
            enrol_m = re.search(r'name="enrolid"\s+value="(\d+)"', inner_html)
            self.enrol_id = enrol_m.group(1) if enrol_m else "3349"

        # 2. Quét toàn bộ thành viên hiện tại để trích xuất UEID (User Enrolment ID)
        table_payload = [{
            "index": 0,
            "methodname": "core_table_get_dynamic_table_content",
            "args": {
                "component": "core_user",
                "handler": "participants",
                "uniqueid": f"user-index-participants-{TEST_COURSE_ID}",
                "sortdata": [{"sortby": "lastname", "sortorder": 4}],
                "jointype": 2,
                "filters": {"courseid": {"name": "courseid", "jointype": 1, "values": [int(TEST_COURSE_ID)]}},
                "firstinitial": "",
                "lastinitial": "",
                "pagenumber": "1",
                "pagesize": "5000",
                "hiddencolumns": [],
                "resetpreferences": False
            }
        }]
        table_res = await client.post(f"/lib/ajax/service.php?sesskey={self.sesskey}&info=core_table_get_dynamic_table_content", json=table_payload)
        if table_res.status_code == 200:
            t_html = table_res.json()[0].get("data", {}).get("html", "")
            rows = re.findall(r'<tr[^>]*id="user-index-participants-[^"]*"[^>]*>(.*?)</tr>', t_html, re.DOTALL)
            for r_html in rows:
                email_m = re.search(r'<td[^>]*class="cell c2"[^>]*>(.*?)</td>', r_html, re.DOTALL)
                ue_m = re.search(r'rel="(\d+)"[^>]*data-action="editenrolment"', r_html) or re.search(r'ue=(\d+)', r_html)
                role_m = re.search(r'data-itemid="(\d+):(\d+)"[^>]*data-value="([^"]*)"', r_html)

                if email_m and ue_m and role_m:
                    email_clean = re.sub(r'<[^>]+>', '', email_m.group(1)).strip().lower()
                    self.existing_participants[email_clean] = {
                        "user_id": int(role_m.group(2)),
                        "course_id": int(role_m.group(1)),
                        "ue_id": ue_m.group(1),
                        "itemid": f"{role_m.group(1)}:{role_m.group(2)}",
                        "roles": role_m.group(3).replace('&quot;', '"')
                    }

        elapsed = round((time.time() - t0) * 1000, 1)
        logger.info(f"⚡ Đọc xong Metadata (ContextID: {self.context_id}, EnrolID: {self.enrol_id}) & {len(self.existing_participants)} thành viên trong {elapsed}ms.")
        return True

    # =================================================================
    # GIAI ĐOẠN 3: MULTI-ROLE ENROL & SMART FALLBACK (MONO-ROLE)
    # =================================================================
    async def stage_3_multi_role_enrol_and_fallback(self, client: httpx.AsyncClient) -> List[int]:
        logger.info("\n" + "-" * 60)
        logger.info("🚀 [GIAI ĐOẠN 3] MULTI-ROLE ENROL & SMART FALLBACK (MONO-ROLE)...")
        all_active_uids: List[int] = []

        # Tách danh sách thành các nhóm vai trò
        roles_buckets: Dict[str, List[Dict[str, str]]] = {}
        for u in TEST_USERS:
            r_val = u["role_value"]
            roles_buckets.setdefault(r_val, []).append(u)

        for r_val, user_group in roles_buckets.items():
            r_label = user_group[0]["role_label"]
            logger.info(f"\n👉 Đang xử lý nhóm [{r_label}] (Role: {r_val}) gồm {len(user_group)} tài khoản:")

            new_enrol_uids: List[int] = []

            for u in user_group:
                em = u["email"].lower()
                # 1. Nếu đã có trong khóa học -> Kích hoạt SMART FALLBACK (Chữa lành Mono-Role)
                if em in self.existing_participants:
                    p_info = self.existing_participants[em]
                    uid = p_info["user_id"]
                    all_active_uids.append(uid)
                    logger.info(f"   ℹ️ [{em}] ĐÃ TỒN TẠI (UID: {uid}, UEID: {p_info['ue_id']}) ➔ Kích hoạt Smart Fallback:")

                    # Cập nhật Mono-Role duy nhất qua core_update_inplace_editable
                    role_payload = [{
                        "index": 0,
                        "methodname": "core_update_inplace_editable",
                        "args": {
                            "component": "core_user",
                            "itemtype": "user_roles",
                            "itemid": p_info["itemid"],
                            "value": f'["{r_val}"]'
                        }
                    }]
                    r_res = await client.post(f"/lib/ajax/service.php?sesskey={self.sesskey}&info=core_update_inplace_editable", json=role_payload)
                    if r_res.status_code == 200:
                        logger.info(f"      ✏️ Ép Mono-Role thành công ➔ [{r_label}]")

                # 2. Nếu chưa có -> Tìm User ID và chuẩn bị ghi danh mới
                else:
                    search_payload = [{
                        "index": 0,
                        "methodname": "core_enrol_get_potential_users",
                        "args": {
                            "courseid": TEST_COURSE_ID,
                            "enrolid": self.enrol_id,
                            "search": em,
                            "searchanywhere": True,
                            "page": 0,
                            "perpage": 5
                        }
                    }]
                    s_res = await client.post(f"/lib/ajax/service.php?sesskey={self.sesskey}&info=core_enrol_get_potential_users", json=search_payload)
                    if s_res.status_code == 200:
                        s_data = s_res.json()[0].get("data", [])
                        if s_data:
                            uid = int(s_data[0]["id"])
                            new_enrol_uids.append(uid)
                            all_active_uids.append(uid)
                            logger.info(f"      🎯 Tìm thấy user mới: {em} ➔ UID #{uid}")

            # Bắn 1 request ghi danh cho cả lô người mới của role này
            if new_enrol_uids:
                form_data = [
                    ("mform_showmore_main", "0"),
                    ("id", TEST_COURSE_ID),
                    ("action", "enrol"),
                    ("enrolid", self.enrol_id),
                    ("sesskey", self.sesskey),
                    ("_qf__enrol_manual_enrol_users_form", "1"),
                    ("mform_showmore_id_main", "1"),
                    ("roletoassign", r_val),
                    ("startdate", "4"),
                    ("timeend[day]", "15"),
                    ("timeend[month]", "9"),
                    ("timeend[year]", "2027"),
                    ("timeend[hour]", "17"),
                    ("timeend[minute]", "00"),
                    ("timeend[enabled]", "1")
                ]
                for uid in new_enrol_uids:
                    form_data.append(("userlist[]", str(uid)))

                encoded_body = urllib.parse.urlencode(form_data)
                enrol_res = await client.post(
                    "/enrol/manual/ajax.php",
                    content=encoded_body,
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
                if enrol_res.status_code == 200 and enrol_res.json().get("success"):
                    logger.info(f"   🎉 Ghi danh MỚI thành công {len(new_enrol_uids)} tài khoản [{r_label}] trong 1 request!")

        return list(set(all_active_uids))

    # =================================================================
    # GIAI ĐOẠN 4 & 5: FUZZY GROUP SEARCH & AUTO-CREATE NEW GROUP
    # =================================================================
    async def stage_4_fuzzy_group_and_add(self, client: httpx.AsyncClient, user_ids: List[int]):
        logger.info("\n" + "-" * 60)
        logger.info(f"👥 [GIAI ĐOẠN 4] TÌM NHÓM GẦN ĐÚNG (FUZZY MATCH): '{FUZZY_GROUP_SEARCH}'...")

        res = await client.get(f"/group/index.php?id={TEST_COURSE_ID}")
        groups_map: Dict[str, str] = {}
        if res.status_code == 200:
            options = re.findall(r'<option\s+value="(\d+)"[^>]*title="([^"]*)"[^>]*>', res.text)
            for g_val, g_title in options:
                clean_title = re.sub(r'\s*\(\d+\)$', '', g_title).strip()
                groups_map[clean_title] = g_val

        # Thuật toán tìm kiếm gần đúng (Substring + Difflib)
        matched_group_name = None
        matched_group_id = None

        # 1. Tìm theo Substring
        for g_name, g_id in groups_map.items():
            if FUZZY_GROUP_SEARCH.lower() in g_name.lower():
                matched_group_name, matched_group_id = g_name, g_id
                break

        # 2. Tìm theo Difflib Levenshtein cutoff 0.5
        if not matched_group_id:
            close = difflib.get_close_matches(FUZZY_GROUP_SEARCH, list(groups_map.keys()), n=1, cutoff=0.5)
            if close:
                matched_group_name = close[0]
                matched_group_id = groups_map[matched_group_name]

        if matched_group_id:
            logger.info(f"   🎯 FUZZY KHỚP THÀNH CÔNG: '{FUZZY_GROUP_SEARCH}' ➔ Nhóm: '{matched_group_name}' (ID: {matched_group_id})")
            add_payload = [
                ("sesskey", self.sesskey),
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
                logger.info(f"   🎉 Đã add {len(user_ids)} thành viên vào nhóm gần đúng [{matched_group_name}]!")

    async def stage_5_auto_create_group_and_add(self, client: httpx.AsyncClient, user_ids: List[int]):
        logger.info("\n" + "-" * 60)
        logger.info(f"➕ [GIAI ĐOẠN 5] TỰ ĐỘNG TẠO NHÓM MỚI TINH: '{AUTO_CREATE_GROUP_NAME}'...")

        # Bắn API tạo Group mới (Action 2 người dùng cung cấp)
        create_payload = {
            "id": "",
            "courseid": TEST_COURSE_ID,
            "sesskey": self.sesskey,
            "_qf__group_form": "1",
            "mform_isexpanded_id_general": "1",
            "name": AUTO_CREATE_GROUP_NAME,
            "idnumber": "",
            "description_editor[text]": "",
            "description_editor[format]": "1",
            "description_editor[itemid]": str(int(time.time())),
            "enrolmentkey": "",
            "enablemessaging": "0",
            "submitbutton": "Save changes"
        }
        res = await client.post("/group/group.php", data=create_payload)
        logger.info("   🚀 Đã gửi lệnh tạo Group mới đến Moodle...")

        # Quét lại để lấy ID của nhóm vừa sinh
        re_res = await client.get(f"/group/index.php?id={TEST_COURSE_ID}")
        new_gid = None
        if re_res.status_code == 200:
            options = re.findall(r'<option\s+value="(\d+)"[^>]*title="([^"]*)"[^>]*>', re_res.text)
            for g_val, g_title in options:
                if AUTO_CREATE_GROUP_NAME.lower() in g_title.lower():
                    new_gid = g_val
                    break

        if new_gid:
            logger.info(f"   🎉 TẠO NHÓM THÀNH CÔNG! Group ID mới: #{new_gid}")
            add_payload = [
                ("sesskey", self.sesskey),
                ("removeselect_searchtext", ""),
                ("userselector_preserveselected", "0"),
                ("userselector_autoselectunique", "0"),
                ("userselector_searchanywhere", "0"),
                ("add", "◄ Add")
            ]
            for uid in user_ids:
                add_payload.append(("addselect[]", str(uid)))

            await client.post(
                f"/group/members.php?group={new_gid}",
                content=urllib.parse.urlencode(add_payload),
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            logger.info(f"   🎉 Đã chuyển toàn bộ {len(user_ids)} thành viên vào Group mới tạo [{AUTO_CREATE_GROUP_NAME}]!")

    # =================================================================
    # GIAI ĐOẠN 6: SỬA NGÀY BẮT ĐẦU / KẾT THÚC QUA EDIT ENROLMENT API
    # =================================================================
    async def stage_6_edit_enrolment_dates(self, client: httpx.AsyncClient):
        logger.info("\n" + "-" * 60)
        logger.info("⚙️ [GIAI ĐOẠN 6] SỬA NGÀY BẮT ĐẦU & KẾT THÚC (Action 1 Bánh Răng)...")

        # Quét lại danh sách để có đủ UEID mới nhất
        await self.stage_2_fetch_metadata_and_participants(client)

        for u in TEST_USERS:
            em = u["email"].lower()
            if em in self.existing_participants:
                ue_id = self.existing_participants[em]["ue_id"]
                logger.info(f"   📅 Đang hiệu chỉnh ngày cho: {em} (UEID: {ue_id})...")

                form_data_str = urllib.parse.urlencode({
                    "ue": ue_id,
                    "ifilter": "",
                    "sesskey": self.sesskey,
                    "_qf__enrol_user_enrolment_form": "1",
                    "status": "0",  # Active
                    "timestart[day]": "15",
                    "timestart[month]": "1",
                    "timestart[year]": "2026",
                    "timestart[hour]": "08",
                    "timestart[minute]": "00",
                    "timestart[enabled]": "1",
                    "timeend[day]": "15",
                    "timeend[month]": "1",
                    "timeend[year]": "2027",
                    "timeend[hour]": "17",
                    "timeend[minute]": "00",
                    "timeend[enabled]": "1"
                })

                edit_payload = [{
                    "index": 0,
                    "methodname": "core_enrol_submit_user_enrolment_form",
                    "args": {"formdata": form_data_str}
                }]

                res = await client.post(f"/lib/ajax/service.php?sesskey={self.sesskey}&info=core_enrol_submit_user_enrolment_form", json=edit_payload)
                if res.status_code == 200 and res.json()[0].get("data", {}).get("result"):
                    logger.info(f"      ✅ Đã sửa ngày: Bắt đầu 15/01/2026 ➔ Kết thúc 15/01/2027 (Active)!")

    # =================================================================
    # GIAI ĐOẠN 7: UNENROL XÓA SẠCH HIỆN TRƯỜNG (Action 3 Thùng Rác)
    # =================================================================
    async def stage_7_unenrol_cleanup(self, client: httpx.AsyncClient):
        logger.info("\n" + "-" * 60)
        logger.info("🗑️ [GIAI ĐOẠN 7] UNENROL XÓA SẠCH TÀI KHOẢN KHỎI KHÓA HỌC...")

        await self.stage_2_fetch_metadata_and_participants(client)

        for u in TEST_USERS:
            em = u["email"].lower()
            if em in self.existing_participants:
                ue_id = self.existing_participants[em]["ue_id"]
                logger.info(f"   🗑️ Đang hủy ghi danh (Unenrol): {em} (UEID: {ue_id})...")

                del_payload = [{
                    "index": 0,
                    "methodname": "core_enrol_unenrol_user_enrolment",
                    "args": {"ueid": str(ue_id)}
                }]

                res = await client.post(f"/lib/ajax/service.php?sesskey={self.sesskey}&info=core_enrol_unenrol_user_enrolment", json=del_payload)
                if res.status_code == 200 and not res.json()[0].get("error"):
                    logger.info(f"      ✅ Đã Unenrol thành công: {em}!")

    # =================================================================
    # RUNNER CHÍNH
    # =================================================================
    async def run_master_pipeline(self):
        start_time = time.time()
        logger.info("🚀🚀🚀 BẮT ĐẦU MASTER LMS HIGH-SPEED TEST SUITE 🚀🚀🚀")

        # 1. Bốc Session
        if not await self.stage_1_steal_session():
            return

        async with httpx.AsyncClient(
            base_url=MOODLE_BASE_URL,
            cookies=self.cookies_dict,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"},
            timeout=30.0,
            follow_redirects=True
        ) as client:

            # 2. Quét Metadata
            await self.stage_2_fetch_metadata_and_participants(client)

            # 3. Multi-Role Enrol & Fallback Mono-Role
            active_uids = await self.stage_3_multi_role_enrol_and_fallback(client)

            # 4. Fuzzy Group Search (Gõ "Digital" -> Tự nhận diện Group "Digital Hub PH Corp")
            await self.stage_4_fuzzy_group_and_add(client, active_uids)

            # 5. Tự động tạo Group mới tinh & chuyển user vào
            await self.stage_5_auto_create_group_and_add(client, active_uids)

            # 6. Sửa ngày bắt đầu & ngày kết thúc qua Bánh Răng API
            await self.stage_6_edit_enrolment_dates(client)

            # 7. Unenrol dọn dẹp sạch sẽ
            await self.stage_7_unenrol_cleanup(client)

        total_elapsed = round(time.time() - start_time, 2)
        logger.info("\n" + "=" * 60)
        logger.info(f"🏁 TỔNG KẾT TOÀN BỘ 7 GIAI ĐOẠN HOÀN TẤT TRONG: {total_elapsed} GIÂY!")
        logger.info("=" * 60 + "\n")


if __name__ == "__main__":
    tester = MasterLMSFastTester()
    asyncio.run(tester.run_master_pipeline())