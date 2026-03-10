from __future__ import annotations

import logging
import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Optional, Union

from core.config import settings
from models.response_models import TranscriptionResponse

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Backend detection
# ---------------------------------------------------------------------------
# We try faster-whisper first — it uses CTranslate2 under the hood and runs
# 2-4× faster than openai-whisper on CPU with a smaller memory footprint.
# If it is not installed we fall back to the original openai-whisper package.
# Both expose the same public interface through our wrapper below.

try:
    from faster_whisper import WhisperModel as FasterWhisperModel  # type: ignore
    _BACKEND = "faster-whisper"
except ImportError:
    FasterWhisperModel = None
    try:
        import whisper as openai_whisper  # type: ignore
        _BACKEND = "openai-whisper"
    except ImportError:
        openai_whisper = None
        _BACKEND = "none"

logger.info("Whisper backend selected: %s", _BACKEND)


# ---------------------------------------------------------------------------
# Model loader
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def get_whisper_model() -> Union["FasterWhisperModel", "openai_whisper.Whisper", None]:
    """
    Load and cache the Whisper model so it is initialised once at startup
    and reused for every subsequent transcription request.

    The @lru_cache(maxsize=1) means the first call does the expensive work;
    every later call returns the cached object immediately.

    Returns None if neither backend is installed (transcription will raise).
    """
    size    = settings.WHISPER_MODEL_SIZE
    device  = settings.WHISPER_DEVICE
    compute = settings.WHISPER_COMPUTE_TYPE

    if _BACKEND == "faster-whisper":
        logger.info(
            "Loading faster-whisper model | size=%s device=%s compute_type=%s",
            size, device, compute,
        )
        t0 = time.perf_counter()
        model = FasterWhisperModel(size, device=device, compute_type=compute)
        logger.info("faster-whisper model ready in %.2fs", time.perf_counter() - t0)
        return model

    elif _BACKEND == "openai-whisper":
        logger.info(
            "Loading openai-whisper model | size=%s device=%s",
            size, device,
        )
        t0 = time.perf_counter()
        model = openai_whisper.load_model(size, device=device)
        logger.info("openai-whisper model ready in %.2fs", time.perf_counter() - t0)
        return model

    else:
        logger.error(
            "No Whisper backend found. "
            "Install faster-whisper or openai-whisper:\n"
            "  pip install faster-whisper\n"
            "  pip install openai-whisper"
        )
        return None


# ---------------------------------------------------------------------------
# Transcription helpers — one per backend
# ---------------------------------------------------------------------------

def _transcribe_faster_whisper(
    model: "FasterWhisperModel",
    audio_path: str,
) -> TranscriptionResponse:
    """
    Run transcription with faster-whisper.

    faster-whisper returns a generator of Segment objects plus an AudioInfo
    object that carries the duration and detected language. We iterate the
    segments once to build the transcript and collect per-segment confidence
    (log_prob) values so we can report a mean confidence score.
    """
    t0 = time.perf_counter()

    segments_gen, info = model.transcribe(
        audio_path,
        beam_size=5,
        language=None,          # auto-detect
        condition_on_previous_text=True,
        vad_filter=True,        # skip silent regions — faster + cleaner
    )

    # Materialise the generator — each segment has .text and .avg_logprob
    segments = list(segments_gen)

    elapsed = time.perf_counter() - t0
    logger.info(
        "faster-whisper transcription done | segments=%d lang=%s duration=%.1fs elapsed=%.2fs",
        len(segments),
        info.language,
        info.duration,
        elapsed,
    )

    if not segments:
        return TranscriptionResponse(
            transcript="",
            detected_language=info.language,
            duration_seconds=round(info.duration, 2),
            confidence=None,
        )

    transcript = " ".join(seg.text.strip() for seg in segments)

    # avg_logprob is in log-space; convert to a 0–1 probability estimate.
    # We clip at 0 so callers never see a value above 1.0.
    import math
    log_probs  = [seg.avg_logprob for seg in segments if seg.avg_logprob is not None]
    confidence: Optional[float] = None
    if log_probs:
        mean_log_prob = sum(log_probs) / len(log_probs)
        confidence    = round(min(1.0, math.exp(mean_log_prob)), 4)

    return TranscriptionResponse(
        transcript=transcript,
        detected_language=info.language,
        duration_seconds=round(info.duration, 2),
        confidence=confidence,
    )


def _transcribe_openai_whisper(
    model: "openai_whisper.Whisper",
    audio_path: str,
) -> TranscriptionResponse:
    """
    Run transcription with openai-whisper.

    openai-whisper returns a single dict with keys: text, language, segments.
    Each segment carries an avg_logprob that we use for confidence, and the
    last segment's end time gives us the audio duration.
    """
    import math

    t0 = time.perf_counter()

    result = model.transcribe(
        audio_path,
        language=None,    # auto-detect
        verbose=False,
    )

    elapsed = time.perf_counter() - t0
    segments = result.get("segments", [])

    logger.info(
        "openai-whisper transcription done | segments=%d lang=%s elapsed=%.2fs",
        len(segments),
        result.get("language"),
        elapsed,
    )

    transcript = result.get("text", "").strip()
    language   = result.get("language")

    # Duration = end time of the last segment
    duration: Optional[float] = None
    if segments:
        duration = segments[-1].get("end")

    # Confidence from segment log-probs
    confidence: Optional[float] = None
    log_probs = [
        seg["avg_logprob"]
        for seg in segments
        if seg.get("avg_logprob") is not None
    ]
    if log_probs:
        mean_log_prob = sum(log_probs) / len(log_probs)
        confidence    = round(min(1.0, math.exp(mean_log_prob)), 4)

    return TranscriptionResponse(
        transcript=transcript,
        detected_language=language,
        duration_seconds=round(duration, 2) if duration else None,
        confidence=confidence,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def transcribe_audio(audio_path: str) -> TranscriptionResponse:
    """
    Transcribe an audio file and return a TranscriptionResponse.

    Parameters
    ----------
    audio_path : str
        Absolute or relative path to an audio file.
        Accepted formats: .webm  .wav  .mp3  .mp4  .m4a  .ogg
        (Whisper converts to 16 kHz mono internally via ffmpeg.)

    Returns
    -------
    TranscriptionResponse
        transcript        — full text of the speech
        detected_language — ISO 639-1 code e.g. "en"
        duration_seconds  — length of the audio file in seconds
        confidence        — mean segment confidence in [0, 1], or None

    Raises
    ------
    FileNotFoundError
        If audio_path does not exist on disk.
    RuntimeError
        If no Whisper backend is installed, or if the model fails to load.
    """
    # ── Guard: file must exist ─────────────────────────────────────────────
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path!r}")

    file_size_mb = path.stat().st_size / (1024 * 1024)
    logger.info(
        "Starting transcription | file=%s size=%.2fMB backend=%s",
        path.name, file_size_mb, _BACKEND,
    )

    # ── Guard: backend available ──────────────────────────────────────────
    model = get_whisper_model()
    if model is None:
        raise RuntimeError(
            "Whisper is not available. "
            "Install faster-whisper or openai-whisper and restart the server."
        )

    # ── Dispatch to the correct backend ───────────────────────────────────
    if _BACKEND == "faster-whisper":
        result = _transcribe_faster_whisper(model, str(path))
    elif _BACKEND == "openai-whisper":
        result = _transcribe_openai_whisper(model, str(path))
    else:
        raise RuntimeError("No Whisper backend available.")

    # ── Sanity-check: warn on suspiciously short transcripts ──────────────
    word_count = len(result.transcript.split())
    if word_count < 3:
        logger.warning(
            "Transcript has only %d word(s) — the recording may be "
            "too short, silent, or in an unsupported language. "
            "Detected language: %s",
            word_count,
            result.detected_language,
        )

    logger.info(
        "Transcription complete | words=%d lang=%s duration=%.1fs confidence=%s",
        word_count,
        result.detected_language,
        result.duration_seconds or 0,
        f"{result.confidence:.3f}" if result.confidence else "n/a",
    )

    return result


# ---------------------------------------------------------------------------
# Optional: warm the model at import time
# ---------------------------------------------------------------------------
# Calling get_whisper_model() here means the model is loaded when the FastAPI
# worker starts, not on the first request. This trades a slower startup for a
# faster (and more predictable) first transcription.
#
# Comment this line out during unit testing or if you prefer lazy loading.

def warmup_model() -> None:
    """
    Pre-load the Whisper model during app startup.
    Call this from main.py inside the @app.on_event("startup") handler
    so the first real request doesn't pay the model-load cost.

    Example in main.py:
        @app.on_event("startup")
        async def startup():
            from services.speech_to_text import warmup_model
            warmup_model()
    """
    try:
        get_whisper_model()
        logger.info("Whisper model warm-up complete.")
    except Exception as exc:
        logger.warning("Whisper model warm-up failed (non-fatal): %s", exc)
