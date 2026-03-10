from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────────────────
    APP_NAME: str = "Fluento"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True

    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./fluento.db"

    # ── Whisper ───────────────────────────────────────────────────────────
    # Options: tiny | base | small | medium | large
    # Use "base" locally, "medium" or "large" in production
    WHISPER_MODEL_SIZE: str = "base"
    WHISPER_DEVICE: str = "cpu"          # "cpu" or "cuda"
    WHISPER_COMPUTE_TYPE: str = "int8"   # "int8" for CPU, "float16" for GPU

    # ── LLM ───────────────────────────────────────────────────────────────
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MAX_TOKENS: int = 1500
    LLM_TEMPERATURE: float = 0.3        # low = more consistent scoring

    # ── Auth ──────────────────────────────────────────────────────────────
    JWT_SECRET: str = "change-this-before-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7   # 7 days

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/callback"

    # ── CORS ──────────────────────────────────────────────────────────────
    # Comma-separated string in .env: "http://localhost:3000,https://myapp.com"
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    # ── Audio ─────────────────────────────────────────────────────────────
    AUDIO_UPLOAD_DIR: str = "./audio_uploads"
    MAX_AUDIO_SIZE_MB: int = 25
    ALLOWED_AUDIO_TYPES: List[str] = [
        "audio/webm",
        "audio/wav",
        "audio/mp4",
        "audio/mpeg",
        "audio/ogg",
        "audio/x-m4a",
    ]

    @property
    def max_audio_bytes(self) -> int:
        return self.MAX_AUDIO_SIZE_MB * 1024 * 1024


# Single instance — import this everywhere
@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
