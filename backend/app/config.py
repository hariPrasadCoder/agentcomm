"""
Application configuration via environment variables
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Literal


class Settings(BaseSettings):
    # App
    app_name: str = "AgentComm"
    debug: bool = False
    
    # Database Mode: "local" (SQLite) or "supabase"
    db_mode: Literal["local", "supabase"] = "local"
    
    # Local SQLite (used when db_mode="local")
    sqlite_path: str = "./agentcomm.db"
    
    # Supabase (used when db_mode="supabase")
    supabase_url: str = ""
    supabase_key: str = ""  # anon key for client
    supabase_service_key: str = ""  # service role key for admin operations
    
    # JWT (used for local auth)
    jwt_secret: str = "dev-secret-change-in-production-abc123xyz"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24 * 7  # 1 week
    
    # AI Providers (optional - users can provide their own)
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    
    # Default model for org-level agent
    default_model: str = "claude-sonnet-4-20250514"
    default_provider: str = "anthropic"
    
    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
