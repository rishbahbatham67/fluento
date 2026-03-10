from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import UploadFile, HTTPException, status

from core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_audio_file(file: UploadFile) -> None:
    content_type = (file.content_type or "").lower()

    # Strip codec suffix: "audio/webm;codecs=opus" → "audio/webm"
    base_type = content_type.split(";")[0].strip()

    # Normalise x- prefix: "audio/x-wav" → "audio/wav"
    normalised = base_type.replace("audio/x-", "audio/")

    allowed_normalised = {
        t.split(";")[0].strip().replace("audio/x-", "audio/")
        for t in settings.ALLOWED_AUDIO_TYPES
    }

    if normalised not in allowed_normalised:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type: '{content_type}'. "
                f"Accepted types: {', '.join(sorted(settings.ALLOWED_AUDIO_TYPES))}."
            ),
        )
def validate_audio_size(size_bytes: int) -> None:
    """
    Check the file size does not exceed MAX_AUDIO_SIZE_MB.
    Call this after reading the file into memory or after the OS reports
    the saved file size — not before, since UploadFile.size is not always
    populated before the file is fully read.
    """
    if size_bytes > settings.max_audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Audio file is too large "
                f"({size_bytes / (1024*1024):.1f} MB). "
                f"Maximum allowed size is {settings.MAX_AUDIO_SIZE_MB} MB."
            ),
        )


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def _ensure_upload_dir(user_id: str) -> Path:
    """
    Create the per-user upload directory if it does not already exist.
    Returns the Path object.
    """
    directory = Path(settings.AUDIO_UPLOAD_DIR) / user_id
    directory.mkdir(parents=True, exist_ok=True)
    return directory


async def save_audio_file(file: UploadFile, user_id: str) -> tuple[str, int]:
    """
    Read the UploadFile and write it to disk under:
        {AUDIO_UPLOAD_DIR}/{user_id}/{uuid}{ext}

    Returns
    -------
    (absolute_path_str, size_bytes)
        absolute_path_str — passed directly to Whisper's transcribe_audio()
        size_bytes        — used for size validation and logging

    The caller is responsible for calling cleanup_audio_file() after
    transcription completes so raw audio does not accumulate on disk.
    """
    ext       = Path(file.filename).suffix.lower() if file.filename else ".webm"
    filename  = f"{uuid.uuid4()}{ext}"
    directory = _ensure_upload_dir(user_id)
    dest_path = directory / filename

    # Read the entire file into memory once, then write to disk.
    # For very large files a chunked approach is better, but 25 MB is
    # well within the range where this is fine.
    contents = await file.read()
    size_bytes = len(contents)

    with open(dest_path, "wb") as f:
        f.write(contents)

    logger.info(
        "Audio saved | user=%s file=%s size=%.2fMB",
        user_id, filename, size_bytes / (1024 * 1024),
    )
    return str(dest_path.resolve()), size_bytes


def cleanup_audio_file(path: str) -> None:
    """
    Delete a temporary audio file after transcription is complete.
    Logs a warning if the file cannot be deleted but does NOT raise —
    a cleanup failure must never cause the API response to fail.
    """
    try:
        os.remove(path)
        logger.debug("Cleaned up audio file: %s", path)
    except FileNotFoundError:
        logger.debug("Audio file already removed: %s", path)
    except OSError as exc:
        logger.warning("Could not delete audio file %s: %s", path, exc)


def format_file_size(size_bytes: int) -> str:
    """Human-readable file size for log messages."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 ** 2:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 ** 2):.2f} MB"
