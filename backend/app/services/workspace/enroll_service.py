# backend/app/services/workspace/enroll_service.py
import logging
from typing import Dict, Any, List
from playwright.async_api import async_playwright

from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import acquire_playwright_slot, wait_for_dom_and_spinners

logger = logging.getLogger(__name__)


class WorkspaceEnrollService(WorkspaceBaseService):
    """Xử lý ghi danh học sinh/giáo viên và tạo Group lớp trên School Workspace."""

    async def school_enroll_users_and_groups(
        self,
        credentials: Dict[str, str],
        course_name: str,
        start_date: str,
        end_date: str,
        school_name: str,
        group_name_raw: str,
        student_emails: List[str],
        teacher_emails: List[str] = []
    ) -> Dict[str, Any]:
        async with acquire_playwright_slot("School Enroll Users and Groups"):
            async with async_playwright() as p:
                browser, context, page = await self._create_context(p)
                try:
                    is_ok, login_err = await self.login_role(page, credentials.get("username", ""), credentials.get("password", ""), "School")
                    if not is_ok:
                        return {"status": "failed", "error": login_err}

                    logger.info("📚 Điều hướng tới /school-workspace/courses...")
                    await page.goto(f"{BASE_WORKSPACE_URL}/school-workspace/courses", wait_until="domcontentloaded", timeout=45000)
                    await wait_for_dom_and_spinners(page, "table, .MuiDataGrid-row, tr", min_pacing_ms=800)

                    course_row = page.locator(f"//tr[contains(., '{course_name}') and contains(., '{start_date}')]").first
                    if await course_row.count() == 0:
                        course_row = page.locator(f"//tr[contains(., '{course_name}')]").first

                    await course_row.locator("a, button, text=" + course_name).first.click()
                    await wait_for_dom_and_spinners(page, "text=Enrolled Users", min_pacing_ms=500)

                    await page.click("button:has-text('Enroll Users')")
                    await wait_for_dom_and_spinners(page, "text=User Enrollment", min_pacing_ms=500)

                    await page.click("text=GROUP MANAGEMENT")
                    await wait_for_dom_and_spinners(page, "input[placeholder*='Group Name'], input[name='group_name']", min_pacing_ms=400)

                    formatted_group_name = f"{school_name} {group_name_raw} {start_date[:5]}".strip()
                    await page.fill("input[placeholder*='Group Name'], input[name='group_name']", formatted_group_name)
                    await page.click("button:has-text('Create Group')")
                    # Chờ xử lý tạo Group và spinner ẩn hoàn toàn (thay thế wait_for_timeout 1500ms)
                    await wait_for_dom_and_spinners(page, min_pacing_ms=800)

                    await page.click("text=BULK IMPORT")
                    await wait_for_dom_and_spinners(page, "//div[contains(., 'Groups') and contains(@class, 'select')] | //select", min_pacing_ms=400)

                    group_dropdown = page.locator("//div[contains(., 'Groups') and contains(@class, 'select')] | //select").first
                    await group_dropdown.click()
                    await page.locator(f"text={formatted_group_name}").first.click()

                    if student_emails:
                        role_dropdown = page.locator("//div[contains(., 'Assign Role') and contains(@class, 'select')] | //select").last
                        await role_dropdown.click()
                        await page.locator("text=Student").last.click()

                        students_text = "\n".join(student_emails)
                        await page.fill("textarea[placeholder*='Paste user data'], textarea", students_text)
                        await page.click("button:has-text('Import and Enroll Users')")
                        # Chờ API ghi danh học sinh hoàn tất theo State (thay thế wait_for_timeout 3000ms)
                        await wait_for_dom_and_spinners(page, min_pacing_ms=1000)

                    if teacher_emails:
                        role_dropdown = page.locator("//div[contains(., 'Assign Role') and contains(@class, 'select')] | //select").last
                        await role_dropdown.click()
                        await page.locator("text=Teacher").last.click()

                        teachers_text = "\n".join(teacher_emails)
                        await page.fill("textarea[placeholder*='Paste user data'], textarea", teachers_text)
                        await page.click("button:has-text('Import and Enroll Users')")
                        # Chờ API ghi danh giáo viên hoàn tất theo State (thay thế wait_for_timeout 2500ms)
                        await wait_for_dom_and_spinners(page, min_pacing_ms=1000)

                    await page.click("button:has-text('Close')")
                    await wait_for_dom_and_spinners(page, min_pacing_ms=400)

                    return {
                        "status": "success",
                        "group_name": formatted_group_name,
                        "enrolled_students": len(student_emails),
                        "enrolled_teachers": len(teacher_emails)
                    }

                except Exception as e:
                    logger.error(f"❌ Lỗi School Enroll Users: {e}")
                    return {"status": "failed", "error": str(e)}
                finally:
                    await browser.close()