from __future__ import annotations

import json
import logging
import re
import time
from typing import Optional

import httpx

from core.config import settings
from models.response_models import (
    CorrectionItem,
    EvaluationResponse,
    MetricScore,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

# Metric definitions are kept here so tweaking scoring criteria never
# requires touching the function that calls the LLM.
_METRIC_DEFINITIONS = {
    "Fluency":    "Smoothness of speech — absence of hesitations, repetitions, and false starts.",
    "Grammar":    "Correctness of sentence structure, tense, agreement, and word order.",
    "Vocabulary": "Range, precision, and appropriateness of word choices for the topic.",
    "Clarity":    "How easy the message is to follow — logical flow, coherence, and conciseness.",
    "Pacing":     "Appropriate speed and rhythm — neither rushed nor excessively slow.",
}

_SCORE_RUBRIC = """
Scoring rubric (apply to every metric and to overallScore):
  90–100  Native-like or near-perfect performance.
  75–89   Clear and effective with minor errors that don't impede understanding.
  60–74   Generally understandable but noticeable errors or awkwardness.
  45–59   Frequent errors; communication is sometimes unclear.
  0–44    Significant errors; the message is difficult to follow.

Be calibrated and honest. Most learners score between 55 and 85.
Do NOT inflate scores — a score of 95 should be genuinely exceptional.
"""

_JSON_SCHEMA = """
Return ONLY a single valid JSON object — no markdown fences, no commentary, no trailing text.
The object must conform exactly to this schema:

{
  "overallScore": <integer 0-100>,
  "metrics": [
    {"label": "Fluency",    "score": <integer 0-100>},
    {"label": "Grammar",    "score": <integer 0-100>},
    {"label": "Vocabulary", "score": <integer 0-100>},
    {"label": "Clarity",    "score": <integer 0-100>},
    {"label": "Pacing",     "score": <integer 0-100>}
  ],
  "strengths": [
    "<one complete sentence describing something the speaker did well>",
    ...  (2–4 items)
  ],
  "corrections": [
    {
      "original":   "<exact phrase from the transcript that should be improved>",
      "suggestion": "<the improved version of that phrase>",
      "reason":     "<one sentence explaining why this is better>"
    },
    ...  (0–4 items; omit entirely if there are no meaningful corrections)
  ],
  "rewrite": "<optional — a single improved version of the full transcript, or null>"
}

Rules:
- overallScore must be the weighted average of the five metric scores
  (Fluency 25%, Grammar 25%, Vocabulary 20%, Clarity 20%, Pacing 10%).
- Every metric label must appear exactly once, spelled exactly as shown.
- strengths must contain at least 2 items.
- corrections.original must be a verbatim substring of the transcript.
- rewrite should only be included when there are at least 2 corrections;
  otherwise set it to null.
- All scores must be integers, not floats.
"""


def _build_prompt(transcript: str, topic: str) -> str:
    """
    Assemble the full evaluation prompt.

    Separated from the LLM call so it can be unit-tested independently
    and so prompt iterations don't require touching the HTTP logic.
    """
    metric_block = "\n".join(
        f"  • {name}: {definition}"
        for name, definition in _METRIC_DEFINITIONS.items()
    )

    return f"""You are an expert English communication coach evaluating a learner's spoken English.

The learner was asked to speak about the topic: "{topic}"

Here is the transcript of what they said:
\"\"\"
{transcript}
\"\"\"

Your task is to evaluate this transcript across five dimensions:
{metric_block}

{_SCORE_RUBRIC}

{_JSON_SCHEMA}"""


# ---------------------------------------------------------------------------
# Response parsing and validation
# ---------------------------------------------------------------------------

def _extract_json(raw: str) -> str:
    """
    Extract a JSON object from the raw LLM response string.

    Some models wrap JSON in markdown code fences even when told not to.
    We strip those defensively before parsing.
    """
    # Remove ```json ... ``` or ``` ... ``` fences
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw.strip())

    # If the model prepended prose before the JSON object, find the first {
    start = raw.find("{")
    end   = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        raw = raw[start : end + 1]

    return raw.strip()


def _validate_and_parse(raw_json: str, transcript: str) -> EvaluationResponse:
    """
    Parse the raw JSON string into an EvaluationResponse.

    Validation steps:
      1. Valid JSON.
      2. Required keys present.
      3. Metrics list has exactly the five expected labels.
      4. All scores are integers in [0, 100].
      5. overallScore is recalculated from the weighted metric scores
         so the frontend always shows an internally consistent number,
         even if the model got the arithmetic slightly wrong.
      6. corrections.original values are present in the transcript
         (case-insensitive check — flag a warning but don't reject).

    Raises ValueError with a descriptive message on any hard failure.
    """
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {exc}\nRaw: {raw_json[:500]}") from exc

    # ── Required top-level keys ───────────────────────────────────────────
    required = {"overallScore", "metrics", "strengths"}
    missing  = required - data.keys()
    if missing:
        raise ValueError(f"LLM response missing required keys: {missing}")

    # ── Metrics ───────────────────────────────────────────────────────────
    expected_labels = {"Fluency", "Grammar", "Vocabulary", "Clarity", "Pacing"}
    raw_metrics     = data.get("metrics", [])

    if not isinstance(raw_metrics, list):
        raise ValueError("'metrics' must be a list.")

    parsed_metrics: list[MetricScore] = []
    seen_labels: set[str] = set()

    for m in raw_metrics:
        label = m.get("label", "")
        score = m.get("score")

        if label not in expected_labels:
            logger.warning("Unexpected metric label from LLM: %r — skipping.", label)
            continue

        if label in seen_labels:
            logger.warning("Duplicate metric label %r — using first occurrence.", label)
            continue

        if score is None:
            raise ValueError(f"Metric '{label}' is missing a score.")

        # Coerce float → int, clamp to [0, 100]
        score_int = max(0, min(100, int(round(float(score)))))
        parsed_metrics.append(MetricScore(label=label, score=float(score_int)))
        seen_labels.add(label)

    # Fill in any missing metrics with 0 and warn so we don't silently drop bars
    for label in expected_labels - seen_labels:
        logger.warning("Metric '%s' missing from LLM response — defaulting to 0.", label)
        parsed_metrics.append(MetricScore(label=label, score=0.0))

    # Sort to a consistent order for the frontend
    label_order = ["Fluency", "Grammar", "Vocabulary", "Clarity", "Pacing"]
    parsed_metrics.sort(key=lambda m: label_order.index(m.label))

    # ── Recalculate overallScore from weighted metrics ────────────────────
    weights = {"Fluency": 0.25, "Grammar": 0.25, "Vocabulary": 0.20,
               "Clarity": 0.20, "Pacing": 0.10}
    metric_lookup = {m.label: m.score for m in parsed_metrics}
    overall = sum(metric_lookup.get(lbl, 0) * w for lbl, w in weights.items())
    overall_score = round(overall)

    # ── Strengths ─────────────────────────────────────────────────────────
    strengths = data.get("strengths", [])
    if not isinstance(strengths, list):
        strengths = []
    strengths = [str(s).strip() for s in strengths if str(s).strip()]

    if len(strengths) < 1:
        strengths = ["Your response addressed the topic directly."]
        logger.warning("LLM returned no strengths — inserted placeholder.")

    # ── Corrections ───────────────────────────────────────────────────────
    raw_corrections = data.get("corrections") or []
    parsed_corrections: list[CorrectionItem] = []
    transcript_lower = transcript.lower()

    for c in raw_corrections:
        original   = str(c.get("original",   "")).strip()
        suggestion = str(c.get("suggestion", "")).strip()
        reason     = str(c.get("reason",     "")).strip()

        if not original or not suggestion:
            continue

        if original.lower() not in transcript_lower:
            logger.warning(
                "Correction original %r not found in transcript — including anyway.",
                original[:60],
            )

        parsed_corrections.append(
            CorrectionItem(original=original, suggestion=suggestion, reason=reason)
        )

    # ── Rewrite ───────────────────────────────────────────────────────────
    rewrite: Optional[str] = data.get("rewrite") or None
    if rewrite:
        rewrite = str(rewrite).strip() or None
    # Only keep the rewrite if there are corrections to justify it
    if rewrite and len(parsed_corrections) < 2:
        rewrite = None

    return EvaluationResponse(
        transcript=transcript,
        overallScore=overall_score,
        metrics=parsed_metrics,
        strengths=strengths,
        corrections=parsed_corrections,
        rewrite=rewrite,
    )


# ---------------------------------------------------------------------------
# LLM client
# ---------------------------------------------------------------------------

def _call_llm(prompt: str) -> tuple[str, Optional[dict]]:
    """
    POST to an OpenAI-compatible /chat/completions endpoint.

    Returns (response_text, usage_dict).
    usage_dict contains prompt_tokens, completion_tokens, total_tokens
    when the API returns them; otherwise None.

    Uses httpx (sync) so we stay compatible with both sync FastAPI routes
    and plain Python scripts.  If you move to async routes later, swap
    httpx.Client for httpx.AsyncClient and add await.

    Raises RuntimeError on HTTP errors or timeouts.
    """
    if not settings.LLM_API_KEY:
        raise RuntimeError(
            "LLM_API_KEY is not set. Add it to your .env file before "
            "calling the evaluation service."
        )

    url     = f"{settings.LLM_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":       settings.LLM_MODEL,
        "temperature": settings.LLM_TEMPERATURE,
        "max_tokens":  settings.LLM_MAX_TOKENS,
        "messages": [
            {
                "role":    "system",
                "content": (
                    "You are a precise communication coach. "
                    "You always respond with valid JSON only. "
                    "Never include any text outside the JSON object."
                ),
            },
            {
                "role":    "user",
                "content": prompt,
            },
        ],
        # Ask models that support it to return JSON directly
        # (works with gpt-4o, gpt-4o-mini, gpt-4-turbo and compatible models)
        "response_format": {"type": "json_object"},
    }

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise RuntimeError("LLM API request timed out after 60 seconds.") from exc
    except httpx.HTTPStatusError as exc:
        body = exc.response.text[:400]
        raise RuntimeError(
            f"LLM API returned HTTP {exc.response.status_code}: {body}"
        ) from exc

    body    = response.json()
    content = body["choices"][0]["message"]["content"]
    usage   = body.get("usage")

    return content, usage


# ---------------------------------------------------------------------------
# Retry wrapper
# ---------------------------------------------------------------------------

def _call_llm_with_retry(
    prompt: str,
    max_attempts: int = 3,
) -> tuple[str, Optional[dict]]:
    """
    Retry the LLM call up to max_attempts times with exponential back-off.

    We retry on:
      - Network / timeout errors
      - HTTP 429 (rate limit) and 5xx server errors
      - JSON parse failures in the response

    We do NOT retry on:
      - HTTP 400 (bad request — our prompt is malformed)
      - HTTP 401 / 403 (auth errors — won't fix themselves)
    """
    last_exc: Optional[Exception] = None

    for attempt in range(1, max_attempts + 1):
        try:
            return _call_llm(prompt)

        except RuntimeError as exc:
            msg = str(exc)
            # Don't retry auth or bad-request errors
            if "HTTP 400" in msg or "HTTP 401" in msg or "HTTP 403" in msg:
                raise

            last_exc = exc
            wait = 2 ** (attempt - 1)   # 1s, 2s, 4s
            logger.warning(
                "LLM call failed (attempt %d/%d): %s — retrying in %ds",
                attempt, max_attempts, msg[:120], wait,
            )
            time.sleep(wait)

    raise RuntimeError(
        f"LLM call failed after {max_attempts} attempts."
    ) from last_exc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def evaluate_transcript(
    transcript: str,
    topic: str,
    *,
    max_retries: int = 3,
) -> EvaluationResponse:
    """
    Evaluate a speech transcript and return structured AI feedback.

    Parameters
    ----------
    transcript : str
        The full text transcribed from the user's audio recording.
    topic : str
        The topic the user was asked to speak about
        (e.g. "Climate Change", "Artificial Intelligence").
    max_retries : int
        How many times to retry the LLM call on transient failures.
        Default 3.  Set to 1 to disable retries.

    Returns
    -------
    EvaluationResponse
        Matches the FeedbackData interface in FeedbackCard.tsx exactly:
          overallScore  → ScoreRing
          metrics       → MetricBar list (Fluency, Grammar, Vocabulary, Clarity, Pacing)
          strengths     → bullet list
          corrections   → strikethrough → suggestion cards
          rewrite       → optional improved blockquote
          transcript    → shown at top of FeedbackCard

    Raises
    ------
    ValueError
        If the transcript is empty or too short to evaluate meaningfully.
    RuntimeError
        If the LLM API is unreachable or returns an unparseable response
        after all retries are exhausted.
    """
    # ── Input validation ──────────────────────────────────────────────────
    transcript = transcript.strip()

    if not transcript:
        raise ValueError("Transcript is empty — nothing to evaluate.")

    word_count = len(transcript.split())
    if word_count < 5:
        raise ValueError(
            f"Transcript is too short ({word_count} words) to evaluate meaningfully. "
            "Ask the user to speak for at least 10–15 seconds."
        )

    topic = topic.strip() or "General speaking"

    logger.info(
        "Starting evaluation | topic=%r words=%d model=%s",
        topic, word_count, settings.LLM_MODEL,
    )

    # ── Build prompt ──────────────────────────────────────────────────────
    prompt = _build_prompt(transcript, topic)

    # ── Call LLM ─────────────────────────────────────────────────────────
    t0 = time.perf_counter()
    raw_response, usage = _call_llm_with_retry(prompt, max_attempts=max_retries)
    elapsed = time.perf_counter() - t0

    if usage:
        logger.info(
            "LLM call complete | elapsed=%.2fs prompt_tokens=%s "
            "completion_tokens=%s total_tokens=%s",
            elapsed,
            usage.get("prompt_tokens"),
            usage.get("completion_tokens"),
            usage.get("total_tokens"),
        )
    else:
        logger.info("LLM call complete | elapsed=%.2fs (no token usage reported)", elapsed)

    # ── Parse + validate ──────────────────────────────────────────────────
    try:
        json_str = _extract_json(raw_response)
        result   = _validate_and_parse(json_str, transcript)
    except ValueError as exc:
        logger.error(
            "Failed to parse LLM evaluation response: %s\nRaw (first 800 chars):\n%s",
            exc,
            raw_response[:800],
        )
        raise RuntimeError(
            f"The evaluation service received an invalid response from the LLM: {exc}"
        ) from exc

    logger.info(
        "Evaluation complete | overall=%d fluency=%s grammar=%s vocab=%s clarity=%s pacing=%s",
        result.overall_score,
        next((m.score for m in result.metrics if m.label == "Fluency"),    "?"),
        next((m.score for m in result.metrics if m.label == "Grammar"),    "?"),
        next((m.score for m in result.metrics if m.label == "Vocabulary"), "?"),
        next((m.score for m in result.metrics if m.label == "Clarity"),    "?"),
        next((m.score for m in result.metrics if m.label == "Pacing"),     "?"),
    )

    return result
