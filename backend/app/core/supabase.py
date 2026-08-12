from supabase import create_client, Client
from app.core.config import settings

_supabase_client: Client = None


def get_supabase_client() -> Client:
    """Singleton getter for Supabase Client with service role permissions."""
    global _supabase_client
    if _supabase_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            # Return dummy/mock if credentials not populated yet
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables."
            )
        _supabase_client = create_client(
            settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY
        )
    return _supabase_client
