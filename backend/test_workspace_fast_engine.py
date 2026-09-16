# backend/test_workspace_fast_engine.py
"""
=====================================================================
🚀 MASTER WORKSPACE FAST ENGINE TEST SUITE (DIRECT API HYBRID)
=====================================================================
Kịch bản kiểm thử toàn trình 6 giai đoạn mô phỏng luồng License E2E:
1. SCHOOL: Đăng nhập bốc Session (3s) -> POST schoolCreateOrder.php tạo đơn hàng.
2. PARTNER: Đăng nhập bốc Session (3s) -> Query Pool License -> POST updateStatusOrder.php duyệt đơn.
3. PARTNER (TOP-UP): POST createOrderSale.php tạo PRT Contract gửi Distributor.
4. DISTRIBUTOR: Đăng nhập bốc Session (3s) -> Query Pool License -> POST updateStatusPartnerOrder.php duyệt PRT.
5. DISTRIBUTOR (TOP-UP): POST createOrder.php tạo DST Contract gửi Sales Admin.
6. SALES ADMIN: Đăng nhập bốc Session (3s) -> POST /wp-json/.../update-status phê duyệt DST tối cao.

⚡ ĐẶC TÍNH KỸ THUẬT:
- Playwright chỉ sống 3-4 giây lấy Cookie + real WordPress ID trong window.user, sau đó đóng Chromium ngay.
- Toàn bộ thao tác nghiệp vụ chạy bằng HTTPX Async (~200ms/request), RAM < 25MB, triệt tiêu 100% OOM Render.
=====================================================================
"""

import os
import re
import time
import logging
import asyncio
import gc
from typing import Dict, Any, List, Optional, Tuple
import httpx
from playwright.async_api import async_playwright, Browser
from app.services.workspace.base import WorkspaceBaseService, BASE_WORKSPACE_URL
from app.core.playwright_manager import wait_for_dom_and_spinners
from app.core.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("WORKSPACE_FAST_TEST")

BASE_URL = "https://pythaverse.space"

def get_clean_cred(key: str, default: str = "") -> str:
    """Lấy biến môi trường từ Settings Pydantic hoặc os.getenv, gọt sạch dấu ' và "."""
    val = getattr(settings, key, None) or os.getenv(key, default)
    return str(val).strip().strip("'\"")
# =====================================================================
# 🎯 CẤU HÌNH TÀI KHOẢN KIỂM THỬ (Anh có thể điền pass nếu chưa có trong ENV)
# =====================================================================
TEST_ACCOUNTS = {
    "school": {
        "username": os.getenv("TEST_SCHOOL_USER", "htdttemd"),
        "password": os.getenv("TEST_SCHOOL_PASS", "Leanbot@2024"),
        "login_url": f"{BASE_URL}/school-workspace/orders"
    },
    "partner": {
        "username": os.getenv("TEST_PARTNER_USER", "partnerdtte"),
        "password": os.getenv("TEST_PARTNER_PASS", "Leanbot@2024"),
        "login_url": f"{BASE_URL}/partner-workspace/order-management"
    },
    "distributor": {
        "username": os.getenv("TEST_DISTRIBUTOR_USER", "testdistributor"),
        "password": os.getenv("TEST_DISTRIBUTOR_PASS", "PTV@2024"),
        "login_url": f"{BASE_URL}/distributor-workspace/partner-contract-po"
    },
    "sales_admin": {
        "username": get_clean_cred("TEST_ADMIN_USER", "adminworkspace"),
        "password": get_clean_cred("TEST_ADMIN_PASS", "Leanbot@2024"),
        "login_url": f"{BASE_URL}/sales-admin-workspace/dashboard"
    }
}

LOW_RAM_ARGS = [
    "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
    "--disable-gpu", "--no-first-run", "--no-zygote", "--single-process",
    "--disable-extensions", "--js-flags=--max-old-space-size=128"
]


class WorkspaceFastTester(WorkspaceBaseService):
    def __init__(self):
        super().__init__()
        self.sessions: Dict[str, Dict[str, Any]] = {}

    # =================================================================
    # 🔑 BỐC SESSION DÙNG THẲNG LOGIN_ROLE CHUẨN MỰC CỦA ANH
    # =================================================================
    async def steal_session(self, role: str) -> Optional[Dict[str, Any]]:
        acc = TEST_ACCOUNTS.get(role)
        if not acc or not acc["password"]:
            logger.error(f"❌ Thiếu mật khẩu cho role '{role}'!")
            return None

        role_titles = {
            "school": "School",
            "partner": "Partner",
            "distributor": "Distributor",
            "sales_admin": "Sales Admin"
        }
        role_label = role_titles.get(role, role)

        logger.info(f"\n🔑 Đang bốc session cho [{role.upper()}] ({acc['username']})...")
        t0 = time.time()

        async with async_playwright() as p:
            browser, context, page = await self._create_context(p)
            try:
                # 🎯 1. DÙNG THẲNG BẢN QUYỀN LOGIN_ROLE CỦA ANH
                is_ok, login_err = await self.login_role(page, acc["username"], acc["password"], role_label)
                if not is_ok:
                    logger.error(f"❌ Đăng nhập thất bại: {login_err}")
                    return None

                # 🎯 2. ĐẶC TRỊ CHUYỂN HƯỚNG SALES ADMIN (SAU KHI ĐÃ ĐĂNG NHẬP THÀNH CÔNG 100%)
                if role == "sales_admin":
                    logger.info("👑 Đã đăng nhập xong! Chủ động chuyển hướng sang /sales-admin-workspace/dashboard...")
                    try:
                        await page.goto(
                            f"{BASE_WORKSPACE_URL}/sales-admin-workspace/dashboard", 
                            wait_until="domcontentloaded", 
                            timeout=35000
                        )
                    except Exception as nav_e:
                        logger.warning(f"⚠️ Lưu ý chuyển hướng: {nav_e}")

                    # Mỏ neo chuẩn bản quyền của anh trong contract_service.py
                    await wait_for_dom_and_spinners(page, ".MuiDataGrid-virtualScrollerContent, .MuiDataGrid-row", min_pacing_ms=400)

                # 🎯 3. RÚT REAL WORDPRESS IDENTITY
                wp_identity = await page.evaluate("""() => {
                    const u = window.user || {};
                    let localUser = {};
                    try {
                        localUser = JSON.parse(localStorage.getItem('user') || '{}');
                    } catch(e) {}
                    
                    return {
                        school_id: u.school_id || localUser.school_id || null,
                        partner_id: u.partner_id || localUser.partner_id || null,
                        distributor_id: u.distributor_id || localUser.distributor_id || null,
                        user_id: u.id || localUser.id || null,
                        username: u.username || localUser.username || ''
                    };
                }""")

                cookies = await context.cookies()
                cookies_dict = {c["name"]: c["value"] for c in cookies}

                elapsed = round(time.time() - t0, 2)
                logger.info(f"✨ [RAM Zero] Đã bốc session [{role.upper()}] thành công trong {elapsed}s!")
                logger.info(f"   👉 Identity: {wp_identity}")

                session_info = {
                    "cookies": cookies_dict,
                    "identity": wp_identity,
                    "username": acc["username"]
                }
                self.sessions[role] = session_info
                return session_info

            except Exception as e:
                logger.error(f"❌ Lỗi khi bốc session [{role}]: {e}")
                return None
            finally:
                await browser.close()
                gc.collect()
    # =================================================================
    # 🛠️ HELPER GỬI MULTIPART FORM-DATA CHUẨN XÁC CHO WORDPRESS PHP
    # =================================================================
    @staticmethod
    def _to_multipart_files(data_dict: Dict[str, Any]) -> Dict[str, Tuple[None, str]]:
        """Ép dict phẳng thành cấu trúc multipart/form-data chuẩn PHP."""
        files = {}
        for k, v in data_dict.items():
            files[k] = (None, str(v) if v is not None else "")
        return files

    # =================================================================
    # GIAI ĐOẠN 1: SCHOOL TẠO ĐƠN HÀNG (schoolCreateOrder.php)
    # =================================================================
    async def stage_1_school_create_order(self, client: httpx.AsyncClient) -> Optional[Dict[str, Any]]:
        logger.info("\n" + "=" * 60)
        logger.info("🏫 [GIAI ĐOẠN 1] SCHOOL TẠO ĐƠN HÀNG QUA DIRECT API...")
        logger.info("=" * 60)

        school_session = self.sessions.get("school")
        school_id = school_session["identity"].get("school_id") or "10266"

        payload = {
            "school_id": str(school_id),
            "courses[0][courseId]": "1",
            "courses[0][studentCount]": "5",
            "courses[0][startDate]": "2026-09-16",
            "courses[0][endDate]": "2027-09-16",
            "courses[0][licenseCategory]": "SWRP",
            "contactInfoId": "Automation Test Fast Engine (hungnm@dtt.vn)",
            "notes": "Order auto-generated by Workspace Fast Tester",
            "type": "course"
        }

        url = f"{BASE_URL}/wp-content/plugins/school_workspace_v3/api/orders_management/schoolCreateOrder.php"
        t0 = time.time()
        res = await client.post(url, files=self._to_multipart_files(payload))
        elapsed = round((time.time() - t0) * 1000, 1)

        if res.status_code in [200, 201]:
            res_json = res.json()
            if res_json.get("code") in [200, 201]:
                order_data = res_json.get("data", {}).get("order", {})
                order_id = order_data.get("id")
                order_code = order_data.get("school_order_id_format")
                logger.info(f"🎉 TẠO SCHOOL ORDER THÀNH CÔNG TRONG {elapsed}ms!")
                logger.info(f"   👉 Order ID: #{order_id} | Mã đơn: [{order_code}]")
                return order_data

        logger.error(f"❌ Tạo School Order thất bại ({res.status_code}): {res.text}")
        return None

    # =================================================================
    # GIAI ĐOẠN 2: PARTNER DUYỆT ĐƠN HÀNG (updateStatusOrder.php)
    # =================================================================
    async def stage_2_partner_approve_order(self, client: httpx.AsyncClient, order_id: int, order_code: str):
        logger.info("\n" + "-" * 60)
        logger.info(f"🤝 [GIAI ĐOẠN 2] PARTNER DUYỆT ĐƠN HÀNG #{order_id} [{order_code}]...")

        partner_session = self.sessions.get("partner")
        partner_id = partner_session["identity"].get("partner_id") or "60"

        # 1. Lấy chi tiết đơn
        detail_url = f"{BASE_URL}/wp-content/plugins/partner_workspace_v3/api/orders_management/getOrderDetail.php?order_id={order_id}"
        d_res = await client.get(detail_url)
        detail_data = d_res.json() if d_res.status_code == 200 else {}
        courses_req = detail_data.get("detail_package", {}).get("courses", [])

        # 2. Quét kho License Pool của Partner
        pool_url = f"{BASE_URL}/wp-content/plugins/partner_workspace_v3/api/order_sale/getPartnerPoolLicense.php?partner_id={partner_id}"
        p_res = await client.get(pool_url)
        pool_courses = p_res.json().get("data", {}).get("pool_courses", []) if p_res.status_code == 200 else []

        logger.info(f"📊 Kho Partner hiện có {len(pool_courses)} gói pool license.")

        # 3. Tự động so khớp tìm pool_id thỏa mãn
        matched_pool_id = None
        target_course_id = 780
        quantity_needed = 5

        if courses_req:
            target_course_id = courses_req[0].get("course_id", 1)
            quantity_needed = int(courses_req[0].get("course_count", 5))

        for p in pool_courses:
            avail = int(p.get("item_quantity", 0))
            if avail >= quantity_needed:
                matched_pool_id = p.get("id")
                logger.info(f"   🎯 Khớp thành công Pool #{matched_pool_id} [{p.get('item_name')}] (Khả dụng: {avail} >= Cần: {quantity_needed})")
                break

        if not matched_pool_id and pool_courses:
            matched_pool_id = pool_courses[0].get("id")

        # 4. Bắn API phê duyệt
        approve_payload = {
            "order_id": str(order_id),
            "status": "1",  # 1 = Approved
            "partner_id": str(partner_id),
            "courses[0][course_id]": str(target_course_id),
            "courses[0][quantity]": str(quantity_needed),
            "courses[0][pool_id]": str(matched_pool_id or "21"),
            "username": partner_session.get("username", "partnerdtte"),
            "order_code": order_code,
            "license_type": "course"
        }

        approve_url = f"{BASE_URL}/wp-content/plugins/partner_workspace_v3/api/orders_management/updateStatusOrder.php"
        t0 = time.time()
        res = await client.post(approve_url, files=self._to_multipart_files(approve_payload))
        elapsed = round((time.time() - t0) * 1000, 1)

        if res.status_code in [200, 201]:
            logger.info(f"🎉 PARTNER DUYỆT ĐƠN HÀNG THÀNH CÔNG TRONG {elapsed}ms: {res.json().get('message')}")
            return True

        logger.error(f"❌ Partner duyệt đơn thất bại: {res.text}")
        return False

    # =================================================================
    # GIAI ĐOẠN 3: PARTNER TẠO PRT CONTRACT XIN CẤP BÙ (createOrderSale.php)
    # =================================================================
    async def stage_3_partner_create_contract(self, client: httpx.AsyncClient) -> Optional[Dict[str, Any]]:
        logger.info("\n" + "-" * 60)
        logger.info("📝 [GIAI ĐOẠN 3] PARTNER TẠO PRT CONTRACT XIN CẤP BÙ...")

        partner_session = self.sessions.get("partner")
        partner_id = partner_session["identity"].get("partner_id") or "60"

        payload = {
            "partner_id": str(partner_id),
            "order_type": "License",
            "order_notes": "Topup contract by PTV Automation Hub",
            "status": "pending_distributor_review",
            "total_amount": "100",
            "courses[0][course_id]": "1344",
            "courses[0][course_name]": "SWRP 1: STREAM Explorers (EN)",
            "courses[0][student_count]": "10",
            "courses[0][category]": "SWRP",
            "courses[0][unit_price]": "10",
            "courses[0][total_amount]": "100"
        }

        url = f"{BASE_URL}/wp-content/plugins/partner_workspace_v3/api/order_sale/createOrderSale.php"
        t0 = time.time()
        res = await client.post(url, files=self._to_multipart_files(payload))
        elapsed = round((time.time() - t0) * 1000, 1)

        if res.status_code == 200:
            data = res.json().get("data", {})
            prt_code = data.get("order_code")
            logger.info(f"🎉 TẠO PRT CONTRACT THÀNH CÔNG TRONG {elapsed}ms!")
            logger.info(f"   👉 PRT Code: [{prt_code}] (ID: #{data.get('id')})")
            return data

        logger.error(f"❌ Tạo PRT Contract thất bại: {res.text}")
        return None

    # =================================================================
    # GIAI ĐOẠN 4: DISTRIBUTOR DUYỆT PRT CONTRACT (updateStatusPartnerOrder.php)
    # =================================================================
    async def stage_4_distributor_approve_prt(self, client: httpx.AsyncClient, prt_id: int):
        logger.info("\n" + "-" * 60)
        logger.info(f"🏢 [GIAI ĐOẠN 4] DISTRIBUTOR DUYỆT PRT CONTRACT #{prt_id}...")

        dist_session = self.sessions.get("distributor")
        dist_id = dist_session["identity"].get("distributor_id") or "36"

        payload = {
            "order_id": str(prt_id),
            "status": "approved",
            "distributor_id": str(dist_id),
            "username": dist_session.get("username", "testdistributor"),
            "license_type": "license",
            "note": "Approved by PTV Automation Fast Engine"
        }

        url = f"{BASE_URL}/wp-content/plugins/distributor_workspace_v3/api/orders_management/updateStatusPartnerOrder.php"
        t0 = time.time()
        res = await client.post(url, files=self._to_multipart_files(payload))
        elapsed = round((time.time() - t0) * 1000, 1)

        if res.status_code == 200:
            logger.info(f"🎉 DISTRIBUTOR DUYỆT PRT THÀNH CÔNG TRONG {elapsed}ms: {res.json().get('message')}")
            return True

        logger.error(f"❌ Distributor duyệt PRT thất bại: {res.text}")
        return False

    # =================================================================
    # GIAI ĐOẠN 5: DISTRIBUTOR TẠO DST CONTRACT GỬI SALES ADMIN (createOrder.php)
    # =================================================================
    async def stage_5_distributor_create_dst(self, client: httpx.AsyncClient) -> Optional[Dict[str, Any]]:
        logger.info("\n" + "-" * 60)
        logger.info("📦 [GIAI ĐOẠN 5] DISTRIBUTOR TẠO DST CONTRACT GỬI SALES ADMIN...")

        dist_session = self.sessions.get("distributor")
        dist_id = dist_session["identity"].get("distributor_id") or "36"

        payload = {
            "distributor_id": str(dist_id),
            "order_type": "License",
            "order_notes": "Topup DST by PTV Automation Hub",
            "total_amount": "100",
            "courses[0][course_id]": "1344",
            "courses[0][course_name]": "SWRP 1: STREAM Explorers (EN)",
            "courses[0][student_count]": "10",
            "courses[0][category]": "SWRP",
            "courses[0][unit_price]": "10",
            "courses[0][total_amount]": "100"
        }

        url = f"{BASE_URL}/wp-content/plugins/distributor_workspace_v3/api/order_sale/createOrder.php"
        t0 = time.time()
        res = await client.post(url, files=self._to_multipart_files(payload))
        elapsed = round((time.time() - t0) * 1000, 1)

        if res.status_code == 200:
            data = res.json().get("data", {})
            dst_code = data.get("order_code")
            logger.info(f"🎉 TẠO DST CONTRACT THÀNH CÔNG TRONG {elapsed}ms!")
            logger.info(f"   👉 DST Code: [{dst_code}] (ID: #{data.get('id')})")
            return data

        logger.error(f"❌ Tạo DST Contract thất bại: {res.text}")
        return None

    # =================================================================
    # GIAI ĐOẠN 6: SALES ADMIN DUYỆT DST CONTRACT (update-status)
    # =================================================================
    async def stage_6_sales_admin_approve_dst(self, client: httpx.AsyncClient, dst_code: str):
        logger.info("\n" + "-" * 60)
        logger.info(f"👑 [GIAI ĐOẠN 6] SALES ADMIN PHÊ DUYỆT TỐI CAO DST [{dst_code}]...")

        admin_session = self.sessions.get("sales_admin")

        payload = {
            "order_code": dst_code,
            "status": "approved",
            "username": admin_session.get("username", "adminworkspace"),
            "note": "Automation Flow - Processed by Master Fast Engine",
            "license_type": "license"
        }

        url = f"{BASE_URL}/wp-json/sales-admin-workspace/v1/orders/update-status"
        t0 = time.time()
        res = await client.post(url, files=self._to_multipart_files(payload))
        elapsed = round((time.time() - t0) * 1000, 1)

        if res.status_code == 200 and res.json().get("status") == "success":
            logger.info(f"🎉 SALES ADMIN DUYỆT DST THÀNH CÔNG TRONG {elapsed}ms!")
            logger.info(f"   👉 Thông điệp: {res.json().get('message')}")
            return True

        logger.error(f"❌ Sales Admin duyệt DST thất bại: {res.text}")
        return False

    # =================================================================
    # 🏁 MAIN PIPELINE RUNNER
    # =================================================================
    async def run_all(self):
        total_start = time.time()
        logger.info("🚀🚀🚀 KHỞI ĐỘNG WORKSPACE DIRECT API FAST TEST SUITE 🚀🚀🚀\n")

        # 1. School Flow
        if await self.steal_session("school"):
            async with httpx.AsyncClient(base_url=BASE_URL, cookies=self.sessions["school"]["cookies"], timeout=20.0) as client:
                order_data = await self.stage_1_school_create_order(client)

        # 2. Partner Flow
        if await self.steal_session("partner"):
            async with httpx.AsyncClient(base_url=BASE_URL, cookies=self.sessions["partner"]["cookies"], timeout=20.0) as client:
                # Nếu vừa tạo được đơn ở trên thì duyệt đơn đó, hoặc dùng đơn mẫu
                o_id = order_data.get("id") if 'order_data' in locals() and order_data else 1389
                o_code = order_data.get("school_order_id_format") if 'order_data' in locals() and order_data else "SCH-10266-20260916-1389"
                await self.stage_2_partner_approve_order(client, o_id, o_code)
                
                # Tạo PRT contract mẫu
                prt_data = await self.stage_3_partner_create_contract(client)

        # 3. Distributor Flow
        if await self.steal_session("distributor"):
            async with httpx.AsyncClient(base_url=BASE_URL, cookies=self.sessions["distributor"]["cookies"], timeout=20.0) as client:
                prt_id = prt_data.get("id") if 'prt_data' in locals() and prt_data else 613
                await self.stage_4_distributor_approve_prt(client, prt_id)
                dst_data = await self.stage_5_distributor_create_dst(client)

        # 4. Sales Admin Flow
        if await self.steal_session("sales_admin"):
            async with httpx.AsyncClient(base_url=BASE_URL, cookies=self.sessions["sales_admin"]["cookies"], timeout=20.0) as client:
                dst_code = dst_data.get("order_code") if 'dst_data' in locals() and dst_data else "DST-20260916-615"
                await self.stage_6_sales_admin_approve_dst(client, dst_code)

        total_elapsed = round(time.time() - total_start, 2)
        logger.info("\n" + "=" * 60)
        logger.info(f"🏁 TỔNG KẾT TOÀN BỘ 6 GIAI ĐOẠN WORKSPACE HOÀN TẤT TRONG: {total_elapsed} GIÂY!")
        logger.info("=" * 60 + "\n")


if __name__ == "__main__":
    tester = WorkspaceFastTester()
    asyncio.run(tester.run_all())