from __future__ import annotations

from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .analytics import build_report
from .models import CanonicalDataset
from .parsers import list_sqlite_conversations, parse_csv, parse_json, parse_sqlite


def validate_timezone(timezone_name: str) -> str:
    value = (timezone_name or "UTC").strip()
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"Unsupported timezone '{value}'. Choose an IANA timezone such as America/Los_Angeles or Asia/Kolkata.") from exc
    return value


def detect_format(filename: str, raw: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in (".sqlite", ".db", ".sqlite3") or raw.startswith(b"SQLite format 3"):
        return "imessage_sqlite"
    if suffix == ".csv":
        return "csv"
    if suffix == ".json" or raw.lstrip().startswith((b"{", b"[")):
        return "instagram_json"
    raise ValueError("Unsupported file format; use JSON, CSV, or SQLite")


def list_conversations(filename: str, raw: bytes, timezone_name: str = "UTC") -> list[dict]:
    timezone_name = validate_timezone(timezone_name)
    format_name = detect_format(filename, raw)
    if format_name == "imessage_sqlite":
        return list_sqlite_conversations(raw, timezone_name)
    dataset = parse_bytes(filename, raw, timezone_name)
    return [{"conversation_id": dataset.conversation.conversation_id, "source_conversation_id": None, "title": dataset.conversation.title, "message_count": len(dataset.messages), "participant_count": len(dataset.participants)}]


def parse_bytes(filename: str, raw: bytes, timezone_name: str = "UTC", conversation_id: str | None = None, progress_callback=None) -> CanonicalDataset:
    timezone_name = validate_timezone(timezone_name)
    format_name = detect_format(filename, raw)
    if format_name == "csv":
        return parse_csv(raw, timezone_name)
    if format_name == "imessage_sqlite":
        return parse_sqlite(raw, timezone_name, conversation_id, progress_callback)
    return parse_json(raw, timezone_name)


def process_file(filename: str, raw: bytes, timezone_name: str = "UTC", conversation_id: str | None = None, progress_callback=None) -> dict:
    if progress_callback:
        progress_callback(15, "Reading upload")
    dataset = parse_bytes(filename, raw, timezone_name, conversation_id, progress_callback)
    if progress_callback:
        progress_callback(35, "Parsing and normalizing messages")
    return build_report(dataset, progress_callback)
