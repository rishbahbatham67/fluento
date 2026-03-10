from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session as DBSession

from core.dependencies import get_current_user_id
from crud.sessions import get_sessions_filtered
from database.engine import get_db
from models.response_models import (
    HistoryItemResponse,
    HistoryResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/history", tags=["history"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_history_item(session) -> HistoryItemResponse:
    """
    Map a Session ORM row → HistoryItemResponse.

    Flattens the speech_result metric scores into the top-level response
    so the history page accordion can render metric bars without a
    second network request per row.
    """
    sr = session.speech_result

    excerpt: Optional[str] = None
    if session.transcript:
        raw = session.transcript.strip()
        excerpt = raw[:160] + ("…" if len(raw) > 160 else "")

    return HistoryItemResponse(
        id=session.id,
        topic=session.topic,
        topic_category=session.topic_category,
        practice_type=session.practice_type,
        duration_seconds=session.duration_seconds,
        overall_score=session.overall_score,
        created_at=session.created_at,
        # Metric scores flattened from the linked SpeechResult row
        fluency_score=sr.fluency_score       if sr else None,
        grammar_score=sr.grammar_score       if sr else None,
        vocabulary_score=sr.vocabulary_score if sr else None,
        clarity_score=sr.clarity_score       if sr else None,
        pacing_score=sr.pacing_score         if sr else None,
        transcript_excerpt=excerpt,
    )


def _to_utc_datetime(d) -> Optional[datetime]:
    """
    Convert a date or datetime to a UTC-aware datetime.
    Returns None if d is None.
    """
    if d is None:
        return None
    if isinstance(d, datetime):
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    # date object
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# GET /history
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=HistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Filtered session history",
)
def get_history(
    # ── Filters ───────────────────────────────────────────────────────────
    practice_type: Optional[str] = Query(
        None,
        description="Filter by practice mode: topic | vocabulary | reading",
    ),
    topic_category: Optional[str] = Query(
        None,
        description="Filter by topic category e.g. 'Technology'",
    ),
    date_from: Optional[str] = Query(
        None,
        description="Inclusive start date (YYYY-MM-DD). Sessions on or after this date.",
    ),
    date_to: Optional[str] = Query(
        None,
        description="Inclusive end date (YYYY-MM-DD). Sessions on or before this date.",
    ),
    min_score: Optional[float] = Query(
        None, ge=0, le=100,
        description="Only return sessions with overall_score >= this value.",
    ),
    max_score: Optional[float] = Query(
        None, ge=0, le=100,
        description="Only return sessions with overall_score <= this value.",
    ),
    # ── Pagination ────────────────────────────────────────────────────────
    limit: int = Query(
        20, ge=1, le=100,
        description="Number of items per page.",
    ),
    offset: int = Query(
        0, ge=0,
        description="Number of items to skip (for pagination).",
    ),
    # ── Dependencies ──────────────────────────────────────────────────────
    db:      DBSession = Depends(get_db),
    user_id: str       = Depends(get_current_user_id),
) -> HistoryResponse:
    """
    Return a filtered, paginated list of the user's practice sessions.

    All filter parameters are optional. Omitting them returns all sessions
    for the user, newest first.

    This is the primary endpoint for the History page. Each item includes
    a `transcript_excerpt` (first 160 chars) and all five metric scores
    so the accordion can render without a follow-up request.

    To fetch the full speech result (corrections, strengths, rewrite) for
    a specific session, use `GET /sessions/{session_id}`.
    """
    # ── Parse date strings ────────────────────────────────────────────────
    # Dates arrive as query strings (YYYY-MM-DD). We parse them here
    # rather than in the CRUD layer so the CRUD layer stays framework-agnostic.
    parsed_date_from: Optional[datetime] = None
    parsed_date_to:   Optional[datetime] = None

    if date_from:
        try:
            from datetime import date
            parsed_date_from = _to_utc_datetime(
                date.fromisoformat(date_from)
            )
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail=f"Invalid date_from format: '{date_from}'. Use YYYY-MM-DD.",
            )

    if date_to:
        try:
            from datetime import date
            parsed_date_to = _to_utc_datetime(
                date.fromisoformat(date_to)
            )
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail=f"Invalid date_to format: '{date_to}'. Use YYYY-MM-DD.",
            )

    if parsed_date_from and parsed_date_to and parsed_date_from > parsed_date_to:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail="date_from must be before or equal to date_to.",
        )

    if min_score is not None and max_score is not None and min_score > max_score:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail="min_score must be less than or equal to max_score.",
        )

    logger.info(
        "GET /history | user=%s type=%s category=%s from=%s to=%s "
        "score=[%s,%s] limit=%d offset=%d",
        user_id,
        practice_type  or "any",
        topic_category or "any",
        date_from  or "—",
        date_to    or "—",
        min_score if min_score is not None else "—",
        max_score if max_score is not None else "—",
        limit,
        offset,
    )

    # ── Query ─────────────────────────────────────────────────────────────
    items, total = get_sessions_filtered(
        db,
        user_id,
        practice_type=practice_type,
        topic_category=topic_category,
        date_from=parsed_date_from,
        date_to=parsed_date_to,
        min_score=min_score,
        max_score=max_score,
        limit=limit,
        offset=offset,
    )

    logger.info(
        "History query returned %d/%d sessions | user=%s",
        len(items), total, user_id,
    )

    return HistoryResponse(
        items=[_build_history_item(s) for s in items],
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + len(items)) < total,
    )
