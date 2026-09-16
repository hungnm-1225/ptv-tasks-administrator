# backend/app/services/workspace/enroll_service.py
"""
Workspace License & Course Enrollment Service (Master Enterprise Edition)
Tác giả: Nguyễn Mạnh Hùng & Co-pilot AI
Chuyên trách: 
- Gán License và phân bổ Group LMS cho Học Sinh & Giáo Viên trên School Workspace qua Direct API.
- Hỗ trợ Ma trận Đa Khóa Học (Multi-Course), Đa Phân Nhóm (Multi-Group) và Giáo viên dạy nhiều môn.
- TỰ ĐỘNG ĐỒNG BỘ PYTHAVERSE GIT: Tra cứu git_repos từ CSDL Supabase theo Course ID và phân quyền tự động.
"""
import os
import re
import gc
import json
import time
import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple, Set
import httpx
from playwright.async_api import async_playwright, Browser

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot, LOW_RAM_CHROMIUM_ARGS, setup_low_ram_routes
from app.services.workspace_lineage_service import workspace_lineage_service
from app.services.git_service import git_playwright_service
from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)


class WorkspaceEnrollService(WorkspaceBaseService):
    """
    Dịch vụ Ghi danh & Phân phối License trên School Workspace:
    ĐỘNG CƠ HYBRID V3.6:
    - Playwright bốc Session School đúng 3 giây ➔ Đóng Chromium giải phóng RAM.
    - HTTPX Direct API: Tạo Group, Gán học sinh (Role 9) & Giáo viên (Role 7) đa môn học.
    - TỰ ĐỘNG ĐỒNG BỘ GIT: Móc nối Course ID ➔ git_repos ➔ Tự động thêm vào GitBucket!
    """

    # =========================================================================
    # 🛠️ HELPER NỘI BỘ: BỐC SESSION PLAYWRIGHT CỰC NHANH
    # =========================================================================
    async def _steal_school_session(self, username: str, password: str) -> Tuple[Dict[str, str], str]:
        """Đăng nhập Playwright 3s, lấy Cookie và School ID rồi đóng Chromium ngay."""
        async with async_playwright() as p:
            browser: Browser = await p.chromium.launch(headless=True, args=LOW_RAM_ARGS)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"
            )
            await setup_low_ram_routes(context)
            page = await context.new_page()

            try:
                is_ok, login_err = await self.login_role(page, username, password, "School")
                if not is_ok:
                    raise RuntimeError(f"Đăng nhập School thất bại: {login_err}")

                wp_identity = await page.evaluate("""() => {
                    const u = window.user || {};
                    let localUser = {};
                    try { localUser = JSON.parse(localStorage.getItem('user') || '{}'); } catch(e) {}
                    return {
                        school_id: u.school_id || localUser.school_id || '10266'
                    };
                }""")
                school_id = str(wp_identity.get("school_id") or "10266")

                cookies = await context.cookies()
                cookies_dict = {c["name"]: c["value"] for c in cookies}
                return cookies_dict, school_id

            finally:
                await browser.close()
                gc.collect()

    @staticmethod
    def _to_multipart(data_dict: Dict[str, Any]) -> Dict[str, Tuple[None, str]]:
        return {k: (None, str(v) if v is not None else "") for k, v in data_dict.items()}

    # =========================================================================
    # 🐙 HELPER: TRA CỨU GIT_REPOS TỪ CSDL SUPABASE THEO COURSE ID
    # =========================================================================
    def _resolve_git_repos_for_courses(
        self,
        course_ids: List[int],
        class_assignments: Dict[str, List[Dict[str, Any]]],
        teachers_alloc: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Tra cứu bảng workspace_courses & lms_courses trên Supabase để lập kế hoạch add Git."""
        if not course_ids:
            return []

        git_sync_plan: List[Dict[str, Any]] = []
        supabase = get_supabase_client()

        try:
            # Tra cứu bảng workspace_courses
            res = supabase.table("workspace_courses").select("course_id, course_name, git_repos").in_("course_id", course_ids).execute()
            db_courses = res.data or []

            # Nếu chưa thấy, tra cứu thêm bảng lms_courses
            if not db_courses:
                res2 = supabase.table("lms_courses").select("course_id, course_name, git_repos").in_("course_id", course_ids).execute()
                db_courses = res2.data or []

            for db_c in db_courses:
                cid_str = str(db_c.get("course_id"))
                raw_repos = db_c.get("git_repos") or []

                if isinstance(raw_repos, str):
                    try:
                        raw_repos = json.loads(raw_repos)
                    except Exception:
                        raw_repos = []

                if not isinstance(raw_repos, list):
                    continue

                # Gom danh sách học sinh thuộc khóa này
                course_students: List[str] = []
                for cls in class_assignments.get(cid_str, []):
                    course_students.extend([str(s).strip().lower() for s in cls.get("students", []) if str(s).strip()])

                # Gom danh sách giáo viên phụ trách khóa này
                course_teachers: List[str] = []
                for t in teachers_alloc:
                    t_email = str(t.get("email") or "").strip().lower()
                    assigned_cids = [str(c) for c in t.get("assignedCourses", [])]
                    if cid_str in assigned_cids and t_email:
                        course_teachers.append(t_email)

                for r_item in raw_repos:
                    if not isinstance(r_item, dict):
                        continue
                    repo_url = str(r_item.get("repo_url") or "").strip()
                    target = str(r_item.get("target") or "all").strip().lower()

                    if not repo_url:
                        continue

                    # Phân loại đối tượng thêm vào Repo: Teacher-only hay All (HS + GV)
                    if target == "teacher_only":
                        target_users = list(set(course_teachers))
                        role = "GUEST"
                    else:
                        target_users = list(set(course_students + course_teachers))
                        role = "GUEST"

                    if target_users:
                        # Kiểm tra xem repo này đã có trong plan chưa, nếu có thì gộp users
                        existing = next((p for p in git_sync_plan if p["repo_url"] == repo_url), None)
                        if existing:
                            existing["users"] = list(set(existing["users"] + target_users))
                        else:
                            git_sync_plan.append({
                                "repo_url": repo_url,
                                "role": role,
                                "users": target_users,
                                "course_name": db_c.get("course_name", f"Course #{cid_str}")
                            })

            logger.info(f"🐙 [Git Resolver] Đã lập kế hoạch đồng bộ {len(git_sync_plan)} Repositories liên kết.")
        except Exception as e:
            logger.warning(f"⚠️ [Git Resolver] Lỗi khi tra cứu git_repos: {e}")

        return git_sync_plan

    # =========================================================================
    # 🚀 PIPELINE GHI DANH ĐA KHÓA HỌC & ĐỒNG BỘ GIT TOÀN TRÌNH
    # =========================================================================
    async def enroll_students_pipeline(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Cổng tiếp nhận chính:
        1. Bốc session School Workspace.
        2. Duyệt qua Ma trận Đa Khóa Học (Multi-Course), tạo Group và gán học sinh/giáo viên.
        3. Tự động tra cứu CSDL Supabase theo Course ID và đồng bộ vào Pythaverse Git!
        """
        school_name = payload.get("school_name") or payload.get("school_code") or ""
        logger.info(f"\n🚀 [Workspace Enroll Engine] Bắt đầu xử lý cho trường: '{school_name}'...")
        t0 = time.time()

        # 1. Tra cứu Két Sắt Fernet
        resolved_school = workspace_lineage_service.resolve_by_school(school_name)
        if not resolved_school or not resolved_school.get("school_user") or not resolved_school.get("school_pass"):
            err_msg = f"Không tìm thấy thông tin đăng nhập của trường '{school_name}' trong Két Sắt Vault!"
            logger.error(f"❌ {err_msg}")
            return {"status": "failed", "error": err_msg}

        school_user = resolved_school["school_user"]
        school_pass = resolved_school["school_pass"]

        courses_plan = payload.get("courses") or payload.get("courses_plan") or []
        class_assignments = payload.get("class_assignments") or {}
        teachers_alloc = payload.get("teachers_allocation") or []
        should_auto_sync_git = payload.get("auto_sync_git", True)

        async with acquire_playwright_slot("School Workspace Enroll Pipeline", lane="admin"):
            try:
                # 2. Bốc Session đúng 3s
                cookies, school_id = await self._steal_school_session(school_user, school_pass)

                async with httpx.AsyncClient(
                    base_url=BASE_WORKSPACE_URL,
                    cookies=cookies,
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"},
                    timeout=30.0
                ) as client:

                    # 3. Đọc Metadata danh sách gói khóa học và danh bạ học sinh/giáo viên
                    meta_url = f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/courses/getListEnrolledCourse.php?school_id={school_id}"
                    meta_res = await client.get(meta_url)
                    if meta_res.status_code != 200:
                        return {"status": "failed", "error": f"Lỗi đọc metadata khóa học ({meta_res.status_code}): {meta_res.text}"}

                    meta_data = meta_res.json()
                    packages = meta_data.get("coursePackage", [])
                    list_students = meta_data.get("listStudent", [])
                    list_teachers = meta_data.get("listTeacher", [])

                    student_dir = {s["user_email"].lower(): s for s in list_students if s.get("user_email")}
                    teacher_dir = {t["user_email"].lower(): t for t in list_teachers if t.get("user_email")}

                    total_students_enrolled = 0
                    total_teachers_enrolled = 0
                    created_groups_count = 0
                    processed_courses_count = 0

                    # 4. DUYỆT QUA TỪNG KHÓA HỌC TRONG MA TRẬN (MULTI-COURSE LOOP)
                    for c_item in courses_plan:
                        c_id = int(c_item.get("course_id") or c_item.get("id", 0))
                        if not c_id:
                            continue

                        # Khớp Package ID đã mua
                        matched_pkg = next((p for p in packages if p.get("course_id") == c_id), None)
                        if not matched_pkg:
                            logger.warning(f"⚠️ Không tìm thấy gói đã mua cho Khóa #{c_id} trên Workspace!")
                            continue

                        pkg_id = str(matched_pkg.get("id"))
                        start_ts = matched_pkg.get("course_enroll_start_date_bigint") or int(time.time())
                        end_ts = matched_pkg.get("course_enroll_end_date_bigint") or int(time.time() + 365 * 86400)
                        existing_groups = matched_pkg.get("groups", [])

                        # Lấy danh sách các lớp được xếp vào khóa học này
                        assigned_classes = class_assignments.get(str(c_id), [])
                        logger.info(f"📚 Đang xử lý Khóa #{c_id} ({matched_pkg.get('course_name')}) gồm {len(assigned_classes)} lớp:")

                        # A. Xử lý từng Group học sinh
                        for cls in assigned_classes:
                            grp_name = cls.get("lmsGroupName") or cls.get("rawClassName")
                            if not grp_name:
                                continue

                            # Tìm hoặc tạo Group mới qua createGroup.php
                            group_id = None
                            matched_grp = next((g for g in existing_groups if g.get("group_name") == grp_name), None)
                            if matched_grp:
                                group_id = matched_grp.get("group_id")
                            else:
                                grp_payload = {"course_id": str(c_id), "group_name": grp_name, "school_id": school_id}
                                grp_res = await client.post(
                                    f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/courses/createGroup.php",
                                    files=self._to_multipart(grp_payload)
                                )
                                if grp_res.status_code == 200 and grp_res.json().get("success"):
                                    created_data = grp_res.json().get("data", [])
                                    if created_data:
                                        group_id = created_data[0].get("id")
                                        created_groups_count += 1
                                        # Cập nhật cache local existing_groups
                                        existing_groups.append({"group_id": group_id, "group_name": grp_name})

                            if not group_id:
                                continue

                            # Gán danh sách học sinh của lớp này
                            cls_students = cls.get("students", []) or []
                            matched_st_records = [student_dir[s.lower()] for s in cls_students if str(s).lower() in student_dir]

                            if matched_st_records:
                                st_payload = {
                                    "id": pkg_id,
                                    "course_use": str(len(matched_st_records)),
                                    "role_name": "student",
                                    "school_id": school_id,
                                    "type": "enrol",
                                    "enrol_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                                }
                                for idx, st in enumerate(matched_st_records):
                                    moodle_uid = st.get("moodle_user_id") or st.get("ID")
                                    wp_uid = st.get("ID")
                                    st_payload[f"enrolments[{idx}][userid]"] = str(moodle_uid)
                                    st_payload[f"enrolments[{idx}][courseid]"] = str(c_id)
                                    st_payload[f"enrolments[{idx}][roleid]"] = "9"
                                    st_payload[f"enrolments[{idx}][suspend]"] = "0"
                                    st_payload[f"enrolments[{idx}][timestart]"] = str(start_ts)
                                    st_payload[f"enrolments[{idx}][timeend]"] = str(end_ts)
                                    st_payload[f"enrolments[{idx}][wp_user_id]"] = str(wp_uid)

                                    st_payload[f"enrolmentsGroup[{idx}][userid]"] = str(moodle_uid)
                                    st_payload[f"enrolmentsGroup[{idx}][groupid]"] = str(group_id)
                                    st_payload[f"enrolmentsGroup[{idx}][wp_user_id]"] = str(wp_uid)

                                await client.post(
                                    f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/courses/enrolMultipleUser.php",
                                    files=self._to_multipart(st_payload)
                                )
                                total_students_enrolled += len(matched_st_records)

                        # B. Gán các Giáo viên phụ trách khóa học này
                        for t_item in teachers_alloc:
                            t_email = str(t_item.get("email") or "").lower()
                            assigned_cids = [str(c) for c in t_item.get("assignedCourses", [])]

                            if str(c_id) not in assigned_cids or t_email not in teacher_dir:
                                continue

                            tc_record = teacher_dir[t_email]
                            moodle_uid = tc_record.get("moodle_user_id") or tc_record.get("ID")
                            wp_uid = tc_record.get("ID")

                            t_groups = t_item.get("assignedLmsGroups", [])
                            for g_name in t_groups:
                                matched_grp = next((g for g in existing_groups if g.get("group_name") == g_name), None)
                                if not matched_grp:
                                    continue

                                grp_id = matched_grp.get("group_id")
                                tc_payload = {
                                    "id": pkg_id,
                                    "course_use": "1",
                                    "role_name": "teacher",
                                    "school_id": school_id,
                                    "type": "enrol",
                                    "enrol_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                    "enrolments[0][userid]": str(moodle_uid),
                                    "enrolments[0][courseid]": str(c_id),
                                    "enrolments[0][roleid]": "7",
                                    "enrolments[0][suspend]": "0",
                                    "enrolments[0][timestart]": str(start_ts),
                                    "enrolments[0][timeend]": str(end_ts),
                                    "enrolments[0][wp_user_id]": str(wp_uid),
                                    "enrolmentsGroup[0][userid]": str(moodle_uid),
                                    "enrolmentsGroup[0][groupid]": str(grp_id),
                                    "enrolmentsGroup[0][wp_user_id]": str(wp_uid)
                                }
                                await client.post(
                                    f"{BASE_WORKSPACE_URL}/wp-content/plugins/school_workspace_v3/api/courses/enrolMultipleUser.php",
                                    files=self._to_multipart(tc_payload)
                                )
                                total_teachers_enrolled += 1

                        processed_courses_count += 1

                # =====================================================================
                # 5. 🐙 TỰ ĐỘNG ĐỒNG BỘ PYTHAVERSE GIT REPOSITORIES
                # =====================================================================
                git_summary = "Không có Repo liên kết cần đồng bộ."
                if should_auto_sync_git:
                    course_ids = [int(c.get("course_id") or c.get("id")) for c in courses_plan if (c.get("course_id") or c.get("id"))]
                    git_plan = self._resolve_git_repos_for_courses(course_ids, class_assignments, teachers_alloc)

                    if git_plan:
                        logger.info(f"\n🐙 [Auto Git Sync] Đang tự động gán quyền cho {len(git_plan)} Repositories liên kết...")
                        git_res = await git_playwright_service.add_collaborators_pipeline({
                            "repos_plan": git_plan,
                            "action": "add"
                        })
                        git_summary = git_res.get("message") or "Đồng bộ Git hoàn tất."
                        logger.info(f"🎉 [Git Sync Hoàn Tất]: {git_summary}")

                elapsed = round((time.time() - t0), 2)
                summary_msg = (
                    f"Đã gán thành công {total_students_enrolled} lượt Học sinh & {total_teachers_enrolled} lượt Giáo viên "
                    f"vào {processed_courses_count} Khóa học ({created_groups_count} Group mới) trên Workspace trong {elapsed}s! "
                    f"🐙 Git Sync: {git_summary}"
                )
                logger.info(f"🏆 [HOÀN THÀNH XUẤT SẮC TOÀN TRÌNH] {summary_msg}")

                return {
                    "status": "success",
                    "message": summary_msg,
                    "school_name": school_name,
                    "total_students_enrolled": total_students_enrolled,
                    "total_teachers_enrolled": total_teachers_enrolled,
                    "created_groups_count": created_groups_count,
                    "git_sync_summary": git_summary,
                    "elapsed_seconds": elapsed
                }

            except Exception as e:
                logger.error(f"❌ Lỗi School Workspace Enroll Pipeline: {e}", exc_info=True)
                return {"status": "failed", "error": str(e)}


workspace_enroll_service = WorkspaceEnrollService()