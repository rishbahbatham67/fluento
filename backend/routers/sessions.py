from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DBSession

from core.dependencies import get_current_user_id, require_session_owner
from crud.sessions import (
    get_session_by_id,
    get_sessions_by_user,
    hydrate_speech_result,
)
from database.engine import get_db
from models.response_models import (
    CorrectionItem,
    HistoryResponse,
    HistoryItemResponse,
    SessionResponse,
    SpeechResultResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ---------------------------------------------------------------------------
# Helpers — ORM → response model
# ---------------------------------------------------------------------------

def _build_speech_result_response(
    session,
) -> Optional[SpeechResultResponse]:
    """
    Convert a Session ORM object's linked SpeechResult into a
    SpeechResultResponse, deserialising the JSON text fields.
    Returns None if the session has no speech_result yet.
    """
    sr = session.speech_result
    if sr is None:
        return None

    hydrated = hydrate_speech_result(sr)

    return SpeechResultResponse(
        fluency_score=hydrated["fluency_score"],
        grammar_score=hydrated["grammar_score"],
        vocabulary_score=hydrated["vocabulary_score"],
        clarity_score=hydrated["clarity_score"],
        pacing_score=hydrated["pacing_score"],
        strengths=hydrated["strengths"],
        corrections=[
            CorrectionItem(**c) for c in hydrated["corrections"]
        ],
        rewrite=hydrated["rewrite"],
    )


def _build_session_response(session) -> SessionResponse:
    """Map a Session ORM row → SessionResponse."""
    return SessionResponse(
        id=session.id,
        topic=session.topic,
        topic_category=session.topic_category,
        practice_type=session.practice_type,
        transcript=session.transcript,
        duration_seconds=session.duration_seconds,
        overall_score=session.overall_score,
        created_at=session.created_at,
        speech_result=_build_speech_result_response(session),
    )


def _build_history_item(session) -> HistoryItemResponse:
    """
    Map a Session ORM row → HistoryItemResponse.
    Pulls metric scores up from speech_result into flat fields so the
    history page accordion can render bars without a second fetch.
    """
    sr = session.speech_result

    # Short excerpt for the accordion preview (first 160 chars)
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
        fluency_score=sr.fluency_score    if sr else None,
        grammar_score=sr.grammar_score    if sr else None,
        vocabulary_score=sr.vocabulary_score if sr else None,
        clarity_score=sr.clarity_score    if sr else None,
        pacing_score=sr.pacing_score      if sr else None,
        transcript_excerpt=excerpt,
    )


# ---------------------------------------------------------------------------
# GET /sessions/{session_id}
# ---------------------------------------------------------------------------

@router.get(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Get a single session with full feedback",
)
def get_session(
    session_id: str,
    db:         DBSession = Depends(get_db),
    user_id:    str       = Depends(get_current_user_id),
) -> SessionResponse:
    """
    Return the full session record including the speech_result
    with deserialised strengths and corrections.

    Used by the history page when the user expands a row to see
    the complete AI feedback for that session.
    """
    logger.info("GET /sessions/%s | user=%s", session_id, user_id)

    session = get_session_by_id(db, session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )

    require_session_owner(session.user_id, user_id)

    return _build_session_response(session)


# ---------------------------------------------------------------------------
# GET /sessions
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=HistoryResponse,
    summary="List sessions for the current user (paginated)",
)
def list_sessions(
    limit:   int = Query(20, ge=1,  le=100, description="Page size"),
    offset:  int = Query(0,  ge=0,          description="Pagination offset"),
    db:      DBSession = Depends(get_db),
    user_id: str       = Depends(get_current_user_id),
) -> HistoryResponse:
    """
    Return a paginated list of all sessions for the authenticated user,
    ordered newest first.

    This is a minimal listing endpoint. For filtering, use GET /history.
    """
    logger.info(
        "GET /sessions | user=%s limit=%d offset=%d",
        user_id, limit, offset,
    )

    items, total = get_sessions_by_user(db, user_id, limit=limit, offset=offset)

    logger.info("Returning %d/%d sessions for user=%s", len(items), total, user_id)

    return HistoryResponse(
        items=[_build_history_item(s) for s in items],
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + len(items)) < total,
    )
