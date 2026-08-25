from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any

URL_RE = re.compile(r"https?://[^\s]+", re.IGNORECASE)
EMOJI_BASE = r"[\U0001F300-\U0001FAFF\u2600-\u27BF]"
EMOJI_MODIFIER = r"[\uFE0F\U0001F3FB-\U0001F3FF]"
EMOJI_RE = re.compile(
    rf"(?:"
    rf"[\U0001F1E6-\U0001F1FF]{{2}}"  # regional-indicator flag
    rf"|[0-9#*]{EMOJI_MODIFIER}?\u20E3"  # keycap emoji
    rf"|{EMOJI_BASE}(?:{EMOJI_MODIFIER}|\u200D{EMOJI_BASE})*"
    rf")"
)


def stable_id(prefix: str, value: Any) -> str:
    digest = hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


def parse_timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        result = value
    elif isinstance(value, (int, float)):
        number = float(value)
        if number > 1e17:
            number /= 1e9
        elif number > 1e14:
            number /= 1e6
        elif number > 1e11:
            number /= 1e3
        result = datetime.fromtimestamp(number, tz=timezone.utc)
    else:
        text = str(value or "").strip()
        if not text:
            raise ValueError("message is missing a timestamp")
        result = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def extract_emojis(text: str) -> list[str]:
    return EMOJI_RE.findall(text)


def extract_links(text: str) -> list[str]:
    return URL_RE.findall(text)


def classify_media(value: Any) -> str:
    text = str(value or "").lower()
    if not text:
        return "none"
    if "http://" in text or "https://" in text:
        return "link"
    if any(token in text for token in ("image", "jpeg", "png", "heic", "gif", "public.jpeg", "public.png")) or any(ext in text for ext in (".jpg", ".jpeg", ".png", ".heic", ".gif")):
        return "photo"
    if any(token in text for token in ("video", "movie", "mpeg", "quicktime")) or any(ext in text for ext in (".mp4", ".mov", ".m4v")):
        return "video"
    if any(token in text for token in ("audio", "m4a", "mpeg-4-audio")) or any(ext in text for ext in (".mp3", ".m4a", ".wav")):
        return "audio"
    return "file"
