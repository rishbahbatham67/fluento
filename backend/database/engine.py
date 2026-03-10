from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool
from typing import Generator

from core.config import settings


# ── Declarative base ──────────────────────────────────────────────────────
# All ORM table classes inherit from this
class Base(DeclarativeBase):
    pass


# ── Engine factory ────────────────────────────────────────────────────────
def _build_engine():
    url = settings.DATABASE_URL

    if url.startswith("sqlite"):
        # SQLite-specific tuning:
        # - check_same_thread=False  → required for FastAPI's async handlers
        # - StaticPool             → single in-memory connection for tests
        # - WAL journal mode       → allows concurrent reads during a write
        engine = create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool if ":memory:" in url else None,
            echo=settings.DEBUG,
        )

        # Enable WAL mode and foreign-key enforcement on every new connection
        @event.listens_for(engine, "connect")
        def _on_connect(dbapi_conn, _):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    else:
        # PostgreSQL / any other dialect — no special connect_args needed
        engine = create_engine(
            url,
            pool_pre_ping=True,   # recycle stale connections
            pool_size=10,
            max_overflow=20,
            echo=settings.DEBUG,
        )

    return engine


engine = _build_engine()

# ── Session factory ───────────────────────────────────────────────────────
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


# ── FastAPI dependency ────────────────────────────────────────────────────
def get_db() -> Generator:
    """
    Yields a SQLAlchemy session and guarantees it is closed after the
    request finishes — even if an exception is raised.

    Usage in a router:
        @router.get("/example")
        def example(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Schema creation helper ────────────────────────────────────────────────
def create_tables():
    """
    Create all tables defined in tables.py.
    Called once at app startup from main.py.
    Import Base *after* all models have been imported so SQLAlchemy
    knows about every table before calling create_all.
    """
    from database import tables  # noqa: F401 — side-effect import registers models
    Base.metadata.create_all(bind=engine)
