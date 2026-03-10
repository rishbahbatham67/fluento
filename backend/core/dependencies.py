from __future__ import annotations

import logging
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from database.engine import get_db
from database.tables import User

logger = logging.getLogger(__name__)

_DEV_USER_ID    = "dev-user-001"
_DEV_USER_EMAIL = "dev@fluento.local"
_DEV_USER_NAME  = "Dev User"


def _ensure_dev_user(db: DBSession) -> None:
    user = db.get(User, _DEV_USER_ID)
    if user is None:
        from crud.users import create_user
        try:
            create_user(db, email=_DEV_USER_EMAIL, name=_DEV_USER_NAME)
            logger.info("Dev user created | id=%s", _DEV_USER_ID)
        except Exception:
            db.rollback()


def get_current_user_id(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: DBSession = Depends(get_db),
) -> str:
    _ensure_dev_user(db)
    return x_user_id or _DEV_USER_ID


def require_session_owner(
    session_user_id: str,
    current_user_id: str,
) -> None:
    if session_user_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource.",
        )
