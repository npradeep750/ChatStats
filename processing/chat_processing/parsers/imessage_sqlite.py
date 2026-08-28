from __future__ import annotations

import re
import sqlite3
import struct
import tempfile
from collections import defaultdict
from typing import Any
import unicodedata

from ..models import CanonicalDataset, Conversation, Message, Participant, Reaction
from ..imessage_attributed import _Decoder, decode_mentions
from ..normalization import classify_media, extract_emojis, extract_links, normalize_contact, normalize_text, parse_timestamp, stable_id


# iMessage stores native tapbacks as rows in `message`, rather than as a
# separate reactions table. The associated_message_* columns point back to the
# message that received the tapback.
IMESSAGE_TAPBACKS = {
    2000: ("❤️", "positive"),  # heart
    2001: ("👍", "positive"),  # like
    2002: ("👎", "negative"),  # dislike
    2003: ("😂", "positive"),  # laugh
    2004: ("‼️", "positive"),  # emphasis
    2005: ("❓", "neutral"),  # question
}

TEXT_REACTION_PATTERNS = (
    # Some SQLite viewers prepend an encoding marker directly to the action,
    # e.g. `698ALaughed at ...`, so these intentionally do not require a word
    # boundary before the action verb.
    (re.compile(r"(?:laughed|laughing|haha)(?:\s+at)?(?=\s*(?:[\"“‚Äú]|$))", re.IGNORECASE), ("😂", "positive")),
    (re.compile(r"(?:loved|loving)(?:\s+at)?(?=\s*(?:[\"“‚Äú]|$))", re.IGNORECASE), ("❤️", "positive")),
    (re.compile(r"liked(?:\s+at)?(?=\s*(?:[\"“‚Äú]|$))", re.IGNORECASE), ("👍", "positive")),
    (re.compile(r"disliked(?:\s+at)?(?=\s*(?:[\"“‚Äú]|$))", re.IGNORECASE), ("👎", "negative")),
    (re.compile(r"emphasized(?:\s+at)?(?=\s*(?:[\"“‚Äú]|$))", re.IGNORECASE), ("‼️", "positive")),
    (re.compile(r"questioned(?:\s+at)?(?=\s*(?:[\"“‚Äú]|$))", re.IGNORECASE), ("❓", "neutral")),
)


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')}


def _guid_variants(value: Any) -> set[str]:
    """Return raw and prefixed forms used by macOS/iOS reply GUID columns."""
    if value in (None, ""):
        return set()
    raw = str(value)
    variants = {raw}
    if "/" in raw:
        variants.add(raw.rsplit("/", 1)[-1])
    if raw.startswith("bp:"):
        variants.add(raw[3:])
    return variants


def _title(row: sqlite3.Row, columns: set[str], row_id: int) -> str:
    for column in ("display_name", "room_name", "chat_identifier", "guid"):
        if column in columns and row[column]:
            return normalize_text(row[column])
    return f"iMessage chat {row_id}"


def _open_database(raw: bytes) -> tuple[tempfile.NamedTemporaryFile, sqlite3.Connection]:
    handle = tempfile.NamedTemporaryFile(suffix=".sqlite")
    handle.write(raw)
    handle.flush()
    connection = sqlite3.connect(handle.name)
    connection.row_factory = sqlite3.Row
    return handle, connection


def _handle_value_expression(handle_columns: set[str]) -> str:
    available = [column for column in ("display_name", "name", "uncanonicalized_id", "id") if column in handle_columns]
    if not available:
        return "NULL"
    return available[0] if len(available) == 1 else "COALESCE(" + ", ".join(available) + ")"


_METADATA_TOKEN_RE = re.compile(
    r'(?:\bNS[A-Z]\w+|\bUI[A-Z]\w+|\bCF[A-Z]\w+|\b__\w+|'
    r'\btypedstream|\bstreamtyped\b)'
)


def _extract_text_from_raw_bytes(raw: bytes) -> str:
    """Best-effort extraction of visible text from a binary blob.

    When the typedstream decoder fails (which happens for many
    attributedBody blobs), the raw byte decode picks up Apple class
    names, binary metadata, and other junk as extra "words".  This
    function finds the actual message text by splitting on null bytes
    and control characters, stripping known metadata tokens, and
    returning the longest remaining fragment that looks like natural
    language.
    """
    raw_candidates = [
        (raw.decode("utf-8", errors="ignore"), 2),
        (raw.decode("utf-16le", errors="ignore"), 1),
        (raw.decode("latin-1", errors="ignore"), 1),
    ]
    best = ""
    best_score = (-1, -1, -1, -1)
    for candidate, enc_weight in raw_candidates:
        # Replace control characters with nulls, then split on null
        # bytes to isolate readable fragments.
        cleaned: list[str] = []
        for char in candidate:
            cat = unicodedata.category(char)
            if cat.startswith("C") and char not in {"\u200d"}:
                cleaned.append("\x00")
            else:
                cleaned.append(char)
        text = "".join(cleaned)
        # Split on nulls to get fragments between binary metadata.
        for fragment in text.split("\x00"):
            fragment = fragment.strip()
            if len(fragment) < 2:
                continue
            # Strip known Apple metadata tokens.
            stripped = normalize_text(_METADATA_TOKEN_RE.sub(" ", fragment))
            stripped = stripped.strip()
            if len(stripped) < 2:
                continue
            has_space = " " in stripped
            emoji_count = len(extract_emojis(stripped))
            alpha_ratio = (
                sum(c.isalpha() for c in stripped) / max(1, len(stripped))
            )
            if alpha_ratio < 0.3 and emoji_count == 0:
                continue
            # Score: emoji-rich > multi-word > longer > higher alpha.
            score = (
                enc_weight,
                emoji_count * 100 + int(has_space) * 10_000,
                len(stripped),
                int(alpha_ratio * 1000),
            )
            if score > best_score:
                best_score = score
                best = stripped
    return best


def _message_text(value: Any) -> str:
    """Read normal text and the text embedded in NSAttributedString blobs."""
    if not isinstance(value, (bytes, bytearray, memoryview)):
        return normalize_text(value)
    raw = bytes(value)
    # Try the proper typedstream decoder first.
    try:
        decoded = _Decoder(raw).decode()
        if (
            decoded
            and decoded.kind == "attributed_string"
            and isinstance(decoded.value, dict)
            and decoded.value.get("text")
        ):
            return normalize_text(decoded.value["text"])
    except (IndexError, UnicodeError, ValueError, struct.error):
        pass
    # Tapback descriptions are often embedded as a readable UTF-8
    # fragment in an otherwise binary attributedBody blob.
    for encoding in ("utf-8", "latin-1"):
        try:
            candidate = raw.decode(encoding, errors="ignore")
        except Exception:
            continue
        for pattern, _ in TEXT_REACTION_PATTERNS:
            if pattern.search(candidate):
                return normalize_text(candidate)
    # Fall back to smart extraction from raw bytes.
    return normalize_text(_extract_text_from_raw_bytes(raw))


def _text_reaction(text: str) -> tuple[str, str] | None:
    for pattern, reaction in TEXT_REACTION_PATTERNS:
        if pattern.search(text):
            return reaction
    return None


def _reaction_target_from_text(
    text: str,
    message_texts: dict[int, str],
    exact_text_index: dict[str, list[int]],
    prefix_text_index: dict[str, list[int]],
    current_row_id: int,
) -> int | None:
    """Find the original message quoted by a text-form tapback."""
    action_match = next((pattern.search(text) for pattern, _ in TEXT_REACTION_PATTERNS if pattern.search(text)), None)
    quoted = text[action_match.end():].strip() if action_match else ""
    for prefix in ('"', "“", "‚Äú", "«"):
        if quoted.startswith(prefix):
            quoted = quoted[len(prefix):]
            break
    quoted = re.split(r'["”»\x00]', quoted, maxsplit=1)[0]
    quoted = normalize_text(quoted).strip("\"“”‚Äú‚Äù ")
    if not quoted:
        return None
    normalized_quoted = quoted.casefold()
    exact = [row_id for row_id in exact_text_index.get(normalized_quoted, []) if row_id != current_row_id]
    if exact:
        return exact[-1]

    # Text-form exports sometimes truncate the quoted message. Restrict the
    # fallback to messages sharing the same first 32 characters instead of
    # scanning every message for every reaction.
    if len(normalized_quoted) >= 32:
        candidates = prefix_text_index.get(normalized_quoted[:32], [])
        for row_id in reversed(candidates):
            if row_id != current_row_id and normalized_quoted in message_texts[row_id].casefold():
                return row_id
    return None


def _chat_rows(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "chat" not in tables or "chat_message_join" not in tables:
        return []
    join_columns = _columns(connection, "chat_message_join")
    if not {"chat_id", "message_id"}.issubset(join_columns):
        return []
    chat_columns = _columns(connection, "chat")
    message_columns = _columns(connection, "message")
    handle_columns = _columns(connection, "handle") if "handle" in tables else set()
    handles: dict[int, str] = {}
    if "handle" in tables and "id" in handle_columns:
        value = _handle_value_expression(handle_columns)
        handles = {int(handle_row[0]): str(handle_row[1]) for handle_row in connection.execute(f"SELECT ROWID, {value} FROM handle")}
    handle_expr = "m.handle_id" if "handle_id" in message_columns else "NULL"
    own_expr = "m.is_from_me" if "is_from_me" in message_columns else "0"
    tapback_filter = "AND COALESCE(m.associated_message_type, 0) NOT BETWEEN 2000 AND 2005" if "associated_message_type" in message_columns else ""
    rows = connection.execute("SELECT ROWID AS _rowid, * FROM chat ORDER BY ROWID").fetchall()
    message_counts = {
        int(row[0]): int(row[1])
        for row in connection.execute(f"""
            SELECT cmj.chat_id, COUNT(*)
            FROM chat_message_join AS cmj
            JOIN message AS m ON m.ROWID = cmj.message_id
            WHERE 1 = 1 {tapback_filter}
            GROUP BY cmj.chat_id
        """)
    }
    participant_rows_by_chat: dict[int, list[tuple[Any, Any]]] = {}
    for participant_row in connection.execute(f"""
        SELECT cmj.chat_id, {handle_expr}, {own_expr}
        FROM message AS m
        JOIN chat_message_join AS cmj ON cmj.message_id = m.ROWID
        WHERE 1 = 1 {tapback_filter}
        GROUP BY cmj.chat_id, {handle_expr}, {own_expr}
    """):
        participant_rows_by_chat.setdefault(int(participant_row[0]), []).append((participant_row[1], participant_row[2]))
    candidates = []
    for row in rows:
        source_id = int(row["_rowid"])
        message_count = message_counts.get(source_id, 0)
        if not message_count:
            continue
        participant_rows = participant_rows_by_chat.get(source_id, [])
        participant_names: set[str] = set()
        participant_keys: set[Any] = set()
        for participant_row in participant_rows:
            handle_id, is_from_me = participant_row
            if is_from_me:
                participant_keys.add("me")
                participant_names.add("Me")
            elif handle_id is None:
                participant_keys.add("unknown")
                participant_names.add("Unknown")
            else:
                try:
                    participant_keys.add(int(handle_id))
                    participant_names.add(handles.get(int(handle_id), f"Participant {handle_id}"))
                except (TypeError, ValueError):
                    participant_keys.add(str(handle_id))
                    participant_names.add(str(handle_id))
        title = _title(row, chat_columns, source_id)
        is_named = any(column in chat_columns and normalize_text(row[column]) for column in ("display_name", "room_name"))
        candidates.append({"conversation_id": f"chat_{source_id}", "source_conversation_id": str(source_id), "title": title, "is_named": is_named, "message_count": int(message_count), "participant_count": len(participant_keys), "participant_names": sorted(participant_names, key=str.casefold)})
    return sorted(candidates, key=lambda item: (not item["is_named"], -item["message_count"], item["title"].casefold()))


def list_sqlite_conversations(raw: bytes, timezone_name: str = "UTC") -> list[dict[str, Any]]:
    handle, connection = _open_database(raw)
    try:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "message" not in tables:
            raise ValueError("SQLite export has no message table")
        candidates = _chat_rows(connection)
        if candidates:
            return candidates
        count = int(connection.execute("SELECT COUNT(*) FROM message").fetchone()[0])
        return [{"conversation_id": "conversation_1", "source_conversation_id": None, "title": "Imported iMessage chat", "message_count": count, "participant_count": 0}]
    finally:
        connection.close()
        handle.close()


def parse_sqlite(raw: bytes, timezone_name: str = "UTC", conversation_id: str | None = None, progress_callback: Any | None = None) -> CanonicalDataset:
    handle, connection = _open_database(raw)
    try:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "message" not in tables:
            raise ValueError("SQLite export has no message table")
        message_columns = _columns(connection, "message")
        if "text" not in message_columns and "attributedBody" not in message_columns:
            raise ValueError("SQLite message table has no supported text column")
        candidates = _chat_rows(connection)
        if candidates:
            if not conversation_id:
                raise ValueError("Choose a conversation from the SQLite preview before analyzing")
            selected = next((candidate for candidate in candidates if candidate["conversation_id"] == conversation_id), None)
            if selected is None:
                raise ValueError("The selected SQLite conversation was not found")
            source_chat_id = int(selected["source_conversation_id"])
            conversation = Conversation(conversation_id, selected["title"], "imessage_sqlite", timezone_name)
            message_filter = "JOIN chat_message_join AS cmj ON cmj.message_id = m.ROWID WHERE cmj.chat_id = ?"
            filter_args: tuple[Any, ...] = (source_chat_id,)
        else:
            conversation = Conversation(conversation_id or "conversation_1", "Imported iMessage chat", "imessage_sqlite", timezone_name)
            message_filter = ""
            filter_args = ()

        handle_columns = _columns(connection, "handle") if "handle" in tables else set()
        handles: dict[int, str] = {}
        if "handle" in tables and "id" in handle_columns:
            value = _handle_value_expression(handle_columns)
            handles = {int(row[0]): str(row[1]) for row in connection.execute(f"SELECT ROWID, {value} FROM handle")}

        attachment_descriptors: dict[int, list[str]] = {}
        if "attachment" in tables and "message_attachment_join" in tables:
            join_columns = _columns(connection, "message_attachment_join")
            attachment_columns = _columns(connection, "attachment")
            if {"message_id", "attachment_id"}.issubset(join_columns):
                descriptor_columns = [column for column in ("mime_type", "uti", "filename", "transfer_name", "type") if column in attachment_columns]
                if descriptor_columns:
                    descriptor_sql = ", ".join(f'a."{column}"' for column in descriptor_columns)
                    attachment_rows = connection.execute(f"SELECT maj.message_id, {descriptor_sql} FROM message_attachment_join AS maj JOIN attachment AS a ON a.ROWID = maj.attachment_id").fetchall()
                    for attachment_row in attachment_rows:
                        message_row_id = int(attachment_row[0])
                        descriptor = " ".join(str(value or "") for value in attachment_row[1:])
                        attachment_descriptors.setdefault(message_row_id, []).append(descriptor)

        plain_text_column = 'm.text' if "text" in message_columns else 'NULL'
        attributed_body_column = 'm.attributedBody' if "attributedBody" in message_columns else 'NULL'
        sender_column = "m.handle_id" if "handle_id" in message_columns else "NULL"
        date_column = "m.date" if "date" in message_columns else "NULL"
        own_column = "m.is_from_me" if "is_from_me" in message_columns else "0"
        attachment_flag = "COALESCE(m.cache_has_attachments, 0)" if "cache_has_attachments" in message_columns else "0"
        associated_type = "m.associated_message_type" if "associated_message_type" in message_columns else "NULL"
        associated_id = "m.associated_message_id" if "associated_message_id" in message_columns else "NULL"
        associated_guid = "m.associated_message_guid" if "associated_message_guid" in message_columns else "NULL"
        message_guid = "m.guid" if "guid" in message_columns else "NULL"
        reply_to_guid = "m.reply_to_guid" if "reply_to_guid" in message_columns else "NULL"
        thread_originator_guid = "m.thread_originator_guid" if "thread_originator_guid" in message_columns else "NULL"
        rows = connection.execute(
            f"""
            SELECT m.ROWID AS _rowid,
                   {plain_text_column} AS _plain_text,
                   {attributed_body_column} AS _attributed_body,
                   {sender_column} AS _handle_id,
                   {date_column} AS _date,
                   {own_column} AS _is_from_me,
                   {attachment_flag} AS _has_attachments,
                   {associated_type} AS _associated_type,
                   {associated_id} AS _associated_id,
                   {associated_guid} AS _associated_guid,
                   {reply_to_guid} AS _reply_to_guid,
                   {thread_originator_guid} AS _thread_originator_guid,
                   {message_guid} AS _guid
            FROM message AS m {message_filter}
            ORDER BY {date_column}, m.ROWID
            """,
            filter_args,
        ).fetchall()
        if progress_callback:
            progress_callback(20, f"Reading {len(rows):,} SQLite records")
        guid_to_rowid: dict[str, int] = {}
        for row in rows:
            if row["_guid"]:
                for guid_variant in _guid_variants(row["_guid"]):
                    guid_to_rowid[guid_variant] = int(row["_rowid"])
        message_texts: dict[int, str] = {}
        exact_text_index: dict[str, list[int]] = defaultdict(list)
        prefix_text_index: dict[str, list[int]] = defaultdict(list)
        for index, row in enumerate(rows, start=1):
            row_id = int(row["_rowid"])
            raw_text_value = row["_plain_text"] if row["_plain_text"] not in (None, "") else row["_attributed_body"]
            text = normalize_text(_message_text(raw_text_value))
            message_texts[row_id] = text
            if text:
                normalized_text = text.casefold()
                exact_text_index[normalized_text].append(row_id)
                if len(normalized_text) >= 32:
                    prefix_text_index[normalized_text[:32]].append(row_id)
            if progress_callback and (index == 1 or index % 1000 == 0 or index == len(rows)):
                progress_callback(20 + round(5 * index / max(1, len(rows))), f"Indexing message text ({index:,}/{len(rows):,})")
        participants: dict[str, Participant] = {}
        messages: list[Message] = []
        normal_message_row_ids: list[int] = []
        reactions: list[Reaction] = []
        for index, row in enumerate(rows, start=1):
            try:
                timestamp = parse_timestamp(row["_date"])
            except ValueError:
                continue
            sender_value, is_from_me = row["_handle_id"], row["_is_from_me"]
            if is_from_me:
                sender = "Me"
            elif sender_value is not None:
                try:
                    sender = handles.get(int(sender_value), f"Participant {sender_value}")
                except (TypeError, ValueError):
                    sender = str(sender_value)
            else:
                sender = "Unknown"
            sender_id = stable_id("participant", sender.casefold())
            participants.setdefault(sender_id, Participant(sender_id, sender, conversation.conversation_id))
            text_value = message_texts.get(int(row["_rowid"]), "")
            mentions = decode_mentions(row["_attributed_body"], text_value)

            try:
                associated_type_value = int(row["_associated_type"] or 0)
            except (TypeError, ValueError):
                associated_type_value = 0
            if associated_type_value in IMESSAGE_TAPBACKS:
                target_row_id = row["_associated_id"]
                if target_row_id is None and row["_associated_guid"]:
                    target_row_id = guid_to_rowid.get(str(row["_associated_guid"]))
                try:
                    target_row_id = int(target_row_id) if target_row_id is not None else None
                except (TypeError, ValueError):
                    target_row_id = None
                if target_row_id is None:
                    target_row_id = _reaction_target_from_text(text_value, message_texts, exact_text_index, prefix_text_index, int(row["_rowid"]))
                if target_row_id is None and normal_message_row_ids:
                    target_row_id = normal_message_row_ids[-1]
                if target_row_id is not None:
                    emoji, reaction_type = IMESSAGE_TAPBACKS[associated_type_value]
                    reactions.append(
                        Reaction(
                            stable_id("reaction", row["_rowid"]),
                            stable_id("message", target_row_id),
                            sender_id,
                            emoji,
                            reaction_type,
                            timestamp,
                        )
                    )
                continue

            text_reaction = _text_reaction(text_value)
            if text_reaction:
                target_row_id = _reaction_target_from_text(text_value, message_texts, exact_text_index, prefix_text_index, int(row["_rowid"]))
                if target_row_id is None and normal_message_row_ids:
                    target_row_id = normal_message_row_ids[-1]
                if target_row_id is not None:
                    emoji, reaction_type = text_reaction
                    reactions.append(
                        Reaction(
                            stable_id("reaction", row["_rowid"]),
                            stable_id("message", target_row_id),
                            sender_id,
                            emoji,
                            reaction_type,
                            timestamp,
                        )
                    )
                # A text-form tapback is an event record, not a message.
                continue

            attachment_types = [classify_media(value) for value in attachment_descriptors.get(int(row["_rowid"]), [])]
            attachment_types = [media_type for media_type in attachment_types if media_type != "none"]
            link_count = len(extract_links(text_value))
            attachment_count = len(attachment_types)
            if attachment_types:
                media_type = max(set(attachment_types), key=attachment_types.count)
            elif attachment_count or row["_has_attachments"]:
                media_type = "file"
                attachment_count = max(attachment_count, 1)
            elif link_count:
                media_type = "link"
            else:
                media_type = "none"
            media_count = attachment_count + link_count
            reply_guid = row["_reply_to_guid"] or row["_thread_originator_guid"]
            reply_target_row_id = next(
                (guid_to_rowid[variant] for variant in _guid_variants(reply_guid) if variant in guid_to_rowid),
                None,
            )
            reply_target_message_id = stable_id("message", reply_target_row_id) if reply_target_row_id is not None else None
            messages.append(
                Message(
                    stable_id("message", row["_rowid"]),
                    conversation.conversation_id,
                    sender_id,
                    timestamp,
                    text_value,
                    media_type,
                    media_count,
                    str(row["_rowid"]),
                    reply_to_message_id=reply_target_message_id,
                    source_metadata={
                        "reply_to_guid": str(reply_guid) if reply_guid else None,
                        "reply_reference_type": "reply_to_guid" if row["_reply_to_guid"] else "thread_originator_guid" if row["_thread_originator_guid"] else None,
                        "native_mentions": mentions,
                    },
                )
            )
            normal_message_row_ids.append(int(row["_rowid"]))
            if progress_callback and (index == 1 or index % 1000 == 0 or index == len(rows)):
                progress_callback(25 + round(10 * index / max(1, len(rows))), f"Parsing SQLite records ({index:,}/{len(rows):,})")
    finally:
        connection.close()
        handle.close()
    if not messages:
        raise ValueError("SQLite export contained no valid messages")
    return CanonicalDataset(conversation, list(participants.values()), messages, reactions)
