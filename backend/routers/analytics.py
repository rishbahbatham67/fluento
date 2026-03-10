from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session as DBSession

from core.dependencies import get_current_user_id
from crud.sessions import get_metric_averages, get_score_trend
from crud.streaks import get_activity_grid, get_streak
from database.engine import get_db
from models.response_models import (
    ActivityDay,
    AnalyticsSummaryResponse,
    MetricAverage,
    StreakResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Canonical metric order for the frontend bars
_METRIC_LABELS = ["Fluency", "Grammar", "Vocabulary", "Clarity", "Pacing"]

# Mapping from DB dict key → display label
_METRIC_KEY_TO_LABEL: dict[str, str] = {
    "fluency":    "Fluency",
    "grammar":    "Grammar",
    "vocabulary": "Vocabulary",
    "clarity":    "Clarity",
    "pacing":     "Pacing",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_metric_averages(raw: dict[str, float | None]) -> list[MetricAverage]:
    """
    Convert the {metric_key: avg_score} dict from get_metric_averages()
    into a list[MetricAverage] in the canonical frontend order.
    Metrics with no data yet are omitted from the list rather than
    shown as 0, so the frontend can display a "no data" state correctly.
    """
    result: list[MetricAverage] = []
    for key, label in _METRIC_KEY_TO_LABEL.items():
        value = raw.get(key)
        if value is not None:
            result.append(MetricAverage(label=label, avg=round(value, 1)))
    # Preserve canonical order
    result.sort(key=lambda m: _METRIC_LABELS.index(m.label))
    return result


def _build_activity_grid(raw: list[list[dict]]) -> list[list[ActivityDay]]:
    """
    Convert the list[list[dict]] from get_activity_grid()
    into list[list[ActivityDay]] Pydantic models.
    """
    return [
        [
            ActivityDay(
                date=day["date"],
                practiced=day["practiced"],
                score=day.get("score"),
            )
            for day in week
        ]
        for week in raw
    ]


# ---------------------------------------------------------------------------
# GET /analytics/summary
# ---------------------------------------------------------------------------

@router.get(
    "/summary",
    response_model=AnalyticsSummaryResponse,
    summary="Analytics dashboard summary",
)
def get_analytics_summary(
    score_trend_limit: int = 14,
    activity_weeks:    int = 12,
    db:      DBSession = Depends(get_db),
    user_id: str       = Depends(get_current_user_id),
) -> AnalyticsSummaryResponse:
    """
    Return everything the analytics dashboard needs in one request:

    - **Streak stats** — current streak, longest streak, total sessions
    - **Average score** — mean overall_score across all sessions
    - **Metric averages** — per-metric bar chart data (Fluency, Grammar, …)
    - **Activity grid** — 12-week GitHub-style heatmap data
    - **Score trend** — last N overall scores for the sparkline

    All values default to safe empty states (0, [], null) when the user
    has no sessions yet, so the frontend never has to handle missing keys.
    """
    logger.info(
        "GET /analytics/summary | user=%s trend_limit=%d activity_weeks=%d",
        user_id, score_trend_limit, activity_weeks,
    )

    # ── Streak ────────────────────────────────────────────────────────────
    streak = get_streak(db, user_id)

    current_streak  = streak.current_streak  if streak else 0
    longest_streak  = streak.longest_streak  if streak else 0
    total_sessions  = streak.total_sessions  if streak else 0

    # ── Metric averages ───────────────────────────────────────────────────
    raw_averages   = get_metric_averages(db, user_id)
    metric_avgs    = _build_metric_averages(raw_averages)

    # ── Overall average score ─────────────────────────────────────────────
    # Derived from the metric averages so it is consistent with what
    # the user sees in the metric bars — no separate DB query needed.
    average_score: float | None = None
    if metric_avgs:
        average_score = round(
            sum(m.avg for m in metric_avgs) / len(metric_avgs), 1
        )

    # ── Score trend ───────────────────────────────────────────────────────
    score_trend = get_score_trend(db, user_id, limit=score_trend_limit)

    # ── Activity grid ─────────────────────────────────────────────────────
    raw_grid      = get_activity_grid(db, user_id, weeks=activity_weeks)
    activity_grid = _build_activity_grid(raw_grid)

    logger.info(
        "Analytics summary built | user=%s streak=%d sessions=%d avg=%.1f trend_points=%d",
        user_id,
        current_streak,
        total_sessions,
        average_score or 0,
        len(score_trend),
    )

    return AnalyticsSummaryResponse(
        current_streak=current_streak,
        longest_streak=longest_streak,
        total_sessions=total_sessions,
        average_score=average_score,
        metric_averages=metric_avgs,
        activity_grid=activity_grid,
        score_trend=score_trend,
    )


# ---------------------------------------------------------------------------
# GET /analytics/streak
# ---------------------------------------------------------------------------

@router.get(
    "/streak",
    response_model=StreakResponse,
    summary="Current streak stats only",
)
def get_streak_summary(
    db:      DBSession = Depends(get_db),
    user_id: str       = Depends(get_current_user_id),
) -> StreakResponse:
    """
    Lightweight endpoint for the streak badge shown in the nav header.
    Returns only streak data without computing the full analytics payload.
    The frontend can poll this after each session to update the streak counter.
    """
    logger.info("GET /analytics/streak | user=%s", user_id)

    streak = get_streak(db, user_id)
    if streak is None:
        # User exists but somehow has no streak row — return zeros
        return StreakResponse(
            current_streak=0,
            longest_streak=0,
            total_sessions=0,
            last_session_date=None,
        )

    return StreakResponse(
        current_streak=streak.current_streak,
        longest_streak=streak.longest_streak,
        total_sessions=streak.total_sessions,
        last_session_date=streak.last_session_date,
    )
