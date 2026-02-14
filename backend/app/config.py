"""
Application configuration via environment variables
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "AgentComm"
    debug: bool = False
    
    # Supabase
    supabase_url: str
    supabase_key: str  # anon key for client
    supabase_service_key: str  # service role key for admin operations
    
    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24 * 7  # 1 week
    
    # AI Providers (optional - users can provide their own)
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    
    # Default model for org-level agent
    default_model: str = "claude-sonnet-4-20250514"
    default_provider: str = "anthropic"
    
    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
