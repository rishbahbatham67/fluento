from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session as DBSession

from core.config import settings
from core.dependencies import get_current_user_id
from crud.sessions import create_session
from crud.streaks import increment_streak
from crud.users import get_user_by_id
from database.engine import get_db
from models.request_models import CorrectionItem, MetricScore
from models.response_models import EvaluationResponse
from services.evaluation import evaluate_transcript
from services.speech_to_text import transcribe_audio
from utils.audio import (
    cleanup_audio_file,
    format_file_size,
    save_audio_file,
    validate_audio_file,
    validate_audio_size,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audio", tags=["audio"])


# ---------------------------------------------------------------------------
# Dev user fallback
# ---------------------------------------------------------------------------
# While Google OAuth is not yet wired, every request falls back to this
# user ID. Replace with Depends(get_current_user) once auth is live.



# ---------------------------------------------------------------------------
# POST /audio/upload
# ---------------------------------------------------------------------------

@router.post(
    "/upload",
    response_model=EvaluationResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload audio, transcribe, and evaluate",
    description=(
        "Accepts a recorded audio file plus practice metadata. "
        "Transcribes the audio with Whisper, evaluates the transcript "
        "with an LLM, saves the session to the database, increments the "
        "user's streak, and returns structured AI feedback."
    ),
)
async def upload_audio(
    # ── File ─────────────────────────────────────────────────────────────
    audio: UploadFile = File(
        ...,
        description="Audio recording in webm / wav / mp3 / mp4 / ogg format.",
    ),
    # ── Form fields ───────────────────────────────────────────────────────
    topic: str = Form(
        ...,
        min_length=1,
        max_length=200,
        description="The topic the user spoke about, e.g. 'Climate Change'.",
    ),
    topic_category: Optional[str] = Form(
        None,
        max_length=100,
        description="Category label, e.g. 'Technology'. Optional.",
    ),
    practice_type: str = Form(
        "topic",
        description="One of: topic | vocabulary | reading.",
    ),
    duration_seconds: Optional[int] = Form(
        None,
        ge=1,
        le=3600,
        description="Client-measured recording length in seconds. Optional.",
    ),
    user_id: str = Depends(get_current_user_id),
    # ── Dependencies ──────────────────────────────────────────────────────
    db: DBSession = Depends(get_db),
) -> EvaluationResponse:
    """
    Full pipeline: audio → Whisper → LLM → DB → EvaluationResponse.

    Error responses:
      400  invalid file type, file too large, or transcript too short
      422  form validation failure (FastAPI built-in)
      500  Whisper or LLM failure after retries exhausted
    """

    request_start = time.perf_counter()

    # ── 1. Resolve user ───────────────────────────────────────────────────
    uid = user_id

    logger.info(
        "Audio upload received | user=%s topic=%r type=%s file=%s",
        uid, topic, practice_type, audio.filename,
    )

    # ── 2. Validate file type (before reading — fast rejection) ───────────
    try:
        validate_audio_file(audio)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File validation error: {exc}",
        ) from exc

    # ── 3. Save to disk + validate size ───────────────────────────────────
    audio_path: Optional[str] = None
    try:
        audio_path, size_bytes = await save_audio_file(audio, uid)
        validate_audio_size(size_bytes)
        logger.info("File saved | path=%s size=%s", audio_path, format_file_size(size_bytes))
    except HTTPException:
        if audio_path:
            cleanup_audio_file(audio_path)
        raise
    except Exception as exc:
        if audio_path:
            cleanup_audio_file(audio_path)
        logger.error("Failed to save audio file: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save the uploaded audio file. Please try again.",
        ) from exc

    # ── 4. Transcribe ─────────────────────────────────────────────────────
    t_transcribe = time.perf_counter()
    try:
        transcription = transcribe_audio(audio_path)
    except FileNotFoundError as exc:
        cleanup_audio_file(audio_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Audio file was not found for transcription.",
        ) from exc
    except RuntimeError as exc:
        cleanup_audio_file(audio_path)
        logger.error("Transcription failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Transcription failed. Make sure the audio contains clear speech "
                f"and try again. Detail: {exc}"
            ),
        ) from exc
    except Exception as exc:
        cleanup_audio_file(audio_path)
        logger.error("Unexpected transcription error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during transcription.",
        ) from exc

    transcription_elapsed = time.perf_counter() - t_transcribe
    logger.info(
        "Transcription done | words=%d lang=%s duration=%.1fs took=%.2fs",
        len(transcription.transcript.split()),
        transcription.detected_language,
        transcription.duration_seconds or 0,
        transcription_elapsed,
    )

    # ── 5. Guard: transcript must have usable content ─────────────────────
    if not transcription.transcript.strip():
        cleanup_audio_file(audio_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No speech was detected in the recording. "
                "Please check your microphone and try again."
            ),
        )

    word_count = len(transcription.transcript.split())
    if word_count < 5:
        cleanup_audio_file(audio_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"The recording was too short ({word_count} words). "
                "Please speak for at least 10–15 seconds to receive meaningful feedback."
            ),
        )

    # ── 6. Evaluate ───────────────────────────────────────────────────────
    t_evaluate = time.perf_counter()
    try:
        evaluation = evaluate_transcript(
            transcript=transcription.transcript,
            topic=topic,
        )
    except ValueError as exc:
        # evaluate_transcript raises ValueError for short transcripts
        # (redundant here after our guard above, but safe to handle)
        cleanup_audio_file(audio_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        cleanup_audio_file(audio_path)
        logger.error("Evaluation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "The AI evaluation service encountered an error. "
                "The transcript was captured — please try submitting again."
            ),
        ) from exc
    except Exception as exc:
        cleanup_audio_file(audio_path)
        logger.error("Unexpected evaluation error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during evaluation.",
        ) from exc

    evaluation_elapsed = time.perf_counter() - t_evaluate
    logger.info(
        "Evaluation done | score=%d took=%.2fs",
        evaluation.overall_score,
        evaluation_elapsed,
    )

    # ── 7. Save session + speech result to database ───────────────────────
    # We save regardless of whether the user explicitly clicks "Save"
    # on the frontend, because:
    #   a) The history page should always reflect what was practiced.
    #   b) Analytics and streaks depend on session records.
    #   c) The frontend receives a session_id it can reference for later
    #      retrieval or sharing.
    session_record = None
    try:
        # Convert Pydantic models to the types crud.sessions.create_session expects
        metric_scores = [
            MetricScore(label=m.label, score=m.score)
            for m in evaluation.metrics
        ]
        correction_items = [
            CorrectionItem(
                original=c.original,
                suggestion=c.suggestion,
                reason=c.reason,
            )
            for c in evaluation.corrections
        ]

        session_record = create_session(
            db,
            user_id=uid,
            topic=topic,
            topic_category=topic_category,
            practice_type=practice_type,
            transcript=transcription.transcript,
            overall_score=float(evaluation.overall_score),
            metrics=metric_scores,
            strengths=evaluation.strengths,
            corrections=correction_items,
            duration_seconds=duration_seconds or (
                int(transcription.duration_seconds)
                if transcription.duration_seconds else None
            ),
            audio_file_path=None,    # we clean up the file below
            detected_language=transcription.detected_language,
            rewrite=evaluation.rewrite,
        )
        logger.info("Session saved | session_id=%s", session_record.id)

    except Exception as exc:
        # A DB failure must NOT invalidate the evaluation the user just received.
        # Log it, skip the streak update, and continue — the evaluation is returned.
        logger.error(
            "Failed to save session to database: %s | user=%s topic=%r",
            exc, uid, topic, exc_info=True,
        )

    # ── 8. Increment streak ───────────────────────────────────────────────
    if session_record is not None:
        try:
            updated_streak = increment_streak(db, uid)
            logger.info(
                "Streak updated | user=%s current=%d longest=%d total=%d",
                uid,
                updated_streak.current_streak,
                updated_streak.longest_streak,
                updated_streak.total_sessions,
            )
        except Exception as exc:
            # Streak failure is also non-fatal — the evaluation is more important
            logger.error("Failed to update streak: %s | user=%s", exc, uid, exc_info=True)

    # ── 9. Cleanup audio file ─────────────────────────────────────────────
    # Raw audio is no longer needed once we have the transcript.
    # We do not store audio long-term to keep disk usage low.
    cleanup_audio_file(audio_path)

    # ── 10. Build and return response ─────────────────────────────────────
    total_elapsed = time.perf_counter() - request_start
    logger.info(
        "Request complete | user=%s score=%d words=%d "
        "transcribe=%.2fs evaluate=%.2fs total=%.2fs",
        uid,
        evaluation.overall_score,
        word_count,
        transcription_elapsed,
        evaluation_elapsed,
        total_elapsed,
    )

    # Attach the session_id to the response so the frontend can reference
    # this specific session (e.g. for sharing or re-fetching the full record)
    if session_record is not None:
        evaluation.session_id = session_record.id

    # Also attach the detected language so the frontend can display it
    evaluation.detected_language = transcription.detected_language

    return evaluation
