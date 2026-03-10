from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Shared building blocks ────────────────────────────────────────────────

class CorrectionItem(BaseModel):
    """Mirrors the corrections structure FeedbackCard.tsx renders."""
    original:   str
    suggestion: str
    reason:     str


class MetricScore(BaseModel):
    """One row in the FeedbackCard metric bars."""
    label: str
    score: float = Field(..., ge=0, le=100)


# ── Transcription ─────────────────────────────────────────────────────────

class TranscriptionResponse(BaseModel):
    """
    Returned after Whisper processes the audio.
    The frontend can display this before the full evaluation finishes
    if you choose to stream results in two steps.
    """
    transcript:        str
    detected_language: Optional[str] = None
    duration_seconds:  Optional[float] = None
    confidence:        Optional[float] = None


# ── Evaluation ────────────────────────────────────────────────────────────

class EvaluationResponse(BaseModel):
    """
    The primary response object — matches the FeedbackData interface
    in components/practice/FeedbackCard.tsx exactly.

    Fields:
      transcript    — the Whisper transcript shown at the top of FeedbackCard
      overall_score — drives the ScoreRing
      metrics       — drives the MetricBar list
      strengths     — bullet list of what the user did well
      corrections   — strikethrough → suggestion cards
      rewrite       — optional improved version blockquote
    """
    transcript:    str
    overall_score: float               = Field(..., ge=0, le=100, alias="overallScore")
    metrics:       list[MetricScore]
    strengths:     list[str]           = Field(default_factory=list)
    corrections:   list[CorrectionItem] = Field(default_factory=list)
    rewrite:       Optional[str]       = None

    # Extra fields the frontend doesn't render but are useful for saving
    session_id:        Optional[str]   = Field(None, alias="sessionId")
    detected_language: Optional[str]   = Field(None, alias="detectedLanguage")

    model_config = {"populate_by_name": True}


# ── Session ───────────────────────────────────────────────────────────────

class SpeechResultResponse(BaseModel):
    fluency_score:    Optional[float] = None
    grammar_score:    Optional[float] = None
    vocabulary_score: Optional[float] = None
    clarity_score:    Optional[float] = None
    pacing_score:     Optional[float] = None
    strengths:        list[str]             = Field(default_factory=list)
    corrections:      list[CorrectionItem]  = Field(default_factory=list)
    rewrite:          Optional[str]         = None


class SessionResponse(BaseModel):
    """
    Full session record — used by the session detail and history expand views.
    """
    id:               str
    topic:            str
    topic_category:   Optional[str]  = None
    practice_type:    str
    transcript:       Optional[str]  = None
    duration_seconds: Optional[int]  = None
    overall_score:    Optional[float] = None
    created_at:       datetime
    speech_result:    Optional[SpeechResultResponse] = None

    model_config = {"from_attributes": True}


# ── History ───────────────────────────────────────────────────────────────

class HistoryItemResponse(BaseModel):
    """
    Lightweight row for the history list — no full corrections to keep
    the payload small. The frontend expands a row to fetch the full session.
    """
    id:               str
    topic:            str
    topic_category:   Optional[str]  = None
    practice_type:    str
    duration_seconds: Optional[int]  = None
    overall_score:    Optional[float] = None
    created_at:       datetime

    # Metric scores for the mini bars shown in the accordion
    fluency_score:    Optional[float] = None
    grammar_score:    Optional[float] = None
    vocabulary_score: Optional[float] = None
    clarity_score:    Optional[float] = None
    pacing_score:     Optional[float] = None

    # Short transcript excerpt (first 160 chars)
    transcript_excerpt: Optional[str] = None

    model_config = {"from_attributes": True}


class HistoryResponse(BaseModel):
    items:      list[HistoryItemResponse]
    total:      int
    limit:      int
    offset:     int
    has_more:   bool


# ── Analytics ─────────────────────────────────────────────────────────────

class MetricAverage(BaseModel):
    label: str
    avg:   float = Field(..., ge=0, le=100)


class ActivityDay(BaseModel):
    """One cell in the GitHub-style activity grid."""
    date:       str    # ISO format YYYY-MM-DD
    practiced:  bool
    score:      Optional[float] = None


class AnalyticsSummaryResponse(BaseModel):
    """
    Feeds the analytics dashboard:
      - stat row  (streak, total sessions, avg score)
      - activity grid
      - metric average bars
    """
    current_streak:  int
    longest_streak:  int
    total_sessions:  int
    average_score:   Optional[float] = None

    metric_averages: list[MetricAverage] = Field(default_factory=list)

    # 12 weeks × 7 days for the activity grid
    activity_grid:   list[list[ActivityDay]] = Field(default_factory=list)

    # Last N scores for the sparkline — ordered oldest → newest
    score_trend:     list[float] = Field(default_factory=list)


# ── Streak ────────────────────────────────────────────────────────────────

class StreakResponse(BaseModel):
    current_streak:    int
    longest_streak:    int
    total_sessions:    int
    last_session_date: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── User ──────────────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id:         str
    email:      str
    name:       str
    avatar_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Generic ───────────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    """Simple acknowledgement for endpoints that don't return data."""
    message: str
    success: bool = True
