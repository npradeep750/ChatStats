from __future__ import annotations

import json
from typing import Any

from ..models import CanonicalDataset, Conversation, Message, Participant, Reaction
from ..normalization import classify_media, extract_links, normalize_text, parse_timestamp, stable_id


def _first(mapping: dict[str, Any], *keys: str, default: Any = "") -> Any:
    for key in keys:
        if key in mapping and mapping[key] not in (None, ""):
            return mapping[key]
    return default


def parse_json(raw: bytes, timezone_name: str = "UTC") -> CanonicalDataset:
    payload = json.loads(raw.decode("utf-8-sig"))
    if isinstance(payload, list):
        records = payload
        title = "Imported JSON chat"
        participants_data: list[Any] = []
    else:
        records = _first(payload, "messages", "conversation", "data", default=[])
        title = normalize_text(_first(payload, "title", "name", default="Imported JSON chat"))
        participants_data = _first(payload, "participants", "users", default=[])
    if isinstance(records, dict):
        records = records.get("messages", [])
    if not isinstance(records, list) or not records:
        raise ValueError("JSON does not contain a non-empty messages array")

    conversation = Conversation("conversation_1", title, "instagram_json", timezone_name)
    participants: dict[str, Participant] = {}
    messages: list[Message] = []
    reactions: list[Reaction] = []
    warnings: list[str] = []
    for index, item in enumerate(records):
        if not isinstance(item, dict):
            warnings.append(f"message {index}: ignored non-object record")
            continue
        raw_sender = normalize_text(_first(item, "sender_name", "sender", "author", "from", "username", default=""))
        sender = raw_sender or "Unknown"
        sender_id = stable_id("participant", sender.casefold())
        participants.setdefault(sender_id, Participant(sender_id, sender, conversation.conversation_id, is_system_or_unknown=not bool(raw_sender)))
        timestamp_value = _first(item, "timestamp_ms", "timestamp", "created_at", "date")
        try:
            timestamp = parse_timestamp(timestamp_value)
        except ValueError as exc:
            warnings.append(f"message {index}: {exc}")
            continue
        text_value = normalize_text(_first(item, "content", "text", "message", "body"))
        media_value = _first(item, "media_type", "type", "attachments", "photos", "videos", default="")
        media = classify_media(media_value)
        if media == "none" and any(key in item for key in ("photos", "videos", "audio_files", "share")):
            media = "file"
        if media == "none" and extract_links(text_value):
            media = "link"
        source_id = str(_first(item, "message_id", "id", default=index))
        message_id = stable_id("message", source_id)
        reply_to = _first(item, "reply_to_message_id", "reply_to", default=None)
        messages.append(Message(message_id, conversation.conversation_id, sender_id, timestamp, text_value, media, 1 if media != "none" else 0, source_id, reply_to_message_id=str(reply_to) if reply_to else None, source_metadata={"raw_index": index}))
        raw_reactions = _first(item, "reactions", "likes", default=[])
        if isinstance(raw_reactions, dict):
            raw_reactions = [raw_reactions]
        for reaction_index, raw_reaction in enumerate(raw_reactions if isinstance(raw_reactions, list) else []):
            if isinstance(raw_reaction, str):
                emoji, actor = raw_reaction, "unknown"
                actor_is_unknown = True
            else:
                emoji = str(_first(raw_reaction, "reaction", "emoji", "type", default="👍"))
                raw_actor = normalize_text(_first(raw_reaction, "actor", "sender", "user", "name", default=""))
                actor = raw_actor or "unknown"
                actor_is_unknown = not bool(raw_actor)
            actor_id = stable_id("participant", actor.casefold())
            participants.setdefault(actor_id, Participant(actor_id, actor, conversation.conversation_id, is_system_or_unknown=actor_is_unknown))
            reaction_time = _first(raw_reaction, "timestamp", "timestamp_ms", default=None) if isinstance(raw_reaction, dict) else None
            reactions.append(Reaction(stable_id("reaction", f"{source_id}-{reaction_index}"), message_id, actor_id, emoji, "positive", parse_timestamp(reaction_time) if reaction_time else None))
    if not messages:
        raise ValueError("JSON contained no valid messages")
    return CanonicalDataset(conversation, list(participants.values()), messages, reactions, warnings)
