"""CSV Parser — handles various delimiters and encodings."""

import logging
from typing import Any
import io

logger = logging.getLogger(__name__)
MAX_ROWS = 100_000


def parse_csv(file_path: str) -> list[dict[str, Any]]:
    """Parse a CSV file and return table blocks."""
    try:
        import pandas as pd
    except ImportError:
        return _parse_csv_stdlib(file_path)

    blocks = []
    # Try multiple encodings
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(
                file_path,
                encoding=encoding,
                nrows=MAX_ROWS,
                dtype=str,
                on_bad_lines="skip",
            )
            df = df.fillna("")
            rows = [list(df.columns)] + df.values.tolist()
            blocks.append({
                "type": "table",
                "content": rows,
                "source": "csv",
            })
            break
        except Exception as e:
            logger.debug(f"CSV parse failed with {encoding}: {e}")
            continue

    return blocks


def _parse_csv_stdlib(file_path: str) -> list[dict[str, Any]]:
    """Fallback CSV parser using stdlib."""
    import csv

    rows = []
    for encoding in ("utf-8", "latin-1"):
        try:
            with open(file_path, encoding=encoding, errors="replace") as f:
                sample = f.read(4096)
                f.seek(0)
                dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
                reader = csv.reader(f, dialect)
                for i, row in enumerate(reader):
                    if i >= MAX_ROWS:
                        break
                    if any(row):
                        rows.append(row)
            break
        except Exception:
            continue

    if rows:
        return [{"type": "table", "content": rows, "source": "csv"}]
    return []
