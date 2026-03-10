from __future__ import annotations

from datetime import date
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ── Audio upload ──────────────────────────────────────────────────────────

class AudioUploadMetadata(BaseModel):
    """
    Sent as form fields alongside the audio file in the multipart request.
    The file itself is handled by FastAPI's UploadFile — this model
    covers everything else the frontend sends with it.
    """
    topic:          str            = Field(..., min_length=1, max_length=200, description="The practice topic label")
    topic_category: Optional[str] = Field(None, max_length=100, description="Category e.g. Technology, Environment")
    practice_type:  str            = Field("topic", description="topic | vocabulary | reading")
    duration_seconds: Optional[int] = Field(None, ge=1, le=3600, description="Client-measured recording duration")
    user_id:        Optional[str] = Field(None, description="Omit until auth is wired — backend uses dev user")

    @field_validator("practice_type")
    @classmethod
    def validate_practice_type(cls, v: str) -> str:
        allowed = {"topic", "vocabulary", "reading"}
        if v not in allowed:
            raise ValueError(f"practice_type must be one of {allowed}")
        return v


# ── Session creation ──────────────────────────────────────────────────────

class CorrectionItem(BaseModel):
    original:   str = Field(..., description="The original phrase from the transcript")
    suggestion: str = Field(..., description="The improved version")
    reason:     str = Field(..., description="Brief explanation of why this is better")


class MetricScore(BaseModel):
    label: str   = Field(..., description="Metric name e.g. Fluency")
    score: float = Field(..., ge=0, le=100)


class SessionCreateRequest(BaseModel):
    """
    Sent by the frontend after the evaluation is complete and
    the user chooses to save the session to their history.
    """
    user_id:        Optional[str]  = Field(None)
    topic:          str            = Field(..., min_length=1, max_length=200)
    topic_category: Optional[str] = Field(None, max_length=100)
    practice_type:  str            = Field("topic")
    duration_seconds: Optional[int] = Field(None, ge=1)

    # Transcript + scores to persist
    transcript:     str            = Field(..., min_length=1)
    overall_score:  float          = Field(..., ge=0, le=100)
    metrics:        list[MetricScore]    = Field(default_factory=list)
    strengths:      list[str]            = Field(default_factory=list)
    corrections:    list[CorrectionItem] = Field(default_factory=list)
    rewrite:        Optional[str]        = Field(None)


# ── Analytics query ───────────────────────────────────────────────────────

class AnalyticsQueryParams(BaseModel):
    """
    Query parameters for the analytics and history endpoints.
    All fields are optional — omitting them returns all data.
    """
    user_id:        Optional[str]  = Field(None)
    practice_type:  Optional[str]  = Field(None, description="Filter by topic | vocabulary | reading")
    topic_category: Optional[str]  = Field(None)
    date_from:      Optional[date] = Field(None, description="Inclusive start date YYYY-MM-DD")
    date_to:        Optional[date] = Field(None, description="Inclusive end date YYYY-MM-DD")
    min_score:      Optional[float] = Field(None, ge=0, le=100)
    max_score:      Optional[float] = Field(None, ge=0, le=100)
    limit:          int            = Field(20, ge=1, le=100, description="Page size")
    offset:         int            = Field(0,  ge=0,        description="Pagination offset")
