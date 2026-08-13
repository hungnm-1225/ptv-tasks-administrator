# backend/app/main.py
import gc
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Import các hàm quét từ Service
from app.services.gmail_service import poll_unread_gmails
from app.services.osticket_service import poll_open_ostickets
from app.services.google_sheet_service import poll_form_feedbacks

# Import API Router
from app.api.v1.router import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Khởi tạo Async Scheduler
scheduler = AsyncIOScheduler()

async def safe_job_wrapper(job_func, job_name: str):
    """Bọc các hàm quét để bẫy lỗi, không làm sập ứng dụng và tự dọn dẹp RAM"""
    try:
        logger.info(f"🔄 [Cron Job Started] {job_name}")
        await job_func()
    except Exception as e:
        logger.error(f"❌ [Cron Job Error] {job_name}: {str(e)}")
    finally:
        # Thu gom rác bộ nhớ RAM sau mỗi lần quét (Cực kỳ quan trọng trên Render Free Tier!)
        gc.collect()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 🚀 KHỞI CHẠY BỘ MÁY QUÉT NGẦM KHI SERVER BẬT
    logger.info("🔥 Đang kích hoạt APScheduler 24/7...")
    
    # 1. Quét Gmail mỗi 3 phút
    scheduler.add_job(
        safe_job_wrapper, 'interval', minutes=3, 
        args=[poll_unread_gmails, "Quét Gmail"], id='gmail_cron'
    )
    
    # 2. Quét OS Ticket (Playwright) mỗi 5 phút
    scheduler.add_job(
        safe_job_wrapper, 'interval', minutes=5, 
        args=[poll_open_ostickets, "Quét OS Ticket"], id='osticket_cron'
    )
    
    # 3. Quét Form Feedback (Google Sheet) mỗi 5 phút
    scheduler.add_job(
        safe_job_wrapper, 'interval', minutes=5, 
        args=[poll_form_feedbacks, "Quét Form Feedback"], id='sheet_cron'
    )
    
    scheduler.start()
    yield
    
    # 🛑 TẮT SCHEDULER KHI SERVER RESTART
    logger.info("🛑 Tắt APScheduler...")
    scheduler.shutdown()

app = FastAPI(
    title="Pythaverse Central Admin API",
    version="1.0.0",
    lifespan=lifespan
)

# Cấu hình CORS cho phép Web Admin Vercel truy cập
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount các đường dẫn API
app.include_router(api_router, prefix="/api/v1")

@app.get("/api/v1/health")
async def health_check():
    """Endpoint dành riêng cho UptimeRobot Ping giữ Server sống 24/7"""
    return {
        "status": "online",
        "scheduler_running": scheduler.running,
        "active_jobs": len(scheduler.get_jobs())
    }