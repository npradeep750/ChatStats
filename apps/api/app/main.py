from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import Annotated

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from processing.chat_processing.pipeline import detect_format, list_conversations, process_file

app = FastAPI(title="Chat Stats API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], allow_methods=["*"], allow_headers=["*"])
REPORTS: dict[str, dict] = {}
JOBS: dict[str, dict] = {}
MAX_UPLOAD_MB = int(os.getenv("CHAT_MAX_UPLOAD_MB", "1024"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
DASHBOARD_HTML = (Path(__file__).with_name("dashboard.html")).read_text(encoding="utf-8")


@app.get("/", response_class=HTMLResponse)
def dashboard() -> str:
    return DASHBOARD_HTML


async def _read_upload(file: UploadFile) -> bytes:
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Upload exceeds the {MAX_UPLOAD_MB} MB limit")
    if not file.filename:
        raise HTTPException(400, "A filename is required")
    return content


def _run_import_job(job_id: str, filename: str, content: bytes, timezone: str, conversation_id: str | None) -> None:
    def update(progress: int, stage: str) -> None:
        JOBS[job_id].update({"progress": progress, "stage": stage})

    try:
        update(10, "Starting analysis")
        report = process_file(filename, content, timezone, conversation_id, update)
        report_id = secrets.token_urlsafe(12)
        REPORTS[report_id] = report
        JOBS[job_id].update({"status": "complete", "progress": 100, "stage": "Complete", "report_id": report_id, "report": report})
    except (ValueError, UnicodeDecodeError) as exc:
        JOBS[job_id].update({"status": "failed", "progress": 100, "stage": "Failed", "error": str(exc)})
    except Exception:
        JOBS[job_id].update({"status": "failed", "progress": 100, "stage": "Failed", "error": "The analysis failed unexpectedly"})


@app.post("/v1/imports/start")
async def start_import(background_tasks: BackgroundTasks, file: Annotated[UploadFile, File(...)], timezone: Annotated[str, Form()] = "UTC", conversation_id: Annotated[str | None, Form()] = None) -> dict:
    content = await _read_upload(file)
    job_id = secrets.token_urlsafe(12)
    JOBS[job_id] = {"job_id": job_id, "status": "queued", "progress": 0, "stage": "Queued"}
    background_tasks.add_task(_run_import_job, job_id, file.filename or "", content, timezone, conversation_id)
    return JOBS[job_id]


@app.get("/v1/imports/jobs/{job_id}")
def get_import_job(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Import job not found or expired")
    return job


@app.post("/v1/imports/preview")
async def preview_import(file: Annotated[UploadFile, File(...)], timezone: Annotated[str, Form()] = "UTC") -> dict:
    content = await _read_upload(file)
    try:
        return {"format": detect_format(file.filename or "", content), "conversations": list_conversations(file.filename or "", content, timezone)}
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/v1/imports")
async def create_import(file: Annotated[UploadFile, File(...)], timezone: Annotated[str, Form()] = "UTC", conversation_id: Annotated[str | None, Form()] = None) -> dict:
    content = await _read_upload(file)
    try:
        report = process_file(file.filename or "", content, timezone, conversation_id)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    report_id = secrets.token_urlsafe(12)
    REPORTS[report_id] = report
    return {"report_id": report_id, "status": "complete", "report": report}


@app.get("/v1/reports/{report_id}")
def get_report(report_id: str) -> dict:
    if report_id not in REPORTS:
        raise HTTPException(404, "Report not found or expired")
    return REPORTS[report_id]


@app.delete("/v1/reports/{report_id}", status_code=204)
def delete_report(report_id: str) -> None:
    REPORTS.pop(report_id, None)
