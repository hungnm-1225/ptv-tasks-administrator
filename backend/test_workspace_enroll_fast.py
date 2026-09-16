# backend/test_workspace_enroll_fast.py
"""
=====================================================================
🚀 MASTER SCHOOL WORKSPACE ENROLL FAST ENGINE TEST SUITE
=====================================================================
Kịch bản kiểm thử toàn trình Gán License & Phân Group trên School Workspace:
1. Playwright bốc Session School (3-4s) -> Đóng Chromium giải phóng RAM.
2. HTTPX GET getListEnrolledCourse.php đọc coursePackage, listStudent, listTeacher.
3. HTTPX POST createGroup.php tạo Group LMS tự động (100ms).
4. HTTPX POST enrolMultipleUser.php gán học sinh (Role 9) & giáo viên (Role 7) vào Group (300ms).
=====================================================================
"""

import os
import sys
import re
import time
import logging
import asyncio
import gc
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
from dotenv import load_dotenv
import httpx
from playwright.async_api import async_playwright, Browser

# Ép nạp đúng file backend/.env
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)
else:
    load_dotenv()

from app.core.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("WS_ENROLL_TEST")

BASE_URL = (getattr(settings, "WORKSPACE_BASE_URL", None) or "https://pythaverse.space").rstrip("/")
SCHOOL_USER = os.getenv("TEST_SCHOOL_USER") or getattr(settings, "TEST_SCHOOL_USER", "htdttemd")
SCHOOL_PASS = str(os.getenv("TEST_SCHOOL_PASS") or getattr(settings, "TEST_SCHOOL_PASS", "Leanbot@2024")).strip().strip("'\"")

# =====================================================================
# 🎯 THÔNG SỐ TEST THỰC TẾ (Khóa ASP ID 780 & Group Test)
# =====================================================================
TEST_COURSE_ID = 780
TEST_GROUP_NAME = f"The College of Maasin Inc Gr7 Rizal {datetime.now().strftime('%Y%b')}"

# Danh sách test học sinh & giáo viên mẫu từ đợt test trước của anh
TEST_STUDENT_EMAILS = [
    "aiflowtesting.student02@example.com",
    "aiflowtesting.student03@example.com",
    "aiflowtesting.student04@example.com",
    "aiflowtesting.student05@example.com",
    "aiflowtesting.student07@example.com"
]

TEST_TEACHER_EMAILS = [
    "aiflowtesting.teacher01@example.com",
    "aiflowtesting.teacher02@example.com"
]


class WorkspaceEnrollFastTester:
    def __init__(self):
        self.cookies_dict: Dict[str, str] = {}
        self.school_id: str = "10266"

    # =================================================================
    # 🔑 1. BỐC SESSION PLAYWRIGHT (CHỈ 3S RỒI ĐÓNG CHROMIUM)
    # =================================================================
    async def steal_school_session(self) -> bool:
        logger.info("\n" + "=" * 65)
        logger.info(f"🔑 BỐC SESSION SCHOOL WORKSPACE CHO: [{SCHOOL_USER}]...")
        logger.info("=" * 65)
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
            await context.route("**/*.{png,jpg,jpeg,webp,svg,gif,woff,woff2,mp4}", lambda r: r.abort())
            page = await context.new_page()

            try:
                await page.goto(f"{BASE_URL}/login/", wait_until="domcontentloaded", timeout=30000)

                await page.evaluate(f"""() => {{
                    const u = document.querySelector("input#username, input[name='username'], #username, input[type='text']");
                    const p = document.querySelector("input#password, input[name='password'], #password, input[type='password']");
                    if (u) {{ u.value = "{SCHOOL_USER}"; u.dispatchEvent(new Event('input', {{ bubbles: true }})); }}
                    if (p) {{ p.value = "{SCHOOL_PASS}"; p.dispatchEvent(new Event('input', {{ bubbles: true }})); }}
                }}""")

                submit_btn = page.locator("button[type='submit'], input[type='submit'], button:has-text('Login'), button:has-text('Đăng nhập')").first
                await submit_btn.click(force=True)

                await page.wait_for_url(re.compile(r"(school-workspace|orders|courses)", re.IGNORECASE), timeout=20000)

                wp_identity = await page.evaluate("""() => {
                    const u = window.user || {};
                    let localUser = {};
                    try { localUser = JSON.parse(localStorage.getItem('user') || '{}'); } catch(e) {}
                    return {
                        school_id: u.school_id || localUser.school_id || '10266'
                    };
                }""")
                self.school_id = str(wp_identity.get("school_id") or "10266")

                cookies = await context.cookies()
                self.cookies_dict = {c["name"]: c["value"] for c in cookies}

                elapsed = round(time.time() - t0, 2)
                logger.info(f"✨ [RAM Zero] Bốc Session School ID [{self.school_id}] thành công trong {elapsed}s!")
                return True

            except Exception as e:
                logger.error(f"❌ Lỗi bốc Session School: {e}")
                return False
            finally:
                await browser.close()
                gc.collect()

    @staticmethod
    def _to_multipart(data_dict: Dict[str, Any]) -> Dict[str, Tuple[None, str]]:
        return {k: (None, str(v) if v is not None else "") for k, v in data_dict.items()}

    # =================================================================
    # 🚀 2. THỰC THI ENROLL TRƯỜNG HỌC QUA DIRECT API (~1.5s)
    # =================================================================
    async def run_direct_enroll_pipeline(self, client: httpx.AsyncClient) -> bool:
        logger.info("\n" + "-" * 65)
        logger.info(f"📚 [DIRECT API] BẮT ĐẦU ENROLL CHO KHÓA #{TEST_COURSE_ID}...")
        t0 = time.time()

        # BƯỚC 1: LẤY METADATA GÓI HỌC & DANH BẠ HỌC SINH / GIÁO VIÊN
        meta_url = f"{BASE_URL}/wp-content/plugins/school_workspace_v3/api/courses/getListEnrolledCourse.php?school_id={self.school_id}"
        meta_res = await client.get(meta_url)
        if meta_res.status_code != 200:
            logger.error(f"❌ Lỗi đọc metadata khóa học ({meta_res.status_code}): {meta_res.text}")
            return False

        meta_data = meta_res.json()
        packages = meta_data.get("coursePackage", [])
        list_students = meta_data.get("listStudent", [])
        list_teachers = meta_data.get("listTeacher", [])

        # Tìm Package ID của khóa học mục tiêu
        matched_pkg = next((p for p in packages if p.get("course_id") == TEST_COURSE_ID), None)
        if not matched_pkg:
            logger.error(f"❌ Trường #{self.school_id} chưa mua hoặc chưa được duyệt gói cho Khóa #{TEST_COURSE_ID}!")
            return False

        pkg_id = str(matched_pkg.get("id"))
        start_ts = matched_pkg.get("course_enroll_start_date_bigint") or int(time.time())
        end_ts = matched_pkg.get("course_enroll_end_date_bigint") or int(time.time() + 365 * 86400)
        existing_groups = matched_pkg.get("groups", [])

        logger.info(f"📦 Khớp gói Package ID: [ #{pkg_id} ] ({matched_pkg.get('course_name')})")
        logger.info(f"   👉 Thời hạn: {matched_pkg.get('course_enroll_start_date')} ➔ {matched_pkg.get('course_enroll_end_date')}")

        # BƯỚC 2: TẠO HOẶC LẤY GROUP ID (createGroup.php)
        group_id = None
        matched_grp = next((g for g in existing_groups if g.get("group_name") == TEST_GROUP_NAME), None)
        if matched_grp:
            group_id = matched_grp.get("group_id")
            logger.info(f"ℹ️ Group '{TEST_GROUP_NAME}' đã có sẵn ➔ Group ID: [ #{group_id} ]")
        else:
            logger.info(f"➕ Đang tạo Group mới: '{TEST_GROUP_NAME}'...")
            grp_payload = {
                "course_id": str(TEST_COURSE_ID),
                "group_name": TEST_GROUP_NAME,
                "school_id": self.school_id
            }
            grp_res = await client.post(
                f"{BASE_URL}/wp-content/plugins/school_workspace_v3/api/courses/createGroup.php",
                files=self._to_multipart(grp_payload)
            )
            if grp_res.status_code == 200 and grp_res.json().get("success"):
                created_grp_data = grp_res.json().get("data", [])
                if created_grp_data:
                    group_id = created_grp_data[0].get("id")
                    logger.info(f"🎉 TẠO GROUP THÀNH CÔNG! Group ID: [ #{group_id} ]")

        if not group_id:
            logger.error("❌ Không lấy được Group ID để gán học sinh!")
            return False

        # Ánh xạ từ điển Email -> {wp_user_id, moodle_user_id}
        student_dir = {s["user_email"].lower(): s for s in list_students if s.get("user_email")}
        teacher_dir = {t["user_email"].lower(): t for t in list_teachers if t.get("user_email")}

        # BƯỚC 3: GÁN HỌC SINH (ROLEID = 9) QUA enrolMultipleUser.php
        matched_students = [student_dir[e.lower()] for e in TEST_STUDENT_EMAILS if e.lower() in student_dir]
        if matched_students:
            logger.info(f"🎓 Đang gán {len(matched_students)} Học sinh (Role 9) vào Group #{group_id}...")
            st_payload = {
                "id": pkg_id,
                "course_use": str(len(matched_students)),
                "role_name": "student",
                "school_id": self.school_id,
                "type": "enrol",
                "enrol_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            for idx, st in enumerate(matched_students):
                moodle_uid = st.get("moodle_user_id") or st.get("ID")
                wp_uid = st.get("ID")
                st_payload[f"enrolments[{idx}][userid]"] = str(moodle_uid)
                st_payload[f"enrolments[{idx}][courseid]"] = str(TEST_COURSE_ID)
                st_payload[f"enrolments[{idx}][roleid]"] = "9"
                st_payload[f"enrolments[{idx}][suspend]"] = "0"
                st_payload[f"enrolments[{idx}][timestart]"] = str(start_ts)
                st_payload[f"enrolments[{idx}][timeend]"] = str(end_ts)
                st_payload[f"enrolments[{idx}][wp_user_id]"] = str(wp_uid)

                st_payload[f"enrolmentsGroup[{idx}][userid]"] = str(moodle_uid)
                st_payload[f"enrolmentsGroup[{idx}][groupid]"] = str(group_id)
                st_payload[f"enrolmentsGroup[{idx}][wp_user_id]"] = str(wp_uid)

            st_res = await client.post(
                f"{BASE_URL}/wp-content/plugins/school_workspace_v3/api/courses/enrolMultipleUser.php",
                files=self._to_multipart(st_payload)
            )
            if st_res.status_code == 200 and st_res.json().get("success"):
                logger.info(f"🎉 GÁN THÀNH CÔNG {len(matched_students)} HỌC SINH VÀO KHÓA #{TEST_COURSE_ID} & GROUP #{group_id}!")
            else:
                logger.error(f"❌ Gán học sinh thất bại: {st_res.text}")

        # BƯỚC 4: GÁN GIÁO VIÊN (ROLEID = 7) QUA enrolMultipleUser.php
        matched_teachers = [teacher_dir[e.lower()] for e in TEST_TEACHER_EMAILS if e.lower() in teacher_dir]
        if matched_teachers:
            logger.info(f"🧑‍🏫 Đang gán {len(matched_teachers)} Giáo viên (Role 7) vào Group #{group_id}...")
            tc_payload = {
                "id": pkg_id,
                "course_use": str(len(matched_teachers)),
                "role_name": "teacher",
                "school_id": self.school_id,
                "type": "enrol",
                "enrol_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            for idx, tc in enumerate(matched_teachers):
                moodle_uid = tc.get("moodle_user_id") or tc.get("ID")
                wp_uid = tc.get("ID")
                tc_payload[f"enrolments[{idx}][userid]"] = str(moodle_uid)
                tc_payload[f"enrolments[{idx}][courseid]"] = str(TEST_COURSE_ID)
                tc_payload[f"enrolments[{idx}][roleid]"] = "7"
                tc_payload[f"enrolments[{idx}][suspend]"] = "0"
                tc_payload[f"enrolments[{idx}][timestart]"] = str(start_ts)
                tc_payload[f"enrolments[{idx}][timeend]"] = str(end_ts)
                tc_payload[f"enrolments[{idx}][wp_user_id]"] = str(wp_uid)

                tc_payload[f"enrolmentsGroup[{idx}][userid]"] = str(moodle_uid)
                tc_payload[f"enrolmentsGroup[{idx}][groupid]"] = str(group_id)
                tc_payload[f"enrolmentsGroup[{idx}][wp_user_id]"] = str(wp_uid)

            tc_res = await client.post(
                f"{BASE_URL}/wp-content/plugins/school_workspace_v3/api/courses/enrolMultipleUser.php",
                files=self._to_multipart(tc_payload)
            )
            if tc_res.status_code == 200 and tc_res.json().get("success"):
                logger.info(f"🎉 GÁN THÀNH CÔNG {len(matched_teachers)} GIÁO VIÊN VÀO KHÓA #{TEST_COURSE_ID} & GROUP #{group_id}!")
            else:
                logger.error(f"❌ Gán giáo viên thất bại: {tc_res.text}")

        elapsed = round((time.time() - t0) * 1000, 1)
        logger.info(f"\n🏁 TOÀN BỘ TIẾN TRÌNH ENROLL HOÀN TẤT TRONG: {elapsed}ms!")
        return True

    async def run(self):
        t_start = time.time()
        if not await self.steal_school_session():
            return

        async with httpx.AsyncClient(
            base_url=BASE_URL,
            cookies=self.cookies_dict,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"},
            timeout=30.0
        ) as client:
            await self.run_direct_enroll_pipeline(client)

        total_elapsed = round(time.time() - t_start, 2)
        logger.info("=" * 65)
        logger.info(f"🏆 TỔNG THỜI GIAN THỰC THI TOÀN TRÌNH: {total_elapsed} GIÂY!")
        logger.info("=" * 65 + "\n")


if __name__ == "__main__":
    tester = WorkspaceEnrollFastTester()
    asyncio.run(tester.run())