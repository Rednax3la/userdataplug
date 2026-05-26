"""
PDF Parser — uses pdfplumber for text extraction.
Falls back to pytesseract OCR for image-based/scanned pages.
"""

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Maximum pages to process per PDF to avoid memory issues
MAX_PAGES = 200
# Minimum text chars per page to consider it "text-based" (not scanned)
MIN_TEXT_LEN = 50


def parse_pdf(file_path: str) -> list[dict[str, Any]]:
    """
    Parse a PDF and return a list of blocks, where each block is:
      { "type": "text"|"table", "content": str|list[list], "page": int, "source": "pdf"|"ocr" }
    """
    try:
        import pdfplumber
    except ImportError:
        logger.error("pdfplumber not installed")
        return []

    blocks: list[dict[str, Any]] = []

    try:
        with pdfplumber.open(file_path) as pdf:
            total_pages = len(pdf.pages)
            pages_to_process = min(total_pages, MAX_PAGES)

            if total_pages > MAX_PAGES:
                logger.warning(
                    f"PDF has {total_pages} pages, only processing first {MAX_PAGES}"
                )

            for page_num, page in enumerate(pdf.pages[:pages_to_process], start=1):
                # Try text extraction
                text = page.extract_text(x_tolerance=3, y_tolerance=3)

                if text and len(text.strip()) >= MIN_TEXT_LEN:
                    blocks.append({
                        "type": "text",
                        "content": text.strip(),
                        "page": page_num,
                        "source": "pdf_text",
                    })
                else:
                    # Try OCR fallback
                    ocr_text = _ocr_page(page, page_num)
                    if ocr_text:
                        blocks.append({
                            "type": "text",
                            "content": ocr_text,
                            "page": page_num,
                            "source": "ocr",
                        })

                # Extract tables separately for structured extraction
                tables = page.extract_tables()
                for table in tables:
                    if table and len(table) > 1:  # at least header + 1 row
                        blocks.append({
                            "type": "table",
                            "content": table,
                            "page": page_num,
                            "source": "pdf_table",
                        })

    except Exception as e:
        logger.error(f"PDF parse error: {e}")

    logger.info(f"PDF: extracted {len(blocks)} blocks from {Path(file_path).name}")
    return blocks


def _ocr_page(page: Any, page_num: int) -> str | None:
    """Convert a pdfplumber page to image and run Tesseract OCR."""
    try:
        import pytesseract
        from PIL import Image
        import io

        img = page.to_image(resolution=200).original
        if isinstance(img, Image.Image):
            text = pytesseract.image_to_string(img, config="--psm 6")
            if text and len(text.strip()) >= MIN_TEXT_LEN:
                return text.strip()
    except Exception as e:
        logger.debug(f"OCR failed on page {page_num}: {e}")
    return None
