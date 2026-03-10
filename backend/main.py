from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings

# ---------------------------------------------------------------------------
# Logging setup — configure before any other imports that use logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan (startup + shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Code before `yield` runs at startup.
    Code after `yield` runs at shutdown.
    """
    logger.info("Starting %s v%s", settings.APP_NAME, settings.APP_VERSION)

    # ── Create DB tables ───────────────────────────────────────────────────
    from database.engine import create_tables
    create_tables()
    logger.info("Database tables verified.")

    # ── Create audio upload directory ──────────────────────────────────────
    Path(settings.AUDIO_UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    logger.info("Audio upload dir: %s", os.path.abspath(settings.AUDIO_UPLOAD_DIR))

    # ── Pre-load Whisper model ─────────────────────────────────────────────
    # Loads the model now so the first user request isn't slow.
    # This is intentionally non-fatal — if Whisper isn't installed the
    # server still starts; the error surfaces on the first /audio/upload call.
    from services.speech_to_text import warmup_model
    warmup_model()

    yield  # ← server is running and accepting requests

    logger.info("%s shutting down.", settings.APP_NAME)


# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Backend API for Fluento — AI Communication Training",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

from routers.audio import router as audio_router       # noqa: E402

app.include_router(audio_router, prefix="/api/v1")

# Future routers — uncomment as they are implemented:
from routers.audio     import router as audio_router
from routers.sessions  import router as sessions_router
from routers.analytics import router as analytics_router
from routers.history   import router as history_router
from routers.topics import router as topics_router

app.include_router(topics_router, prefix="/api/v1")
app.include_router(audio_router,     prefix="/api/v1")
app.include_router(sessions_router,  prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(history_router,   prefix="/api/v1")

# Future:
# from routers.auth import router as auth_router
# app.include_router(auth_router, prefix="/api/v1")

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"])
def health():
    return {
        "status":  "ok",
        "app":     settings.APP_NAME,
        "version": settings.APP_VERSION,
        "debug":   settings.DEBUG,
    }


# ---------------------------------------------------------------------------
# Run directly (dev only)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )
