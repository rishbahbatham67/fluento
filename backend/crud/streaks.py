from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from database.tables import Streak


# ── Internal helpers ──────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _days_since(last: datetime) -> int:
    """Number of calendar days between last session and today (UTC)."""
    return (_today() - last.astimezone(timezone.utc).date()).days


# ── Read ──────────────────────────────────────────────────────────────────

def get_streak(db: Session, user_id: str) -> Optional[Streak]:
    """
    Fetch the streak row for a user.
    Returns None only if the user somehow has no streak record yet
    (should not happen after create_user, but handled gracefully).
    """
    return (
        db.query(Streak)
        .filter(Streak.user_id == user_id)
        .first()
    )


# ── Create ────────────────────────────────────────────────────────────────

def create_streak(db: Session, *, user_id: str) -> Streak:
    """
    Create a fresh streak row for a newly registered user.
    Called automatically inside crud.users.create_user —
    do not call this manually unless you need a standalone row.
    Does NOT commit — caller is responsible for the commit.
    """
    streak = Streak(
        user_id=user_id,
        current_streak=0,
        longest_streak=0,
        total_sessions=0,
        last_session_date=None,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(streak)
    db.flush()  # populate streak.id without committing
    return streak


# ── Update ────────────────────────────────────────────────────────────────

def update_streak(
    db: Session,
    user_id: str,
    *,
    current_streak: Optional[int] = None,
    longest_streak: Optional[int] = None,
    total_sessions: Optional[int] = None,
    last_session_date: Optional[datetime] = None,
) -> Optional[Streak]:
    """
    Low-level partial update. Prefer increment_streak / reset_streak
    for normal session flows — use this only when you need to set
    explicit values (e.g. data migration, admin tooling).
    """
    streak = get_streak(db, user_id)
    if streak is None:
        return None

    if current_streak is not None:
        streak.current_streak = current_streak
    if longest_streak is not None:
        streak.longest_streak = longest_streak
    if total_sessions is not None:
        streak.total_sessions = total_sessions
    if last_session_date is not None:
        streak.last_session_date = last_session_date

    streak.updated_at = _now()
    db.commit()
    db.refresh(streak)
    return streak


def increment_streak(db: Session, user_id: str) -> Streak:
    """
    Called after every successful session save.
    Applies the following logic:

      last_session_date is None           → first ever session, start streak at 1
      days_since == 0 (same day)          → already practiced today, no change
      days_since == 1 (consecutive day)   → extend streak by 1
      days_since >= 2 (missed day(s))     → streak resets to 1

    Also increments total_sessions and updates longest_streak if needed.
    Creates the streak row if it is missing (safety net).
    """
    streak = get_streak(db, user_id)
    if streak is None:
        streak = create_streak(db, user_id=user_id)
        db.flush()

    now = _now()
    streak.total_sessions += 1

    if streak.last_session_date is None:
        # Very first session for this user
        streak.current_streak = 1

    else:
        days = _days_since(streak.last_session_date)

        if days == 0:
            # Already practiced today — don't double-count the streak
            pass
        elif days == 1:
            # Consecutive day — keep the streak going
            streak.current_streak += 1
        else:
            # Missed one or more days — restart
            streak.current_streak = 1

    # Track all-time longest
    if streak.current_streak > streak.longest_streak:
        streak.longest_streak = streak.current_streak

    streak.last_session_date = now
    streak.updated_at = now

    db.commit()
    db.refresh(streak)
    return streak


def reset_streak(db: Session, user_id: str) -> Optional[Streak]:
    """
    Explicitly reset the current streak to 0.
    Used by admin tooling or scheduled jobs that detect missed days.
    Does NOT reset longest_streak or total_sessions.
    """
    streak = get_streak(db, user_id)
    if streak is None:
        return None

    streak.current_streak = 0
    streak.updated_at = _now()
    db.commit()
    db.refresh(streak)
    return streak


# ── Activity grid ──────────────────────────────────────────────────────────

def get_activity_grid(
    db: Session,
    user_id: str,
    *,
    weeks: int = 12,
) -> list[list[dict]]:
    """
    Build the data for the GitHub-style activity grid on the analytics page.
    Returns a list of `weeks` sublists, each containing 7 day dicts:

        [
          [  # week 0 — oldest
            {"date": "2025-01-06", "practiced": True,  "score": 82.0},
            {"date": "2025-01-07", "practiced": False, "score": None},
            ...
          ],
          ...  # week 11 — most recent (current week)
        ]

    Days in the future (if the current week is partial) are marked
    practiced=False with score=None.
    """
    from database.tables import Session as SessionModel  # local import
    from sqlalchemy import func, cast, Date

    # Date range: go back `weeks` full weeks from today
    today = _today()
    # Align to Monday of the current week so the grid starts on a consistent day
    days_since_monday = today.weekday()  # Mon=0 … Sun=6
    week_start = today - timedelta(days=days_since_monday + (weeks - 1) * 7)
    range_start = week_start
    range_end = today

    # Query: one row per day that has at least one session
    rows = (
        db.query(
            cast(SessionModel.created_at, Date).label("session_date"),
            func.avg(SessionModel.overall_score).label("avg_score"),
        )
        .filter(
            SessionModel.user_id == user_id,
            cast(SessionModel.created_at, Date) >= range_start,
            cast(SessionModel.created_at, Date) <= range_end,
        )
        .group_by(cast(SessionModel.created_at, Date))
        .all()
    )

    # Build a lookup: {date: avg_score}
    practiced_map: dict[date, Optional[float]] = {
        row.session_date: (round(row.avg_score, 1) if row.avg_score else None)
        for row in rows
    }

    # Build the grid week by week
    grid: list[list[dict]] = []
    current = range_start

    for _ in range(weeks):
        week: list[dict] = []
        for _ in range(7):
            score = practiced_map.get(current)
            week.append({
                "date":      current.isoformat(),
                "practiced": current in practiced_map,
                "score":     score,
            })
            current += timedelta(days=1)
        grid.append(week)

    return grid
