"""
AI Extractor — uses Claude API to extract entities from unstructured text.
Designed to minimize token usage:
- Only called when deterministic extraction fails
- Chunks text to stay within context limits
- Uses claude-haiku for cost efficiency
- Uses structured JSON output
"""

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Max characters per AI chunk to avoid token waste
CHUNK_SIZE = 6_000
# Max entities to extract per chunk (prevents hallucination)
MAX_ENTITIES_PER_CHUNK = 50

EXTRACTION_SYSTEM_PROMPT = """You are a precise data extraction assistant.
Your job is to extract real person/contact information from documents.

Rules:
- Extract ONLY information explicitly present in the text. Never infer or guess.
- Do not hallucinate names, emails, or phone numbers.
- If you cannot confidently extract a field, omit it.
- Focus on: people, not organizations.
- confidence_score: 0.0-1.0 reflecting how certain you are the extraction is correct.
- flags: list of issues like "uncertain_name", "partial_info", "ocr_noise".
- extraction_method: always "ai"

Return ONLY a valid JSON array. No explanation, no markdown, no prose."""

EXTRACTION_USER_TEMPLATE = """Extract all person/contact records from this text.

Return JSON array of objects with these fields (all optional except confidence_score):
- first_name, last_name, full_name
- email, phone
- gender (M/F/Unknown)
- country, city
- company, role, occupation
- confidence_score (required, 0.0-1.0)
- flags (array of strings)
- extraction_method (always "ai")

TEXT:
{text}

Return only the JSON array."""


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE) -> list[str]:
    """Split text into chunks at paragraph/line boundaries."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    lines = text.split("\n")
    current = []
    current_len = 0

    for line in lines:
        if current_len + len(line) > chunk_size and current:
            chunks.append("\n".join(current))
            current = [line]
            current_len = len(line)
        else:
            current.append(line)
            current_len += len(line) + 1

    if current:
        chunks.append("\n".join(current))

    return chunks


def _parse_json_response(content: str) -> list[dict]:
    """Safely parse JSON from Claude response."""
    # Strip markdown code blocks if present
    content = re.sub(r"```(?:json)?\n?", "", content).strip()
    content = content.strip("`").strip()

    if not content.startswith("["):
        # Try to find JSON array in response
        match = re.search(r"\[.*\]", content, re.DOTALL)
        if match:
            content = match.group(0)
        else:
            return []

    try:
        data = json.loads(content)
        if isinstance(data, list):
            return data
        return []
    except json.JSONDecodeError as e:
        logger.debug(f"JSON parse failed: {e}")
        return []


async def ai_extract(
    blocks: list[dict[str, Any]], api_key: str
) -> list[dict[str, Any]]:
    """
    Run AI extraction on unstructured text blocks.
    Returns list of extracted entity dicts.
    """
    try:
        import anthropic
    except ImportError:
        logger.error("anthropic package not installed")
        return []

    client = anthropic.AsyncAnthropic(api_key=api_key)
    entities = []

    # Flatten text blocks
    text_blocks = [b for b in blocks if b.get("type") == "text"]

    for block in text_blocks:
        text = block.get("content", "")
        if not text or len(text.strip()) < 20:
            continue

        chunks = _chunk_text(text)

        for chunk in chunks:
            if not chunk.strip():
                continue

            try:
                message = await client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=2048,
                    system=EXTRACTION_SYSTEM_PROMPT,
                    messages=[
                        {
                            "role": "user",
                            "content": EXTRACTION_USER_TEMPLATE.format(text=chunk),
                        }
                    ],
                )

                response_text = message.content[0].text if message.content else ""
                extracted = _parse_json_response(response_text)

                # Validate and clean each entity
                valid_entities = []
                for entity in extracted[:MAX_ENTITIES_PER_CHUNK]:
                    if not isinstance(entity, dict):
                        continue

                    # Must have at least one identity field
                    has_identity = any(
                        k in entity and entity[k]
                        for k in ("email", "phone", "full_name", "first_name")
                    )
                    if not has_identity:
                        continue

                    # Ensure required fields
                    entity.setdefault("confidence_score", 0.65)
                    entity.setdefault("flags", [])
                    entity["extraction_method"] = "ai"

                    # Cap confidence_score
                    try:
                        entity["confidence_score"] = max(0.0, min(1.0, float(entity["confidence_score"])))
                    except (ValueError, TypeError):
                        entity["confidence_score"] = 0.5

                    valid_entities.append(entity)

                entities.extend(valid_entities)
                logger.info(f"AI extracted {len(valid_entities)} entities from chunk")

            except Exception as e:
                logger.error(f"AI extraction error: {e}")
                continue

    return entities
