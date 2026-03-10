from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, desc
from sqlalchemy.orm import Session, joinedload

from database.tables import Session as SessionModel, SpeechResult
from models.request_models import CorrectionItem, MetricScore


# ── JSON helpers ──────────────────────────────────────────────────────────
# SpeechResult stores strengths and corrections as JSON strings so
# the schema stays dialect-agnostic (SQLite + PostgreSQL both work).

def _dump(value: list) -> str:
    """Serialise a list to a JSON string for storage."""
    return json.dumps(value, ensure_ascii=False)


def _load_strings(raw: Optional[str]) -> list[str]:
    """Deserialise a stored JSON string into a list of strings."""
    if not raw:
        return []
    try:
        result = json.loads(raw)
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _load_corrections(raw: Optional[str]) -> list[dict]:
    """Deserialise a stored JSON string into a list of correction dicts."""
    if not raw:
        return []
    try:
        result = json.loads(raw)
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Create ────────────────────────────────────────────────────────────────

def create_session(
    db: Session,
    *,
    user_id: str,
    topic: str,
    transcript: str,
    overall_score: float,
    metrics: list[MetricScore],
    strengths: list[str],
    corrections: list[CorrectionItem],
    topic_category: Optional[str] = None,
    practice_type: str = "topic",
    duration_seconds: Optional[int] = None,
    audio_file_path: Optional[str] = None,
    detected_language: Optional[str] = None,
    rewrite: Optional[str] = None,
) -> SessionModel:
    """
    Atomically insert a Session row and its linked SpeechResult row.
    Uses db.flush() after the Session so its id is available for the
    SpeechResult foreign key before the final commit.

    Metrics list is unpacked into individual float columns so they can
    be aggregated in SQL (AVG, etc.) without JSON parsing.
    """
    # Build a label → score lookup from the metrics list
    metric_map: dict[str, float] = {
        m.label.lower(): m.score for m in metrics
    }

    # ── Session row ───────────────────────────────────────────────────────
    session = SessionModel(
        user_id=user_id,
        topic=topic,
        topic_category=topic_category,
        practice_type=practice_type,
        audio_file_path=audio_file_path,
        transcript=transcript,
        duration_seconds=duration_seconds,
        detected_language=detected_language,
        overall_score=overall_score,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(session)
    db.flush()  # populates session.id without committing

    # ── SpeechResult row ──────────────────────────────────────────────────
    corrections_as_dicts = [
        c.model_dump() if hasattr(c, "model_dump") else dict(c)
        for c in corrections
    ]

    speech_result = SpeechResult(
        session_id=session.id,
        fluency_score=metric_map.get("fluency"),
        grammar_score=metric_map.get("grammar"),
        vocabulary_score=metric_map.get("vocabulary"),
        clarity_score=metric_map.get("clarity"),
        pacing_score=metric_map.get("pacing"),
        strengths=_dump(strengths),
        corrections=_dump(corrections_as_dicts),
        rewrite=rewrite,
        created_at=_now(),
    )
    db.add(speech_result)
    db.commit()

    # Re-fetch with speech_result eagerly loaded so the caller
    # gets a fully hydrated object in one round-trip
    db.refresh(session)
    return session


# ── Read ──────────────────────────────────────────────────────────────────

def get_session_by_id(
    db: Session,
    session_id: str,
) -> Optional[SessionModel]:
    """
    Fetch a single session by primary key.
    Eagerly loads speech_result so callers don't trigger lazy loads.
    Returns None if not found.
    """
    return (
        db.query(SessionModel)
        .options(joinedload(SessionModel.speech_result))
        .filter(SessionModel.id == session_id)
        .first()
    )


def get_sessions_by_user(
    db: Session,
    user_id: str,
    *,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[SessionModel], int]:
    """
    Paginated list of all sessions for a user, newest first.
    Returns (items, total_count) so the API can populate HistoryResponse.
    """
    base_query = (
        db.query(SessionModel)
        .options(joinedload(SessionModel.speech_result))
        .filter(SessionModel.user_id == user_id)
    )

    total = base_query.count()
    items = (
        base_query
        .order_by(desc(SessionModel.created_at))
        .limit(limit)
        .offset(offset)
        .all()
    )
    return items, total


def get_sessions_filtered(
    db: Session,
    user_id: str,
    *,
    practice_type: Optional[str] = None,
    topic_category: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[SessionModel], int]:
    """
    Filtered + paginated session list for the history page.
    Any filter left as None is simply not applied.
    Returns (items, total_count).
    """
    q = (
        db.query(SessionModel)
        .options(joinedload(SessionModel.speech_result))
        .filter(SessionModel.user_id == user_id)
    )

    if practice_type:
        q = q.filter(SessionModel.practice_type == practice_type)

    if topic_category:
        q = q.filter(SessionModel.topic_category == topic_category)

    if date_from:
        q = q.filter(SessionModel.created_at >= date_from)

    if date_to:
        # Include the full end day by going to end-of-day
        from datetime import timedelta
        end_of_day = datetime.combine(date_to, datetime.max.time()).replace(
            tzinfo=timezone.utc
        )
        q = q.filter(SessionModel.created_at <= end_of_day)

    if min_score is not None:
        q = q.filter(SessionModel.overall_score >= min_score)

    if max_score is not None:
        q = q.filter(SessionModel.overall_score <= max_score)

    total = q.count()
    items = (
        q.order_by(desc(SessionModel.created_at))
        .limit(limit)
        .offset(offset)
        .all()
    )
    return items, total


def get_score_trend(
    db: Session,
    user_id: str,
    *,
    limit: int = 14,
) -> list[float]:
    """
    Return the last N overall scores ordered oldest → newest.
    Used to draw the sparkline on the analytics dashboard.
    Only includes sessions that have a non-null overall_score.
    """
    rows = (
        db.query(SessionModel.overall_score)
        .filter(
            SessionModel.user_id == user_id,
            SessionModel.overall_score.is_not(None),
        )
        .order_by(desc(SessionModel.created_at))
        .limit(limit)
        .all()
    )
    # rows come back newest-first; reverse so chart reads left-to-right
    scores = [row.overall_score for row in reversed(rows)]
    return scores


# ── Aggregate helpers (used by analytics service) ─────────────────────────

def get_metric_averages(
    db: Session,
    user_id: str,
) -> dict[str, Optional[float]]:
    """
    Return a dict of {metric_name: average_score} for the analytics page bars.
    Computes averages in SQL so large session counts stay fast.
    """
    row = (
        db.query(
            func.avg(SpeechResult.fluency_score).label("fluency"),
            func.avg(SpeechResult.grammar_score).label("grammar"),
            func.avg(SpeechResult.vocabulary_score).label("vocabulary"),
            func.avg(SpeechResult.clarity_score).label("clarity"),
            func.avg(SpeechResult.pacing_score).label("pacing"),
        )
        .join(SessionModel, SessionModel.id == SpeechResult.session_id)
        .filter(SessionModel.user_id == user_id)
        .first()
    )

    if row is None:
        return {k: None for k in ("fluency", "grammar", "vocabulary", "clarity", "pacing")}

    return {
        "fluency":    round(row.fluency,    1) if row.fluency    is not None else None,
        "grammar":    round(row.grammar,    1) if row.grammar    is not None else None,
        "vocabulary": round(row.vocabulary, 1) if row.vocabulary is not None else None,
        "clarity":    round(row.clarity,    1) if row.clarity    is not None else None,
        "pacing":     round(row.pacing,     1) if row.pacing     is not None else None,
    }


# ── Deserialisation helper (used by response builders) ───────────────────

def hydrate_speech_result(result: SpeechResult) -> dict:
    """
    Convert a raw SpeechResult ORM row into a plain dict with
    strengths and corrections deserialised from their JSON strings.
    Called in routers when building SessionResponse / HistoryItemResponse.
    """
    return {
        "fluency_score":    result.fluency_score,
        "grammar_score":    result.grammar_score,
        "vocabulary_score": result.vocabulary_score,
        "clarity_score":    result.clarity_score,
        "pacing_score":     result.pacing_score,
        "strengths":        _load_strings(result.strengths),
        "corrections":      _load_corrections(result.corrections),
        "rewrite":          result.rewrite,
    }
