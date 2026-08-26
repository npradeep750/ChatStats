from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)


@dataclass
class Conversation:
    conversation_id: str
    title: str = "Group chat"
    source_format: str = "unknown"
    timezone: str = "UTC"


@dataclass
class Participant:
    participant_id: str
    display_name: str
    conversation_id: str
    source_participant_id: str | None = None
    is_system_or_unknown: bool = False


@dataclass
class Message:
    message_id: str
    conversation_id: str
    sender_id: str
    timestamp_utc: datetime
    text: str = ""
    media_type: str = "none"
    media_count: int = 0
    source_message_id: str | None = None
    is_deleted: bool = False
    is_system_message: bool = False
    reply_to_message_id: str | None = None
    source_metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def word_count(self) -> int:
        collapsed = _URL_RE.sub("url", self.text.replace("\n", " "))
        return len(collapsed.split())


@dataclass
class Reaction:
    reaction_id: str
    message_id: str
    actor_id: str
    reaction_emoji: str
    reaction_type: str = "positive"
    timestamp_utc: datetime | None = None


@dataclass
class ReplyEdge:
    source_message_id: str
    reply_message_id: str
    seconds_after_source: float
    attribution_method: str
    attribution_confidence: float


@dataclass
class CanonicalDataset:
    conversation: Conversation
    participants: list[Participant] = field(default_factory=list)
    messages: list[Message] = field(default_factory=list)
    reactions: list[Reaction] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def sorted_messages(self) -> list[Message]:
        return sorted(self.messages, key=lambda m: (m.timestamp_utc, m.message_id))

    def to_dict(self) -> dict[str, Any]:
        def serialize(value: Any) -> Any:
            if isinstance(value, datetime):
                return value.astimezone(timezone.utc).isoformat()
            if isinstance(value, list):
                return [serialize(item) for item in value]
            if hasattr(value, "__dataclass_fields__"):
                return {key: serialize(item) for key, item in asdict(value).items()}
            return value

        return serialize(self)
