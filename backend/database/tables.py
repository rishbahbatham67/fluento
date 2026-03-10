from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.engine import Base


# ── Helpers ───────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _uuid() -> str:
    return str(uuid.uuid4())


# ── User ──────────────────────────────────────────────────────────────────

class User(Base):
    """
    Stores identity data from Google OAuth.
    google_id is the stable identifier we trust;
    email is stored for display only.
    """
    __tablename__ = "users"

    id:           Mapped[str]           = mapped_column(String, primary_key=True, default=_uuid)
    email:        Mapped[str]           = mapped_column(String, unique=True, nullable=False, index=True)
    name:         Mapped[str]           = mapped_column(String, nullable=False)
    avatar_url:   Mapped[Optional[str]] = mapped_column(String, nullable=True)
    google_id:    Mapped[Optional[str]] = mapped_column(String, unique=True, nullable=True, index=True)
    is_active:    Mapped[bool]          = mapped_column(Boolean, default=True)
    created_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now)
    updated_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    # Relationships
    sessions: Mapped[List["Session"]]   = relationship("Session",  back_populates="user", cascade="all, delete-orphan")
    streak:   Mapped[Optional["Streak"]]= relationship("Streak",   back_populates="user", uselist=False, cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User id={self.id!r} email={self.email!r}>"


# ── Session ───────────────────────────────────────────────────────────────

class Session(Base):
    """
    One practice session = one recording + one evaluation.
    Stores both the raw transcript and the aggregated score for quick reads.
    The per-metric breakdown lives in SpeechResult.
    """
    __tablename__ = "sessions"

    id:                Mapped[str]           = mapped_column(String, primary_key=True, default=_uuid)
    user_id:           Mapped[str]           = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Practice metadata
    topic:             Mapped[str]           = mapped_column(String, nullable=False)
    topic_category:    Mapped[Optional[str]] = mapped_column(String, nullable=True)
    practice_type:     Mapped[str]           = mapped_column(String, default="topic")   # topic | vocabulary | reading

    # Audio + transcript
    audio_file_path:   Mapped[Optional[str]] = mapped_column(String, nullable=True)
    transcript:        Mapped[Optional[str]] = mapped_column(Text,   nullable=True)
    duration_seconds:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    detected_language: Mapped[Optional[str]] = mapped_column(String,  nullable=True)

    # Aggregated score (denormalised for fast analytics queries)
    overall_score:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    created_at:        Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at:        Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    # Relationships
    user:          Mapped["User"]                   = relationship("User",         back_populates="sessions")
    speech_result: Mapped[Optional["SpeechResult"]] = relationship("SpeechResult", back_populates="session", uselist=False, cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Session id={self.id!r} topic={self.topic!r} score={self.overall_score}>"


# ── SpeechResult ──────────────────────────────────────────────────────────

class SpeechResult(Base):
    """
    Stores the full structured output from the LLM evaluation service.
    JSON fields (strengths, corrections) are stored as plain Text and
    serialised/deserialised in the CRUD layer — avoids dialect-specific
    JSON column types so SQLite and PostgreSQL both work identically.
    """
    __tablename__ = "speech_results"

    id:         Mapped[str]           = mapped_column(String, primary_key=True, default=_uuid)
    session_id: Mapped[str]           = mapped_column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    # Per-metric scores (0–100)
    fluency_score:    Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grammar_score:    Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vocabulary_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    clarity_score:    Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pacing_score:     Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # LLM narrative output — stored as JSON strings
    strengths:   Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON list of strings
    corrections: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON list of correction objects
    rewrite:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # single improved sentence

    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now)

    # Relationship
    session: Mapped["Session"] = relationship("Session", back_populates="speech_result")

    def __repr__(self) -> str:
        return f"<SpeechResult id={self.id!r} session_id={self.session_id!r}>"


# ── Streak ────────────────────────────────────────────────────────────────

class Streak(Base):
    """
    One row per user. Updated on every session save.
    last_session_date is used to decide whether today's session
    continues a streak or starts a new one.
    """
    __tablename__ = "streaks"

    id:                Mapped[str]            = mapped_column(String, primary_key=True, default=_uuid)
    user_id:           Mapped[str]            = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    current_streak:    Mapped[int]            = mapped_column(Integer, default=0)
    longest_streak:    Mapped[int]            = mapped_column(Integer, default=0)
    total_sessions:    Mapped[int]            = mapped_column(Integer, default=0)
    last_session_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at:        Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=_now)
    updated_at:        Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    # Relationship
    user: Mapped["User"] = relationship("User", back_populates="streak")

    def __repr__(self) -> str:
        return f"<Streak user_id={self.user_id!r} current={self.current_streak} longest={self.longest_streak}>"
