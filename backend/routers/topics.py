from __future__ import annotations

import json
import logging
import time
from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/topics", tags=["topics"])


class TopicGenerateRequest(BaseModel):
    goals:      str          # free-text goals string from the user
    difficulty: str = "intermediate"   # beginner | intermediate | advanced
    count:      int = 6


class TopicItem(BaseModel):
    label:    str
    category: str
    why:      str | None = None


class TopicGenerateResponse(BaseModel):
    topics: list[TopicItem]


DIFFICULTY_INSTRUCTIONS = {
    "beginner": (
        "Topics must be simple and familiar — everyday life, basic routines, "
        "common experiences. Vocabulary should be basic (A1–A2 level). "
        "Expected speaking time: 30–60 seconds."
    ),
    "intermediate": (
        "Topics should require some thought and basic argument construction. "
        "Mix of current events and personal opinions. Vocabulary B1–B2 level. "
        "Expected speaking time: 1–2 minutes."
    ),
    "advanced": (
        "Topics must be nuanced, complex, and require specialist vocabulary. "
        "Abstract ideas, global issues, or professional scenarios. "
        "C1–C2 level vocabulary. Expected speaking time: 2–3 minutes."
    ),
}


def _build_prompt(goals: str, difficulty: str, count: int) -> str:
    difficulty_instruction = DIFFICULTY_INSTRUCTIONS.get(
        difficulty, DIFFICULTY_INSTRUCTIONS["intermediate"]
    )
    current_year = datetime.now().year

    return f"""You are an expert English speaking coach generating personalised practice topics.

Student's goals: {goals}

Difficulty level: {difficulty.upper()}
{difficulty_instruction}

Generate exactly {count} speaking practice topics that are:
1. Directly relevant to the student's stated goals
2. Current and topical for {current_year}
3. At the right difficulty level described above
4. Specific enough to speak about clearly
5. Varied — no two topics from the same theme

For each topic, also provide a short "why" field (one sentence) explaining
why this topic is relevant to the student's goals.

Return ONLY valid JSON, no markdown fences, no extra text:
{{
  "topics": [
    {{
      "label":    "Topic name here",
      "category": "Short category 2-3 words",
      "why":      "One sentence on why this fits the goal."
    }}
  ]
}}"""


def _call_llm(prompt: str) -> str:
    if not settings.LLM_API_KEY:
        raise RuntimeError("LLM_API_KEY is not set.")

    url     = f"{settings.LLM_BASE_URL.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.LLM_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":       settings.LLM_MODEL,
        "temperature": 0.85,
        "max_tokens":  1000,
        "messages": [
            {
                "role":    "system",
                "content": "You are a helpful assistant. Respond only with valid JSON.",
            },
            {
                "role":    "user",
                "content": prompt,
            },
        ],
    }

    with httpx.Client(timeout=30.0) as client:
        res = client.post(url, headers=headers, json=payload)
        res.raise_for_status()

    return res.json()["choices"][0]["message"]["content"]


@router.post(
    "/generate",
    response_model=TopicGenerateResponse,
    summary="Generate personalised speaking topics from goals + difficulty",
)
def generate_topics(req: TopicGenerateRequest) -> TopicGenerateResponse:
    logger.info(
        "Generating topics | difficulty=%s goals=%s",
        req.difficulty,
        req.goals[:80],
    )

    prompt = _build_prompt(req.goals, req.difficulty, req.count)

    t0 = time.perf_counter()
    try:
        raw = _call_llm(prompt)
    except httpx.HTTPStatusError as exc:
        logger.error("LLM HTTP error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Topic generation service unavailable. Please try again.",
        )
    except Exception as exc:
        logger.error("LLM error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate topics.",
        )

    # Strip markdown fences defensively
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw   = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    raw = raw.strip()

    try:
        data   = json.loads(raw)
        topics = [TopicItem(**t) for t in data.get("topics", [])]
    except Exception as exc:
        logger.error("Parse error: %s | raw=%s", exc, raw[:400])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to parse generated topics. Please try again.",
        )

    if not topics:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No topics were generated. Please try again.",
        )

    logger.info(
        "Generated %d topics | difficulty=%s took=%.2fs",
        len(topics),
        req.difficulty,
        time.perf_counter() - t0,
    )
    return TopicGenerateResponse(topics=topics)
class VocabItem(BaseModel):
    word:       str
    type:       str          # noun, verb, adjective, etc.
    definition: str
    example:    str


class VocabGenerateRequest(BaseModel):
    goals:      str
    difficulty: str = "intermediate"
    count:      int = 12


class VocabGenerateResponse(BaseModel):
    words: list[VocabItem]


def _build_vocab_prompt(goals: str, difficulty: str, count: int) -> str:
    difficulty_instruction = DIFFICULTY_INSTRUCTIONS.get(
        difficulty, DIFFICULTY_INSTRUCTIONS["intermediate"]
    )
    return f"""You are an expert English vocabulary coach.

Student's goals: {goals}

Difficulty level: {difficulty.upper()}
{difficulty_instruction}

Generate exactly {count} vocabulary words that are:
1. Directly useful for the student's stated goals
2. At the right difficulty level
3. Words the student would actually use in real speaking situations
4. Varied across different word types (nouns, verbs, adjectives, adverbs)

Return ONLY valid JSON, no markdown, no extra text:
{{
  "words": [
    {{
      "word":       "articulate",
      "type":       "adjective",
      "definition": "Having or showing the ability to speak fluently and coherently.",
      "example":    "An articulate candidate impresses interviewers with clear, confident answers."
    }}
  ]
}}

Important: The example sentence must directly relate to the student's goal: {goals}"""


@router.post(
    "/vocabulary",
    response_model=VocabGenerateResponse,
    summary="Generate goal-based vocabulary words using AI",
)
def generate_vocabulary(req: VocabGenerateRequest) -> VocabGenerateResponse:
    logger.info(
        "Generating vocabulary | difficulty=%s goals=%s",
        req.difficulty, req.goals[:80],
    )

    prompt = _build_vocab_prompt(req.goals, req.difficulty, req.count)

    t0 = time.perf_counter()
    try:
        raw = _call_llm(prompt)
    except httpx.HTTPStatusError as exc:
        logger.error("LLM HTTP error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Vocabulary generation service unavailable. Please try again.",
        )
    except Exception as exc:
        logger.error("LLM error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate vocabulary.",
        )

    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw   = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    raw = raw.strip()

    try:
        data  = json.loads(raw)
        words = [VocabItem(**w) for w in data.get("words", [])]
    except Exception as exc:
        logger.error("Parse error: %s | raw=%s", exc, raw[:400])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to parse generated vocabulary. Please try again.",
        )

    if not words:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No vocabulary words were generated. Please try again.",
        )

    logger.info(
        "Generated %d words | difficulty=%s took=%.2fs",
        len(words), req.difficulty, time.perf_counter() - t0,
    )
    return VocabGenerateResponse(words=words)
# ── Reading paragraph generation ─────────────────────────────────────────

class ParagraphGenerateRequest(BaseModel):
    goals:      str
    difficulty: str = "intermediate"
    topic:      str | None = None
    seed:       str | None = None   # ignored by LLM, just busts cache

class ParagraphGenerateResponse(BaseModel):
    paragraph:  str
    topic:      str
    word_count: int
    target_wpm: int   # ideal WPM for this difficulty


DIFFICULTY_WPM = {
    "beginner":     90,
    "intermediate": 130,
    "advanced":     160,
}

DIFFICULTY_PARAGRAPH = {
    "beginner": (
        "Write a SHORT paragraph of exactly 60-80 words. "
        "Use simple, common vocabulary (A1-A2 level). "
        "Short sentences of 8-12 words. No complex grammar. "
        "The paragraph must be easy to read aloud by a beginner English speaker."
    ),
    "intermediate": (
        "Write a paragraph of exactly 100-130 words. "
        "Use varied vocabulary (B1-B2 level). "
        "Mix short and medium sentences. Some complex ideas are fine. "
        "The paragraph should challenge an intermediate speaker without being overwhelming."
    ),
    "advanced": (
        "Write a paragraph of exactly 150-180 words. "
        "Use sophisticated vocabulary (C1-C2 level). "
        "Include complex sentence structures, subordinate clauses, and advanced ideas. "
        "The paragraph should challenge an advanced speaker significantly."
    ),
}

def _build_paragraph_prompt(goals: str, difficulty: str, topic: str | None, seed: str | None) -> str:
    length_instruction = DIFFICULTY_PARAGRAPH.get(
        difficulty, DIFFICULTY_PARAGRAPH["intermediate"]
    )
    topic_instruction = (
        f"The paragraph must be about: {topic}"
        if topic
        else f"Choose an interesting topic relevant to: {goals}. Pick a DIFFERENT topic each time you are called."
    )

    unique_hint = f"\n\nUniqueness token (ignore this, just ensures variety): {seed}" if seed else ""

    return f"""You are an English speaking coach creating a reading practice paragraph.

Student's goals: {goals}
{topic_instruction}

Paragraph requirements:
{length_instruction}

The content must be directly relevant to the student's goals: {goals}
Make it engaging, informative, and natural to speak aloud.
Avoid bullet points, headers, or lists — pure flowing prose only.
IMPORTANT: Generate a completely unique paragraph, different from any previous response.{unique_hint}

Return ONLY valid JSON, no markdown:
{{
  "paragraph": "The full paragraph text here...",
  "topic":     "Short topic label e.g. Climate Change"
}}"""


@router.post(
    "/paragraph",
    summary="Generate a reading practice paragraph based on goal and difficulty",
)
def generate_paragraph(req: ParagraphGenerateRequest) -> ParagraphGenerateResponse:
    logger.info(
        "Generating paragraph | difficulty=%s goals=%s topic=%s",
        req.difficulty, req.goals[:60], req.topic,
    )

    prompt = _build_paragraph_prompt(req.goals, req.difficulty, req.topic, req.seed)

    t0 = time.perf_counter()
    try:
        raw = _call_llm(prompt)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail="Paragraph generation service unavailable.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to generate paragraph.")

    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw   = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    raw = raw.strip()

    try:
        data      = json.loads(raw)
        paragraph = data["paragraph"].strip()
        topic     = data.get("topic", "Reading Practice")
    except Exception as exc:
        logger.error("Paragraph parse error: %s | raw=%s", exc, raw[:300])
        raise HTTPException(status_code=500, detail="Failed to parse paragraph. Please try again.")

    word_count = len(paragraph.split())
    target_wpm = DIFFICULTY_WPM.get(req.difficulty, 130)

    logger.info(
        "Paragraph generated | words=%d target_wpm=%d took=%.2fs",
        word_count, target_wpm, time.perf_counter() - t0,
    )

    return ParagraphGenerateResponse(
        paragraph=paragraph,
        topic=topic,
        word_count=word_count,
        target_wpm=target_wpm,
    )


# ── Structure hints generation ────────────────────────────────────────────

class StructureHintsRequest(BaseModel):
    topic:      str
    goals:      str
    difficulty: str = "intermediate"


class StructureHint(BaseModel):
    step:  str   # e.g. "01"
    hint:  str   # e.g. "State the problem clearly"


class StructureHintsResponse(BaseModel):
    structure: list[StructureHint]
    vocab:     list[str]
    tip:       str   # one personalized tip based on goal


def _build_hints_prompt(topic: str, goals: str, difficulty: str) -> str:
    return f"""You are an expert English speaking coach.

A student is about to speak about: "{topic}"
Their goal: {goals}
Their level: {difficulty}

Generate a speaking structure guide tailored specifically to this topic AND their goal.
If their goal is job interviews and the topic is AI, the structure should relate to how
they would discuss AI in an interview context, not just AI in general.

Return ONLY valid JSON, no markdown:
{{
  "structure": [
    {{"step": "01", "hint": "Specific actionable instruction for this topic + goal"}},
    {{"step": "02", "hint": "..."}},
    {{"step": "03", "hint": "..."}}
  ],
  "vocab": [
    "word1", "word2", "word3", "word4", "word5"
  ],
  "tip": "One personalized tip connecting this topic directly to their goal: {goals}"
}}

Rules:
- Exactly 3 structure steps
- Exactly 5 vocabulary words — advanced and directly useful for this topic + goal
- The tip must explicitly mention their goal, not be generic
- Structure steps must be specific to BOTH the topic AND the goal"""


@router.post(
    "/hints",
    summary="Generate AI structure hints for a topic based on goal and difficulty",
)
def generate_hints(req: StructureHintsRequest) -> StructureHintsResponse:
    logger.info(
        "Generating hints | topic=%s difficulty=%s goals=%s",
        req.topic, req.difficulty, req.goals[:60],
    )

    prompt = _build_hints_prompt(req.topic, req.goals, req.difficulty)

    t0 = time.perf_counter()
    try:
        raw = _call_llm(prompt)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail="Hints service unavailable.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to generate hints.")

    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw   = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    raw = raw.strip()

    try:
        data = json.loads(raw)
        structure = [StructureHint(**s) for s in data.get("structure", [])]
        vocab     = data.get("vocab", [])
        tip       = data.get("tip", "")
    except Exception as exc:
        logger.error("Hints parse error: %s | raw=%s", exc, raw[:300])
        raise HTTPException(status_code=500, detail="Failed to parse hints. Please try again.")

    logger.info("Hints generated | took=%.2fs", time.perf_counter() - t0)
    return StructureHintsResponse(structure=structure, vocab=vocab, tip=tip)
