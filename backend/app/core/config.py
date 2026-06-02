from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    DATABASE_URL: str = "sqlite+aiosqlite:///./graphchat.db"
    OPENAI_API_KEY: str = "sk-7d5bd68c1ff64f80a52972455008a504"
    OPENAI_MODEL: str = "deepseek-v4-flash"
    OPENAI_BASE_URL: str = "https://api.deepseek.com"
    LLM_PROVIDER: str = "openai"
    CORS_ORIGINS: str = "http://localhost:5173"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS_ORIGINS into a list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"


@lru_cache
def get_settings() -> Settings:
    """Singleton accessor for application settings."""
    return Settings()
