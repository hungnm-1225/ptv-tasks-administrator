# backend/app/core/cache_policy.py
import time
import logging
from collections import OrderedDict
from typing import Optional, Any, Dict, List
from enum import Enum

logger = logging.getLogger(__name__)


class CacheTier(Enum):
    TIER_A_CATALOG = "tier_a_catalog"    # Dữ liệu tĩnh, ít thay đổi (Courses, 480 Trường học): max 50 entries, TTL 10-15m
    TIER_B_STATUS = "tier_b_status"      # Trạng thái hệ thống (Bot workers, Monitor, Health): max 20 entries, TTL 15-30s
    TIER_C_SUMMARY = "tier_c_summary"    # Bảng tóm tắt / danh sách rút gọn (Tasks, Tickets): max 15 entries, TTL 30-60s


class BoundedMemoryCache:
    """
    Bộ nhớ đệm RAM phân tầng có kiểm soát dung lượng nghiêm ngặt (Render 512MB RAM Budget <= 40MB):
    - Áp dụng thuật toán LRU (Least Recently Used) qua OrderedDict: không bao giờ phình to vô hạn.
    - Giới hạn cứng số lượng bản ghi (max_entries).
    - Tự động dọn dẹp các key hết hạn (TTL) khi đọc hoặc ghi.
    - Hỗ trợ invalidate toàn bộ hoặc theo prefix.
    """

    def __init__(self, tier: CacheTier = CacheTier.TIER_B_STATUS, max_entries: Optional[int] = None, default_ttl: Optional[int] = None):
        self.tier = tier
        
        if tier == CacheTier.TIER_A_CATALOG:
            self.max_entries = max_entries or 50
            self.default_ttl = default_ttl or 600  # 10 phút
        elif tier == CacheTier.TIER_B_STATUS:
            self.max_entries = max_entries or 20
            self.default_ttl = default_ttl or 30   # 30 giây
        elif tier == CacheTier.TIER_C_SUMMARY:
            self.max_entries = max_entries or 15
            self.default_ttl = default_ttl or 45   # 45 giây
        else:
            self.max_entries = max_entries or 20
            self.default_ttl = default_ttl or 60

        self._store: OrderedDict[str, tuple[Any, float]] = OrderedDict()

    def _purge_expired(self):
        """Dọn dẹp các key đã hết hạn."""
        now = time.time()
        expired_keys = [k for k, (_, expire_at) in self._store.items() if now >= expire_at]
        for k in expired_keys:
            self._store.pop(k, None)

    def get(self, key: str) -> Optional[Any]:
        """Lấy giá trị từ cache. Trả về None nếu không tồn tại hoặc đã hết hạn."""
        if key not in self._store:
            return None

        val, expire_at = self._store[key]
        if time.time() >= expire_at:
            self._store.pop(key, None)
            return None

        # Đẩy key vừa truy cập lên cuối danh sách LRU
        self._store.move_to_end(key)
        return val

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """Lưu giá trị vào cache với LRU eviction và TTL."""
        self._purge_expired()

        # Nếu đã đạt ngưỡng tối đa, loại bỏ phần tử cũ nhất (đầu danh sách)
        if len(self._store) >= self.max_entries and key not in self._store:
            oldest_key, _ = self._store.popitem(last=False)
            logger.debug(f"🧹 [CACHE LRU] Loại bỏ key cũ nhất '{oldest_key}' khỏi cache {self.tier.value}")

        expire_at = time.time() + (ttl if ttl is not None else self.default_ttl)
        self._store[key] = (value, expire_at)
        self._store.move_to_end(key)

    def invalidate(self, prefix: str = ""):
        """Xóa sạch toàn bộ bộ nhớ đệm hoặc xóa theo prefix."""
        if not prefix:
            self._store.clear()
        else:
            self.invalidate_prefix(prefix)

    def invalidate_prefix(self, prefix: str):
        """Xóa các key có tiền tố khớp với prefix."""
        matched = [k for k in list(self._store.keys()) if k.startswith(prefix)]
        for k in matched:
            self._store.pop(k, None)

    def size(self) -> int:
        """Số lượng item hiện có trong cache."""
        return len(self._store)
