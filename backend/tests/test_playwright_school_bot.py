# backend/test_playwright_school_bot.py
import os
import sys
import asyncio
import logging
from datetime import datetime, timedelta
import pytz
from app.services.cof_excel_service import COFExcelService
from app.services.workspace_playwright_service import workspace_playwright_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_COF_PATH = os.path.join(BASE_DIR, "data", "cof_input", "test.xlsx")
TEMP_IMPORT_PATH = os.path.join(BASE_DIR, "data", "temp_import", "accounts.xlsx")
DOWNLOAD_DIR = os.path.join(BASE_DIR, "data", "results_download")
OUTPUT_COF_PATH = os.path.join(BASE_DIR, "data", "cof_output", "COMPLETED_REAL_test.xlsx")

SCHOOL_CREDS = {
    "username": "htdttemd",
    "password": "Leanbot@2024"
}

def get_now_vn_str():
    return datetime.now(pytz.timezone('Asia/Ho_Chi_Minh')).strftime("%H:%M:%S")

async def main():
    print("=" * 70)
    print("🚀 BẮT ĐẦU CHẠY THẬT (LIVE): TẠO TÀI KHOẢN & SMART POLLING")
    print("=" * 70)

    # 1. BÓC TÁCH FILE COF ĐẦU VÀO
    if not os.path.exists(INPUT_COF_PATH):
        logger.error(f"❌ Không tìm thấy file tại: {INPUT_COF_PATH}")
        return

    logger.info(f"📖 1. Đang bóc tách file COF: {INPUT_COF_PATH}...")
    data = COFExcelService.parse_cof_file(INPUT_COF_PATH)
    total_to_create = data["students_to_create"] + data["teachers_to_create"]

    print(f"🏫 Trường: {data['school_name']}")
    print(f"👥 Cần tạo mới: {len(data['students_to_create'])} học sinh | {len(data['teachers_to_create'])} giáo viên")

    if not total_to_create:
        logger.info("ℹ️ Toàn bộ người dùng đã có tài khoản, cập nhật Group Name vào COF...")
        COFExcelService.write_results_back_to_cof(
            original_cof_path=INPUT_COF_PATH,
            result_excel_path=None,
            students_all=data["students_all"],
            students_to_create=[],
            teachers_all=data["teachers_all"],
            teachers_to_create=[],
            output_cof_path=OUTPUT_COF_PATH
        )
        return

    # 2. SINH FILE ACCOUNTS.XLSX CHUẨN TỪ DÒNG 6
    logger.info("⚙️ 2. Đang sinh file accounts.xlsx chuẩn Template...")
    count = COFExcelService.generate_accounts_excel(total_to_create, TEMP_IMPORT_PATH)
    logger.info(f"✅ Đã tạo file: {TEMP_IMPORT_PATH} ({count} tài khoản)")

    # 3. PHA 1: NỘP FILE & LẤY REQUEST ID
    # (Đặt False nếu anh muốn xem trình duyệt mở lên, True để chạy ngầm)
    workspace_playwright_service.headless = True 

    logger.info("📤 3. PHA 1: Bot nộp file lên School Workspace...")
    submit_res = await workspace_playwright_service.submit_account_creation_batch(
        credentials=SCHOOL_CREDS,
        upload_file_path=TEMP_IMPORT_PATH,
        record_count=count
    )

    if submit_res.get("status") != "submitted":
        logger.error(f"❌ Lỗi nộp file: {submit_res.get('error')}")
        return

    request_id = submit_res["request_id"]
    est_wait = submit_res["estimated_wait_seconds"]
    
    now_dt = datetime.now()
    first_check_dt = now_dt + timedelta(seconds=est_wait)

    print("\n" + "═" * 70)
    print(f"📌 NỘP FILE THÀNH CÔNG! REQUEST ID: [ #{request_id} ]")
    print(f"⏱️ Tổng số tài khoản: {count} user | Công thức: {count} x 40s")
    print(f"⏳ Thời gian ước tính xử lý: {est_wait}s ({est_wait//60} phút {est_wait%60}s)")
    print(f"🕒 Lần kiểm tra đầu tiên sẽ diễn ra vào lúc: [ {first_check_dt.strftime('%H:%M:%S')} ]")
    print(f"💡 Trình duyệt đã đóng hoàn toàn - RAM máy chủ giải phóng 100%!")
    print("═" * 70 + "\n")

    # 4. PHA 2: SMART POLLING ENGINE (HẸN GIỜ THÔNG MINH)
    logger.info(f"💤 Bot đang tạm nghỉ {est_wait}s chờ hệ thống Pythaverse xử lý đợt #{request_id}...")
    await asyncio.sleep(est_wait)

    downloaded_file = None
    step_interval = 300  # Bước nhảy: 5 phút (300s) / lần check
    max_wait_hours = 48  # Tối đa 48 tiếng cho các batch cực lớn
    max_attempts = int((max_wait_hours * 3600) / step_interval)

    for attempt in range(1, max_attempts + 1):
        now_str = get_now_vn_str()
        logger.info(f"🔍 [{now_str}] [Lần check {attempt}] Đang kiểm tra trạng thái Request #{request_id}...")

        check_res = await workspace_playwright_service.check_and_export_batch_result(
            credentials=SCHOOL_CREDS,
            request_id=request_id,
            download_dir=DOWNLOAD_DIR
        )

        status = check_res.get("status")

        if status == "completed":
            downloaded_file = check_res["result_file_path"]
            logger.info(f"🎉 [{get_now_vn_str()}] TẠO XONG HOÀN TẤT! Đã tải file kết quả: {downloaded_file}")
            break

        elif status == "still_processing":
            next_check_dt = datetime.now() + timedelta(seconds=step_interval)
            logger.info(f"⏳ Request #{request_id} vẫn đang xử lý: [{check_res.get('current_status')}].")
            logger.info(f"💤 Hẹn kiểm tra lại sau {step_interval//60} phút (vào lúc {next_check_dt.strftime('%H:%M:%S')})...")
            await asyncio.sleep(step_interval)

        else:
            logger.warning(f"⚠️ Trạng thái tạm thời: {check_res.get('error')}. Sẽ thử lại sau {step_interval//60} phút...")
            await asyncio.sleep(step_interval)

    if not downloaded_file or not os.path.exists(downloaded_file):
        logger.error("❌ Không lấy được file kết quả từ Workspace.")
        return

    # 5. GHI NGƯỢC USER/PASS VÀ GROUP NAME VÀO FILE COF XUẤT XƯỞNG
    logger.info("📝 5. Đang map User/Pass thật và Group Name vào file COF xuất xưởng...")
    final_cof = COFExcelService.write_results_back_to_cof(
        original_cof_path=INPUT_COF_PATH,
        result_excel_path=downloaded_file,
        students_all=data["students_all"],
        students_to_create=data["students_to_create"],
        teachers_all=data["teachers_all"],
        teachers_to_create=data["teachers_to_create"],
        output_cof_path=OUTPUT_COF_PATH
    )

    print("\n" + "═" * 70)
    print("🎉 CHÚC MỪNG ANH YÊU! TOÀN BỘ LUỒNG TỰ ĐỘNG HÓA COF ĐÃ XONG 100%!")
    print(f"📁 File kết quả tải từ Workspace: {downloaded_file}")
    print(f"📁 File COF hoàn thiện cho khách: {final_cof}")
    print("═" * 70)

if __name__ == "__main__":
    asyncio.run(main())