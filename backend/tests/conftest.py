# backend/tests/conftest.py
import os
import sys
import pytest
from unittest.mock import MagicMock

# Đảm bảo đường dẫn import từ thư mục backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Thiết lập biến môi trường giả lập phục vụ test độc lập
os.environ["GEMINI_API_KEY"] = "mock-gemini-key-for-testing"
os.environ["GEMINI_API_KEY2"] = "mock-gemini-key2-for-testing"
os.environ["SUPABASE_URL"] = "https://mock.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "mock-service-role-key"