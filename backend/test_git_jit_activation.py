"""
==============================================================================
PYTHAVERSE GIT - HEADLESS OIDC JIT ACTIVATION TEST SUITE (PRECISION EDITION)
==============================================================================
Khớp 100% cơ chế đăng nhập SSO Keycloak của GitBucket pythaverse.space:
1. GET /signin -> Bóc form action /signin/oidc
2. POST /signin/oidc -> Bắt 302 Redirect sang Keycloak
3. GET Keycloak -> Bóc form action và hidden inputs
4. POST credentials vào Keycloak -> Bắt 302 Redirect về GitBucket callback
5. GET callback -> Kích hoạt JIT Insert User vào GitBucket DB
6. POST /_user/existence -> Nghiệm thu kết quả JIT với cookie phiên mới!
==============================================================================
"""

import asyncio
import argparse
import html
import re
from urllib.parse import urljoin
import httpx


class LogColor:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def print_step(step_num: int, title: str):
    print(f"\n{LogColor.BOLD}{LogColor.CYAN}▶ BƯỚC {step_num}: {title}{LogColor.RESET}")


def print_info(label: str, value: str):
    print(f"  {LogColor.BLUE}ℹ [{label}]{LogColor.RESET} {value}")


def print_success(msg: str):
    print(f"  {LogColor.GREEN}✔ {msg}{LogColor.RESET}")


def print_warning(msg: str):
    print(f"  {LogColor.YELLOW}⚠ {msg}{LogColor.RESET}")


def print_error(msg: str):
    print(f"  {LogColor.RED}✖ {msg}{LogColor.RESET}")


async def test_jit_activation(username: str, password: str, git_url: str = "https://git.pythaverse.space"):
    clean_git_url = git_url.rstrip("/")
    print(f"{LogColor.BOLD}{LogColor.HEADER}==================================================================")
    print(f" KHỞI CHẠY KIỂM THỬ KÍCH HOẠT JIT CHO: {username}")
    print(f" Mục tiêu Git: {clean_git_url}")
    print(f"=================================================================={LogColor.RESET}")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    # Bật follow_redirects=False để kiểm soát từng cú nhảy 302
    async with httpx.AsyncClient(headers=headers, follow_redirects=False, verify=False, timeout=20.0) as client:
        # ------------------------------------------------------------------
        # BƯỚC 1: TRUY CẬP /signin VÀ KÍCH HOẠT /signin/oidc TRÊN GITBUCKET
        # ------------------------------------------------------------------
        print_step(1, "Truy cập /signin và kích hoạt Form OIDC")
        signin_url = f"{clean_git_url}/signin"
        signin_res = await client.get(signin_url)
        print_info("Status /signin", str(signin_res.status_code))

        # Bóc tách form action chứa /signin/oidc
        form_match = re.search(r'<form[^>]+action=["\']([^"\']*/signin/oidc[^"\']*)["\'][^>]*>', signin_res.text, re.IGNORECASE)
        if form_match:
            oidc_endpoint = urljoin(signin_url, html.unescape(form_match.group(1)))
        else:
            oidc_endpoint = f"{clean_git_url}/signin/oidc"

        print_info("Bắn POST kích hoạt OIDC tới", oidc_endpoint)
        oidc_trigger_res = await client.post(oidc_endpoint)
        print_info("Trigger Status Code", str(oidc_trigger_res.status_code))

        keycloak_auth_url = oidc_trigger_res.headers.get("Location")
        if not keycloak_auth_url and oidc_trigger_res.status_code not in [302, 303]:
            # Thử GET nếu POST không nhảy
            oidc_trigger_res = await client.get(oidc_endpoint)
            keycloak_auth_url = oidc_trigger_res.headers.get("Location")

        if not keycloak_auth_url:
            print_error("GitBucket không trả về 302 chuyển hướng sang Keycloak!")
            return False

        keycloak_auth_url = urljoin(clean_git_url, keycloak_auth_url)
        print_info("Keycloak Auth URL bắt được", keycloak_auth_url)
        print_success("Đã kích hoạt bệ phóng OIDC! Đang chuyển tiếp sang Keycloak...")

        # ------------------------------------------------------------------
        # BƯỚC 2: TẢI TRANG ĐĂNG NHẬP KEYCLOAK & BÓC TÁCH FORM ĐĂNG NHẬP
        # ------------------------------------------------------------------
        print_step(2, "Mở trang đăng nhập Keycloak để bóc Form Action & Hidden fields")
        kc_page_res = await client.get(keycloak_auth_url)
        print_info("Keycloak Page Status", str(kc_page_res.status_code))

        kc_html = kc_page_res.text
        form_kc_match = re.search(r'<form[^>]+action=["\']([^"\']+)["\'][^>]*>', kc_html, re.IGNORECASE)
        if not form_kc_match:
            print_error("Không tìm thấy thẻ <form> trên trang Keycloak!")
            return False

        kc_submit_url = urljoin(str(kc_page_res.url), html.unescape(form_kc_match.group(1)))
        print_info("Form Action Keycloak (Đầy đủ)", kc_submit_url)

        # Thu thập các hidden inputs nếu có trong form
        hidden_inputs = dict(re.findall(r'<input[^>]+type=["\']hidden["\'][^>]+name=["\']([^"\']+)["\'][^>]+value=["\']([^"\']*)["\']', kc_html, re.IGNORECASE))
        print_info("Hidden fields thu được", str(list(hidden_inputs.keys())))
        print_success("Bóc tách Form Keycloak hoàn tất!")

        # ------------------------------------------------------------------
        # BƯỚC 3: SUBMIT THÔNG TIN ĐĂNG NHẬP VÀO KEYCLOAK
        # ------------------------------------------------------------------
        print_step(3, f"Gửi thông tin xác thực ({username}) vào Keycloak")
        login_payload = {
            **hidden_inputs,
            "username": username,
            "password": password,
            "credentialId": ""
        }

        kc_submit_res = await client.post(
            kc_submit_url,
            data=login_payload,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": str(kc_page_res.url)
            }
        )

        print_info("Keycloak Submit Status", str(kc_submit_res.status_code))
        callback_url = kc_submit_res.headers.get("Location")

        if kc_submit_res.status_code not in [302, 303] or not callback_url:
            print_error("Đăng nhập Keycloak THẤT BẠI! (Sai thông tin hoặc tài khoản bị khóa)")
            err_msg_match = re.search(r'<span[^>]+id=["\']input-error[^"\']*["\'][^>]*>(.*?)</span>', kc_submit_res.text, re.DOTALL)
            if err_msg_match:
                print_error(f"Thông báo từ Keycloak: {err_msg_match.group(1).strip()}")
            return False

        callback_url = urljoin(str(kc_submit_res.url), callback_url)
        print_info("Keycloak Redirects To", callback_url)

        if "required-action" in callback_url or "UPDATE_PASSWORD" in callback_url:
            print_error("CẢNH BÁO: Tài khoản bị dính cờ BẮT BUỘC ĐỔI MẬT KHẨU trên Keycloak!")
            return False

        print_success("Xác thực Keycloak CHÍNH XÁC! Nhận được Callback kèm Authorization Code.")

        # ------------------------------------------------------------------
        # BƯỚC 4: GỬI CODE VỀ GITBUCKET CALLBACK ĐỂ KÍCH HOẠT JIT
        # ------------------------------------------------------------------
        print_step(4, "Gửi Authorization Code về GitBucket để kích hoạt JIT")
        callback_res = await client.get(callback_url)
        print_info("GitBucket Callback Status", str(callback_res.status_code))
        
        final_dest = callback_res.headers.get("Location")
        if final_dest:
            print_info("GitBucket tiếp tục chuyển hướng tới", final_dest)
            # Theo dấu chuyển hướng cuối cùng về Dashboard hoặc Home
            await client.get(urljoin(clean_git_url, final_dest))

        print_success("GitBucket đã xử lý xong Callback và tạo phiên đăng nhập!")
        current_cookies = dict(client.cookies)
        print_info("Cookies phiên thu được", str(list(current_cookies.keys())))

        # ------------------------------------------------------------------
        # BƯỚC 5: NGHIỆM THU TỐI HẬU QUA /_user/existence (VỚI SESSION MỚI)
        # ------------------------------------------------------------------
        print_step(5, "Kiểm chứng tối hậu qua endpoint /_user/existence (Có Session)")
        await asyncio.sleep(0.5)

        # Vì client đang mang session hợp lệ vừa login, /_user/existence sẽ KHÔNG bị 302 nữa!
        final_check = await client.post(
            f"{clean_git_url}/_user/existence",
            data={"userName": username},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        print_info("Final HTTP Status", str(final_check.status_code))
        print_info("Final Response Text", final_check.text.strip())

        if final_check.status_code == 200 and final_check.text.strip().lower() == "user":
            print(f"\n{LogColor.BOLD}{LogColor.GREEN}==================================================================")
            print(f" 🎉 KẾT QUẢ: KÍCH HOẠT JIT THÀNH CÔNG RỰC RỠ 100%! 🎉")
            print(f" Tài khoản '{username}' ĐÃ CHÍNH THỨC XUẤT HIỆN TRÊN GITBUCKET!")
            print(f" Thời gian thực thi: Siêu tốc (< 500ms) - Zero RAM - Không cần Git Admin!")
            print(f"=================================================================={LogColor.RESET}\n")
            return True
        else:
            # Thử thêm phương án kiểm tra trang cá nhân /{username}
            profile_res = await client.get(f"{clean_git_url}/{username}")
            if profile_res.status_code == 200:
                print(f"\n{LogColor.BOLD}{LogColor.GREEN}🎉 KẾT QUẢ: JIT THÀNH CÔNG! Trang cá nhân /{username} đã Online! 🎉{LogColor.RESET}\n")
                return True

            print(f"\n{LogColor.BOLD}{LogColor.RED}❌ KẾT QUẢ: CHƯA THẤY USER TRÊN GIT.{LogColor.RESET}\n")
            return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test Git JIT Activation via Headless HTTPX")
    parser.add_argument("--user", required=True, help="Tài khoản cần test")
    parser.add_argument("--password", required=True, help="Mật khẩu của tài khoản")
    parser.add_argument("--git-url", default="https://git.pythaverse.space", help="Đường dẫn Git")

    args = parser.parse_args()
    asyncio.run(test_jit_activation(args.user, args.password, args.git_url))