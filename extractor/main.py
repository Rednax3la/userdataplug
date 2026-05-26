"""
Userplug Extraction Microservice
FastAPI service that processes uploaded files and extracts contact entities.
"""

import asyncio
import logging
import os
import tempfile
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
from pydantic_settings import BaseSettings

from parsers.pdf_parser import parse_pdf
from parsers.excel_parser import parse_excel
from parsers.csv_parser import parse_csv
from parsers.docx_parser import parse_docx
from extractors.deterministic import deterministic_extract
from extractors.ai_extractor import ai_extract

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    service_secret: str = ""
    anthropic_api_key: str = ""
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()

app = FastAPI(title="Userplug Extractor", version="1.0.0")


class ProcessRequest(BaseModel):
    document_id: str
    upload_id: str
    storage_path: str
    file_type: str
    file_name: str
    supabase_url: str
    callback_url: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/process")
async def process_file(
    request: ProcessRequest,
    background_tasks: BackgroundTasks,
    x_secret: str = Header(default=""),
):
    if x_secret != settings.service_secret and settings.service_secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    background_tasks.add_task(run_extraction, request)
    return {"status": "accepted", "document_id": request.document_id}


async def run_extraction(request: ProcessRequest):
    logger.info(f"Processing document {request.document_id}: {request.file_name}")

    try:
        # 1. Download file from Supabase storage
        file_content = await download_from_supabase(request.supabase_url, request.storage_path)

        with tempfile.NamedTemporaryFile(
            suffix=f".{request.file_type}", delete=False
        ) as tmp:
            tmp.write(file_content)
            tmp_path = tmp.name

        # 2. Parse file → extract raw text / structured rows
        file_type = request.file_type.lower().lstrip(".")

        if file_type == "pdf":
            raw_blocks = parse_pdf(tmp_path)
        elif file_type in ("xls", "xlsx"):
            raw_blocks = parse_excel(tmp_path)
        elif file_type == "csv":
            raw_blocks = parse_csv(tmp_path)
        elif file_type == "docx":
            raw_blocks = parse_docx(tmp_path)
        else:
            logger.warning(f"Unsupported file type: {file_type}")
            await send_callback(request.callback_url, request.document_id, [], f"Unsupported file type: {file_type}")
            return

        Path(tmp_path).unlink(missing_ok=True)

        logger.info(f"Parsed {len(raw_blocks)} blocks from {request.file_name}")

        # 3. Run deterministic extraction first
        entities = []
        remaining_blocks = []

        for block in raw_blocks:
            det_entities = deterministic_extract(block)
            if det_entities:
                entities.extend(det_entities)
            else:
                remaining_blocks.append(block)

        logger.info(
            f"Deterministic: {len(entities)} entities, {len(remaining_blocks)} blocks for AI"
        )

        # 4. AI extraction for unstructured blocks (batched)
        if remaining_blocks and settings.anthropic_api_key:
            ai_entities = await ai_extract(remaining_blocks, settings.anthropic_api_key)
            entities.extend(ai_entities)
            logger.info(f"AI extraction added {len(ai_entities)} entities")

        logger.info(f"Total extracted: {len(entities)} entities from {request.file_name}")

        # 5. Send results back to Next.js
        await send_callback(request.callback_url, request.document_id, entities, None)

    except Exception as e:
        logger.error(f"Extraction failed for {request.document_id}: {e}", exc_info=True)
        await send_callback(request.callback_url, request.document_id, [], str(e))


async def download_from_supabase(supabase_url: str, storage_path: str) -> bytes:
    """Download a file from Supabase Storage."""
    url = f"{supabase_url}/storage/v1/object/uploads/{storage_path}"
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(
            url,
            headers={"Authorization": f"Bearer {settings.supabase_service_role_key}"},
        )
        resp.raise_for_status()
        return resp.content


async def send_callback(
    callback_url: str, document_id: str, entities: list, error: str | None
):
    """POST results back to Next.js /api/process/complete."""
    payload = {
        "document_id": document_id,
        "entities": entities,
        "error": error,
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                callback_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Secret": settings.service_secret,
                },
            )
            resp.raise_for_status()
            logger.info(f"Callback sent for {document_id}: {resp.status_code}")
    except Exception as e:
        logger.error(f"Callback failed for {document_id}: {e}")
