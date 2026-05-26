"""
Deterministic Extractor
Regex + heuristics for structured data. No AI needed.
Handles tables with recognizable column headers and inline contact patterns.
"""

import re
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ── Regex patterns ──────────────────────────────────────────────────────────

EMAIL_RE = re.compile(
    r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b"
)

PHONE_RE = re.compile(
    r"""
    (?:
        \+?254[\s\-]?\d{3}[\s\-]?\d{3}[\s\-]?\d{3}  |   # Kenya +254
        \+?256[\s\-]?\d{3}[\s\-]?\d{3}[\s\-]?\d{3}  |   # Uganda
        \+?255[\s\-]?\d{3}[\s\-]?\d{3}[\s\-]?\d{3}  |   # Tanzania
        0[17]\d{2}[\s\-]?\d{3}[\s\-]?\d{3}               # Local 07/01
    )
    """,
    re.VERBOSE,
)

# Column header patterns for structured tables
HEADER_ALIASES = {
    "email":      r"e[\-\s]?mail|email\s*address",
    "phone":      r"phone|tel(ephone)?|mobile|cell|contact[\s\-]?no|contact[\s\-]?number",
    "first_name": r"first[\s\-]?name|fn|f\.?n\.?|given[\s\-]?name|forename",
    "last_name":  r"(last|sur|family)[\s\-]?name|ln|l\.?n\.?",
    "full_name":  r"(full[\s\-]?)?name|participant|member|staff|employee|contact",
    "gender":     r"gender|sex",
    "country":    r"country|nation|nationality",
    "city":       r"city|town|location|county",
    "company":    r"(company|organisation|organization|employer|firm|institution|entity)",
    "role":       r"(title|role|position|designation|rank|post)",
    "occupation": r"(occupation|profession|job|work)",
}


def _match_header(col: str) -> str | None:
    """Return canonical field name for a column header, or None."""
    clean = col.strip().lower()
    for field, pattern in HEADER_ALIASES.items():
        if re.search(pattern, clean, re.IGNORECASE):
            return field
    return None


def deterministic_extract(block: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Extract entities from a single block.
    Returns list of entity dicts (may be empty).
    """
    if block["type"] == "table":
        return _extract_from_table(block["content"])
    elif block["type"] == "text":
        return _extract_from_text(block["content"])
    return []


def _extract_from_table(rows: list[list[str]]) -> list[dict[str, Any]]:
    """
    Try to extract contacts from a table.
    Returns entities if header recognition succeeds, empty list otherwise.
    """
    if not rows or len(rows) < 2:
        return []

    # Detect header row (first row, or first non-empty row)
    header_row_idx = 0
    header = rows[header_row_idx]

    # Map column index → field name
    col_map: dict[int, str] = {}
    for i, cell in enumerate(header):
        field = _match_header(str(cell))
        if field:
            col_map[i] = field

    if not col_map:
        # No recognizable headers — return empty, let AI handle it
        return []

    entities = []
    for row in rows[header_row_idx + 1:]:
        if not any(row):
            continue

        entity: dict[str, Any] = {
            "extraction_method": "deterministic",
            "confidence_score": 0.75,
            "flags": [],
        }

        for col_idx, field in col_map.items():
            if col_idx < len(row):
                val = str(row[col_idx]).strip()
                if val and val.lower() not in ("none", "null", "n/a", "-", ""):
                    entity[field] = val

        # Must have at least one identity field
        has_identity = any(k in entity for k in ("email", "phone", "full_name", "first_name"))
        if not has_identity:
            continue

        # Inline email/phone extraction from any cell if not already found
        if "email" not in entity:
            for cell in row:
                emails = EMAIL_RE.findall(str(cell))
                if emails:
                    entity["email"] = emails[0].lower()
                    break

        if "phone" not in entity:
            for cell in row:
                phones = PHONE_RE.findall(str(cell))
                if phones:
                    entity["phone"] = phones[0]
                    break

        # Boost confidence if we have email + phone
        if entity.get("email") and entity.get("phone"):
            entity["confidence_score"] = 0.9
        elif entity.get("email") or entity.get("phone"):
            entity["confidence_score"] = 0.8

        entities.append(entity)

    return entities


def _extract_from_text(text: str) -> list[dict[str, Any]]:
    """
    Extract inline emails and phones from free text.
    Does NOT attempt name extraction (that's for AI).
    Returns entities only if we find email+phone patterns.
    """
    emails = list(set(EMAIL_RE.findall(text)))
    phones = list(set(PHONE_RE.findall(text)))

    if not emails and not phones:
        return []

    # If we find a small number of emails/phones, create individual entities
    # For large counts (e.g., 50+ emails), let AI handle context
    if len(emails) > 30 or len(phones) > 30:
        return []

    entities = []

    # Pair emails with phones if counts match
    max_len = max(len(emails), len(phones))
    for i in range(max_len):
        entity: dict[str, Any] = {
            "extraction_method": "deterministic",
            "confidence_score": 0.55,  # Low — no name context
            "flags": ["no_name_context"],
        }
        if i < len(emails):
            entity["email"] = emails[i].lower()
        if i < len(phones):
            entity["phone"] = phones[i]

        entities.append(entity)

    return entities
