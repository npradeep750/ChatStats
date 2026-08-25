from __future__ import annotations

import csv
import io
from datetime import timezone

from ..models import CanonicalDataset, Conversation, Message, Participant
from ..normalization import classify_media, extract_links, normalize_text, parse_timestamp, stable_id


def parse_csv(raw: bytes, timezone_name: str = "UTC") -> CanonicalDataset:
    text = raw.decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise ValueError("CSV contains no rows")
    keys = {key.lower().strip() for key in rows[0]}

    def field(row: dict[str, str], *names: str) -> str:
        lowered = {str(key).lower().strip(): value for key, value in row.items()}
        for name in names:
            if name in lowered and lowered[name] not in (None, ""):
                return str(lowered[name])
        return ""

    if not ({"timestamp", "time", "date"} & keys) or not ({"sender", "author", "from", "user"} & keys):
        raise ValueError("CSV must contain timestamp and sender columns")
    conversation = Conversation("conversation_1", "Imported CSV", "csv", timezone_name)
    participants: dict[str, Participant] = {}
    messages: list[Message] = []
    warnings: list[str] = []
    for index, row in enumerate(rows):
        sender = normalize_text(field(row, "sender", "author", "from", "user")) or "Unknown"
        sender_id = stable_id("participant", sender.casefold())
        participants.setdefault(sender_id, Participant(sender_id, sender, conversation.conversation_id))
        try:
            timestamp = parse_timestamp(field(row, "timestamp", "time", "date"))
        except ValueError as exc:
            warnings.append(f"row {index + 2}: {exc}")
            continue
        text_value = normalize_text(field(row, "text", "message", "content", "body"))
        media = classify_media(field(row, "media_type", "media", "attachment", "file"))
        if media == "none" and extract_links(text_value):
            media = "link"
        messages.append(Message(stable_id("message", f"csv-{index}"), conversation.conversation_id, sender_id, timestamp, text_value, media, 1 if media != "none" else 0, str(index)))
    if not messages:
        raise ValueError("CSV contained no valid messages")
    return CanonicalDataset(conversation, list(participants.values()), messages, warnings=warnings)
