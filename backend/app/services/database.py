"""
Database service facade - switches between local SQLite and Supabase
"""
from ..config import get_settings


def get_database():
    """Get the appropriate database service based on config"""
    settings = get_settings()
    
    if settings.db_mode == "local":
        from .database_local import get_local_database
        return get_local_database()
    else:
        from .database_supabase import get_supabase_database
        return get_supabase_database()
