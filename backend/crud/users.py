from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from database.tables import User


# ── Internal helper ───────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Read ──────────────────────────────────────────────────────────────────

def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    """Fetch a single user by primary key. Returns None if not found."""
    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """
    Fetch a user by email address (case-insensitive).
    Used during OAuth login to check if the account already exists.
    """
    return (
        db.query(User)
        .filter(User.email == email.lower().strip())
        .first()
    )


def get_user_by_google_id(db: Session, google_id: str) -> Optional[User]:
    """
    Fetch a user by their stable Google sub identifier.
    Preferred over email lookup because email addresses can change.
    """
    return (
        db.query(User)
        .filter(User.google_id == google_id)
        .first()
    )


# ── Create ────────────────────────────────────────────────────────────────

def create_user(
    db: Session,
    *,
    email: str,
    name: str,
    google_id: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> User:
    """
    Insert a new user row and return the hydrated ORM object.
    Email is normalised to lowercase before storing.
    Also creates an empty Streak row so analytics never has to handle
    a missing streak for this user.
    """
    from crud.streaks import create_streak  # local import avoids circular deps

    user = User(
        email=email.lower().strip(),
        name=name,
        google_id=google_id,
        avatar_url=avatar_url,
        is_active=True,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(user)
    db.flush()  # write to DB so user.id is populated before we reference it

    # Every user gets a streak record immediately so downstream
    # code never has to guard against a missing streak
    create_streak(db, user_id=user.id)

    db.commit()
    db.refresh(user)
    return user


# ── Update ────────────────────────────────────────────────────────────────

def update_user(
    db: Session,
    user_id: str,
    *,
    name: Optional[str] = None,
    avatar_url: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> Optional[User]:
    """
    Partial update — only fields explicitly passed are written.
    Returns the updated User, or None if the user_id does not exist.
    """
    user = get_user_by_id(db, user_id)
    if user is None:
        return None

    if name is not None:
        user.name = name
    if avatar_url is not None:
        user.avatar_url = avatar_url
    if is_active is not None:
        user.is_active = is_active

    user.updated_at = _now()
    db.commit()
    db.refresh(user)
    return user


# ── Upsert (OAuth convenience) ────────────────────────────────────────────

def get_or_create_user(
    db: Session,
    *,
    google_id: str,
    email: str,
    name: str,
    avatar_url: Optional[str] = None,
) -> tuple[User, bool]:
    """
    Look up by google_id first, then fall back to email.
    Returns (user, created) where created=True means a new row was inserted.

    Call this inside the OAuth callback handler — it handles all three cases:
      1. Returning user identified by google_id      → return existing
      2. Existing email account not yet linked        → link google_id, return
      3. Brand-new user                               → create and return
    """
    # Case 1 — already linked
    user = get_user_by_google_id(db, google_id)
    if user:
        # Refresh name/avatar in case they changed it on Google
        update_user(db, user.id, name=name, avatar_url=avatar_url)
        db.refresh(user)
        return user, False

    # Case 2 — email exists but not yet linked to Google
    user = get_user_by_email(db, email)
    if user:
        user.google_id = google_id
        user.avatar_url = avatar_url or user.avatar_url
        user.updated_at = _now()
        db.commit()
        db.refresh(user)
        return user, False

    # Case 3 — new user
    user = create_user(
        db,
        email=email,
        name=name,
        google_id=google_id,
        avatar_url=avatar_url,
    )
    return user, True
