# backend/test_lms_local.py
import asyncio
import os
import sys
from pathlib import Path

# Load file .env nếu có
from dotenv import load_dotenv
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.services.playwright_service import playwright_lms_service

async def test_lms_enrollment_live():
    print("🚀 =================================================================")
    print("🚀 BẮT ĐẦU CHẠY TEST LMS ENROLLMENT TỪ DỊCH VỤ GỐC (PLAYWRIGHT)...")
    print("🚀 =================================================================")

    payload = {
        "action": "direct_moodle_lms_enroll",
        "course_id": "1502",
        "course_name": "STEM AI - MATH QUEST 5 (EN-BM)",
        "teacher_emails": ["gvdttemd@pythaverse.net"],
        "student_emails": ["hsdttemd@pythaverse.net"],
        "end_date": "31-12-2027",
        "group_name": "DEMO_TEST_LOCAL_2026"
    }

    # 🌟 Gọi trực tiếp dịch vụ gốc với headless=False để anh quan sát trình duyệt
    result = await playwright_lms_service.enroll_users_pipeline(payload, headless=False)

    print("\n" + "="*50)
    print(f"🏁 KẾT QUẢ THỰC THI LMS:")
    print(f"📊 Trạng thái: {result.get('status')}")
    print(f"💬 Thông điệp: {result.get('message')}")
    print(f"📦 Chi tiết: {result.get('details')}")
    print("="*50)

if __name__ == "__main__":
    asyncio.run(test_lms_enrollment_live())